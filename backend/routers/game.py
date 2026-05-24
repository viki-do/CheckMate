import uuid
import chess
import chess.engine
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request 
from sqlalchemy.orm import Session
import models
from database import SessionLocal
from .auth import get_current_user_id
import time
import json
import os
import asyncio
import random
from pathlib import Path
from shutil import which
from .analysis_engine import ChessCoachEngine

router = APIRouter(tags=["Chess Game"])
coach = ChessCoachEngine()

# Globális változó a motornak
engine_singleton = None

def resolve_stockfish_path():
    env_path = os.getenv("STOCKFISH_PATH")
    if env_path:
        return env_path
    system_path = which("stockfish")
    if system_path:
        return system_path
    return str(Path(__file__).resolve().parents[1] / "engine" / "stockfish.exe")

STOCKFISH_PATH = resolve_stockfish_path()
OPENING_BOOK = {}

def get_engine():
    global engine_singleton
    if engine_singleton is None:
        try:
            engine_singleton = chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH)
        except Exception as e:
            print(f"Hiba a Stockfish indításakor: {e}")
            raise e
    return engine_singleton

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# --- HELPER A SOCKET ELÉRÉSÉHEZ ---
def get_sio(request: Request):
    """Visszaadja a main.py-ban definiált Socket.io szervert"""
    return request.app.state.sio

def get_book_info_after_move(board: chess.Board, move: chess.Move):
    board.push(move)
    try:
        return find_opening_by_fen(board.fen())
    finally:
        board.pop()


