import argparse
import json
import re
import sys
from pathlib import Path

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal
from routers.r2_storage import delete_r2_objects, list_r2_objects
from services.import_stats import refresh_import_stats
from services.player_catalog import slugify_player_name


MASTER_PREFIX = "pgn-imports/chesscom-master/"


def parse_keep_values(values):
    keep = []
    for value in values:
        for part in re.split(r"[\n,;]+", value):
            clean = part.strip()
            if clean:
                keep.append(slugify_player_name(clean))
    return sorted(set(keep))


def load_keep_file(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    values = []
    for item in data:
        if isinstance(item, str):
            values.append(item)
        elif isinstance(item, dict):
            values.append(
                item.get("chesscom_master_slug")
                or item.get("master_slug")
                or item.get("slug")
                or item.get("name")
                or ""
            )
    return parse_keep_values(values)


def bind_slugs(slugs):
    params = {}
    clauses = []
    for index, slug in enumerate(slugs):
        key = f"slug_{index}"
        params[key] = f"{MASTER_PREFIX}{slug}/%"
        clauses.append(f"pgn_object_key LIKE :{key}")
    return params, clauses


def bind_file_slugs(slugs):
    params = {}
    clauses = []
    for index, slug in enumerate(slugs):
        key = f"file_slug_{index}"
        params[key] = f"{MASTER_PREFIX}{slug}/%"
        clauses.append(f"object_key LIKE :{key}")
    return params, clauses


def get_db_slugs(db):
    rows = db.execute(text("""
        SELECT slug
        FROM (
            SELECT substring(pgn_object_key from '^pgn-imports/chesscom-master/([^/]+)/') AS slug
            FROM imported_games
            WHERE pgn_object_key LIKE :prefix
            UNION
            SELECT substring(object_key from '^pgn-imports/chesscom-master/([^/]+)/') AS slug
            FROM imported_pgn_files
            WHERE object_key LIKE :prefix
        ) slugs
        WHERE slug IS NOT NULL AND slug <> ''
        ORDER BY slug
    """), {"prefix": f"{MASTER_PREFIX}%"}).all()
    return [row.slug for row in rows]


def audit_player(db, slug):
    prefix = f"{MASTER_PREFIX}{slug}/%"
    return db.execute(text("""
        SELECT
          :slug AS slug,
          (
            SELECT COUNT(*)
            FROM imported_games
            WHERE pgn_object_key LIKE :prefix
          ) AS db_rows,
          (
            SELECT COUNT(DISTINCT pgn_object_key)
            FROM imported_games
            WHERE pgn_object_key LIKE :prefix
          ) AS db_object_keys,
          (
            SELECT COUNT(DISTINCT (white, black, game_date, result, md5(COALESCE(moves, ''))))
            FROM imported_games
            WHERE pgn_object_key LIKE :prefix
          ) AS unique_games,
          (
            SELECT COUNT(*)
            FROM imported_pgn_files
            WHERE object_key LIKE :prefix
          ) AS file_rows,
          (
            SELECT COALESCE(SUM(games_imported), 0)
            FROM imported_pgn_files
            WHERE object_key LIKE :prefix
          ) AS file_imported,
          (
            SELECT COALESCE(SUM(games_skipped), 0)
            FROM imported_pgn_files
            WHERE object_key LIKE :prefix
          ) AS file_skipped
    """), {"slug": slug, "prefix": prefix}).first()._mapping


def collect_db_delete_counts(db, keep_slugs):
    game_params, game_keep_clauses = bind_slugs(keep_slugs)
    file_params, file_keep_clauses = bind_file_slugs(keep_slugs)

    game_keep_sql = " OR ".join(game_keep_clauses) or "FALSE"
    file_keep_sql = " OR ".join(file_keep_clauses) or "FALSE"

    games = int(db.execute(text(f"""
        SELECT COUNT(*)
        FROM imported_games
        WHERE pgn_object_key LIKE :master_prefix
          AND NOT ({game_keep_sql})
    """), {"master_prefix": f"{MASTER_PREFIX}%", **game_params}).scalar() or 0)

    files = int(db.execute(text(f"""
        SELECT COUNT(*)
        FROM imported_pgn_files
        WHERE object_key LIKE :master_prefix
          AND NOT ({file_keep_sql})
    """), {"master_prefix": f"{MASTER_PREFIX}%", **file_params}).scalar() or 0)

    return games, files


def delete_db_rows(db, keep_slugs):
    game_params, game_keep_clauses = bind_slugs(keep_slugs)
    file_params, file_keep_clauses = bind_file_slugs(keep_slugs)

    game_keep_sql = " OR ".join(game_keep_clauses) or "FALSE"
    file_keep_sql = " OR ".join(file_keep_clauses) or "FALSE"

    deleted_games = db.execute(text(f"""
        DELETE FROM imported_games
        WHERE pgn_object_key LIKE :master_prefix
          AND NOT ({game_keep_sql})
    """), {"master_prefix": f"{MASTER_PREFIX}%", **game_params}).rowcount

    deleted_files = db.execute(text(f"""
        DELETE FROM imported_pgn_files
        WHERE object_key LIKE :master_prefix
          AND NOT ({file_keep_sql})
    """), {"master_prefix": f"{MASTER_PREFIX}%", **file_params}).rowcount

    return deleted_games, deleted_files


def should_keep_r2_key(key, keep_slugs):
    return any(key.startswith(f"{MASTER_PREFIX}{slug}/") for slug in keep_slugs)


def main():
    parser = argparse.ArgumentParser(
        description="Audit and purge Chess.com master imports, keeping only selected players."
    )
    parser.add_argument("--keep", action="append", default=[], help="Player name/slug to keep. Can be repeated or comma-separated.")
    parser.add_argument("--keep-file", help="JSON file containing player names/slugs to keep.")
    parser.add_argument("--apply", action="store_true", help="Actually delete DB rows. Without this, only prints a dry-run report.")
    parser.add_argument("--delete-r2", action="store_true", help="Also delete R2 objects outside the keep list. Requires --apply.")
    parser.add_argument("--audit-kept", action="store_true", help="Print per-player audit for kept players.")
    args = parser.parse_args()

    keep_slugs = parse_keep_values(args.keep)
    if args.keep_file:
        keep_slugs = sorted(set(keep_slugs + load_keep_file(args.keep_file)))

    if not keep_slugs:
        parser.error("Provide at least one player via --keep or --keep-file.")
    if args.delete_r2 and not args.apply:
        parser.error("--delete-r2 requires --apply.")

    db = SessionLocal()
    try:
        existing_slugs = get_db_slugs(db)
        missing_kept = [slug for slug in keep_slugs if slug not in existing_slugs]
        purge_slugs = [slug for slug in existing_slugs if slug not in keep_slugs]
        delete_games, delete_files = collect_db_delete_counts(db, keep_slugs)

        print("Keep slugs:")
        for slug in keep_slugs:
            print(f"  {slug}")
        if missing_kept:
            print("\nKeep slugs not currently present in DB:")
            for slug in missing_kept:
                print(f"  {slug}")

        print(f"\nPlayers currently in DB: {len(existing_slugs)}")
        print(f"Players that would be purged: {len(purge_slugs)}")
        print(f"DB imported_games rows that would be deleted: {delete_games}")
        print(f"DB imported_pgn_files rows that would be deleted: {delete_files}")

        if args.audit_kept:
            print("\nKept player audit:")
            for slug in keep_slugs:
                row = audit_player(db, slug)
                print(
                    f"  {slug}: rows={row['db_rows']}, unique={row['unique_games']}, "
                    f"db_object_keys={row['db_object_keys']}, file_rows={row['file_rows']}, "
                    f"file_imported={row['file_imported']}, file_skipped={row['file_skipped']}"
                )

        if not args.apply:
            print("\nDry run only. Re-run with --apply to delete DB rows.")
            return

        deleted_games, deleted_files = delete_db_rows(db, keep_slugs)
        db.commit()
        print(f"\nDeleted DB imported_games rows: {deleted_games}")
        print(f"Deleted DB imported_pgn_files rows: {deleted_files}")

        if args.delete_r2:
            r2_keys = list(list_r2_objects(MASTER_PREFIX))
            delete_keys = [key for key in r2_keys if not should_keep_r2_key(key, keep_slugs)]
            deleted_r2 = delete_r2_objects(delete_keys)
            print(f"Deleted R2 objects: {deleted_r2}/{len(delete_keys)}")

        refresh_import_stats(db)
        print("Refreshed imported stats and player catalog.")
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
