import io
import json
import re
from pathlib import Path

import chess
import chess.pgn
from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session

import models
from database import SessionLocal
from services.historical_players import HISTORICAL_PLAYERS, normalize_for_match, normalize_player_name
from .auth import get_current_user_id
from .pgn_importer import import_pgn_stream
from .r2_storage import build_pgn_object_key, get_r2_prefix_stats, upload_fileobj_to_r2

router = APIRouter(prefix="/database", tags=["Game Database"])

BEST_PLAYERS_OF_ALL_TIME = [
    {"name": "Garry Kasparov", "aliases": ["garry kasparov", "gary kasparov", "kasparov, garry"]},
    {"name": "Magnus Carlsen", "aliases": ["magnus carlsen", "carlsen, magnus"]},
    {"name": "Bobby Fischer", "aliases": ["bobby fischer", "robert james fischer", "fischer, bobby"]},
    {"name": "Jose Raul Capablanca", "aliases": ["jose raul capablanca", "capablanca, jose raul"]},
    {"name": "Anatoly Karpov", "aliases": ["anatoly karpov", "anatoly yevgenyevich karpov", "karpov, anatoly"]},
    {"name": "Mikhail Botvinnik", "aliases": ["mikhail botvinnik", "botvinnik, mikhail"]},
    {"name": "Vladimir Kramnik", "aliases": ["vladimir kramnik", "kramnik, vladimir"]},
    {"name": "Emanuel Lasker", "aliases": ["emanuel lasker", "lasker, emanuel"]},
    {"name": "Mikhail Tal", "aliases": ["mikhail tal", "tal, mikhail"]},
    {"name": "Alexander Alekhine", "aliases": ["alexander alekhine", "alekhine, alexander"]},
]

CATALOG_PLAYERS = [player["name"] for player in HISTORICAL_PLAYERS]
OPENING_BOOK = None


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def serialize_game(game):
    detected_opening = get_detected_opening(game.moves, game.result, game.eco, game.opening)
    return {
        "id": game.id,
        "event": game.event,
        "site": game.site,
        "date": game.game_date,
        "round": game.round,
        "white": normalize_player_name(game.white),
        "black": normalize_player_name(game.black),
        "white_elo": game.white_elo,
        "black_elo": game.black_elo,
        "result": game.result,
        "eco": game.eco,
        "opening": game.opening,
        "detected_opening": detected_opening,
        "ply_count": game.ply_count,
        "source": game.source,
        "pgn_object_key": game.pgn_object_key,
        "moves": game.moves,
    }


def parse_first_move_record(moves_text: str, result: str = ""):
    if not moves_text:
        return None

    try:
        game = chess.pgn.read_game(io.StringIO(f"{moves_text} {result or '*'}".strip()))
        if not game:
            return None

        board = game.board()
        first_move = next(game.mainline_moves(), None)
        if not first_move:
            return None

        san = board.san(first_move)
        return san
    except Exception:
        return None


FIRST_MOVE_EVALS = {
    "e4": 0.22,
    "d4": 0.26,
    "Nf3": 0.28,
    "c4": 0.19,
    "b3": -0.06,
    "f4": -0.20,
    "g3": 0.15,
    "a3": -0.05,
    "e3": 0.13,
    "Nc3": -0.06,
    "d3": -0.19,
}


def clean_first_move_token(token: str):
    cleaned = re.sub(r"[!?+#]+$", "", str(token or "").strip())
    return cleaned or None


def extract_first_move_fast(moves_text: str):
    text_value = re.sub(r"\{[^}]*\}|\([^)]*\)|\$\d+", " ", str(moves_text or ""))
    text_value = re.sub(r"^\s*1\.(?:\.\.)?\s*", "", text_value.strip())
    token = text_value.split()[0] if text_value.split() else ""
    token = re.sub(r"^\d+\.(?:\.\.)?", "", token)
    token = clean_first_move_token(token)
    if token in {"1-0", "0-1", "1/2-1/2", "*"}:
        return None
    return token


