from sqlalchemy import Column, Integer, String, Enum, DateTime, ForeignKey, Text, Float, Index, Boolean, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy import func
from database import Base
import uuid
import enum
from datetime import datetime, timezone

class GameCategory(enum.Enum):
    bullet = "bullet"
    blitz = "blitz"
    rapid = "rapid"
    daily = "daily"
    custom = "custom"

class GameStatus(enum.Enum):
    ongoing = "ongoing"
    finished = "finished"
    draw = "draw"
    aborted = "aborted"
    resigned = "resigned"
    checkmate = "checkmate"

# --- 2. TÁBLÁK (MODELLEK) ---
class User(Base):
    __tablename__ = "users"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username = Column(String(50), unique=True, nullable=False)
    email = Column(String(255), unique=True, nullable=False)
    password_hash = Column(Text, nullable=True) 
    provider = Column(String(20), default="local") 
    bio = Column(String(50), nullable=True)
    about_me = Column(Text, nullable=True)
    first_name = Column(String(100), nullable=True)
    last_name = Column(String(100), nullable=True)
    avatar_url = Column(String(512), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    
class Game(Base):
    __tablename__ = "games"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    white_player_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    black_player_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    time_category = Column(Enum(GameCategory), nullable=False)
    base_time_sec = Column(Integer, nullable=False)
    # Most már látni fogja a GameStatus-t:
    status = Column(Enum(GameStatus), default=GameStatus.ongoing)
    pgn = Column(Text)
    created_at = Column(DateTime, server_default=func.now())
    bot_elo = Column(Integer, default=1500)
    bot_id = Column(String, nullable=True)    
    bot_style = Column(String, default="mix")  
    player_color = Column(String, default="white")
    white_accuracy = Column(Float, nullable=True)
    black_accuracy = Column(Float, nullable=True)
    reviewed_at = Column(DateTime, nullable=True)


class Move(Base):
    __tablename__ = "moves"
    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id"))
    move_number = Column(Integer, nullable=False)
    notation = Column(String(20), nullable=False)
    fen_before = Column(Text, nullable=False)
    fen_after = Column(Text, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc))
    accuracy_label = Column(String, nullable=True) 
    evaluation = Column(Float, nullable=True)
    best_move_uci = Column(String, nullable=True)
    win_chance_drop = Column(Float, nullable=True)


class ImportedGame(Base):
    __tablename__ = "imported_games"

    id = Column(Integer, primary_key=True, index=True)
    event = Column(String(255), nullable=True)
    site = Column(String(255), nullable=True)
    game_date = Column(String(20), nullable=True)
    round = Column(String(50), nullable=True)
    white = Column(String(255), nullable=True, index=True)
    black = Column(String(255), nullable=True, index=True)
    result = Column(String(20), nullable=True)
    white_elo = Column(Integer, nullable=True)
    black_elo = Column(Integer, nullable=True)
    eco = Column(String(20), nullable=True, index=True)
    opening = Column(String(255), nullable=True, index=True)
    ply_count = Column(Integer, nullable=True)
    source = Column(String(255), nullable=True)
    pgn_object_key = Column(String(512), nullable=True, index=True)
    moves = Column(Text, nullable=True)
    pgn = Column(Text, nullable=True)
    imported_at = Column(DateTime, server_default=func.now())


Index("ix_imported_games_white_lower", func.lower(ImportedGame.white))
Index("ix_imported_games_black_lower", func.lower(ImportedGame.black))
Index("ix_imported_games_opening_lower", func.lower(ImportedGame.opening))


class Player(Base):
    __tablename__ = "players"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), unique=True, nullable=False, index=True)
    slug = Column(String(255), unique=True, nullable=True, index=True)
    chesscom_username = Column(String(255), nullable=True, index=True)
    chesscom_master_slug = Column(String(255), nullable=True, index=True)
    aliases = Column(Text, nullable=True)
    games = Column(Integer, nullable=False, default=0, index=True)
    is_catalog = Column(Boolean, nullable=False, default=True, index=True)
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class ImportedPgnFile(Base):
    __tablename__ = "imported_pgn_files"

    id = Column(Integer, primary_key=True, index=True)
    object_key = Column(String(512), unique=True, nullable=False, index=True)
    filename = Column(String(255), nullable=False)
    size_bytes = Column(Integer, nullable=True)
    status = Column(String(30), nullable=False, default="pending", index=True)
    games_imported = Column(Integer, default=0)
    games_skipped = Column(Integer, default=0)
    error = Column(Text, nullable=True)
    started_at = Column(DateTime, server_default=func.now())
    completed_at = Column(DateTime, nullable=True)


class ImportedGamePlayerSource(Base):
    __tablename__ = "imported_game_player_sources"
    __table_args__ = (
        UniqueConstraint("game_id", "player_slug", "source", name="uq_imported_game_player_source"),
    )

    id = Column(Integer, primary_key=True, index=True)
    game_id = Column(Integer, ForeignKey("imported_games.id", ondelete="CASCADE"), nullable=False, index=True)
    player_slug = Column(String(255), nullable=False, index=True)
    source = Column(String(50), nullable=False, default="chesscom-master", index=True)
    source_object_key = Column(String(512), nullable=True, index=True)
    source_game_id = Column(String(50), nullable=True, index=True)
    imported_at = Column(DateTime, server_default=func.now())