@router.post("/analyze-full-game/{game_id}")
def analyze_full_game(game_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    game_uuid = uuid.UUID(game_id)
    
    # 1. Adatok lekérése a DB-ből
    game = db.query(models.Game).filter(models.Game.id == game_uuid).first()
    moves = db.query(models.Move).filter(models.Move.game_id == game_uuid).order_by(models.Move.move_number.asc()).all()
    
    if not game or not moves:
        raise HTTPException(status_code=404, detail="Game or moves not found")

    engine = get_engine()
    board = chess.Board()
    coach = ChessCoachEngine()
    full_analysis = []
    
    # Statisztikák a pontossághoz
    phase_stats = {
        "opening": {"losses": [], "p_befores": [], "counts": {}},
        "middlegame": {"losses": [], "p_befores": [], "counts": {}},
        "endgame": {"losses": [], "p_befores": [], "counts": {}}
    }
    side_stats = {
        "white": {"losses": [], "p_befores": []},
        "black": {"losses": [], "p_befores": []},
    }
    
    prev_eval = 30 
    
    # 2. LÉPÉSRŐL LÉPÉSRE ELEMZÉS
    for m in moves:
        if m.notation == "start":
            continue

        current_phase = coach.get_game_phase(board)
        is_white_turn = board.turn == chess.WHITE
        
        # Opening Book ellenőrzés
        try:
            player_move = board.parse_san(m.notation)
        except:
            player_move = board.parse_uci(m.notation)

        book_info = get_book_info_after_move(board, player_move)
        is_book = book_info is not None

        # Multi-PV elemzés
        analysis = engine.analyse(board, coach.review_limit(), multipv=3)
        best_eval_info = analysis[0]["score"].white().score(mate_score=10000)
        
        # Címkézés
        played_eval = coach.evaluate_played_move_after(board, player_move, engine)
        label, move_eval = coach.classify_move(
            board,
            player_move,
            analysis,
            prev_eval,
            is_book=is_book,
            played_eval=played_eval,
        )
        
        # Engine Lines összeállítása
        engine_lines = []
        for entry in analysis:
            score_cp = entry["score"].white().score(mate_score=10000)
            
            # PV kinyerése biztonságosan
            pv_moves = entry.get("pv", [])
            
            engine_lines.append({
                "eval": score_cp / 100.0 if abs(score_cp) < 5000 else f"M{int((10000-abs(score_cp))/100)}",
                "raw_eval": score_cp,
                # Itt a lényeg: 20 fél-lépés = 10 teljes lépés
                "continuation": board.variation_san(pv_moves[:30]),
                "pv_uci": [move.uci() for move in pv_moves[:30]]
            })

        # Accuracy számítás adatai
        p_before = coach.get_win_chance(prev_eval if is_white_turn else -prev_eval)
        player_best_eval = best_eval_info if is_white_turn else -best_eval_info
        player_move_eval = move_eval if is_white_turn else -move_eval
        loss = coach.get_review_loss(player_best_eval, player_move_eval, label)

        phase_stats[current_phase]["losses"].append(loss)
        phase_stats[current_phase]["p_befores"].append(p_before)
        phase_stats[current_phase]["counts"][label] = phase_stats[current_phase]["counts"].get(label, 0) + 1
        side_key = "white" if is_white_turn else "black"
        side_stats[side_key]["losses"].append(loss)
        side_stats[side_key]["p_befores"].append(p_before)
        best_move = analysis[0]["pv"][0] if analysis[0].get("pv") else None
        eval_loss = 0 if label == "book" else max(0, player_best_eval - player_move_eval)
        m.accuracy_label = label.lower()
        m.evaluation = move_eval / 100.0 if abs(move_eval) < 5000 else None
        m.best_move_uci = best_move.uci() if best_move else None
        m.win_chance_drop = loss

        # JSON elem hozzáadása
        full_analysis.append({
            "move_number": m.move_number,
            "notation": m.notation,
            "label": label,
            "is_book": is_book,
            "eval": move_eval / 100.0 if abs(move_eval) < 5000 else f"M{int((10000-abs(move_eval))/100)}",
            "raw_eval": move_eval,
            "best_move": board.san(best_move) if best_move else "",
            "best_move_uci": best_move.uci() if best_move else "",
            "best_eval": best_eval_info / 100.0 if abs(best_eval_info) < 5000 else f"M{int((10000-abs(best_eval_info))/100)}",
            "raw_best_eval": best_eval_info,
            "eval_loss": eval_loss / 100.0 if eval_loss < 5000 else None,
            "win_chance_loss": round(loss, 4),
            "engine_lines": engine_lines,
            "phase": current_phase,
            "opening_name": book_info["name"] if is_book else None
        })

        board.push(player_move)
        prev_eval = move_eval

    # 3. ÖSSZEGZÉS (Accuracy és Rating - Pontosan az eredeti logikáddal)
    summary = {}
    all_losses = []
    all_p_befores = []
    
    for phase in ["opening", "middlegame", "endgame"]:
        losses = phase_stats[phase]["losses"]
        p_befores = phase_stats[phase]["p_befores"]
        if losses:
            acc = coach.calculate_accuracy(losses, p_befores)
            all_losses.extend(losses)
            all_p_befores.extend(p_befores)
            
            # Ez a te eredeti rating logikád:
            rating = "Best" if acc > 97 else "Great" if acc > 90 else "Excellent" if acc > 80 else "Good" if acc > 70 else "Inaccurate"
            summary[phase] = {
                "accuracy": acc,
                "rating": rating,
                "stats": phase_stats[phase]["counts"]
            }

    overall_accuracy = coach.calculate_accuracy(all_losses, all_p_befores)
    white_accuracy = coach.calculate_accuracy(side_stats["white"]["losses"], side_stats["white"]["p_befores"]) if side_stats["white"]["losses"] else None
    black_accuracy = coach.calculate_accuracy(side_stats["black"]["losses"], side_stats["black"]["p_befores"]) if side_stats["black"]["losses"] else None
    game.white_accuracy = white_accuracy
    game.black_accuracy = black_accuracy
    game.reviewed_at = datetime.now(timezone.utc)
    db.commit()

    return {
        "game_id": game_id,
        "overall_accuracy": overall_accuracy,
        "white_accuracy": white_accuracy,
        "black_accuracy": black_accuracy,
        "summary": summary,
        "analysis": full_analysis,
        "player_color": game.player_color,
        "opening": get_opening_with_fallback(db, game_uuid)
    }

def get_skill_level_from_elo(elo: int) -> int:
    if elo <= 250: return 0
    if elo >= 3000: return 20
    level = int((elo - 250) / (3000 - 250) * 20)
    return max(0, min(20, level))

def configure_engine_for_elo(engine, elo: int):
    skill = get_skill_level_from_elo(elo)
    config = {"Skill Level": skill}

    try:
        options = getattr(engine, "options", {})
        if "UCI_LimitStrength" in options and "UCI_Elo" in options and elo >= 1320:
            elo_option = options["UCI_Elo"]
            min_elo = elo_option.min if elo_option.min is not None else 1320
            max_elo = elo_option.max if elo_option.max is not None else 3190
            config["UCI_LimitStrength"] = True
            config["UCI_Elo"] = max(min_elo, min(max_elo, int(elo)))
        elif "UCI_LimitStrength" in options:
            config["UCI_LimitStrength"] = False
    except Exception:
        pass

    try:
        engine.configure(config)
    except Exception:
        engine.configure({"Skill Level": skill})

def get_bot_limit_params(elo: int, pure_stockfish: bool = False):
    if elo < 500:
        return {"time": 0.05, "nodes": 250}
    if elo < 800:
        return {"time": 0.08, "nodes": 500}
    if elo < 1300:
        return {"time": 0.12}
    if elo < 1800:
        return {"time": 0.2}
    if elo < 2300:
        return {"time": 0.35}
    return {"time": 0.6 if pure_stockfish else 0.45}

def first_legal_option(board, options):
    for move in options:
        if move in board.legal_moves:
            return move
    return next(iter(board.legal_moves))

def is_immediate_reversal(board, move):
    if not board.move_stack:
        return False
    previous = board.move_stack[-1]
    return move.from_square == previous.to_square and move.to_square == previous.from_square

def choose_styled_bot_move(board, analysis, bot_style: str, bot_elo: int):
    if not analysis:
        return next(iter(board.legal_moves))

    options = []
    for entry in analysis:
        pv = entry.get("pv") or []
        if pv and pv[0] in board.legal_moves:
            options.append(pv[0])
    if not options:
        return next(iter(board.legal_moves))

    style = (bot_style or "universal").lower()
    if style in {"stockfish", "engine", "top_player"}:
        return options[0]

    non_repeating_options = [move for move in options if not is_immediate_reversal(board, move)]
    if non_repeating_options:
        options = non_repeating_options

    r = random.random()
    captures = [m for m in options if board.is_capture(m)]
    checks = [m for m in options if board.gives_check(m)]
    forcing = []
    for move in checks + captures:
        if move not in forcing:
            forcing.append(move)
    quiet = [m for m in options if not board.is_capture(m) and not board.gives_check(m)]

    if style in {"attacker", "attacking", "tactical"}:
        chosen = random.choice(forcing[:3]) if forcing and r < 0.8 else first_legal_option(board, options[:2])
    elif style in {"defensive", "solid"}:
        chosen = quiet[0] if quiet and r < 0.75 else options[0]
    elif style in {"positional", "strategic"}:
        chosen = quiet[0] if quiet and r < 0.65 else first_legal_option(board, options[:2])
    elif style in {"universal", "dynamic"}:
        chosen = options[0] if r < 0.65 or len(options) < 2 else random.choice(options[:3])
    else:
        chosen = options[0]

    if bot_elo < 500 and r < 0.4 and len(options) > 1:
        return options[-1]
    if bot_elo < 900 and r < 0.2 and len(options) > 2:
        return random.choice(options[1:])

    return chosen

def load_openings():
    global OPENING_BOOK
    base_path = os.path.join("data", "openings")
    for letter in ['A', 'B', 'C', 'D', 'E']:
        file_name = f"eco{letter}.json"
        full_path = os.path.join(base_path, file_name)
        if os.path.exists(full_path):
            try:
                with open(full_path, "r", encoding="utf-8") as f:
                    data = json.load(f)
                    OPENING_BOOK.update(data)
            except Exception as e:
                print(f"Hiba a {file_name} betöltésekor: {e}")
    print(f"Sakk könyvtár kész: {len(OPENING_BOOK)} megnyitás betöltve.")

load_openings()

def find_opening_by_fen(fen: str):
    if not fen: return None
    parts = fen.split()
    if len(parts) < 2: return None
    search_key = f"{parts[0]} {parts[1]}"
    opening = OPENING_BOOK.get(search_key)
    if not opening:
        for db_fen, info in OPENING_BOOK.items():
            if db_fen.startswith(search_key):
                opening = info
                break
    if opening:
        return {
            "name": opening.get("name"),
            "eco": opening.get("eco")
        }
    return None

def get_opening_with_fallback(db: Session, game_id: uuid.UUID):
    # Lekérjük a lépéseket időrendben visszafelé
    moves = db.query(models.Move).filter(
        models.Move.game_id == game_id
    ).order_by(models.Move.move_number.desc()).all()

    for m in moves:
        fen_to_check = m.fen_after if m.fen_after else m.fen_before
        # MEGHÍVJUK AZ ÚJ UNIVERZÁLIS KERESŐT
        opening = find_opening_by_fen(fen_to_check)
        if opening:
            return opening

    return None

@router.post("/analyze-sandbox-move")
def analyze_sandbox_move(data: dict):
    try:
        fen_before = data.get("fen_before")
        move_san = data.get("move")
        prev_eval = data.get("prev_eval", 30)
        
        board = chess.Board(fen_before)
        if not board.is_valid():
            return {
                "label": "best",
                "eval": 0,
                "best_move": "",
                "opening": None,
                "engine_lines": [],
                "error": "invalid_position",
                "message": "This position is not a legal chess position, so engine analysis is unavailable."
            }

        engine = get_engine()
        
        # Alapértelmezett üres válasz struktúra
        deep_res = {"eval": prev_eval, "best_move": "", "engine_lines": [], "raw_analysis": []}
        
        # Mélyelemzés megkísérlése
        try:
            deep_res = coach.analyze_position_deep(board, engine, depth=10, nodes=60000, multipv=3)
        except Exception as e:
            print(f"Mélyelemzési hiba: {e}")

        # Fallback: bizonyos sandbox/FEN állásoknál a fenti út néha üres engine_lines-szal tér vissza.
        # Ilyenkor ugyanazzal a mélységgel lefuttatunk egy közvetlen engine elemzést.
        if not deep_res.get("engine_lines"):
            try:
                analysis = engine.analyse(board, coach.review_limit(depth=10, nodes=60000), multipv=3)
                engine_lines = []

                for entry in analysis:
                    pv_moves = entry.get("pv", [])
                    if not pv_moves:
                        continue

                    score = entry["score"].white().score(mate_score=10000)
                    engine_lines.append({
                        "eval": score / 100.0 if abs(score) < 5000 else f"M{int((10000-abs(score))/100)}",
                        "raw_eval": score,
                        "continuation": board.variation_san(pv_moves[:30]),
                        "pv_uci": [move.uci() for move in pv_moves[:30]],
                        "first_move_san": board.san(pv_moves[0])
                    })

                if engine_lines:
                    deep_res = {
                        "eval": engine_lines[0]["raw_eval"],
                        "best_move": engine_lines[0]["first_move_san"],
                        "engine_lines": engine_lines,
                        "raw_analysis": analysis
                    }
            except Exception as e:
                print(f"Sandbox fallback elemzési hiba: {e}")

        # Ha nincs lépés (LOAD gomb)
        if not move_san:
            try:
                opening_data = find_opening_by_fen(board.fen())
            except:
                opening_data = None
                
            return {
                "label": "best", 
                "eval": deep_res.get("eval", prev_eval),
                "best_move": deep_res.get("best_move", ""),
                "opening": opening_data,
                "engine_lines": deep_res.get("engine_lines", [])
            }

        # Ha van lépés (normál működés)
        player_move = board.parse_san(move_san)
        temp_board = board.copy()
        temp_board.push(player_move)
        
        opening_data = None
        try:
            opening_data = find_opening_by_fen(temp_board.fen())
        except:
            pass

        played_eval = coach.evaluate_played_move_after(board, player_move, engine)
        post_move_engine_lines = []
        try:
            post_move_res = coach.analyze_position_deep(temp_board, engine, depth=10, nodes=60000, multipv=3)
            post_move_engine_lines = post_move_res.get("engine_lines", [])
            if not post_move_engine_lines:
                post_move_analysis = engine.analyse(temp_board, coach.review_limit(depth=10, nodes=60000), multipv=3)
                for entry in post_move_analysis:
                    pv_moves = entry.get("pv", [])
                    if not pv_moves:
                        continue

                    score = entry["score"].white().score(mate_score=10000)
                    post_move_engine_lines.append({
                        "eval": score / 100.0 if abs(score) < 5000 else f"M{int((10000-abs(score))/100)}",
                        "raw_eval": score,
                        "continuation": temp_board.variation_san(pv_moves[:30]),
                        "pv_uci": [move.uci() for move in pv_moves[:30]],
                        "first_move_san": temp_board.san(pv_moves[0])
                    })
        except Exception as e:
            print(f"Sandbox post-move elemzési hiba: {e}")

        label, move_eval = coach.classify_move(
            board, 
            player_move, 
            deep_res.get("raw_analysis", []), 
            prev_eval, 
            is_book=(opening_data is not None),
            played_eval=played_eval
        )

        raw_analysis = deep_res.get("raw_analysis", [])
        best_eval_info = raw_analysis[0]["score"].white().score(mate_score=10000) if raw_analysis else move_eval
        best_move = raw_analysis[0]["pv"][0] if raw_analysis and raw_analysis[0].get("pv") else None
        is_white_turn = board.turn == chess.WHITE
        player_best_eval = best_eval_info if is_white_turn else -best_eval_info
        player_move_eval = move_eval if is_white_turn else -move_eval
        eval_loss = 0 if label == "book" else max(0, player_best_eval - player_move_eval)
        win_chance_loss = coach.get_review_loss(player_best_eval, player_move_eval, label)
        
        return {
            "label": label,
            "eval": move_eval,
            "best_move": deep_res.get("best_move", ""),
            "best_move_uci": best_move.uci() if best_move else "",
            "best_eval": best_eval_info / 100.0 if abs(best_eval_info) < 5000 else f"M{int((10000-abs(best_eval_info))/100)}",
            "raw_best_eval": best_eval_info,
            "eval_loss": eval_loss / 100.0 if eval_loss < 5000 else None,
            "win_chance_loss": round(win_chance_loss, 4),
            "opening": opening_data,
            "engine_lines": post_move_engine_lines,
            "best_engine_lines": deep_res.get("engine_lines", [])
        }

    except Exception as e:
        print(f"KRITIKUS Sandbox hiba: {e}")
        return {
            "label": "best", 
            "eval": 0, 
            "best_move": "", 
            "opening": None, 
            "engine_lines": []
        }
@router.post("/analyze-full-game-sandbox")
def analyze_full_game_sandbox(data: dict):
    moves_list = data.get("moves", [])
    # Ha a kliens küld egyedi FEN-t, azt használjuk, egyébként az alapállást
    initial_fen = data.get("initial_fen", chess.STARTING_FEN)
    
    if not moves_list:
        return {"analysis": []}

    engine = get_engine()
    # A táblát a megadott kezdőpozícióval inicializáljuk!
    board = chess.Board(initial_fen)
    coach = ChessCoachEngine()
    full_analysis = []
    side_stats = {
        "white": {"losses": [], "p_befores": []},
        "black": {"losses": [], "p_befores": []},
    }
    
    # Kezdő értékelés meghatározása (ha nem alapállás, érdemes ránézni)
    # Az alapértelmezett 30 (enyhe fehér előny) jó kiindulópont
    prev_eval = 30 

    for i, m_san in enumerate(moves_list):
        try:
            player_move = board.parse_san(m_san)
        except:
            try:
                player_move = board.parse_uci(m_san)
            except:
                continue # Ha hibás a lépés jelölése, ugorjuk át

        book_info = get_book_info_after_move(board, player_move)
        is_book = book_info is not None

        # Multi-PV elemzés gyors game review beállításokkal.
        analysis = engine.analyse(board, coach.review_limit(), multipv=3)
        
        # Címkézés (label, eval)
        played_eval = coach.evaluate_played_move_after(board, player_move, engine)
        label, move_eval = coach.classify_move(
            board,
            player_move,
            analysis,
            prev_eval,
            is_book=is_book,
            played_eval=played_eval,
        )
        
        # Engine Lines összeállítása
        engine_lines = []
        for entry in analysis:
            score_white = entry["score"].white().score(mate_score=10000)
            pv_moves = entry.get("pv", [])
            engine_lines.append({
                "eval": score_white / 100.0 if abs(score_white) < 5000 else f"M{int((10000-abs(score_white))/100)}",
                "raw_eval": score_white,
                "continuation": board.variation_san(pv_moves[:10]),
                "pv_uci": [move.uci() for move in pv_moves[:10]]
            })

        best_eval_info = analysis[0]["score"].white().score(mate_score=10000)
        is_white_turn = board.turn == chess.WHITE
        player_best_eval = best_eval_info if is_white_turn else -best_eval_info
        player_move_eval = move_eval if is_white_turn else -move_eval
        eval_loss = 0 if label == "book" else max(0, player_best_eval - player_move_eval)
        win_chance_loss = coach.get_review_loss(player_best_eval, player_move_eval, label)
        p_before = coach.get_win_chance(prev_eval if is_white_turn else -prev_eval)
        side_key = "white" if is_white_turn else "black"
        side_stats[side_key]["losses"].append(win_chance_loss)
        side_stats[side_key]["p_befores"].append(p_before)
        best_move = analysis[0]["pv"][0] if analysis[0].get("pv") else None

        full_analysis.append({
            "move_number": i + 1,
            "m": m_san,
            "label": label,
            "is_book": is_book,
            "eval": move_eval / 100.0 if abs(move_eval) < 5000 else f"M{int((10000-abs(move_eval))/100)}",
            "raw_eval": move_eval,
            "best_move": board.san(best_move) if best_move else "",
            "best_move_uci": best_move.uci() if best_move else "",
            "best_eval": best_eval_info / 100.0 if abs(best_eval_info) < 5000 else f"M{int((10000-abs(best_eval_info))/100)}",
            "raw_best_eval": best_eval_info,
            "eval_loss": eval_loss / 100.0 if eval_loss < 5000 else None,
            "win_chance_loss": round(win_chance_loss, 4),
            "engine_lines": engine_lines,
            "opening": book_info["name"] if is_book else None
        })

        board.push(player_move)
        prev_eval = move_eval

    white_accuracy = coach.calculate_accuracy(side_stats["white"]["losses"], side_stats["white"]["p_befores"]) if side_stats["white"]["losses"] else None
    black_accuracy = coach.calculate_accuracy(side_stats["black"]["losses"], side_stats["black"]["p_befores"]) if side_stats["black"]["losses"] else None

    return {
        "analysis": full_analysis,
        "white_accuracy": white_accuracy,
        "black_accuracy": black_accuracy,
    }


def rebuild_board(game_id: uuid.UUID, db: Session):
    # Csak a legutolsó lépést kérjük le (move_number alapján csökkenő sorrend, az első elem)
    last_move = db.query(models.Move).filter(
        models.Move.game_id == game_id
    ).order_by(models.Move.move_number.desc()).first()

    # Ha még nincs lépés (vagy csak a "start" sor van), alapállásból indulunk
    if not last_move or last_move.notation == "start":
        return chess.Board()

    # Ha van mentett 'fen_after', azonnal abból töltjük be a táblát
    if hasattr(last_move, 'fen_after') and last_move.fen_after:
        return chess.Board(last_move.fen_after)

    # TARTALÉK (Fallback): Ha valamiért nincs fen_after (pl. régi meccs), 
    # akkor lefut a régi lassú algoritmusod
    moves = db.query(models.Move).filter(models.Move.game_id == game_id).order_by(models.Move.move_number.asc()).all()
    board = chess.Board()
    for m in moves:
        if m.notation == "start" or not m.notation: continue
        try: board.push_san(m.notation)
        except:
            try: board.push_uci(m.notation)
            except: continue
    return board

@router.post("/create-game")
async def create_game(request: Request, data: dict, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    # Megjegyzés: async def-re váltottunk és bekerült a request: Request a Socket.io miatt
    try:
        sio = get_sio(request) # Socket elérése
        u_uuid = uuid.UUID(user_id)
        chosen_color = data.get("color", "white")
        
        # --- ÚJ ADATOK FOGADÁSA ---
        bot_elo = data.get("bot_elo", 1500)
        bot_id = data.get("bot_id", "engine")
        bot_style = data.get("bot_style", "mix")
        time_category_raw = data.get("time_category", "rapid")
        try:
            time_category = models.GameCategory(time_category_raw)
        except ValueError:
            time_category = models.GameCategory.rapid
        
        # --- RANDOM SORSOLÁS (Backend oldalon) ---
        if chosen_color == "random":
            import random
            chosen_color = random.choice(["white", "black"])
        
        board = chess.Board()
        
        # --- ÚJ GAME REKORD MENTÉSE ---
        new_game = models.Game(
            white_player_id=u_uuid if chosen_color == "white" else None,
            black_player_id=u_uuid if chosen_color == "black" else None,
            player_color=chosen_color,
            bot_elo=bot_elo,
            bot_id=bot_id,
            bot_style=bot_style,
            time_category=time_category,
            base_time_sec=data.get("base_time", 600),
            status=models.GameStatus.ongoing
        )
        db.add(new_game)
        db.commit()
        db.refresh(new_game)

        # 0. lépés: Start mentése a Move táblába
        db.add(models.Move(
            game_id=new_game.id, 
            move_number=0, 
            notation="start", 
            fen_before=board.fen(), 
            fen_after=board.fen()
        ))
        db.commit()

        # --- BOT LÉPÉSE (HA A USER FEKETE, A BOT KEZD FEHÉRREL) ---
        if chosen_color == "black":
            engine = get_engine()
            
            # Konfigurálás
            configure_engine_for_elo(engine, bot_elo)
            
            # Időlimit meghatározása
            pure_stockfish = bot_style in {"stockfish", "engine", "top_player"} or bot_id == "engine"
            limit_params = get_bot_limit_params(bot_elo, pure_stockfish)
            
            # Bot lép
            analysis = engine.analyse(board, chess.engine.Limit(**limit_params), multipv=5)
            bot_move = choose_styled_bot_move(board, analysis, bot_style, bot_elo)
            
            move_san = board.san(bot_move)
            fen_elotte = board.fen()
            board.push(bot_move)
            
            # Bot első lépésének mentése
            db.add(models.Move(
                game_id=new_game.id, 
                move_number=1, 
                notation=move_san,
                fen_before=fen_elotte, 
                fen_after=board.fen()
            ))
            db.commit()

            # --- SOCKET ÉRTESÍTÉS ---
            # Jelezzük a kliensnek, hogy a bot lépett (ha már csatlakozott a szobához)
            await sio.emit("game_started", {
                "game_id": str(new_game.id),
                "fen": board.fen(),
                "last_move": move_san
            }, room=str(new_game.id))

        return {
            "game_id": str(new_game.id), 
            "fen": board.fen(), 
            "player_color": chosen_color
        }
    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc() # Ez kiírja a hibát a terminálba!
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/get-valid-moves")
def get_valid_moves(data: dict, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    game_id_str = data.get("game_id")
    if not game_id_str or game_id_str == "null": 
        return {"valid_moves": [], "is_in_check": False}
    try:
        board = rebuild_board(uuid.UUID(game_id_str), db)
        is_in_check = board.is_check()
        from_sq_str = data.get("square")
        if not from_sq_str:
            return {"valid_moves": [], "is_in_check": is_in_check}
        from_sq = chess.parse_square(from_sq_str)
        valid_moves = [chess.square_name(m.to_square) for m in board.legal_moves if m.from_square == from_sq]
        return {"valid_moves": valid_moves, "is_in_check": is_in_check}
    except Exception as e:
        return {"valid_moves": [], "is_in_check": False}
    

def get_game_over_details(b: chess.Board):
    """Meghatározza a játék végének pontos okát és státuszát."""
    
    # 1. Matt ellenőrzése
    if b.is_checkmate():
        # b.turn: Aki jönne. Ha b.turn == WHITE (True), akkor a Sötét mattolt.
        winner = "Black" if b.turn == chess.WHITE else "White"
        return models.GameStatus.checkmate, f"{winner} wins by checkmate"
    
    # 2. Patt ellenőrzése
    if b.is_stalemate():
        return models.GameStatus.draw, "Draw by stalemate"
    
    # 3. Anyaghiány
    if b.is_insufficient_material():
        return models.GameStatus.draw, "Draw by insufficient material"
    
    # 4. Állásismétlés
    if b.can_claim_threefold_repetition() or b.is_fivefold_repetition():
        return models.GameStatus.draw, "Draw by repetition"
    
    # 5. 50/75 lépéses szabály
    if b.can_claim_fifty_moves() or b.is_seventyfive_moves():
        return models.GameStatus.draw, "Draw by 50-move rule"

    # 6. Biztonsági háló
    if b.is_game_over():
        return models.GameStatus.draw, "Draw"

    return models.GameStatus.ongoing, None

# --- 3. RÉSZ (TELJES, MINDEN FUNKCIÓVAL) ---

@router.post("/move")
async def make_move(request: Request, data: dict, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    game_id = data.get("game_id")
    if not game_id or game_id == "null":
        raise HTTPException(status_code=400, detail="Missing game_id")
    try:
        game_uuid = uuid.UUID(str(game_id))
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="Invalid game_id")
    move_uci = data.get("move")
    is_timeout = data.get("timeout", False)
    is_resignation = data.get("resigned", False)

    try:
        sio = get_sio(request)
        game_rec = db.query(models.Game).filter(models.Game.id == game_uuid).first()
        if not game_rec:
            raise HTTPException(status_code=404, detail="Game not found")
        
        if game_rec.status != models.GameStatus.ongoing:
            return {"status": game_rec.status.value, "is_game_over": True}

        board = rebuild_board(game_uuid, db)
        user_color = chess.WHITE if str(game_rec.white_player_id) == user_id else chess.BLACK

        # --- 1. ABORT / FINISH LOGIKA ---
        if is_timeout or is_resignation:
            real_moves = db.query(models.Move).filter(
                models.Move.game_id == game_uuid,
                models.Move.notation != "start"
            ).all()
            
            num_actual_moves = len(real_moves)
            limit = 3 if user_color == chess.WHITE else 4

            if num_actual_moves < limit:
                game_rec.status = models.GameStatus.aborted
                reason = "Game Aborted"
            else:
                game_rec.status = models.GameStatus.finished
                if is_timeout:
                    winner = "Black" if board.turn == chess.WHITE else "White"
                    reason = f"{winner} wins on time"
                else:
                    winner = "Black" if user_color == chess.WHITE else "White"
                    reason = f"{winner} wins by resignation"

            db.commit()
            
            await sio.emit("game_over", {
                "game_id": str(game_uuid),
                "status": game_rec.status.value,
                "reason": reason
            }, room=str(game_uuid))

            return {
                "status": game_rec.status.value, 
                "reason": reason, 
                "is_game_over": True, 
                "new_fen": board.fen()
            }

        # --- 2. USER LÉPÉSE ---
        if not move_uci or move_uci == "null":
             raise HTTPException(status_code=400, detail="Missing move data")

        try:
            user_move = chess.Move.from_uci(move_uci)
        except:
            promo_move = chess.Move.from_uci(move_uci + "q")
            if promo_move in board.legal_moves:
                user_move = promo_move
            else:
                raise HTTPException(status_code=400, detail="Invalid move format")

        if user_move not in board.legal_moves:
            legal_from_square = []
            try:
                legal_from_square = [
                    move.uci()
                    for move in board.legal_moves
                    if move.from_square == user_move.from_square
                ]
            except Exception:
                pass
            raise HTTPException(status_code=400, detail={
                "error": "Illegal move",
                "move": move_uci,
                "fen": board.fen(),
                "turn": "white" if board.turn == chess.WHITE else "black",
                "in_check": board.is_check(),
                "legal_from_square": legal_from_square,
            })

        fen_elotte = board.fen()
        user_move_san = board.san(user_move)
        board.push(user_move)
        fen_utana = board.fen()

        move_count = db.query(models.Move).filter(models.Move.game_id == game_uuid).count()
        db.add(models.Move(
            game_id=game_uuid, 
            move_number=move_count, 
            notation=user_move_san, 
            fen_before=fen_elotte, 
            fen_after=fen_utana
        ))
        db.commit()

        # --- 3. BOT VÁLASZA (Késleltetéssel) ---
        bot_res = {"from": "", "to": "", "san": "", "evaluation": 0.0, "think_time": 0.0}
        chosen_move = None 

        if not board.is_game_over():
            # ÚJ: Random gondolkodási idő generálása (1 és 4 másodperc között)
            think_time = round(random.uniform(1.0, 4.0), 1)
            bot_res["think_time"] = think_time
            
            # Aszinkron várakozás, nem blokkolja a szervert
            await asyncio.sleep(think_time)

            engine = get_engine()
            bot_elo = game_rec.bot_elo or 1500
            bot_id = str(game_rec.bot_id).lower()
            bot_style = (game_rec.bot_style or "universal").lower()
            
            pure_stockfish = bot_style in {"stockfish", "engine", "top_player"} or bot_id == "engine"
            configure_engine_for_elo(engine, bot_elo)
            
            limit_params = get_bot_limit_params(bot_elo, pure_stockfish)
            
            analysis = engine.analyse(board, chess.engine.Limit(**limit_params), multipv=5)
            
            chosen_move = choose_styled_bot_move(board, analysis, bot_style, bot_elo)
                        
            if chosen_move:
                bot_res["san"] = board.san(chosen_move)
                bot_res["from"] = chess.square_name(chosen_move.from_square)
                bot_res["to"] = chess.square_name(chosen_move.to_square)
                
                try:
                    score = analysis[0]["score"].white()
                    bot_res["evaluation"] = f"M{score.mate()}" if score.is_mate() else score.score() / 100.0
                except:
                    bot_res["evaluation"] = 0.0

                f_before = board.fen()
                board.push(chosen_move)
                f_after = board.fen()

                m_count = db.query(models.Move).filter(models.Move.game_id == game_uuid).count()
                db.add(models.Move(
                    game_id=game_uuid, 
                    move_number=m_count, 
                    notation=bot_res["san"], 
                    fen_before=f_before,
                    fen_after=f_after
                ))
                db.commit()

                opening_data = get_opening_with_fallback(db, game_uuid)

                # WebSocket értesítés (most már tartalmazza a thinking_time-ot)
                await sio.emit("bot_moved", {
                    "game_id": str(game_uuid),
                    "fen": f_after,
                    "move": bot_res,
                    "thinking_time": think_time,
                    "evaluation": bot_res["evaluation"],
                    "opening": opening_data
                }, room=str(game_uuid))

        opening_data = get_opening_with_fallback(db, game_uuid)
        final_status_enum, final_reason = get_game_over_details(board)
        
        if final_status_enum != models.GameStatus.ongoing:
            game_rec.status = final_status_enum
            db.commit()
            
            await sio.emit("game_over", {
                "game_id": str(game_uuid),
                "status": final_status_enum.value,
                "reason": final_reason
            }, room=str(game_uuid))

        return {
            "new_fen": board.fen(),
            "is_game_over": final_status_enum != models.GameStatus.ongoing,
            "status": final_status_enum.value,
            "reason": final_reason,
            "bot_move": bot_res,
            "opening": opening_data,
            "evaluation": bot_res.get("evaluation", 0.0)
        }

    except Exception as e:
        db.rollback()
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=str(e))
    
# --- 4. RÉSZ (BEFEJEZŐ, MINDEN FUNKCIÓVAL) ---

@router.get("/game/{game_id}/history")
def get_game_history(game_id: str, db: Session = Depends(get_db)):
    try:
        game_uuid = uuid.UUID(game_id)
        game = db.query(models.Game).filter(models.Game.id == game_uuid).first()
        if not game:
            raise HTTPException(status_code=404, detail="Game not found")

        # Lépések lekérése időrendben
        moves = db.query(models.Move).filter(models.Move.game_id == game_uuid).order_by(models.Move.move_number.asc()).all()
        
        history_data = []
        board = chess.Board()
        
        # Feldolgozzuk a lépéseket a FEN és idő kiszámításához
        for i, m in enumerate(moves):
            duration = 0
            if i > 0 and m.created_at and moves[i-1].created_at:
                diff = m.created_at - moves[i-1].created_at
                duration = diff.total_seconds()
            
            if m.notation == "start":
                history_data.append({
                    "num": 0, 
                    "m": "start", 
                    "fen": m.fen_before or board.fen(), 
                    "from": None, 
                    "to": None, 
                    "t": 0
                })
                continue

            try:
                mv = board.push_san(m.notation)
                history_data.append({
                    "num": m.move_number, 
                    "m": m.notation, 
                    "fen": board.fen(), 
                    "from": chess.square_name(mv.from_square), 
                    "to": chess.square_name(mv.to_square),
                    "t": round(duration, 1),
                    "analysisLabel": m.accuracy_label,
                    "eval": m.evaluation,
                    "bestMove": m.best_move_uci,
                    "winChanceLoss": m.win_chance_drop,
                })
            except:
                continue

        # --- AZ ÚJ, OKOS MEGNYITÁS KERESÉS ---
        opening_data = get_opening_with_fallback(db, game_uuid)

        # --- PONTOS OK (REASON) MEGHATÁROZÁSA ---
        status_value = game.status.value if game.status else "ongoing"
        reason = "Match ongoing"
        
        if game.status == models.GameStatus.aborted:
            reason = "Game Aborted"
        elif game.status == models.GameStatus.resigned:
            user_color = str(game.player_color).lower()
            winner = "Black" if user_color == "white" else "White"
            reason = f"{winner} wins by resignation"
        elif game.status == models.GameStatus.checkmate:
            winner = "Black" if board.turn == chess.WHITE else "White"
            reason = f"{winner} wins by checkmate"
        elif game.status == models.GameStatus.finished:
            winner = "Black" if board.turn == chess.WHITE else "White"
            reason = f"{winner} wins on time"
        elif game.status == models.GameStatus.draw:
            if board.is_stalemate(): reason = "Draw by stalemate"
            elif board.is_insufficient_material(): reason = "Draw by insufficient material"
            elif board.can_claim_threefold_repetition(): reason = "Draw by repetition"
            elif board.can_claim_fifty_moves(): reason = "Draw by 50-move rule"
            else: reason = "Draw by agreement"

        move_count = len([m for m in history_data if m.get("m") != "start"])
        result = "*"
        if game.status == models.GameStatus.draw:
            result = "1/2-1/2"
        elif game.status not in {models.GameStatus.ongoing, models.GameStatus.aborted} and move_count > 0:
            winner_is_white = board.turn == chess.BLACK
            if game.status == models.GameStatus.resigned:
                winner_is_white = str(game.player_color).lower() == "black"
            result = "1-0" if winner_is_white else "0-1"

        return {
            "history": history_data,
            "status": status_value,
            "result": result,
            "reason": reason,
            "opening": opening_data,
            "base_time_sec": game.base_time_sec,
            "time_category": game.time_category.value if game.time_category else None,
            "player_color": game.player_color,
            "bot_id": game.bot_id,
            "bot_elo": game.bot_elo,
            "bot_style": game.bot_style,
            "white_accuracy": game.white_accuracy,
            "black_accuracy": game.black_accuracy,
        }

    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"history": [], "status": "ongoing", "reason": "Error", "opening": None}

@router.delete("/game/{game_id}")
def delete_game(game_id: str, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    try:
        game_uuid = uuid.UUID(game_id)
        user_uuid = uuid.UUID(user_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid game id")

    game = db.query(models.Game).filter(models.Game.id == game_uuid).first()
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    if game.white_player_id != user_uuid and game.black_player_id != user_uuid:
        raise HTTPException(status_code=403, detail="Not allowed to delete this game")

    db.query(models.Move).filter(models.Move.game_id == game_uuid).delete(synchronize_session=False)
    db.delete(game)
    db.commit()
    return {"deleted": True, "game_id": str(game_uuid)}
    
@router.get("/get-active-game")
def get_active_game(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    u_uuid = uuid.UUID(user_id)
    active_game = db.query(models.Game).filter(
        ((models.Game.white_player_id == u_uuid) | (models.Game.black_player_id == u_uuid)),
        models.Game.status == models.GameStatus.ongoing
    ).order_by(models.Game.created_at.desc()).first()

    if active_game:
        return {
            "game_id": str(active_game.id),
            "player_color": active_game.player_color,
            "bot_elo": active_game.bot_elo,
            "bot_id": active_game.bot_id,
            "bot_style": active_game.bot_style,
            "base_time_sec": active_game.base_time_sec,
            "time_category": active_game.time_category.value if active_game.time_category else None
        }
    return {"game_id": None}

@router.post("/resign-game")
async def resign_game(request: Request, data: dict, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    try:
        # 1. Socket.io elérése a központi state-ből
        sio = get_sio(request)
        
        # 2. Adatok kinyerése és validálása
        game_id_raw = data.get("game_id")
        if not game_id_raw or game_id_raw == "null":
            return {"status": "error", "message": "Missing or invalid game_id"}

        # Biztonságos UUID konvertálás
        try:
            game_uuid = uuid.UUID(str(game_id_raw))
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid UUID format")

        # 3. Játék lekérése az adatbázisból
        game = db.query(models.Game).filter(models.Game.id == game_uuid).first()
        if not game: 
            return {"status": "not_found"}

        # 4. Valódi lépések számolása (Abort vagy Resign döntéshez)
        real_moves = db.query(models.Move).filter(
            models.Move.game_id == game_uuid, 
            models.Move.notation != "start"
        ).count()

        # 5. Logika: 3 lépés alatt Aborted, felette Resigned
        if real_moves < 3:
            game.status = models.GameStatus.aborted
            reason = "Game Aborted"
        else:
            user_color = str(game.player_color).lower()
            winner = "Black" if user_color == "white" else "White"
            game.status = models.GameStatus.resigned 
            reason = f"{winner} wins by resignation"
            
        db.commit()

        # 6. WebSocket értesítés küldése a szobának
        # Az aszinkron emit miatt kell az await
        await sio.emit("game_over", {
            "game_id": str(game_uuid),
            "status": game.status.value,
            "reason": reason
        }, room=str(game_uuid))
        
        # 7. Válasz küldése a HTTP kérésre
        return {
            "status": game.status.value, 
            "reason": reason
        }

    except Exception as e:
        # Hiba esetén visszagörgetjük az adatbázist
        db.rollback()
        # Ez a sor kiírja a pontos hibát a Python terminálba (pl. NameError vagy AttributeError)
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=str(e))
    
@router.post("/handle-timeout")
async def handle_timeout(request: Request, data: dict, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    try:
        sio = get_sio(request)
        game_uuid = uuid.UUID(str(data.get("game_id")))
        lost_color = data.get("color")
        game = db.query(models.Game).filter(models.Game.id == game_uuid).first()
        
        if not game:
            return {"status": "not_found"}

        move_count = db.query(models.Move).filter(models.Move.game_id == game_uuid).count()

        if move_count <= 2:
            game.status = models.GameStatus.aborted
            reason = "Game Aborted"
        else:
            winner = "Black" if lost_color == "white" else "White"
            game.status = models.GameStatus.finished 
            reason = f"{winner} wins on time"
            
        db.commit()

        await sio.emit("game_over", {
            "game_id": str(game_uuid),
            "status": game.status.value,
            "reason": reason
        }, room=str(game_uuid))

        return {"status": game.status.value, "reason": reason}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/offer-draw")
async def offer_draw(request: Request, data: dict, user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    try:
        sio = get_sio(request)
        game_uuid = uuid.UUID(data.get("game_id"))
        game = db.query(models.Game).filter(models.Game.id == game_uuid).first()
        if game:
            game.status = models.GameStatus.draw
            reason = "Draw by agreement"
            db.commit()
            
            await sio.emit("game_over", {
                "game_id": str(game_uuid),
                "status": "draw",
                "reason": reason
            }, room=str(game_uuid))
            
            return {"status": "draw", "reason": reason}
        return {"status": "not_found"}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/get-latest-review-game")
def get_latest_review_game(user_id: str = Depends(get_current_user_id), db: Session = Depends(get_db)):
    latest_game = db.query(models.Game)\
        .filter(
            (models.Game.white_player_id == user_id) | (models.Game.black_player_id == user_id),
            models.Game.status != models.GameStatus.ongoing,
            models.Game.status != models.GameStatus.aborted,
            models.Game.white_accuracy.is_(None),
            models.Game.black_accuracy.is_(None),
        )\
        .order_by(models.Game.created_at.desc())\
        .first()
    
    if not latest_game:
        return None

    last_move = db.query(models.Move)\
        .filter(models.Move.game_id == latest_game.id)\
        .order_by(models.Move.move_number.desc())\
        .first()

    return {
        "game_id": str(latest_game.id),
        "opponent": latest_game.bot_id or "Opponent",
        "last_fen": last_move.fen_after if last_move else "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",
        "is_analyzed": False 
    }

@router.get("/user-games/{username}")
def get_user_games(username: str, offset: int = 0, limit: int = 10, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    user_game_filter = (models.Game.white_player_id == user.id) | (models.Game.black_player_id == user.id)
    completed_statuses = {
        models.GameStatus.finished,
        models.GameStatus.draw,
        models.GameStatus.resigned,
        models.GameStatus.checkmate,
        models.GameStatus.aborted,
    }

    games = db.query(models.Game)\
        .filter(user_game_filter, models.Game.status.in_(completed_statuses))\
        .order_by(models.Game.created_at.desc())\
        .offset(offset)\
        .limit(limit)\
        .all()
    
    total_count = db.query(models.Game)\
        .filter(user_game_filter, models.Game.status.in_(completed_statuses))\
        .count()

    def bot_display_name(game):
        bot_id = (game.bot_id or "engine").replace("_", " ").replace("-", " ").strip()
        if not bot_id:
            return "Engine"
        known_names = {
            "beginner stockfish": "Stockfish",
            "intermediate stockfish": "Stockfish",
            "advanced stockfish": "Stockfish",
            "master stockfish": "Stockfish",
        }
        return known_names.get(bot_id.lower(), bot_id.title())

    def format_game_date(value):
        if not value:
            return None
        return value.strftime("%b %-d, %Y") if os.name != "nt" else value.strftime("%b %#d, %Y")

    def result_for_game(game, move_count, board):
        if game.status == models.GameStatus.draw:
            return "1/2-1/2"
        if game.status in {models.GameStatus.ongoing, models.GameStatus.aborted} or move_count == 0:
            return "*"

        winner_is_white = board.turn == chess.BLACK
        if game.status == models.GameStatus.resigned:
            winner_is_white = str(game.player_color).lower() == "black"
        elif game.status == models.GameStatus.finished:
            winner_is_white = board.turn == chess.BLACK

        return "1-0" if winner_is_white else "0-1"

    def format_accuracy(value):
        if value is None:
            return None
        return f"{float(value):.1f}"

    serialized_games = []
    for game in games:
        moves = db.query(models.Move)\
            .filter(models.Move.game_id == game.id, models.Move.notation != "start")\
            .order_by(models.Move.move_number.asc())\
            .all()
        board = chess.Board()
        for move in moves:
            try:
                board.push_san(move.notation)
            except Exception:
                try:
                    board.push_uci(move.notation)
                except Exception:
                    continue

        i_was_white = str(game.player_color).lower() != "black"
        result = result_for_game(game, len(moves), board)
        user_won = (i_was_white and result == "1-0") or ((not i_was_white) and result == "0-1")
        time_label = "bot"
        if game.base_time_sec and game.base_time_sec > 0:
            minutes = max(1, round(game.base_time_sec / 60))
            time_label = f"{minutes} min"

        serialized_games.append({
            "id": str(game.id),
            "type": time_label,
            "isBot": bool(game.bot_id),
            "opponent": bot_display_name(game),
            "elo": game.bot_elo,
            "myElo": None,
            "result": result,
            "accuracy": [
                format_accuracy(game.white_accuracy),
                format_accuracy(game.black_accuracy),
            ] if game.white_accuracy is not None or game.black_accuracy is not None else None,
            "myAccuracy": format_accuracy(game.white_accuracy if i_was_white else game.black_accuracy),
            "opponentAccuracy": format_accuracy(game.black_accuracy if i_was_white else game.white_accuracy),
            "moves": (len(moves) + 1) // 2,
            "date": format_game_date(game.created_at),
            "win": user_won,
            "iWasWhite": i_was_white,
            "status": game.status.value if game.status else "ongoing",
        })

    return {"games": serialized_games, "total": total_count}

@router.get("/user-activity-dates/{username}")
def get_user_activity_dates(username: str, db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    games = db.query(models.Game.created_at, models.Game.reviewed_at)\
        .filter((models.Game.white_player_id == user.id) | (models.Game.black_player_id == user.id))\
        .order_by(models.Game.created_at.desc())\
        .all()

    return {
        "dates": [
            value.isoformat()
            for game in games
            for value in (game.created_at, game.reviewed_at)
            if value
        ]
    }