def tokenize_moves_fast(moves_text: str):
    text_value = re.sub(r"\{[^}]*\}|\([^)]*\)|\$\d+", " ", str(moves_text or ""))
    tokens = []
    for token in text_value.replace("\n", " ").split():
        cleaned = re.sub(r"^\d+\.(?:\.\.)?", "", token.strip())
        cleaned = clean_first_move_token(cleaned)
        if not cleaned or cleaned in {"1-0", "0-1", "1/2-1/2", "*"}:
            continue
        tokens.append(cleaned)
    return tokens


def format_ply_move(ply_index: int, move_san: str):
    move_number = (ply_index // 2) + 1
    return f"{move_number}. {move_san}" if ply_index % 2 == 0 else f"{move_number}... {move_san}"


def player_name_variants(name: str):
    cleaned = name.strip().lower()
    variants = {cleaned}
    if " " in cleaned and "," not in cleaned:
        parts = cleaned.split()
        if len(parts) >= 2:
            variants.add(f"{parts[-1]}, {' '.join(parts[:-1])}")
    return sorted(v for v in variants if v)


def sql_player_name(column: str):
    return (
        "trim(regexp_replace("
        f"regexp_replace(replace(replace(replace(replace(lower({column}), '_', ' '), '-', ' '), ',', ' '), '.', ' '), "
        r"'\([^)]*\)', ' ', 'g'), "
        r"'\s+', ' ', 'g'))"
    )


def catalog_variants_for_player(player):
    variants = {normalize_for_match(player["name"]), player["name"].strip().lower()}
    for alias in player.get("aliases", []):
        variants.add(normalize_for_match(alias))
        variants.add(str(alias).strip().lower().replace("_", " ").replace("-", " "))
    return sorted(value for value in variants if value)


def get_catalog_variant_map():
    return {
        player["name"]: catalog_variants_for_player(player)
        for player in HISTORICAL_PLAYERS
    }


def get_all_catalog_variants():
    variants = set()
    for player_variants in get_catalog_variant_map().values():
        variants.update(player_variants)
    return sorted(variants)


def get_catalog_variants_for_name(name: str):
    requested = normalize_for_match(name)
    for player in HISTORICAL_PLAYERS:
        variants = catalog_variants_for_player(player)
        if requested in variants:
            return player["name"], variants
    return name, player_name_variants(name)


def get_catalog_master_object_key(name: str):
    canonical_name, variants = get_catalog_variants_for_name(name)
    for player in HISTORICAL_PLAYERS:
        if player["name"] == canonical_name:
            slug = re.sub(r"[^a-z0-9]+", "-", normalize_for_match(canonical_name)).strip("-")
            return f"pgn-imports/chesscom-master/{slug}/master-games.pgn", variants
    return None, variants


def get_catalog_master_scope(name: str):
    master_object_key, variants = get_catalog_master_object_key(name)
    if not master_object_key:
        return None, None, None, variants
    return (
        master_object_key,
        master_object_key.rsplit("/", 1)[0] + "/updates/%",
        master_object_key.rsplit("/", 1)[0] + "/%",
        variants,
    )


def master_object_keys_for_scope(db: Session, master_object_key: str, master_updates_prefix: str):
    rows = (
        db.query(models.ImportedPgnFile.object_key)
        .filter(or_(
            models.ImportedPgnFile.object_key == master_object_key,
            models.ImportedPgnFile.object_key.like(master_updates_prefix),
        ))
        .all()
    )
    object_keys = [row.object_key for row in rows]
    if master_object_key not in object_keys:
        object_keys.insert(0, master_object_key)
    return object_keys


def bind_master_object_keys(query_params, object_keys):
    placeholders = []
    for index, object_key in enumerate(object_keys):
        key = f"master_object_key_{index}"
        query_params[key] = object_key
        placeholders.append(f":{key}")
    return ", ".join(placeholders)


def unique_master_games_cte():
    return """
        WITH unique_master_games AS (
            SELECT DISTINCT g.id, g.event, g.site, g.game_date, g.round, g.white, g.black,
                   g.white_elo, g.black_elo, g.result, g.eco, g.opening, g.ply_count,
                   g.source, g.pgn_object_key, g.moves
            FROM imported_games g
            JOIN imported_game_player_sources s ON s.game_id = g.id
            WHERE s.player_slug = :master_player_slug
              AND s.source = 'chesscom-master'
              AND g.white <> 'Unknown'
              AND g.black <> 'Unknown'
        )
    """


def bind_values(prefix: str, values):
    return {f"{prefix}_{index}": value for index, value in enumerate(values)}


def placeholders(prefix: str, values):
    return ", ".join(f":{prefix}_{index}" for index in range(len(values)))


def player_game_clause(player_variants):
    player_sql = placeholders("player", player_variants)
    white = sql_player_name("white")
    black = sql_player_name("black")
    return f"({white} IN ({player_sql}) OR {black} IN ({player_sql}))"


def serialize_game_row(row):
    data = row._mapping
    detected_opening = get_detected_opening(data["moves"], data["result"], data["eco"], data["opening"])
    return {
        "id": data["id"],
        "event": data["event"],
        "site": data["site"],
        "date": data["game_date"],
        "round": data["round"],
        "white": normalize_player_name(data["white"]),
        "black": normalize_player_name(data["black"]),
        "white_elo": data["white_elo"],
        "black_elo": data["black_elo"],
        "result": data["result"],
        "eco": data["eco"],
        "opening": data["opening"],
        "detected_opening": detected_opening,
        "ply_count": data["ply_count"],
        "source": data["source"],
        "pgn_object_key": data["pgn_object_key"],
        "moves": data["moves"],
    }


def load_opening_book():
    global OPENING_BOOK
    if OPENING_BOOK is not None:
        return OPENING_BOOK

    opening_book = {}
    base_path = Path(__file__).resolve().parents[1] / "data" / "openings"
    for letter in ["A", "B", "C", "D", "E"]:
        path = base_path / f"eco{letter}.json"
        if not path.exists():
            continue
        with path.open("r", encoding="utf-8") as file:
            opening_book.update(json.load(file))

    OPENING_BOOK = opening_book
    return OPENING_BOOK


def find_opening_by_fen(fen: str):
    if not fen:
        return None
    parts = fen.split()
    if len(parts) < 2:
        return None

    search_key = f"{parts[0]} {parts[1]}"
    opening_book = load_opening_book()
    opening = opening_book.get(search_key)
    if not opening:
        for book_fen, info in opening_book.items():
            if book_fen.startswith(search_key):
                opening = info
                break
    if not opening:
        return None

    name = opening.get("name")
    eco = opening.get("eco")
    if not name:
        return None
    return {"name": name, "eco": eco}


def find_opening_by_eco(eco: str):
    clean_eco = str(eco or "").strip().upper()
    if not clean_eco:
        return None

    matches = [
        opening
        for opening in load_opening_book().values()
        if str(opening.get("eco") or "").strip().upper() == clean_eco and opening.get("name")
    ]
    if not matches:
        return None

    def move_depth(opening):
        return len(str(opening.get("moves") or "").split())

    opening = min(matches, key=move_depth)
    return {"name": opening.get("name"), "eco": opening.get("eco")}


def detect_opening_from_moves(moves: str, result: str = "*"):
    if not moves:
        return None

    try:
        pgn_text = f"{moves} {result or '*'}"
        game = chess.pgn.read_game(io.StringIO(pgn_text))
        if game is None:
            return None

        board = game.board()
        positions = []
        for move in game.mainline_moves():
            board.push(move)
            positions.append(board.fen())

        for fen in reversed(positions):
            opening = find_opening_by_fen(fen)
            if opening:
                return opening
        return None
    except Exception:
        return None


def get_detected_opening(moves: str, result: str = "*", eco: str = "", opening: str = ""):
    detected = detect_opening_from_moves(moves, result)
    if detected:
        return detected

    eco_code = eco or (opening if re.match(r"^[A-E][0-9]{2}$", str(opening or "").strip(), re.IGNORECASE) else "")
    return find_opening_by_eco(eco_code)


@router.post("/import-pgn")
def import_pgn(
    file: UploadFile = File(...),
    user_id: str = Depends(get_current_user_id),
    db: Session = Depends(get_db),
):
    if not file.filename.lower().endswith((".pgn", ".txt")):
        raise HTTPException(status_code=400, detail="Only PGN or TXT files can be imported")

    imported = 0
    skipped = 0
    batch = []
    object_key = build_pgn_object_key(file.filename)

    try:
        upload_fileobj_to_r2(file.file, object_key, file.content_type or "application/x-chess-pgn")
        file.file.seek(0)

        result = import_pgn_stream(file.file, db, pgn_object_key=object_key)
        imported = result["imported"]
        skipped = result["skipped"]

        return {"imported": imported, "skipped": skipped, "object_key": object_key}
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=400, detail=f"PGN import failed: {exc}") from exc


