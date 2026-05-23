import sys
from pathlib import Path

from sqlalchemy import text

BACKEND_DIR = Path(__file__).resolve().parent
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from database import SessionLocal
from services.import_stats import refresh_import_stats


CHESSCOM_MASTER_PREFIX = "pgn-imports/chesscom-master/%"


def main():
    db = SessionLocal()
    try:
        deleted_games = db.execute(text("""
            DELETE FROM imported_games
            WHERE pgn_object_key IS NULL
               OR pgn_object_key NOT LIKE :prefix
        """), {"prefix": CHESSCOM_MASTER_PREFIX}).rowcount

        deleted_files = db.execute(text("""
            DELETE FROM imported_pgn_files
            WHERE object_key NOT LIKE :prefix
        """), {"prefix": CHESSCOM_MASTER_PREFIX}).rowcount

        db.commit()
        print(f"Deleted non-Chess.com master imported_games rows: {deleted_games}", flush=True)
        print(f"Deleted non-Chess.com master imported_pgn_files rows: {deleted_files}", flush=True)

        refresh_import_stats(db)
        print("Refreshed imported stats and player catalog.", flush=True)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
