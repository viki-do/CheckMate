import { useEffect, useMemo, useState } from 'react';
import { Chess } from 'chess.js';
import { useNavigate } from 'react-router-dom';
import ChessBoardGrid from '../ChessBoardGrid';
import { ControlBtn } from '../component_helpers/AnalysisHelpers';
import { ChevronLeft, ChevronRight, New, ResetArrow } from '../icons/Icons';
import CapturedProgressBar from '../game-board/CapturedProgressBar';
import { useChess } from '../../context/ChessContext';
import { getReplayPositionSoundName } from '../../hooks/chess-game/soundUtils';
import { MoveNotation } from '../move-list/MoveNotation';
import { CapturedRow } from '../MaterialAdvantage';
import { getCapturedPieces, getMaterialDiff } from '../materialUtils';

const DEFAULT_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

const parseMoveText = (moveText) => {
  const chess = new Chess();
  const cleanText = String(moveText || '')
    .replace(/\{[^}]*\}/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\$\d+/g, ' ')
    .replace(/\d+\.(\.\.)?/g, ' ')
    .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, ' ');

  const tokens = cleanText
    .split(/\s+/)
    .map((token) => token.trim().replace(/[!?]+$/g, ''))
    .filter(Boolean);

  for (const token of tokens) {
    chess.move(token);
  }

  return chess;
};

const buildReplay = (game) => {
  const pgn = `${game.moves || ''} ${game.result || '*'}`.trim();
  let chess = new Chess();
  let parseError = false;

  try {
    chess.loadPgn(pgn);
  } catch {
    try {
      chess = parseMoveText(game.moves);
    } catch {
      parseError = true;
    }
  }

  const replay = new Chess();
  const moves = chess.history({ verbose: true });
  const fens = [DEFAULT_FEN];
  const history = moves.map((move, index) => {
    const fenBefore = replay.fen();
    const replayMove = replay.move(move.san);
    const fen = replay.fen();
    fens.push(fen);

    return {
      num: index,
      m: replayMove.san,
      from: replayMove.from,
      to: replayMove.to,
      fen,
      fen_before: fenBefore,
      color: replayMove.color,
    };
  });

  return { fens, history, parseError };
};

const formatMoveRows = (history) => {
  const rows = [];
  for (let index = 0; index < history.length; index += 2) {
    rows.push({
      moveNumber: Math.floor(index / 2) + 1,
      white: history[index],
      black: history[index + 1],
    });
  }
  return rows;
};

const PlayerStrip = ({ name, rating, type, material, side }) => (
  <div className={`w-170 flex items-center justify-between px-1 h-12 ${type === 'top' ? 'mb-1' : 'mt-1'} shrink-0`}>
    <div className="flex items-center gap-3">
      <div className="w-9 h-9 bg-[#2b2a27] rounded-md flex items-center justify-center border border-chess-bg overflow-hidden">
        <i className={`fas ${type === 'top' ? 'fa-user-tie' : 'fa-user'} text-[#808080] text-xl`}></i>
      </div>
      <div className="flex flex-col justify-center">
        <span className="text-[#bab9b8] font-bold text-[14px] leading-none">{name}</span>
        {rating && (
          <span className="text-[#8b8987] text-[11px] font-bold">({rating})</span>
        )}
        <CapturedRow pieces={material.pieces} side={side} diff={material.diff} />
      </div>
    </div>
  </div>
);

const isEcoCode = (value) => /^[A-E][0-9]{2}$/i.test(String(value || '').trim());

const getOpeningDisplay = (game) => {
  const detectedName = String(game.detected_opening?.name || '').trim();
  const detectedEco = String(game.detected_opening?.eco || '').trim();
  const opening = String(game.opening || '').trim();
  const eco = String(game.eco || '').trim();
  const ecoCode = detectedEco || eco || (isEcoCode(opening) ? opening : '');

  if (detectedName) {
    return { title: detectedName, metaEco: ecoCode };
  }

  if (opening && !isEcoCode(opening)) {
    return { title: opening, metaEco: eco && eco !== opening ? eco : '' };
  }

  return {
    title: 'Unknown opening',
    metaEco: ecoCode,
  };
};