@router.get("/summary")
def database_summary(
    db: Session = Depends(get_db),
):
    try:
        indexed_games = int(db.query(func.count(models.ImportedGame.id)).filter(
            models.ImportedGame.pgn_object_key.like("pgn-imports/chesscom-master/%")
        ).scalar() or 0)
        imported_file_games = int(db.query(func.sum(models.ImportedPgnFile.games_imported)).filter(
            models.ImportedPgnFile.status == "complete",
            models.ImportedPgnFile.object_key.like("pgn-imports/chesscom-master/%"),
        ).scalar() or 0)
        total_games = indexed_games or imported_file_games
        r2_archive = {"prefix": "pgn-imports/chesscom-master/", "object_count": 0, "size_bytes": 0, "available": False}
        if total_games == 0:
            try:
                r2_archive = {**get_r2_prefix_stats(), "available": True}
            except Exception:
                pass
        top_players = get_top_players(db, limit=5)

        top_openings = db.execute(text("""
            SELECT opening, games
            FROM imported_opening_stats
            ORDER BY games DESC
            LIMIT 8
        """)).all()

        return {
            "total_games": total_games,
            "indexed_games": indexed_games,
            "imported_file_games": imported_file_games,
            "r2_archive": r2_archive,
            "top_players": top_players,
            "best_players": get_best_players_of_all_time(db),
            "top_openings": [
                {"opening": opening or "Unknown", "games": int(games or 0)}
                for opening, games in top_openings
            ],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/explore/first-moves")
def explore_first_moves(limit: int = Query(10, ge=1, le=20), db: Session = Depends(get_db)):
    try:
        limit_value = max(1, min(20, int(limit)))
    except Exception:
        limit_value = 10

    stats = {}
    total = 0
    games = (
        db.query(models.ImportedGame.moves, models.ImportedGame.result)
        .filter(models.ImportedGame.moves.isnot(None), models.ImportedGame.moves != "")
        .yield_per(1000)
    )

    for moves_text, result in games:
        move = extract_first_move_fast(moves_text)
        if not move:
            continue

        total += 1
        row = stats.setdefault(move, {
            "move": move,
            "games": 0,
            "white_wins": 0,
            "draws": 0,
            "black_wins": 0,
        })
        row["games"] += 1

        clean_result = str(result or "").strip()
        if clean_result == "1-0":
            row["white_wins"] += 1
        elif clean_result == "0-1":
            row["black_wins"] += 1
        elif clean_result == "1/2-1/2":
            row["draws"] += 1

    rows = []
    for row in sorted(stats.values(), key=lambda item: item["games"], reverse=True)[:limit_value]:
        games_count = max(1, int(row["games"] or 0))
        row["percent"] = round((games_count / total) * 100, 1) if total else 0
        row["white_win_percent"] = round((row["white_wins"] / games_count) * 100, 1)
        row["draw_percent"] = round((row["draws"] / games_count) * 100, 1)
        row["black_win_percent"] = round((row["black_wins"] / games_count) * 100, 1)
        row["eval"] = FIRST_MOVE_EVALS.get(row["move"])
        rows.append(row)

    return {"total_games": total, "rows": rows}


@router.get("/explore/next-moves")
def explore_next_moves(
    moves: str = "",
    limit: int = Query(10, ge=1, le=20),
    db: Session = Depends(get_db),
):
    try:
        limit_value = max(1, min(20, int(limit)))
    except Exception:
        limit_value = 10

    prefix = [clean_first_move_token(token) for token in str(moves or "").split(",") if clean_first_move_token(token)]
    stats = {}
    total = 0

    games = (
        db.query(models.ImportedGame.moves, models.ImportedGame.result)
        .filter(models.ImportedGame.moves.isnot(None), models.ImportedGame.moves != "")
        .yield_per(1000)
    )

    for moves_text, result in games:
        tokens = tokenize_moves_fast(moves_text)
        if len(tokens) <= len(prefix):
            continue
        if prefix and tokens[:len(prefix)] != prefix:
            continue

        next_move = tokens[len(prefix)]
        if not next_move:
            continue

        total += 1
        row = stats.setdefault(next_move, {
            "move": next_move,
            "display_move": format_ply_move(len(prefix), next_move),
            "games": 0,
            "white_wins": 0,
            "draws": 0,
            "black_wins": 0,
        })
        row["games"] += 1

        clean_result = str(result or "").strip()
        if clean_result == "1-0":
            row["white_wins"] += 1
        elif clean_result == "0-1":
            row["black_wins"] += 1
        elif clean_result == "1/2-1/2":
            row["draws"] += 1

    rows = []
    for row in sorted(stats.values(), key=lambda item: item["games"], reverse=True)[:limit_value]:
        games_count = max(1, int(row["games"] or 0))
        row["percent"] = round((games_count / total) * 100, 1) if total else 0
        row["white_win_percent"] = round((row["white_wins"] / games_count) * 100, 1)
        row["draw_percent"] = round((row["draws"] / games_count) * 100, 1)
        row["black_win_percent"] = round((row["black_wins"] / games_count) * 100, 1)
        row["eval"] = FIRST_MOVE_EVALS.get(row["move"])
        rows.append(row)

    return {
        "total_games": total,
        "ply": len(prefix) + 1,
        "line": " ".join(prefix),
        "rows": rows,
    }


@router.get("/players")
def players(
    limit: int = Query(24, ge=1, le=100),
    page: int = Query(1, ge=1),
    search: str = "",
    sort: str = "name",
    db: Session = Depends(get_db),
):
    safe_sort = sort if sort in {"name", "games"} else "name"
    return get_players(db, page=page, page_size=limit, search=search, sort=safe_sort)


@router.get("/player-profile")
def player_profile(
    name: str,
    db: Session = Depends(get_db),
):
    canonical_name, variants = get_catalog_variants_for_name(name)
    master_object_key, master_updates_prefix, master_object_prefix, variants = get_catalog_master_scope(name)
    if not variants:
        raise HTTPException(status_code=400, detail="Missing player name")

    query_params = bind_values("player", variants)
    where_clause = player_game_clause(variants)
    if master_object_key:
        query_params["master_object_key"] = master_object_key
        query_params["master_player_slug"] = master_object_key.split("/")[-2]
        query_params["master_object_prefix"] = master_object_prefix
    white_name = sql_player_name("white")
    black_name = sql_player_name("black")
    player_sql = placeholders("player", variants)
    source_table = "unique_master_games" if master_object_key else "imported_games"
    source_prefix = unique_master_games_cte() if master_object_key else ""
    source_where = "" if master_object_key else f"WHERE {where_clause}"

    total_games = int(db.execute(text(f"""
        {source_prefix}
        SELECT COUNT(*)
        FROM {source_table}
        {source_where}
    """), query_params).scalar() or 0)

    player_is_white = f"{white_name} IN ({player_sql})"
    player_is_black = f"{black_name} IN ({player_sql})"
    player_is_present = f"({player_is_white} OR {player_is_black})"

    row = db.execute(text(f"""
        {source_prefix}
        SELECT
            COUNT(*) FILTER (WHERE {player_is_white}) AS as_white,
            COUNT(*) FILTER (WHERE {player_is_black}) AS as_black,
            COUNT(*) FILTER (
                WHERE ({player_is_white} AND result = '1-0')
                   OR ({player_is_black} AND result = '0-1')
            ) AS wins,
            COUNT(*) FILTER (WHERE result IN ('1/2-1/2', '1/2', '½-½')) AS draws,
            COUNT(*) FILTER (
                WHERE ({player_is_white} AND result = '0-1')
                   OR ({player_is_black} AND result = '1-0')
            ) AS losses,
            COUNT(*) FILTER (WHERE {player_is_white} AND result = '1-0') AS white_wins,
            COUNT(*) FILTER (WHERE {white_name} IN ({player_sql}) AND result IN ('1/2-1/2', '1/2', '½-½')) AS white_draws,
            COUNT(*) FILTER (WHERE {player_is_white} AND result = '0-1') AS white_losses,
            COUNT(*) FILTER (WHERE {player_is_black} AND result = '0-1') AS black_wins,
            COUNT(*) FILTER (WHERE {black_name} IN ({player_sql}) AND result IN ('1/2-1/2', '1/2', '½-½')) AS black_draws,
            COUNT(*) FILTER (WHERE {player_is_black} AND result = '1-0') AS black_losses
        FROM {source_table}
        {source_where}
    """), query_params).first()

    draw_result = "result LIKE '1/2%'"
    row = db.execute(text(f"""
        {source_prefix}
        SELECT
            COUNT(*) FILTER (WHERE {player_is_white}) AS as_white,
            COUNT(*) FILTER (WHERE {player_is_black}) AS as_black,
            COUNT(*) FILTER (
                WHERE ({player_is_white} AND result = '1-0')
                   OR ({player_is_black} AND result = '0-1')
            ) AS wins,
            COUNT(*) FILTER (WHERE {player_is_present} AND {draw_result}) AS draws,
            COUNT(*) FILTER (
                WHERE ({player_is_white} AND result = '0-1')
                   OR ({player_is_black} AND result = '1-0')
            ) AS losses,
            COUNT(*) FILTER (WHERE {player_is_white} AND result = '1-0') AS white_wins,
            COUNT(*) FILTER (WHERE {player_is_white} AND {draw_result}) AS white_draws,
            COUNT(*) FILTER (WHERE {player_is_white} AND result = '0-1') AS white_losses,
            COUNT(*) FILTER (WHERE {player_is_black} AND result = '0-1') AS black_wins,
            COUNT(*) FILTER (WHERE {player_is_black} AND {draw_result}) AS black_draws,
            COUNT(*) FILTER (WHERE {player_is_black} AND result = '1-0') AS black_losses
        FROM {source_table}
        {source_where}
    """), query_params).first()

    data = row._mapping if row else {}
    return {
        "name": canonical_name,
        "games": total_games,
        "as_white": int(data.get("as_white") or 0),
        "as_black": int(data.get("as_black") or 0),
        "wins": int(data.get("wins") or 0),
        "draws": int(data.get("draws") or 0),
        "losses": int(data.get("losses") or 0),
        "white_wins": int(data.get("white_wins") or 0),
        "white_draws": int(data.get("white_draws") or 0),
        "white_losses": int(data.get("white_losses") or 0),
        "black_wins": int(data.get("black_wins") or 0),
        "black_draws": int(data.get("black_draws") or 0),
        "black_losses": int(data.get("black_losses") or 0),
    }

@router.get("/games")
def games(
    opening: str = "",
    player1: str = "",
    player2: str = "",
    fixed_colors: bool = False,
    sort: str = "year_desc",
    page: int = Query(1, ge=1),
    page_size: int = Query(12, ge=1, le=100),
    db: Session = Depends(get_db),
):
    try:
        if player1.strip() and not player2.strip() and not opening.strip():
            master_object_key, master_updates_prefix, master_object_prefix, variants = get_catalog_master_scope(player1)
            query_params = bind_values("player", variants)
            where_clause = player_game_clause(variants)
            if master_object_key:
                query_params["master_object_key"] = master_object_key
                query_params["master_player_slug"] = master_object_key.split("/")[-2]
                query_params["master_object_prefix"] = master_object_prefix

            source_table = "unique_master_games" if master_object_key else "imported_games"
            source_prefix = unique_master_games_cte() if master_object_key else ""
            source_where = "" if master_object_key else f"WHERE {where_clause}"

            total = int(db.execute(text(f"""
                {source_prefix}
                SELECT COUNT(*)
                FROM {source_table}
                {source_where}
            """), query_params).scalar() or 0)

            rows = db.execute(text(f"""
                {source_prefix}
                SELECT id, event, site, game_date, round, white, black, white_elo, black_elo, result, eco, opening,
                       ply_count, source, pgn_object_key, moves
                FROM {source_table}
                {source_where}
                ORDER BY {get_games_order_sql(sort)}
                LIMIT :limit OFFSET :offset
            """), {
                **query_params,
                "limit": page_size,
                "offset": (page - 1) * page_size,
            }).all()

            return {
                "total": total,
                "page": page,
                "page_size": page_size,
                "games": [serialize_game_row(row) for row in rows],
            }

        query = db.query(models.ImportedGame)
        master_object_key = None
        if player1.strip():
            master_object_key, _, master_object_prefix, _ = get_catalog_master_scope(player1)
            if master_object_key:
                master_player_slug = master_object_key.split("/")[-2]
                query = query.filter(
                    models.ImportedGame.id.in_(
                        db.query(models.ImportedGamePlayerSource.game_id).filter(
                            models.ImportedGamePlayerSource.player_slug == master_player_slug,
                            models.ImportedGamePlayerSource.source == "chesscom-master",
                        )
                    ),
                    models.ImportedGame.white != "Unknown",
                    models.ImportedGame.black != "Unknown",
                )

        if opening.strip():
            needle = f"%{opening.strip().lower()}%"
            query = query.filter(or_(
                func.lower(models.ImportedGame.opening).like(needle),
                func.lower(models.ImportedGame.eco).like(needle),
            ))

        p1 = player1.strip().lower()
        p2 = player2.strip().lower()

        if master_object_key and p2:
            p2_like = f"%{p2}%"
            query = query.filter(or_(
                func.lower(models.ImportedGame.white).like(p2_like),
                func.lower(models.ImportedGame.black).like(p2_like),
            ))
        elif p1 and p2:
            p1_like = f"%{p1}%"
            p2_like = f"%{p2}%"
            if fixed_colors:
                query = query.filter(
                    func.lower(models.ImportedGame.white).like(p1_like),
                    func.lower(models.ImportedGame.black).like(p2_like),
                )
            else:
                query = query.filter(or_(
                    (
                        func.lower(models.ImportedGame.white).like(p1_like) &
                        func.lower(models.ImportedGame.black).like(p2_like)
                    ),
                    (
                        func.lower(models.ImportedGame.white).like(p2_like) &
                        func.lower(models.ImportedGame.black).like(p1_like)
                    ),
                ))
        elif p1 and not master_object_key:
            p1_like = f"%{p1}%"
            query = query.filter(or_(
                func.lower(models.ImportedGame.white).like(p1_like),
                func.lower(models.ImportedGame.black).like(p1_like),
            ))

        total = query.count()
        rows = (
            query.order_by(*get_games_order_by(sort))
            .offset((page - 1) * page_size)
            .limit(page_size)
            .all()
        )

        return {
            "total": total,
            "page": page,
            "page_size": page_size,
            "games": [serialize_game(game) for game in rows],
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.get("/games/{game_id}")
def game_by_id(
    game_id: int,
    db: Session = Depends(get_db),
):
    game = db.query(models.ImportedGame).filter(models.ImportedGame.id == game_id).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    return serialize_game(game)


def get_games_order_sql(sort: str):
    return {
        "rating_white": "white_elo DESC NULLS LAST, id DESC",
        "rating_black": "black_elo DESC NULLS LAST, id DESC",
        "year_desc": "game_date DESC NULLS LAST, id DESC",
        "year_asc": "game_date ASC NULLS LAST, id ASC",
        "moves_desc": "ply_count DESC NULLS LAST, id DESC",
        "moves_asc": "ply_count ASC NULLS LAST, id ASC",
    }.get(sort, "game_date DESC NULLS LAST, id DESC")


def get_games_order_by(sort: str):
    return {
        "rating_white": [models.ImportedGame.white_elo.desc().nullslast(), models.ImportedGame.id.desc()],
        "rating_black": [models.ImportedGame.black_elo.desc().nullslast(), models.ImportedGame.id.desc()],
        "year_desc": [models.ImportedGame.game_date.desc().nullslast(), models.ImportedGame.id.desc()],
        "year_asc": [models.ImportedGame.game_date.asc().nullslast(), models.ImportedGame.id.asc()],
        "moves_desc": [models.ImportedGame.ply_count.desc().nullslast(), models.ImportedGame.id.desc()],
        "moves_asc": [models.ImportedGame.ply_count.asc().nullslast(), models.ImportedGame.id.asc()],
    }.get(sort, [models.ImportedGame.game_date.desc().nullslast(), models.ImportedGame.id.desc()])


def get_top_players(db: Session, limit=5):
    return get_players(db, page=1, page_size=limit, sort="games")["players"]


def get_player_count_union(db: Session, search: str = ""):
    white_counts = (
        db.query(models.ImportedGame.white.label("name"), func.count(models.ImportedGame.id).label("games"))
        .filter(models.ImportedGame.white.isnot(None), models.ImportedGame.white != "")
        .group_by(models.ImportedGame.white)
    )
    black_counts = (
        db.query(models.ImportedGame.black.label("name"), func.count(models.ImportedGame.id).label("games"))
        .filter(models.ImportedGame.black.isnot(None), models.ImportedGame.black != "")
        .group_by(models.ImportedGame.black)
    )

    if search.strip():
        needle = f"%{search.strip().lower()}%"
        white_counts = white_counts.filter(func.lower(models.ImportedGame.white).like(needle))
        black_counts = black_counts.filter(func.lower(models.ImportedGame.black).like(needle))

    return white_counts.union_all(black_counts).subquery()


def get_players(db: Session, page: int = 1, page_size: int = 24, search: str = "", sort: str = "name"):
    query = db.query(models.Player).filter(models.Player.is_catalog.is_(True))
    if search.strip():
        query = query.filter(func.lower(models.Player.name).like(f"%{search.strip().lower()}%"))

    total = query.count()
    if total == 0:
        return {"players": [], "total": 0, "page": page, "page_size": page_size}

    if sort == "games":
        query = query.order_by(models.Player.games.desc(), func.lower(models.Player.name).asc())
    else:
        query = query.order_by(func.lower(models.Player.name).asc())

    rows = query.offset((page - 1) * page_size).limit(page_size).all()

    return {
        "players": [{"name": row.name, "games": int(row.games or 0)} for row in rows],
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def get_catalog_player_names():
    return sorted(set(CATALOG_PLAYERS))


def get_best_players_of_all_time(db: Session):
    names = [player["name"] for player in BEST_PLAYERS_OF_ALL_TIME]
    rows = (
        db.query(models.Player.name, models.Player.games)
        .filter(models.Player.name.in_(names))
        .all()
    )
    games_by_name = {row.name: int(row.games or 0) for row in rows}
    return [
        {"name": player["name"], "games": games_by_name.get(player["name"], 0)}
        for player in BEST_PLAYERS_OF_ALL_TIME
    ]
