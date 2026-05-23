import sys
from pathlib import Path

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

import models
from database import engine
from database import SessionLocal
from routers.r2_storage import delete_r2_objects, list_r2_objects
from services.import_stats import refresh_import_stats


MASTER_PREFIX = "pgn-imports/chesscom-master/"


def main():
    models.Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    try:
        deleted_sources = db.execute(text("""
            DELETE FROM imported_game_player_sources
            WHERE source = 'chesscom-master'
               OR source_object_key LIKE :prefix
        """), {"prefix": f"{MASTER_PREFIX}%"}).rowcount

        deleted_games = db.execute(text("""
            DELETE FROM imported_games
            WHERE pgn_object_key LIKE :prefix
              AND id NOT IN (
                SELECT game_id FROM imported_game_player_sources
              )
        """), {"prefix": f"{MASTER_PREFIX}%"}).rowcount

        deleted_files = db.execute(text("""
            DELETE FROM imported_pgn_files
            WHERE object_key LIKE :prefix
        """), {"prefix": f"{MASTER_PREFIX}%"}).rowcount

        db.commit()
        print(f"Deleted DB imported_game_player_sources rows: {deleted_sources}", flush=True)
        print(f"Deleted DB imported_games rows: {deleted_games}", flush=True)
        print(f"Deleted DB imported_pgn_files rows: {deleted_files}", flush=True)

        r2_keys = list(list_r2_objects(MASTER_PREFIX))
        deleted_r2 = delete_r2_objects(r2_keys) if r2_keys else 0
        print(f"Deleted R2 objects: {deleted_r2}/{len(r2_keys)}", flush=True)

        refresh_import_stats(db)
        print("Refreshed imported stats and player catalog.", flush=True)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