const getResultTitle = (game) => {
  if (game.result === '1-0') return 'White Won (1-0)';
  if (game.result === '0-1') return 'Black Won (0-1)';
  if (game.result === '1/2-1/2' || game.result === '1/2' || game.result === '½-½') {
    return `Draw (${game.result})`;
  }
  return game.result ? `Result: ${game.result}` : 'Result Unknown';
};

const InfoLine = ({ label, value }) => {
  if (!value && value !== 0) return null;

  return (
    <div className="text-[#d7d6d4] text-base leading-7">
      <span className="font-bold text-white">{label}: </span>
      <span>{value}</span>
    </div>
  );
};

const DatabaseGameViewer = ({ game }) => {
  const navigate = useNavigate();
  const { playSound } = useChess();
  const replay = useMemo(() => buildReplay(game), [game]);
  const [moveIndex, setMoveIndex] = useState(replay.history.length);
  const [activeTab, setActiveTab] = useState('moves');
  const fen = replay.fens[moveIndex] || DEFAULT_FEN;
  const lastMove = moveIndex > 0 ? replay.history[moveIndex - 1] : null;
  const moveRows = formatMoveRows(replay.history);
  const currentMove = replay.history[moveIndex - 1];
  const opening = game.opening || 'Unknown opening';
  const openingDisplay = getOpeningDisplay(game);
  const captured = getCapturedPieces(fen);
  const materialDiff = getMaterialDiff(captured);
  const topMaterial = {
    pieces: captured.blackSide,
    diff: materialDiff < 0 ? Math.abs(materialDiff) : 0,
  };
  const bottomMaterial = {
    pieces: captured.whiteSide,
    diff: materialDiff > 0 ? materialDiff : 0,
  };
  const boardGameLogic = {
    fen,
    selectedSquare: null,
    lastMove: lastMove ? { from: lastMove.from, to: lastMove.to } : { from: null, to: null },
    validMoves: [],
    isDragging: false,
    hoverSquare: null,
    mousePos: { x: 0, y: 0 },
    isAlert: false,
    status: 'viewing',
    viewIndex: moveIndex,
    getSquareName: (row, col) => `${'abcdefgh'[col]}${8 - row}`,
    isFlipped: false,
    handleMouseUp: () => {},
  };

  const goToAnalysis = () => {
    navigate(`/analysis/game/master/${game.id}/review`);
  };

  const playReplaySound = (nextIndex) => {
    const soundName = getReplayPositionSoundName(replay.history, moveIndex, nextIndex);
    if (soundName) playSound(soundName);
  };

  const goToReplayMove = (nextIndex) => {
    const safeIndex = Math.max(0, Math.min(replay.history.length, nextIndex));
    playReplaySound(safeIndex);
    setMoveIndex(safeIndex);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const tagName = event.target?.tagName?.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea' || event.target?.isContentEditable) return;

      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        goToReplayMove(moveIndex - 1);
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        goToReplayMove(moveIndex + 1);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [moveIndex, replay.history.length]);

  return (
    <main className="flex justify-center items-center h-screen w-full bg-[#1e1e1e] gap-6 p-4 overflow-hidden select-none relative">
      <CapturedProgressBar />

      <div className="flex flex-col justify-center items-center h-full shrink-0">
        <PlayerStrip
          name={game.black}
          rating={game.black_elo}
          type="top"
          material={topMaterial}
          side="black"
        />

        <div className="w-170 h-170 bg-[#2b2b2b] relative">
          <ChessBoardGrid
            gameLogic={boardGameLogic}
            onMouseDown={() => {}}
            onMouseUp={() => {}}
          />
        </div>

        <PlayerStrip
          name={game.white}
          rating={game.white_elo}
          type="bottom"
          material={bottomMaterial}
          side="white"
        />
      </div>

      <aside className="w-112.5 shrink-0 h-170 self-center bg-[#262421] flex flex-col font-sans border border-[#3c3a37] rounded-xl overflow-hidden shadow-2xl">
        <div className="grid grid-cols-2 border-b border-[#373430] bg-[#1f1d1a]">
          <button
            type="button"
            onClick={() => setActiveTab('moves')}
            className={`py-4 text-center font-black border-b-4 ${
              activeTab === 'moves' ? 'text-white border-white' : 'text-[#bab9b8] border-transparent'
            }`}
          >
            Moves
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('info')}
            className={`py-4 text-center font-black border-b-4 ${
              activeTab === 'info' ? 'text-white border-white' : 'text-[#bab9b8] border-transparent'
            }`}
          >
            Info
          </button>
        </div>

        {activeTab === 'moves' ? (
          <>
            <div className="px-5 py-3 border-b border-[#373430] text-[#d7d6d4]">
              <div className="font-bold">{openingDisplay.title}</div>
              <div className="text-sm text-[#8b8987] mt-1">
                {[openingDisplay.metaEco, game.date].filter(Boolean).join(' - ') || 'Game database'}
              </div>
              {replay.parseError && <div className="text-sm text-[#f87171] mt-1">Could not parse moves</div>}
            </div>

            <div className="flex-1 overflow-y-auto no-scrollbar bg-[#262421]">
              {moveRows.map((row) => (
                <div key={row.moveNumber} className="grid grid-cols-[48px_1fr_1fr] px-5 py-2 odd:bg-[#2b2926] text-[#bab9b8] font-bold">
                  <div>{row.moveNumber}.</div>
                  <button
                    onClick={() => goToReplayMove(row.white.num + 1)}
                    className={`text-left hover:text-white flex items-center ${moveIndex === row.white.num + 1 ? 'text-white' : ''}`}
                  >
                    <MoveNotation move={row.white} isBlack={false} />
                  </button>
                  <button
                    onClick={() => row.black && goToReplayMove(row.black.num + 1)}
                    className={`text-left hover:text-white flex items-center ${row.black && moveIndex === row.black.num + 1 ? 'text-white' : ''}`}
                  >
                    {row.black ? <MoveNotation move={row.black} isBlack /> : ''}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto no-scrollbar bg-[#262421] px-5 py-5">
            <div className="bg-[#f2f2f2] text-[#5b5b5b] text-center font-black text-xl py-3 rounded-sm mb-5">
              {getResultTitle(game)}
            </div>

            <div className="space-y-1">
              <InfoLine label="Date" value={game.date} />
              <InfoLine label="Result" value={game.result} />
              <InfoLine label="Event" value={game.event} />
              <InfoLine label="Site" value={game.site} />
              <InfoLine label="Round" value={game.round} />
              <InfoLine label="White" value={game.white} />
              <InfoLine label="White Elo" value={game.white_elo} />
              <InfoLine label="Black" value={game.black} />
              <InfoLine label="Black Elo" value={game.black_elo} />
              <InfoLine label="Opening" value={openingDisplay.title} />
              <InfoLine label="ECO" value={openingDisplay.metaEco || game.eco} />
              <InfoLine label="Moves" value={game.ply_count ? Math.ceil(game.ply_count / 2) : null} />
            </div>
          </div>
        )}

        <div className="p-2 bg-[#21201d] rounded-b-lg border-t border-[#3c3a37] shrink-0">
          <div className="flex justify-between gap-1 px-1 h-12">
            <ControlBtn icon={<New size={20} />} onClick={goToAnalysis} />
            <ControlBtn icon={<ResetArrow size={20} />} onClick={() => goToReplayMove(0)} />
            <ControlBtn
              icon={<ChevronLeft size={20} />}
              onClick={() => goToReplayMove(moveIndex - 1)}
            />
            <ControlBtn
              icon={<ChevronRight size={20} />}
              onClick={() => goToReplayMove(moveIndex + 1)}
            />
          </div>
        </div>
      </aside>
    </main>
  );
};

export default DatabaseGameViewer;
