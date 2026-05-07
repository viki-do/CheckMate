import io
import json
import re
from pathlib import Path

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


def player_name_variants(name: str):
    cleaned = name.strip().lower()
    variants = {cleaned}
    if " " in cleaned and "," not in cleaned:
        parts = cleaned.split()
        if len(parts) >= 2:
            variants.add(f"{parts[-1]}, {' '.join(parts[:-1])}")
    return sorted(v for v in variants if v)


def sql_player_name(column: str):
    return f"replace(replace(lower({column}), '_', ' '), '-', ' ')"


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


def bind_values(prefix: str, values):
    return {f"{prefix}_{index}": value for index, value in enumerate(values)}


def placeholders(prefix: str, values):
    return ", ".join(f":{prefix}_{index}" for index in range(len(values)))


def curated_player_game_clause(player_variants, all_catalog_variants):
    player_sql = placeholders("player", player_variants)
    catalog_sql = placeholders("catalog", all_catalog_variants)
    white = sql_player_name("white")
    black = sql_player_name("black")
    return (
        f"(({white} IN ({player_sql}) AND {black} IN ({catalog_sql})) "
        f"OR ({black} IN ({player_sql}) AND {white} IN ({catalog_sql})))"
    )


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
        indexed_games = int(db.query(func.count(models.ImportedGame.id)).scalar() or 0)
        imported_file_games = int(db.query(func.sum(models.ImportedPgnFile.games_imported)).filter(
            models.ImportedPgnFile.status == "complete"
        ).scalar() or 0)
        total_games = indexed_games or imported_file_games
        r2_archive = {"prefix": "pgn-imports/lumbras/", "object_count": 0, "size_bytes": 0, "available": False}
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
    all_catalog_variants = get_all_catalog_variants()
    if not variants or not all_catalog_variants:
        raise HTTPException(status_code=400, detail="Missing player name")

    query_params = {
        **bind_values("player", variants),
        **bind_values("catalog", all_catalog_variants),
    }
    where_clause = curated_player_game_clause(variants, all_catalog_variants)
    white_name = sql_player_name("white")
    black_name = sql_player_name("black")
    player_sql = placeholders("player", variants)
    placeholders = player_sql

    total_games = int(db.execute(text(f"""
        SELECT COUNT(*)
        FROM imported_games
        WHERE {where_clause}
    """), query_params).scalar() or 0)

    row = db.execute(text(f"""
        SELECT
            COUNT(*) FILTER (WHERE {white_name} IN ({player_sql})) AS as_white,
            COUNT(*) FILTER (WHERE {black_name} IN ({player_sql})) AS as_black,
            COUNT(*) FILTER (
                WHERE ({white_name} IN ({player_sql}) AND result = '1-0')
                   OR ({black_name} IN ({player_sql}) AND result = '0-1')
            ) AS wins,
            COUNT(*) FILTER (WHERE result IN ('1/2-1/2', '1/2', '½-½')) AS draws,
            COUNT(*) FILTER (
                WHERE ({white_name} IN ({player_sql}) AND result = '0-1')
                   OR ({black_name} IN ({player_sql}) AND result = '1-0')
            ) AS losses,
            COUNT(*) FILTER (WHERE {white_name} IN ({player_sql}) AND result = '1-0') AS white_wins,
            COUNT(*) FILTER (WHERE lower(white) IN ({placeholders}) AND result IN ('1/2-1/2', '1/2', '½-½')) AS white_draws,
            COUNT(*) FILTER (WHERE {white_name} IN ({player_sql}) AND result = '0-1') AS white_losses,
            COUNT(*) FILTER (WHERE {black_name} IN ({player_sql}) AND result = '0-1') AS black_wins,
            COUNT(*) FILTER (WHERE lower(black) IN ({placeholders}) AND result IN ('1/2-1/2', '1/2', '½-½')) AS black_draws,
            COUNT(*) FILTER (WHERE {black_name} IN ({player_sql}) AND result = '1-0') AS black_losses
        FROM imported_games
        WHERE {where_clause}
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
            _, variants = get_catalog_variants_for_name(player1)
            all_catalog_variants = get_all_catalog_variants()
            query_params = {
                **bind_values("player", variants),
                **bind_values("catalog", all_catalog_variants),
            }
            where_clause = curated_player_game_clause(variants, all_catalog_variants)

            total = int(db.execute(text(f"""
                SELECT COUNT(*)
                FROM imported_games
                WHERE {where_clause}
            """), query_params).scalar() or 0)

            rows = db.execute(text(f"""
                SELECT id, event, site, game_date, round, white, black, white_elo, black_elo, result, eco, opening,
                       ply_count, source, pgn_object_key, moves
                FROM imported_games
                WHERE {where_clause}
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

        if opening.strip():
            needle = f"%{opening.strip().lower()}%"
            query = query.filter(or_(
                func.lower(models.ImportedGame.opening).like(needle),
                func.lower(models.ImportedGame.eco).like(needle),
            ))

        p1 = player1.strip().lower()
        p2 = player2.strip().lower()

        if p1 and p2:
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
        elif p1:
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
    catalog_players = [
        player["name"]
        for player in HISTORICAL_PLAYERS
        if not search.strip() or search.strip().lower() in player["name"].lower()
    ]
    if not catalog_players:
        return {"players": [], "total": 0, "page": page, "page_size": page_size}

    all_catalog_variants = get_all_catalog_variants()
    catalog_params = bind_values("catalog", all_catalog_variants)
    catalog_sql = placeholders("catalog", all_catalog_variants)
    white = sql_player_name("white")
    black = sql_player_name("black")
    players_with_counts = []

    for player_name in catalog_players:
        variants = get_catalog_variant_map()[player_name]
        player_params = bind_values("player", variants)
        player_sql = placeholders("player", variants)
        games = int(db.execute(text(f"""
            SELECT COUNT(*)
            FROM imported_games
            WHERE (({white} IN ({player_sql}) AND {black} IN ({catalog_sql}))
                OR ({black} IN ({player_sql}) AND {white} IN ({catalog_sql})))
        """), {**player_params, **catalog_params}).scalar() or 0)
        players_with_counts.append({"name": player_name, "games": games})

    if sort == "games":
        players_with_counts.sort(key=lambda player: (-player["games"], player["name"].lower()))
    else:
        players_with_counts.sort(key=lambda player: player["name"].lower())

    total = len(players_with_counts)
    start = (page - 1) * page_size
    rows = players_with_counts[start:start + page_size]

    return {
        "players": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def get_catalog_player_names():
    return sorted(set(CATALOG_PLAYERS))


def get_best_players_of_all_time(db: Session):
    all_aliases = sorted({alias for player in BEST_PLAYERS_OF_ALL_TIME for alias in player["aliases"]})
    if not all_aliases:
        return []

    alias_params = {f"name_{index}": value for index, value in enumerate(all_aliases)}
    placeholders = ", ".join(f":name_{index}" for index in range(len(all_aliases)))
    rows = db.execute(text(f"""
        SELECT lower(name) AS name, games
        FROM imported_player_stats
        WHERE lower(name) IN ({placeholders})
    """), alias_params).all()
    counts_by_alias = {row.name: int(row.games or 0) for row in rows}

    return [
        {
            "name": player["name"],
            "games": sum(counts_by_alias.get(alias, 0) for alias in player["aliases"]),
        }
        for player in BEST_PLAYERS_OF_ALL_TIME
    ]
