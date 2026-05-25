import os
import socketio
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware

load_dotenv()

import models
from database import engine
from routers import auth, game, database, collections, saved_analyses, analysis_drafts
from sqlalchemy import text
from services.player_catalog import sync_player_catalog

SECRET_KEY = os.getenv("SECRET_KEY")
UPLOAD_ROOT = os.path.join(os.path.dirname(__file__), "uploads")
os.makedirs(os.path.join(UPLOAD_ROOT, "avatars"), exist_ok=True)
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
CORS_ALLOW_ORIGIN_REGEX = os.getenv("CORS_ALLOW_ORIGIN_REGEX", r"https://.*\.onrender\.com")
CORS_ORIGINS = [
    origin.strip().rstrip("/")
    for origin in os.getenv("CORS_ORIGINS", "").split(",")
    if origin.strip()
]
ALLOWED_ORIGINS = sorted(set([
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://checkmate-sqk9.onrender.com",
    FRONTEND_URL,
    *CORS_ORIGINS,
]))

# Adatbázis táblák létrehozása
models.Base.metadata.create_all(bind=engine)

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(50)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS about_me TEXT"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url VARCHAR(512)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT false"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS demo_expires_at TIMESTAMP"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT now()"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_is_demo ON users (is_demo)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_users_demo_expires_at ON users (demo_expires_at)"))
    conn.execute(text("ALTER TABLE games ADD COLUMN IF NOT EXISTS white_accuracy FLOAT"))
    conn.execute(text("ALTER TABLE games ADD COLUMN IF NOT EXISTS black_accuracy FLOAT"))
    conn.execute(text("ALTER TABLE games ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP"))
    conn.execute(text("ALTER TABLE imported_games ADD COLUMN IF NOT EXISTS pgn_object_key VARCHAR(512)"))
    conn.execute(text("ALTER TABLE imported_games ADD COLUMN IF NOT EXISTS white_elo INTEGER"))
    conn.execute(text("ALTER TABLE imported_games ADD COLUMN IF NOT EXISTS black_elo INTEGER"))
    if engine.dialect.name == "postgresql":
        conn.execute(text("ALTER TABLE imported_games ALTER COLUMN pgn DROP NOT NULL"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_games_pgn_object_key ON imported_games (pgn_object_key)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS imported_pgn_files (id SERIAL PRIMARY KEY, object_key VARCHAR(512) UNIQUE NOT NULL, filename VARCHAR(255) NOT NULL, size_bytes INTEGER, status VARCHAR(30) NOT NULL DEFAULT 'pending', games_imported INTEGER DEFAULT 0, games_skipped INTEGER DEFAULT 0, error TEXT, started_at TIMESTAMP DEFAULT now(), completed_at TIMESTAMP)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_pgn_files_object_key ON imported_pgn_files (object_key)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_pgn_files_status ON imported_pgn_files (status)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS imported_game_player_sources (id SERIAL PRIMARY KEY, game_id INTEGER NOT NULL REFERENCES imported_games(id) ON DELETE CASCADE, player_slug VARCHAR(255) NOT NULL, source VARCHAR(50) NOT NULL DEFAULT 'chesscom-master', source_object_key VARCHAR(512), source_game_id VARCHAR(50), imported_at TIMESTAMP DEFAULT now(), CONSTRAINT uq_imported_game_player_source UNIQUE (game_id, player_slug, source))"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_game_player_sources_game_id ON imported_game_player_sources (game_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_game_player_sources_player_slug ON imported_game_player_sources (player_slug)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_game_player_sources_source ON imported_game_player_sources (source)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_game_player_sources_source_object_key ON imported_game_player_sources (source_object_key)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_game_player_sources_source_game_id ON imported_game_player_sources (source_game_id)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS imported_player_stats (name TEXT PRIMARY KEY, games INTEGER NOT NULL DEFAULT 0)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_player_stats_lower_name ON imported_player_stats (lower(name))"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_player_stats_games ON imported_player_stats (games DESC)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS imported_opening_stats (opening TEXT PRIMARY KEY, games INTEGER NOT NULL DEFAULT 0)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_opening_stats_games ON imported_opening_stats (games DESC)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS collections (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, public_id VARCHAR(32) NOT NULL, name VARCHAR(255) NOT NULL, privacy VARCHAR(30) NOT NULL DEFAULT 'public', participants_json TEXT, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT uq_collections_user_public_id UNIQUE (user_id, public_id))"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_collections_user_id ON collections (user_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_collections_public_id ON collections (public_id)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS collection_games (id UUID PRIMARY KEY, collection_id UUID NOT NULL REFERENCES collections(id) ON DELETE CASCADE, client_game_id VARCHAR(255) NOT NULL, source_type VARCHAR(50), source_id VARCHAR(255), payload_json TEXT NOT NULL, added_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT uq_collection_games_client_game_id UNIQUE (collection_id, client_game_id))"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_collection_games_collection_id ON collection_games (collection_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_collection_games_client_game_id ON collection_games (client_game_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_collection_games_source_id ON collection_games (source_id)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS saved_analyses (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, client_analysis_id VARCHAR(255) NOT NULL, title VARCHAR(255), source_type VARCHAR(50), source_id VARCHAR(255), payload_json TEXT NOT NULL, added_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT uq_saved_analyses_client_analysis_id UNIQUE (user_id, client_analysis_id))"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_saved_analyses_user_id ON saved_analyses (user_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_saved_analyses_client_analysis_id ON saved_analyses (client_analysis_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_saved_analyses_source_id ON saved_analyses (source_id)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS analysis_drafts (id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, draft_key VARCHAR(64) NOT NULL DEFAULT 'current', title VARCHAR(255), payload_json TEXT NOT NULL, created_at TIMESTAMP NOT NULL DEFAULT now(), updated_at TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT uq_analysis_drafts_user_draft_key UNIQUE (user_id, draft_key))"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_analysis_drafts_user_id ON analysis_drafts (user_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_analysis_drafts_draft_key ON analysis_drafts (draft_key)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS demo_accesses (id UUID PRIMARY KEY, token_hash VARCHAR(64) UNIQUE NOT NULL, user_id UUID REFERENCES users(id) ON DELETE SET NULL, expires_at TIMESTAMP NOT NULL, revoked_at TIMESTAMP, consumed_at TIMESTAMP, created_at TIMESTAMP NOT NULL DEFAULT now())"))
    conn.execute(text("ALTER TABLE demo_accesses ADD COLUMN IF NOT EXISTS duration_hours INTEGER NOT NULL DEFAULT 24"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_demo_accesses_token_hash ON demo_accesses (token_hash)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_demo_accesses_user_id ON demo_accesses (user_id)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_demo_accesses_expires_at ON demo_accesses (expires_at)"))

try:
    from database import SessionLocal
    db = SessionLocal()
    try:
        sync_player_catalog(db)
    finally:
        db.close()
except Exception as exc:
    print(f"Player catalog sync skipped: {exc}")

# --- SOCKET.IO BEÁLLÍTÁSA ---
# 1. Létrehozzuk az aszinkron Socket.io szervert
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=ALLOWED_ORIGINS
)

# 2. Létrehozzuk a FastAPI appot
app = FastAPI(title="Checkmate.com API")
app.mount("/uploads", StaticFiles(directory=UPLOAD_ROOT), name="uploads")


# --- MIDDLEWARE-EK ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=CORS_ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_middleware(
    SessionMiddleware, 
    secret_key=SECRET_KEY,
    session_cookie="chess_session",
)

# --- SOCKET.IO ESEMÉNYEK ---
@sio.event
async def connect(sid, environ):
    print(f"Socket csatlakozott: {sid}")

@sio.event
async def disconnect(sid):
    print(f"Socket lecsatlakozott: {sid}")

# Példa: Játékos csatlakoztatása egy konkrét meccs szobájához
@sio.on("join_game")
async def join_game(sid, data):
    game_id = data.get("game_id")
    if game_id:
        await sio.enter_room(sid, str(game_id))
        print(f"SID {sid} belépett a {game_id} szobába.")

# --- ROUTEREK ---
app.include_router(auth.router)
app.include_router(game.router)
app.include_router(database.router)
app.include_router(collections.router)
app.include_router(saved_analyses.router)
app.include_router(analysis_drafts.router)

app.state.sio = sio

@app.get("/")
def home():
    return {"status": "Online"}


socket_app = CORSMiddleware(
    socketio.ASGIApp(sio, app),
    allow_origins=ALLOWED_ORIGINS,
    allow_origin_regex=CORS_ALLOW_ORIGIN_REGEX,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
