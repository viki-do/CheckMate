import argparse
import json
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parent
REPO_DIR = BACKEND_DIR.parent


def main():
    parser = argparse.ArgumentParser(description="Import a manifest of local PGN files as linked master games.")
    parser.add_argument("--root", required=True, help="Folder containing the PGN files/folders")
    parser.add_argument("--manifest", default=str(BACKEND_DIR / "data" / "local_chess_players_manifest.json"))
    parser.add_argument("--force", action="store_true")
    parser.add_argument("--skip-r2", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    with open(args.manifest, "r", encoding="utf-8") as file_obj:
        entries = json.load(file_obj)

    python = BACKEND_DIR / "venv" / "Scripts" / "python.exe"
    script = BACKEND_DIR / "import_historical_pgn_folder.py"

    print(f"Found {len(entries)} local player import(s).", flush=True)
    for index, entry in enumerate(entries, start=1):
        slug = entry["slug"]
        input_path = root / entry["path"]
        if not input_path.exists():
            raise FileNotFoundError(f"Missing local PGN path for {slug}: {input_path}")

        command = [
            str(python),
            str(script),
            str(input_path),
            "--player-slug",
            slug,
            "--link-player-source",
            "chesscom-master",
            "--no-refresh-stats",
        ]
        if args.force:
            command.append("--force")
        if args.skip_r2:
            command.append("--skip-r2")

        print(f"\n=== [{index}/{len(entries)}] {slug} ===", flush=True)
        subprocess.run(command, cwd=str(REPO_DIR), check=True)

    print("\nRefreshing imported player/opening stats...", flush=True)
    subprocess.run([
        str(python),
        "-c",
        "import sys; sys.path.insert(0, 'backend'); from database import SessionLocal; from services.import_stats import refresh_import_stats; db=SessionLocal(); refresh_import_stats(db); db.close(); print('Done.')",
    ], cwd=str(REPO_DIR), check=True)

    print("\nDone.", flush=True)


if __name__ == "__main__":
    main()
