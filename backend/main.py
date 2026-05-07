import os
import socketio
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.sessions import SessionMiddleware

import models
from database import engine
from routers import auth, game, database
from sqlalchemy import text

load_dotenv()
SECRET_KEY = os.getenv("SECRET_KEY")

# Adatbázis táblák létrehozása
models.Base.metadata.create_all(bind=engine)

with engine.begin() as conn:
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS bio VARCHAR(50)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS about_me TEXT"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS first_name VARCHAR(100)"))
    conn.execute(text("ALTER TABLE users ADD COLUMN IF NOT EXISTS last_name VARCHAR(100)"))
    conn.execute(text("ALTER TABLE imported_games ADD COLUMN IF NOT EXISTS pgn_object_key VARCHAR(512)"))
    conn.execute(text("ALTER TABLE imported_games ADD COLUMN IF NOT EXISTS white_elo INTEGER"))
    conn.execute(text("ALTER TABLE imported_games ADD COLUMN IF NOT EXISTS black_elo INTEGER"))
    if engine.dialect.name == "postgresql":
        conn.execute(text("ALTER TABLE imported_games ALTER COLUMN pgn DROP NOT NULL"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_games_pgn_object_key ON imported_games (pgn_object_key)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS imported_pgn_files (id SERIAL PRIMARY KEY, object_key VARCHAR(512) UNIQUE NOT NULL, filename VARCHAR(255) NOT NULL, size_bytes INTEGER, status VARCHAR(30) NOT NULL DEFAULT 'pending', games_imported INTEGER DEFAULT 0, games_skipped INTEGER DEFAULT 0, error TEXT, started_at TIMESTAMP DEFAULT now(), completed_at TIMESTAMP)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_pgn_files_object_key ON imported_pgn_files (object_key)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_pgn_files_status ON imported_pgn_files (status)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS imported_player_stats (name TEXT PRIMARY KEY, games INTEGER NOT NULL DEFAULT 0)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_player_stats_lower_name ON imported_player_stats (lower(name))"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_player_stats_games ON imported_player_stats (games DESC)"))
    conn.execute(text("CREATE TABLE IF NOT EXISTS imported_opening_stats (opening TEXT PRIMARY KEY, games INTEGER NOT NULL DEFAULT 0)"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_imported_opening_stats_games ON imported_opening_stats (games DESC)"))

# --- SOCKET.IO BEÁLLÍTÁSA ---
# 1. Létrehozzuk az aszinkron Socket.io szervert
sio = socketio.AsyncServer(
    async_mode='asgi',
    cors_allowed_origins=["http://localhost:5173", "http://127.0.0.1:5173"]
)

# 2. Létrehozzuk a FastAPI appot
app = FastAPI(title="Checkmate.com API")


# --- MIDDLEWARE-EK ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
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

app.state.sio = sio

@app.get("/")
def home():
    return {"status": "Online"}


socket_app = socketio.ASGIApp(sio, app)
