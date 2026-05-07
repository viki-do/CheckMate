import argparse
import io
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import models
from database import SessionLocal, engine
from routers.pgn_importer import import_pgn_stream
from routers.r2_storage import r2_object_exists, upload_fileobj_to_r2
from services.historical_players import HISTORICAL_PLAYERS
from services.import_stats import ensure_import_stat_tables, refresh_import_stats


CHESSCOM_API = "https://api.chess.com/pub"
DEFAULT_PLAYERS_FILE = BACKEND_DIR / "data" / "tracked_chesscom_players.json"
USER_AGENT = "CheckmateChessDatabase/1.0 (contact: local-dev)"
CURATED_PLAYER_NAMES = {player["name"] for player in HISTORICAL_PLAYERS}
NETWORK_RETRIES = 3
RETRY_DELAY_SECONDS = 3


def read_url(url, headers, timeout):
    last_error = None
    for attempt in range(1, NETWORK_RETRIES + 1):
        try:
            with urlopen(Request(url, headers=headers), timeout=timeout) as response:
                return response.read()
        except (TimeoutError, URLError) as exc:
            last_error = exc
            if attempt == NETWORK_RETRIES:
                raise
            print(f"Network retry {attempt}/{NETWORK_RETRIES} for {url}: {exc}", flush=True)
            time.sleep(RETRY_DELAY_SECONDS * attempt)
    raise last_error


def get_json(url):
    data = read_url(url, {"User-Agent": USER_AGENT, "Accept": "application/json"}, timeout=30)
    return json.loads(data.decode("utf-8"))


def get_text(url):
    data = read_url(
        url,
        {"User-Agent": USER_AGENT, "Accept": "application/x-chess-pgn,text/plain"},
        timeout=120,
    )
    return data.decode("utf-8", errors="replace")


def load_players(path):
    with open(path, "r", encoding="utf-8") as file_obj:
        players = json.load(file_obj)

    clean_players = []
    for player in players:
        username = str(player.get("username", "")).strip()
        if not username:
            continue
        clean_players.append({
            "name": str(player.get("name") or username).strip(),
            "username": username.lower(),
        })
    return clean_players


def archive_to_year_month(archive_url):
    parts = archive_url.rstrip("/").split("/")
    return parts[-2], parts[-1]


def get_archives(username):
    data = get_json(f"{CHESSCOM_API}/player/{username}/games/archives")
    return data.get("archives", [])


def build_object_key(username, year, month):
    return f"pgn-imports/chesscom/{username}/{year}-{month}.pgn"


def get_import_record(db, object_key):
    return db.query(models.ImportedPgnFile).filter(
        models.ImportedPgnFile.object_key == object_key
    ).first()


def count_indexed_games(db, object_key):
    return db.query(models.ImportedGame).filter(
        models.ImportedGame.pgn_object_key == object_key
    ).count()


def ensure_import_record(db, object_key, filename, size_bytes):
    record = get_import_record(db, object_key)
    if record:
        return record

    record = models.ImportedPgnFile(
        object_key=object_key,
        filename=filename,
        size_bytes=size_bytes,
        status="pending",
    )
    db.add(record)
    db.commit()
    return record


def sync_month(db, username, archive_url, skip_r2=False, force=False, dry_run=False):
    year, month = archive_to_year_month(archive_url)
    object_key = build_object_key(username, year, month)
    filename = f"{username}-{year}-{month}.pgn"
    indexed_count = count_indexed_games(db, object_key)
    record = get_import_record(db, object_key)

    if not force and record and record.status == "complete" and indexed_count > 0:
        return {"status": "skipped", "object_key": object_key, "imported": 0, "duplicates": 0}

    pgn_url = f"{archive_url}/pgn"
    pgn_text = get_text(pgn_url)
    pgn_bytes = pgn_text.encode("utf-8")

    if dry_run:
        game_count = pgn_text.count("\n[Event ")
        if pgn_text.startswith("[Event "):
            game_count += 1
        return {"status": "dry-run", "object_key": object_key, "estimated_games": game_count}

    record = ensure_import_record(db, object_key, filename, len(pgn_bytes))
    record.status = "running"
    record.games_imported = 0
    record.games_skipped = 0
    record.error = None
    record.started_at = datetime.now(timezone.utc)
    record.completed_at = None
    db.commit()

    try:
        if not skip_r2:
            r2_file = io.BytesIO(pgn_bytes)
            if not r2_object_exists(object_key):
                upload_fileobj_to_r2(r2_file, object_key)

        import_file = io.BytesIO(pgn_bytes)
        result = import_pgn_stream(
            import_file,
            db,
            pgn_object_key=object_key,
            batch_size=500,
            dedupe_by_site=True,
            allowed_player_names=CURATED_PLAYER_NAMES,
        )

        record.status = "complete"
        record.games_imported = result["imported"]
        record.games_skipped = result["skipped"]
        record.completed_at = datetime.now(timezone.utc)
        db.commit()
        return {"status": "complete", "object_key": object_key, **result}
    except Exception as exc:
        db.rollback()
        record = get_import_record(db, object_key)
        if record:
            record.status = "failed"
            record.error = str(exc)
            db.commit()
        raise


