import argparse
import io
import json
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import PurePosixPath
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import models
from database import SessionLocal, engine
from routers.pgn_importer import import_pgn_stream
from routers.r2_storage import r2_object_exists, upload_fileobj_to_r2
from services.import_stats import ensure_import_stat_tables, refresh_import_stats
from services.player_catalog import slugify_player_name


CHESSCOM_BASE = "https://www.chess.com"
USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36 CheckmateChessDatabase/1.0"
)
NETWORK_RETRIES = 4
RETRY_DELAY_SECONDS = 10


def read_url(url, timeout=60):
    request = Request(url, headers={
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/x-chess-pgn,text/plain,*/*",
        "Accept-Language": "en-US,en;q=0.9",
        "Referer": f"{CHESSCOM_BASE}/games",
    })
    for attempt in range(1, NETWORK_RETRIES + 1):
        try:
            with urlopen(request, timeout=timeout) as response:
                return response.read()
        except HTTPError as exc:
            if exc.code not in {403, 429, 500, 502, 503, 504} or attempt == NETWORK_RETRIES:
                raise
            delay = RETRY_DELAY_SECONDS * attempt
            print(f"Request blocked/throttled ({exc.code}); waiting {delay}s before retry...", flush=True)
            time.sleep(delay)


def read_text(url, timeout=60):
    return read_url(url, timeout=timeout).decode("utf-8", errors="replace")


def player_url(player_slug, page):
    if page <= 1:
        return f"{CHESSCOM_BASE}/games/{player_slug}"
    return f"{CHESSCOM_BASE}/games/{player_slug}?page={page}"


def parse_total_pages(html):
    match = re.search(r'data-total-pages="(\d+)"', html)
    return int(match.group(1)) if match else 1


def parse_game_ids(html):
    return re.findall(r'data-game-id="(\d+)"', html)


def collect_game_ids(player_slug, sleep_seconds):
    first_page = read_text(player_url(player_slug, 1), timeout=60)
    total_pages = parse_total_pages(first_page)
    ids = parse_game_ids(first_page)
    print(f"Page 1/{total_pages}: {len(ids)} game ids", flush=True)

    for page in range(2, total_pages + 1):
        time.sleep(sleep_seconds)
        html = read_text(player_url(player_slug, page), timeout=60)
        page_ids = parse_game_ids(html)
        ids.extend(page_ids)
        print(f"Page {page}/{total_pages}: {len(page_ids)} game ids", flush=True)

    seen = set()
    unique_ids = []
    for game_id in ids:
        if game_id in seen:
            continue
        seen.add(game_id)
        unique_ids.append(game_id)
    return unique_ids


def chunks(values, size):
    for index in range(0, len(values), size):
        yield values[index:index + size]


def download_pgn(game_ids):
    query = urlencode({"game_ids": ",".join(game_ids)})
    return read_url(f"{CHESSCOM_BASE}/games/downloadPgn?{query}", timeout=120)


def build_object_key(player_slug):
    return str(PurePosixPath("pgn-imports", "chesscom-master", player_slug, "master-games.pgn"))


def load_player_slugs(path):
    with open(path, "r", encoding="utf-8") as file_obj:
        players = json.load(file_obj)

    slugs = []
    for player in players:
        if isinstance(player, str):
            slugs.append(slugify_player_name(player))
            continue
        slug = (
            player.get("chesscom_master_slug") or
            player.get("master_slug") or
            player.get("slug") or
            (slugify_player_name(player["name"]) if player.get("name") else "")
        )
        if slug:
            slugs.append(slug)
    return slugs


def get_import_record(db, object_key):
    return db.query(models.ImportedPgnFile).filter(
        models.ImportedPgnFile.object_key == object_key
    ).first()


def count_indexed_games(db, object_key):
    return db.query(models.ImportedGame).filter(
        models.ImportedGame.pgn_object_key == object_key
    ).count()


def delete_indexed_games(db, object_key):
    deleted = db.query(models.ImportedGame).filter(
        models.ImportedGame.pgn_object_key == object_key
    ).delete(synchronize_session=False)
    db.commit()
    return deleted


def ensure_import_record(db, object_key, filename):
    record = get_import_record(db, object_key)
    if record:
        return record

    record = models.ImportedPgnFile(
        object_key=object_key,
        filename=filename,
        status="pending",
    )
    db.add(record)
    db.commit()
    return record


def ensure_imported_game_columns(db):
    if db.get_bind().dialect.name == "postgresql":
        from sqlalchemy import text
        db.execute(text("ALTER TABLE imported_games ADD COLUMN IF NOT EXISTS white_elo INTEGER"))
        db.execute(text("ALTER TABLE imported_games ADD COLUMN IF NOT EXISTS black_elo INTEGER"))
        db.commit()


def import_master_player(db, player_slug, chunk_size, force, sleep_seconds, skip_r2):
    object_key = build_object_key(player_slug)
    indexed_count = count_indexed_games(db, object_key)
    record = get_import_record(db, object_key)
    if not force and record and record.status == "complete" and indexed_count > 0:
        print(f"Already complete with {indexed_count} indexed games. Use --force to re-index.", flush=True)
        return {"imported": 0, "skipped": 0, "duplicates": 0, "status": "skipped"}

    if indexed_count > 0:
        deleted = delete_indexed_games(db, object_key)
        print(f"Deleted {deleted} existing indexed rows for {object_key}.", flush=True)

    game_ids = collect_game_ids(player_slug, sleep_seconds)
    print(f"\nCollected {len(game_ids)} unique game ids.", flush=True)
    if not game_ids:
        print("No master game ids found, skipping player.", flush=True)
        return {"imported": 0, "skipped": 0, "duplicates": 0, "status": "no-games"}

    record = ensure_import_record(db, object_key, f"{player_slug}-master-games.pgn")
    record.status = "running"
    record.games_imported = 0
    record.games_skipped = 0
    record.error = None
    record.started_at = datetime.now(timezone.utc)
    record.completed_at = None
    db.commit()

    total_imported = 0
    total_skipped = 0
    total_duplicates = 0
    pgn_archive = io.BytesIO()

    try:
        chunk_list = list(chunks(game_ids, chunk_size))
        for index, game_id_chunk in enumerate(chunk_list, start=1):
            time.sleep(sleep_seconds)
            print(f"\nDownloading chunk {index}/{len(chunk_list)} ({len(game_id_chunk)} games)...", flush=True)
            pgn_bytes = download_pgn(game_id_chunk)
            pgn_archive.write(pgn_bytes)
            if not pgn_bytes.endswith(b"\n\n"):
                pgn_archive.write(b"\n\n")

            result = import_pgn_stream(
                io.BytesIO(pgn_bytes),
                db,
                pgn_object_key=object_key,
                batch_size=500,
                dedupe_by_site=True,
            )
            total_imported += result["imported"]
            total_skipped += result["skipped"]
            total_duplicates += result.get("duplicates", 0)
            print(
                f"Indexed {result['imported']}, skipped {result['skipped']}, "
                f"duplicates {result.get('duplicates', 0)}.",
                flush=True,
            )

        archive_size_bytes = pgn_archive.tell()

        if not skip_r2:
            if r2_object_exists(object_key) and not force:
                print("R2 object exists, keeping it.", flush=True)
            else:
                upload_fileobj_to_r2(pgn_archive, object_key)
                print(f"Uploaded PGN archive to R2: {object_key}", flush=True)

        record.status = "complete"
        record.games_imported = total_imported
        record.games_skipped = total_skipped
        record.size_bytes = archive_size_bytes
        record.completed_at = datetime.now(timezone.utc)
        db.commit()
    except Exception as exc:
        db.rollback()
        record = get_import_record(db, object_key)
        if record:
            record.status = "failed"
            record.error = str(exc)
            db.commit()
        raise

    return {
        "imported": total_imported,
        "skipped": total_skipped,
        "duplicates": total_duplicates,
        "status": "complete",
    }


def main():
    parser = argparse.ArgumentParser(description="Import Chess.com master games for a player page.")
    parser.add_argument("player_slugs", nargs="*", help="Chess.com master game slugs, for example javokhir-sindarov")
    parser.add_argument("--players-file", help="JSON file with player names/slugs to import one by one")
    parser.add_argument("--chunk-size", type=int, default=100, help="How many game ids to download per request")
    parser.add_argument("--force", action="store_true", help="Delete and re-index this player's previous master import")
    parser.add_argument("--skip-r2", action="store_true", help="Index locally without uploading the combined PGN to R2")
    parser.add_argument("--sleep", type=float, default=0.5, help="Delay between Chess.com page/download requests")
    parser.add_argument("--no-refresh-stats", action="store_true", help="Do not rebuild imported player/opening stats")
    args = parser.parse_args()

    player_slugs = list(args.player_slugs)
    if args.players_file:
        player_slugs.extend(load_player_slugs(args.players_file))
    player_slugs = list(dict.fromkeys(slug for slug in player_slugs if slug))
    if not player_slugs:
        parser.error("Provide at least one player slug or --players-file")

    models.Base.metadata.create_all(bind=engine)
    ensure_import_stat_tables(engine)
    db = SessionLocal()

    try:
        ensure_imported_game_columns(db)
        total_imported = 0
        total_skipped = 0
        total_duplicates = 0

        for index, player_slug in enumerate(player_slugs, start=1):
            print(f"\n=== [{index}/{len(player_slugs)}] {player_slug} ===", flush=True)
            try:
                result = import_master_player(
                    db,
                    player_slug=player_slug,
                    chunk_size=args.chunk_size,
                    force=args.force,
                    sleep_seconds=args.sleep,
                    skip_r2=args.skip_r2,
                )
            except (HTTPError, URLError, TimeoutError) as exc:
                db.rollback()
                print(f"Failed {player_slug}: {exc}", flush=True)
                continue
            total_imported += result["imported"]
            total_skipped += result["skipped"]
            total_duplicates += result["duplicates"]

        if not args.no_refresh_stats:
            print("\nRefreshing imported player/opening stats...", flush=True)
            refresh_import_stats(db)

        print("\nDone.", flush=True)
        print(f"Imported games: {total_imported}", flush=True)
        print(f"Skipped games: {total_skipped}", flush=True)
        print(f"Duplicate games skipped: {total_duplicates}", flush=True)
    except (HTTPError, URLError, TimeoutError) as exc:
        print(f"Chess.com request failed: {exc}", flush=True)
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
