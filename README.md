# Checkmate Render

Checkmate Render is a full-stack chess application inspired by the everyday flow of Chess.com: playing against bots, reviewing completed games, browsing a master-game database, saving analyses, and organizing games into collections.

The project is not just a chessboard UI. It treats every game as data that can be replayed, analyzed, searched, imported, grouped, and connected to a player profile.

## What The Project Does

- Play chess against bot opponents with configurable strength, style, color, and time control.
- Store completed games, moves, FEN snapshots, results, clocks, and review metadata.
- Run Stockfish-backed game review with move labels such as book, best, excellent, good, inaccuracy, mistake, blunder, great, and brilliant.
- Show engine lines, evaluations, best moves, win-chance loss, phase summaries, and player accuracies.
- Browse a large imported PGN database of master games.
- Search games by player, opponent, opening, ECO code, year, rating, move count, and color pairing.
- View player database profiles with win/draw/loss splits and color-based statistics.
- Import PGN files and store import metadata.
- Save analyses and keep a current analysis draft.
- Create collections of games and preserve client-side analysis payloads on the backend.
- Manage user accounts, profile details, avatars, username changes, and password changes.
- Support demo access links with expiration and cleanup.
- Support OAuth login through Google, GitHub, and Facebook when credentials are configured.

## Architecture

The app is split into a React frontend and a FastAPI backend.

```text
checkmate_render/
+-- backend/
|   +-- main.py                    # FastAPI + Socket.IO app entrypoint
|   +-- models.py                  # SQLAlchemy models
|   +-- database.py                # Database engine/session setup
|   +-- routers/                   # API routers by feature area
|   +-- services/                  # Catalog/import support logic
|   +-- data/                      # Player manifests and ECO opening data
+-- frontend/
|   +-- src/
|   |   +-- App.jsx                # Main route map
|   |   +-- pages/                 # Top-level screens
|   |   +-- components/            # UI and feature components
|   |   +-- hooks/                 # Chess game state and helpers
|   |   +-- services/              # Frontend API wrappers
|   |   +-- constants/             # Static app data
|   |   +-- config/                # API URL and asset helpers
|   +-- public/assets/             # Pieces, sounds, icons, bot/player images
+-- exports/                       # Local export/output area
```

## Technology Stack

### Frontend

- React 19
- Vite
- React Router
- Tailwind CSS
- chess.js
- Axios
- Socket.IO client
- Framer Motion
- Lucide React icons

### Backend

- Python 3.12
- FastAPI
- SQLAlchemy
- PostgreSQL-compatible database connection
- python-chess
- Stockfish
- python-socketio ASGI integration
- JWT authentication
- Argon2 password hashing
- Authlib OAuth client
- boto3 for Cloudflare R2-compatible object storage

## Backend Feature Areas

The backend is organized around routers:

- `auth.py`: registration, login, JWT auth, OAuth, demo access, profiles, avatars, usernames, passwords.
- `game.py`: game creation, legal moves, bot moves, resignation, timeout, draw offers, history, archive data, full-game review.
- `analysis_engine.py`: chess review heuristics and move classification logic.
- `database.py`: PGN import, master-game search, player catalog, opening explorer, player profiles.
- `collections.py`: user-owned game collections.
- `saved_analyses.py`: persisted analysis payloads.
- `analysis_drafts.py`: current analysis draft storage.
- `pgn_importer.py`: PGN stream parsing and database import.
- `r2_storage.py`: Cloudflare R2-compatible object upload and archive stats.

## Data Model

The main SQLAlchemy models are:

- `User`: local/OAuth/demo accounts, profile fields, avatars, demo expiration.
- `Game`: user games, bot metadata, time control, status, PGN, review accuracy.
- `Move`: SAN notation, FEN before/after, analysis label, evaluation, best move, win-chance drop.
- `ImportedGame`: imported PGN game records for the searchable database.
- `Player`: curated player catalog with aliases, slugs, Chess.com identifiers, and game counts.
- `ImportedPgnFile`: import tracking for PGN objects.
- `ImportedGamePlayerSource`: links imported games to canonical master-player sources.
- `Collection` and `CollectionGame`: saved groups of games.
- `SavedAnalysis`: user-saved analysis payloads.
- `AnalysisDraft`: current analysis state.
- `DemoAccess`: one-time demo registration links.

The backend currently creates tables on startup and also applies pragmatic `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` migrations in `main.py`. That makes the app easy to evolve during development, but a production hardening pass should move this into a formal migration system such as Alembic.

## Chess Review Logic

The review system is built around `ChessCoachEngine`.

It uses Stockfish through `python-chess`, but the product behavior is not a plain Stockfish dump. The app adds its own interpretation layer:

- converts centipawn scores into win chances;
- evaluates win-chance loss per move;
- separates opening, middlegame, and endgame thresholds;
- detects book moves from ECO/opening data;
- identifies strong tactical or forcing moves as `great` or `brilliant` candidates;
- computes side-specific and phase-specific accuracy.

This makes the review experience closer to a coaching product than a raw engine console.

## Game Database

The database feature is one of the central pieces of the app.

It supports:

- PGN upload/import;
- imported game storage;
- player-name normalization;
- canonical historical player catalog entries;
- player aliases and slug-based matching;
- master-game source scoping;
- opening detection from ECO JSON data;
- first-move and next-move exploration;
- paginated game search;
- player profile summaries.