def upload_month_to_r2(username, archive_url, dry_run=False):
    year, month = archive_to_year_month(archive_url)
    object_key = build_object_key(username, year, month)

    if r2_object_exists(object_key):
        return {"status": "skipped", "object_key": object_key}

    pgn_url = f"{archive_url}/pgn"
    pgn_text = get_text(pgn_url)
    pgn_bytes = pgn_text.encode("utf-8")

    if dry_run:
        return {"status": "dry-run", "object_key": object_key, "size_bytes": len(pgn_bytes)}

    upload_fileobj_to_r2(io.BytesIO(pgn_bytes), object_key)
    return {"status": "uploaded", "object_key": object_key, "size_bytes": len(pgn_bytes)}


def main():
    parser = argparse.ArgumentParser(description="Sync curated Chess.com player archives into the local database.")
    parser.add_argument("--players", default=str(DEFAULT_PLAYERS_FILE), help="JSON file with {name, username} entries")
    parser.add_argument("--player", action="append", help="Sync one Chess.com username; can be passed multiple times")
    parser.add_argument("--limit-months", type=int, default=None, help="Only sync the latest N archive months per player")
    parser.add_argument("--skip-r2", action="store_true", help="Index PGNs without uploading monthly PGN files to R2")
    parser.add_argument("--upload-missing-r2", action="store_true", help="Upload missing monthly PGNs to R2 without indexing games")
    parser.add_argument("--force", action="store_true", help="Re-download and re-index months even if marked complete")
    parser.add_argument("--dry-run", action="store_true", help="Download metadata/PGNs but do not write database or R2")
    parser.add_argument("--no-refresh-stats", action="store_true", help="Do not rebuild imported player/opening stats")
    parser.add_argument("--sleep", type=float, default=1.0, help="Delay between Chess.com API requests")
    args = parser.parse_args()

    models.Base.metadata.create_all(bind=engine)
    ensure_import_stat_tables(engine)
    db = SessionLocal()
    if engine.dialect.name == "postgresql":
        from sqlalchemy import text
        db.execute(text("ALTER TABLE imported_games ADD COLUMN IF NOT EXISTS white_elo INTEGER"))
        db.execute(text("ALTER TABLE imported_games ADD COLUMN IF NOT EXISTS black_elo INTEGER"))
        db.commit()

    if args.player:
        players = [{"name": username, "username": username.lower()} for username in args.player]
    else:
        players = load_players(args.players)

    total_imported = 0
    total_duplicates = 0
    total_skipped = 0
    total_uploaded = 0
    total_upload_skipped = 0

    try:
        for player_index, player in enumerate(players, start=1):
            username = player["username"]
            print(f"\n[{player_index}/{len(players)}] {player['name']} ({username})", flush=True)
            try:
                archives = get_archives(username)
            except (HTTPError, URLError, TimeoutError) as exc:
                print(f"Could not fetch archives: {exc}", flush=True)
                continue

            if args.limit_months:
                archives = archives[-args.limit_months:]
            print(f"Archive months: {len(archives)}", flush=True)
            time.sleep(args.sleep)

            for month_index, archive_url in enumerate(archives, start=1):
                year, month = archive_to_year_month(archive_url)
                print(f"  [{month_index}/{len(archives)}] {year}-{month}", flush=True)
                try:
                    if args.upload_missing_r2:
                        result = upload_month_to_r2(username, archive_url, dry_run=args.dry_run)
                    else:
                        result = sync_month(
                            db,
                            username,
                            archive_url,
                            skip_r2=args.skip_r2,
                            force=args.force,
                            dry_run=args.dry_run,
                        )
                    print(f"    {result}", flush=True)
                    total_imported += int(result.get("imported") or 0)
                    total_duplicates += int(result.get("duplicates") or 0)
                    if result.get("status") == "skipped":
                        if args.upload_missing_r2:
                            total_upload_skipped += 1
                        else:
                            total_skipped += 1
                    if result.get("status") == "uploaded":
                        total_uploaded += 1
                except (HTTPError, URLError, TimeoutError) as exc:
                    print(f"    HTTP error: {exc}", flush=True)
                time.sleep(args.sleep)

        if not args.upload_missing_r2 and not args.dry_run and not args.no_refresh_stats:
            print("\nRefreshing imported player/opening stats...", flush=True)
            refresh_import_stats(db)

        print("\nDone.", flush=True)
        print(f"Imported games: {total_imported}", flush=True)
        print(f"Duplicate games skipped: {total_duplicates}", flush=True)
        print(f"Complete months skipped: {total_skipped}", flush=True)
        print(f"R2 months uploaded: {total_uploaded}", flush=True)
        print(f"R2 months already present: {total_upload_skipped}", flush=True)
    finally:
        db.close()


if __name__ == "__main__":
    main()
