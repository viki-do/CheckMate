import math
import os

import chess
import chess.engine
import chess.polyglot


class ChessCoachEngine:
    def __init__(self, book_bin_path="data/titans.bin"):
        self.WIN_CHANCE_CONSTANT = 400.0
        self.REVIEW_DEPTH = 14
        self.PLAYED_MOVE_DEPTH = 12
        self.REVIEW_NODES = 180000
        self.PLAYED_MOVE_NODES = 90000
        self.ACCURACY_EXPONENT = 32
        self.book_bin_path = book_bin_path
        self.phase_thresholds = {
            "opening": {
                "best_cp": 12,
                "excellent_cp": 28,
                "good_cp": 55,
                "inaccuracy_cp": 90,
                "mistake_cp": 180,
                "blunder_cp": 320,
                "inaccuracy_loss": 0.04,
                "mistake_loss": 0.10,
                "blunder_loss": 0.22,
                "only_move_gap": 0.12,
                "alt_window": 0.025,
            },
            "middlegame": {
                "best_cp": 10,
                "excellent_cp": 24,
                "good_cp": 45,
                "inaccuracy_cp": 75,
                "mistake_cp": 150,
                "blunder_cp": 260,
                "inaccuracy_loss": 0.035,
                "mistake_loss": 0.085,
                "blunder_loss": 0.18,
                "only_move_gap": 0.10,
                "alt_window": 0.020,
            },
            "endgame": {
                "best_cp": 8,
                "excellent_cp": 20,
                "good_cp": 35,
                "inaccuracy_cp": 60,
                "mistake_cp": 120,
                "blunder_cp": 220,
                "inaccuracy_loss": 0.03,
                "mistake_loss": 0.07,
                "blunder_loss": 0.15,
                "only_move_gap": 0.08,
                "alt_window": 0.018,
            },
        }

    def get_win_chance(self, cp_score):
        if cp_score is None:
            return 0.5
        if abs(cp_score) > 9000:
            return 1.0 if cp_score > 0 else 0.0
        return 1 / (1 + math.pow(10, -cp_score / self.WIN_CHANCE_CONSTANT))

    def get_review_loss(self, player_best, player_curr, label=None):
        if label == "book":
            return 0

        base_loss = max(0, self.get_win_chance(player_best) - self.get_win_chance(player_curr))

        # Chess.com's review is harsher than pure win chance when a move enters
        # forced mate, even from an already bad position.
        if player_curr <= -9000:
            if player_best > -9000:
                return max(base_loss, 0.075 if player_best <= -700 else 0.18)

            mate_distance_loss = max(0, abs(player_curr) - abs(player_best))
            if mate_distance_loss >= 400:
                return max(base_loss, 0.045)
            if mate_distance_loss >= 200:
                return max(base_loss, 0.025)

        # Missing a forced mate should still matter even if the resulting
        # position remains winning.
        if player_best >= 9000 and player_curr < 9000:
            return max(base_loss, 0.16)

        return base_loss

    def review_limit(self, depth=None, nodes=None):
        return chess.engine.Limit(
            depth=depth or self.REVIEW_DEPTH,
            nodes=nodes or self.REVIEW_NODES,
        )

    def played_move_limit(self, depth=None, nodes=None):
        return chess.engine.Limit(
            depth=depth or self.PLAYED_MOVE_DEPTH,
            nodes=nodes or self.PLAYED_MOVE_NODES,
        )

    def analyze_position_deep(self, board, engine, depth=None, multipv=3):
        book_move = None
        if os.path.exists(self.book_bin_path):
            try:
                with chess.polyglot.open_reader(self.book_bin_path) as reader:
                    entry = reader.find(board)
                    book_move = entry.move.uci()
            except Exception:
                pass

        analysis = engine.analyse(board, self.review_limit(depth=depth), multipv=multipv)
        lines = []
        for entry in analysis:
            score = entry["score"].white().score(mate_score=10000)
            pv_moves = entry.get("pv", [])
            if not pv_moves:
                continue

            lines.append({
                "eval": score / 100.0 if abs(score) < 5000 else f"M{int((10000 - abs(score)) / 100)}",
                "raw_eval": score,
                "continuation": board.variation_san(pv_moves[:30]),
                "pv_uci": [m.uci() for m in pv_moves[:30]],
                "first_move_san": board.san(pv_moves[0]),
            })

        return {
            "is_book": book_move is not None,
            "book_move": book_move,
            "engine_lines": lines,
            "best_move": lines[0]["first_move_san"] if lines else None,
            "raw_analysis": analysis,
        }

    def evaluate_played_move_after(self, board, move, engine, depth=None):
        board.push(move)
        try:
            info = engine.analyse(board, self.played_move_limit(depth=depth))
            return info["score"].white().score(mate_score=10000)
        finally:
            board.pop()

    def get_game_phase(self, board):
        phase_score = 0
        piece_values = {chess.QUEEN: 9, chess.ROOK: 5, chess.BISHOP: 3, chess.KNIGHT: 3}
        for piece in board.piece_map().values():
            if piece.piece_type in piece_values:
                phase_score += piece_values[piece.piece_type]

        move_count = board.fullmove_number
        if phase_score > 40 and move_count <= 12:
            return "opening"
        if phase_score < 14:
            return "endgame"
        return "middlegame"

    def is_sacrifice(self, board, move):
        mover = board.piece_at(move.from_square)
        target = board.piece_at(move.to_square)
        if not mover:
            return False

        piece_vals = {
            chess.PAWN: 1,
            chess.KNIGHT: 3,
            chess.BISHOP: 3,
            chess.ROOK: 5,
            chess.QUEEN: 9,
            chess.KING: 0,
        }
        val_mover = piece_vals.get(mover.piece_type, 0)
        val_target = piece_vals.get(target.piece_type, 0) if target else 0

        if val_mover > val_target and board.is_attacked_by(not board.turn, move.to_square):
            return True
        return False

    def to_player_score(self, score, is_white):
        return score if is_white else -score

    def get_phase_config(self, board):
        return self.phase_thresholds[self.get_game_phase(board)]

    def count_good_alternatives(self, analysis_list, is_white, p_best, alt_window):
        count = 0
        for entry in analysis_list:
            pv = entry.get("pv", [])
            if not pv:
                continue

            score = entry["score"].white().score(mate_score=10000)
            p_score = self.get_win_chance(self.to_player_score(score, is_white))
            if (p_best - p_score) <= alt_window:
                count += 1
        return count

    def is_brilliant_candidate(self, board, move, cp_loss, p_curr, best_gain, only_move):
        mover_piece = board.piece_at(move.from_square)
        if not mover_piece or mover_piece.piece_type == chess.PAWN:
            return False
        if not self.is_sacrifice(board, move):
            return False
        if cp_loss > 25:
            return False
        if not (0.30 < p_curr < 0.98):
            return False
        if best_gain < 0.04 and not only_move:
            return False
        return True

    def is_great_candidate(self, cp_loss, best_gain, only_move):
        return only_move and cp_loss <= 18 and best_gain >= 0.06

    def classify_move(self, board, move, analysis_list, prev_eval, player_elo=1200, is_book=False, played_eval=None):
        if is_book:
            return "book", played_eval if played_eval is not None else prev_eval

        if not analysis_list:
            return "best", prev_eval

        is_white = board.turn == chess.WHITE
        phase_cfg = self.get_phase_config(board)
        best_move_info = analysis_list[0]
        best_eval = best_move_info["score"].white().score(mate_score=10000)

        if board.legal_moves.count() == 1:
            return "best", best_eval

        actual_move_info = next((a for a in analysis_list if a.get("pv") and a["pv"][0] == move), None)
        if played_eval is not None:
            move_eval = played_eval
        elif actual_move_info:
            move_eval = actual_move_info["score"].white().score(mate_score=10000)
        else:
            fallback_base = analysis_list[-1]["score"].white().score(mate_score=10000)
            move_eval = fallback_base - 120 if is_white else fallback_base + 120

        player_prev = self.to_player_score(prev_eval, is_white)
        player_best = self.to_player_score(best_eval, is_white)
        player_curr = self.to_player_score(move_eval, is_white)

        p_prev = self.get_win_chance(player_prev)
        p_best = self.get_win_chance(player_best)
        p_curr = self.get_win_chance(player_curr)

        loss = p_best - p_curr
        delta_prev = p_prev - p_curr
        cp_loss = max(0, player_best - player_curr)
        best_gain = max(0, p_best - p_prev)

        second_gap = 0.0
        if len(analysis_list) > 1 and analysis_list[1].get("pv"):
            score_2nd = analysis_list[1]["score"].white().score(mate_score=10000)
            p_second = self.get_win_chance(self.to_player_score(score_2nd, is_white))
            second_gap = p_best - p_second

        good_alternatives = self.count_good_alternatives(
            analysis_list,
            is_white,
            p_best,
            phase_cfg["alt_window"],
        )
        only_move = good_alternatives <= 1 and second_gap >= phase_cfg["only_move_gap"]

        if abs(best_eval) > 9000 and abs(move_eval) < 9000:
            return "blunder", move_eval

        if player_curr <= -9000:
            if player_best > -9000:
                return "inaccuracy" if player_best <= -700 else "blunder", move_eval

            mate_distance_loss = max(0, abs(player_curr) - abs(player_best))
            if mate_distance_loss >= 600:
                return "mistake", move_eval
            if mate_distance_loss >= 200:
                return "inaccuracy", move_eval
            return "excellent", move_eval

        if abs(move_eval) > 9000 and cp_loss <= 10:
            return "best", move_eval

        if self.is_brilliant_candidate(board, move, cp_loss, p_curr, best_gain, only_move):
            return "brilliant", move_eval

        if self.is_great_candidate(cp_loss, best_gain, only_move):
            return "great", move_eval

        if best_gain >= 0.18 and p_curr <= p_prev + 0.02:
            return "miss", move_eval

        # In already decisive positions, a centipawn swing can look huge while
        # the practical win chance barely changes. Prefer the win-chance shape
        # here; this matches Chess.com's tendency to call many lost-position
        # moves excellent/good instead of repeatedly punishing cp loss.
        if p_best <= 0.08:
            if loss <= 0.02:
                return "excellent", move_eval
            if loss <= 0.04:
                return "good", move_eval
            if loss <= 0.08:
                return "inaccuracy", move_eval
            if loss <= 0.16:
                return "mistake", move_eval
            return "blunder", move_eval

        if p_best >= 0.92:
            if loss <= 0.015:
                return "excellent", move_eval
            if loss <= 0.035:
                return "good", move_eval
            if loss <= 0.075:
                return "inaccuracy", move_eval
            if loss <= 0.15:
                return "mistake", move_eval
            return "blunder", move_eval

        if cp_loss >= phase_cfg["blunder_cp"] or delta_prev >= phase_cfg["blunder_loss"] or loss >= phase_cfg["blunder_loss"]:
            return "blunder", move_eval

        if cp_loss >= phase_cfg["mistake_cp"] or delta_prev >= phase_cfg["mistake_loss"] or loss >= phase_cfg["mistake_loss"]:
            return "mistake", move_eval

        if cp_loss >= phase_cfg["inaccuracy_cp"] or delta_prev >= phase_cfg["inaccuracy_loss"] or loss >= phase_cfg["inaccuracy_loss"]:
            return "inaccuracy", move_eval

        if cp_loss <= phase_cfg["best_cp"]:
            return "best", move_eval

        if cp_loss <= phase_cfg["excellent_cp"]:
            return "excellent", move_eval

        if cp_loss <= phase_cfg["good_cp"]:
            return "good", move_eval

        return "inaccuracy", move_eval

    def calculate_accuracy(self, win_chance_losses, win_probs_before):
        if not win_chance_losses:
            return 100.0
        move_accs = [100 * math.pow(1 - loss, self.ACCURACY_EXPONENT) for loss in win_chance_losses]
        avg_acc = sum(move_accs) / len(move_accs)
        return round(max(avg_acc, 5.0), 1)