The app includes ECO opening files under `backend/data/openings/`.

## Authentication And Demo Mode

Authentication is JWT-based. Local accounts use Argon2 password hashes.

The project also supports:

- Google OAuth;
- GitHub OAuth;
- Facebook OAuth;
- demo access links;
- demo account expiration;
- cleanup of expired demo users and their related saved data.

Demo registration can be enforced with:

```env
REQUIRE_DEMO_TOKEN_FOR_REGISTRATION=true
```

Admin demo-link creation requires:

```env
DEMO_ADMIN_SECRET=...
```

## Realtime Layer

The backend wraps FastAPI with Socket.IO ASGI support.

Socket.IO is used for game rooms and realtime game events such as:

- joining a game room;
- bot move notifications;
- game-over notifications.

The ASGI entrypoint used by the Dockerfile is:

```bash
uvicorn main:socket_app --host 0.0.0.0 --port 8000
```

## Environment Variables

### Backend

Required:

```env
DATABASE_URL=postgresql://user:password@host:5432/database
SECRET_KEY=replace-with-a-secure-secret
```

Common local/deployment settings:

```env
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000
CORS_ORIGINS=
CORS_ALLOW_ORIGIN_REGEX=https://.*\.onrender\.com
STOCKFISH_PATH=/path/to/stockfish
STOCKFISH_THREADS=1
STOCKFISH_HASH_MB=32
REVIEW_DEPTH=10
REVIEW_NODES=35000
REVIEW_TIME_SEC=0.16
PLAYED_MOVE_DEPTH=8
PLAYED_MOVE_NODES=10000
PLAYED_MOVE_TIME_SEC=0.04
REVIEW_MULTIPV=2
BOT_MULTIPV=3
```

Optional OAuth:

```env
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
FACEBOOK_CLIENT_ID=
FACEBOOK_CLIENT_SECRET=
```

Optional Cloudflare R2-compatible storage:

```env
R2_ENDPOINT_URL=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_REGION=auto
R2_BUCKET_NAME=
```

Optional demo mode:

```env
DEMO_ADMIN_SECRET=
REQUIRE_DEMO_TOKEN_FOR_REGISTRATION=false
```

### Frontend

```env
VITE_API_BASE=http://localhost:8000
```

If `VITE_API_BASE` is omitted, the frontend defaults to `http://localhost:8000`.

## Local Development

### 1. Backend

From the repository root:

```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
```

Create a backend `.env` file with at least:

```env
DATABASE_URL=postgresql://user:password@localhost:5432/checkmate
SECRET_KEY=dev-secret
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:8000
```

Start the backend:

```bash
uvicorn main:socket_app --reload --host 0.0.0.0 --port 8000
```

Stockfish must be available through `STOCKFISH_PATH`, installed on the system path, or placed where `backend/routers/game.py` expects the local fallback binary.

### 2. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on:

```text
http://localhost:5173
```

## Build

Frontend production build:

```bash
cd frontend
npm run build
```

Backend Docker image:

```bash
cd backend
docker build -t checkmate-backend .
```

The backend Dockerfile installs Stockfish from the Debian package repository and starts `main:socket_app`.

## Tests And Checks

The repository contains backend test coverage for bot style behavior:

```bash
cd backend
pytest
```

Frontend linting:

```bash
cd frontend
npm run lint
```

Frontend build check:

```bash
cd frontend
npm run build
```

## Design Principles

### 1. Treat chess games as durable data

A game is more than a board state. The app stores moves, FEN snapshots, result information, review output, player profiles, collections, and imported PGN metadata so that games can keep producing value after they finish.

### 2. Use proven chess libraries for rules

The project relies on `chess.js` and `python-chess` instead of hand-rolling legal move generation, SAN parsing, FEN handling, PGN parsing, and engine integration.

### 3. Keep product behavior above raw engine output

Stockfish provides calculation, but the app adds coaching interpretation: phase thresholds, win-chance loss, move labels, book detection, and accuracy summaries.

### 4. Optimize for a Chess.com-like user journey

The main navigation and routes map to familiar chess workflows: play, review, analysis, saved analyses, collections, archive, profile, and game database.

### 5. Prefer feature-oriented structure

Frontend components are grouped around screens and feature areas. Backend routers are grouped around product domains rather than one large API file.

### 6. Keep deployment pragmatic

The current backend uses startup-time schema adjustments, environment-variable configuration, Render-friendly CORS defaults, and a Dockerfile with Stockfish included. This favors fast iteration and deployment simplicity.

## Current Limitations And Notes

- There is no formal migration tool yet; schema evolution currently happens in `main.py`.
- Some comments in older files show encoding artifacts from Hungarian text. The code still works, but comments could be cleaned up.
- Stockfish availability is essential for full analysis and stronger bot play. The backend has fallback bot move logic, but review quality depends on the engine.
- Cloudflare R2 features require the R2 environment variables to be configured.
- OAuth providers require valid provider credentials and matching callback URLs.
- The frontend README is still the default Vite template; this root README is the authoritative project overview.


## Project Summary

Checkmate Render is a pragmatic full-stack chess platform prototype with real product depth. Its strongest engineering idea is that chess games should become searchable, reviewable, reusable data. The app combines a playable bot experience, a Stockfish-backed review system, user profiles, saved analyses, collections, and an imported master-game database into one coherent chess workspace.
