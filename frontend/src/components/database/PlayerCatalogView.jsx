import { useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Database, Loader2, Search } from 'lucide-react';
import PlayerCard from './PlayerCard';
import SearchBox from './SearchBox';
import { latestComments } from '../../constants/databasePlayers';
import { formatBytes, formatNumber } from '../../utils/databaseFormatters';

const RESULT_OPTIONS = [
  'Any result',
  'White wins',
  'Black wins',
  'Player 1 wins',
  'Player 2 wins',
  'Draw',
  'Not a Draw',
];

const COMPARISON_OPTIONS = ['=', '>=', '<='];

const AdvancedInput = ({ placeholder, className = '', ...props }) => (
  <input
    placeholder={placeholder}
    className={`h-9 w-full bg-[#373430] border border-[#53504c] px-3 text-sm text-[#d7d6d4] placeholder:text-[#8b8987] outline-none ${className}`}
    {...props}
  />
);

const AdvancedSelect = ({ value, onChange, options, className = '' }) => (
  <div className={`relative ${className}`}>
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-9 w-full appearance-none bg-[#373430] border border-[#53504c] px-3 pr-9 text-sm text-[#bab9b8] outline-none"
    >
      {options.map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
    <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#bab9b8]" />
  </div>
);

const DEFAULT_SETUP_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const PIECE_ASSETS = {
  p: 'black_pawn',
  n: 'black_knight',
  b: 'black_bishop',
  r: 'black_rook',
  q: 'black_queen',
  k: 'black_king',
  P: 'white_pawn',
  N: 'white_knight',
  B: 'white_bishop',
  R: 'white_rook',
  Q: 'white_queen',
  K: 'white_king',
};

const parseFenBoard = (fen) => {
  const placement = String(fen || '').trim().split(/\s+/)[0];
  const rows = placement.split('/');
  if (rows.length !== 8) return parseFenBoard(DEFAULT_SETUP_FEN);

  const squares = [];
  for (const row of rows) {
    let fileCount = 0;
    for (const char of row) {
      if (/^[1-8]$/.test(char)) {
        const emptyCount = Number(char);
        fileCount += emptyCount;
        squares.push(...Array(emptyCount).fill(null));
      } else if (PIECE_ASSETS[char]) {
        fileCount += 1;
        squares.push(char);
      } else {
        return parseFenBoard(DEFAULT_SETUP_FEN);
      }
    }
    if (fileCount !== 8) return parseFenBoard(DEFAULT_SETUP_FEN);
  }

  return squares.length === 64 ? squares : parseFenBoard(DEFAULT_SETUP_FEN);
};

const getSideToMove = (fen) => {
  const side = String(fen || '').trim().split(/\s+/)[1];
  return side === 'b' ? 'Black to move' : 'White to move';
};

const MiniBoard = ({ fen }) => {
  const squares = parseFenBoard(fen);

  return (
    <div className="w-20 h-20 grid grid-cols-8 grid-rows-8 overflow-hidden border border-[#53504c]">
      {squares.map((piece, index) => {
        const row = Math.floor(index / 8);
        const col = index % 8;
        const isLight = (row + col) % 2 === 0;
        return (
          <div
            key={index}
            className={`flex items-center justify-center ${isLight ? 'bg-[#eeeed2]' : 'bg-[#769656]'}`}
          >
            {piece && (
              <img
                src={`/assets/pieces/${PIECE_ASSETS[piece]}.png`}
                alt=""
                className="w-[92%] h-[92%] object-contain"
                draggable="false"
              />
            )}
          </div>
        );
      })}
    </div>
  );
};

const PlayerCatalogView = ({
  summary,
  players,
  playersTotal,
  playersPage,
  playersTotalPages,
  playerSearch,
  sortMode,
  isLoading,
  isPlayersLoading,
  notice,
  onPlayerSearchChange,
  onSearch,
  onSortChange,
  onPlayersPageChange,
  onSelectPlayer,
}) => {
  const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
  const [fenValue, setFenValue] = useState(DEFAULT_SETUP_FEN);
  const [gameResult, setGameResult] = useState(RESULT_OPTIONS[0]);
  const [minRating, setMinRating] = useState('');
  const [yearOperator, setYearOperator] = useState(COMPARISON_OPTIONS[0]);
  const [movesOperator, setMovesOperator] = useState(COMPARISON_OPTIONS[0]);

  const handleMinRatingChange = (value) => {
    setMinRating(value.replace(/\D/g, ''));
  };

  const normalizeMinRating = () => {
    if (!minRating) return;
    setMinRating(String(Math.max(1000, Number(minRating))));
  };

  return (
  <div className="min-h-screen bg-[#262421] text-[#d7d6d4] p-4 md:p-8 font-sans">
    <div className="max-w-[1800px] mx-auto">
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-10">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <img src="/assets/moves/chess_database.svg" alt="" className="w-11 h-11" />
            <span className="text-[#8b8987] text-xs font-black uppercase tracking-widest">Cloud archive</span>
          </div>
          <h1 className="text-3xl md:text-4xl font-black text-white leading-tight">Players</h1>
          {summary.total_games > 0 ? (
            <p className="text-[#8b8987] mt-2">
              {formatNumber(summary.total_games)} games in the cloud archive
            </p>
          ) : summary.r2_archive?.object_count > 0 ? (
            <p className="text-[#8b8987] mt-2">
              {formatNumber(summary.r2_archive.object_count)} PGN files in Cloudflare R2 - {formatBytes(summary.r2_archive.size_bytes)}
            </p>
          ) : (
            <p className="text-[#8b8987] mt-2">No indexed games found yet</p>
          )}
          {summary.r2_archive?.object_count > 0 && summary.indexed_games === 0 && (
            <p className="text-[#d6a64f] text-sm mt-1">
              The files are uploaded, but player counts need the SQL game index.
            </p>
          )}
        </div>
        <form onSubmit={onSearch} className="w-full md:w-96 flex items-center bg-[#21201d] border border-[#3d3a37]">
          <Search size={18} className="ml-3 text-[#8b8987] shrink-0" />
          <input
            value={playerSearch}
            onChange={(event) => onPlayerSearchChange(event.target.value)}
            placeholder="Search players"
            className="w-full bg-transparent outline-none px-3 py-3 text-white placeholder:text-[#8b8987]"
          />
        </form>
      </header>

      {notice && (
        <div className="mb-6 bg-[#21201d] border border-[#3d3a37] px-4 py-3 text-sm text-[#d7d6d4]">
          {notice}
        </div>
      )}

      <section className="mb-12">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white text-xl font-black">10 Best Players Of All Time</h2>
          {isLoading && <Loader2 size={18} className="animate-spin text-[#8b8987]" />}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-x-8 gap-y-10">
          {(summary.best_players || []).map((player) => (
            <PlayerCard
              key={player.name}
              player={player}
              compact
              onSelect={onSelectPlayer}
            />
          ))}
        </div>
      </section>

      <section id="all-players" className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-7">
        <div className="px-5 md:px-8 pb-8">
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-5 mb-8">
            <div className="max-w-4xl">
              <p className="text-[#d7d6d4] text-base md:text-lg font-semibold leading-relaxed">
                Search through millions of top games played by the strongest chess players of the past and present.
                From world chess champions to FIDE masters, you will find an enormous collection of games that you
                can search, sort, and download.
              </p>
              <p className="text-[#8b8987] text-sm mt-3">{formatNumber(playersTotal)} players - alphabetical catalogue</p>
            </div>
            <div className="flex bg-[#21201d] border border-[#3d3a37] p-1 shrink-0">
              <button
                onClick={() => onSortChange('name')}
                className={`px-4 py-2 text-sm font-bold ${sortMode === 'name' ? 'bg-[#81b64c] text-white' : 'text-[#bab9b8] hover:text-white'}`}
              >
                A-Z
              </button>
              <button
                onClick={() => onSortChange('games')}
                className={`px-4 py-2 text-sm font-bold ${sortMode === 'games' ? 'bg-[#81b64c] text-white' : 'text-[#bab9b8] hover:text-white'}`}
              >
                Most Games
              </button>
            </div>
          </div>

          <div className="relative">
            {isPlayersLoading && (
              <div className="absolute inset-0 bg-[#262421]/70 z-10 flex items-start justify-center pt-20">
                <Loader2 size={24} className="animate-spin text-[#81b64c]" />
              </div>
            )}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-10 gap-y-12">
              {players.map((player) => (
                <PlayerCard
                  key={player.name}
                  player={player}
                  large
                  onSelect={onSelectPlayer}
                />
              ))}
            </div>
          </div>

          {!isLoading && !players.length && (
            <div className="h-48 flex flex-col items-center justify-center text-[#8b8987]">
              <Database size={26} className="mb-2" />
              No players found
            </div>
          )}

          <div className="mt-10 flex justify-center items-center">
            <div className="flex items-center">
              <button
                onClick={() => onPlayersPageChange(playersPage - 1)}
                disabled={playersPage <= 1 || isPlayersLoading}
                className="p-3 bg-[#312e2b] disabled:opacity-40 hover:bg-[#3d3a37]"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="px-5 py-3 bg-[#21201d] text-white font-bold">
                {playersPage} / {playersTotalPages}
              </span>
              <button
                onClick={() => onPlayersPageChange(playersPage + 1)}
                disabled={playersPage >= playersTotalPages || isPlayersLoading}
                className="p-3 bg-[#312e2b] disabled:opacity-40 hover:bg-[#3d3a37]"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-7 xl:sticky xl:top-8 self-start">
          <section className="bg-[#1f1e1b] px-4 py-4">
            <h2 className="text-xl font-black text-white border-b border-[#3d3a37] pb-2 mb-3">Games</h2>
            <p className="text-sm font-semibold mb-3">Select an opening or player to search</p>
            <form onSubmit={onSearch} className="flex flex-col gap-2">
              <div className="space-y-2">
                <SearchBox value="" onChange={() => {}} placeholder="Opening" compact />
                <SearchBox
                  value={playerSearch}
                  onChange={onPlayerSearchChange}
                  placeholder="Player 1"
                  compact
                />
                <SearchBox value="" onChange={() => {}} placeholder="Player 2" compact />
                <label className="flex items-center gap-3 text-[#bab9b8]">
                  <input type="checkbox" className="w-4 h-4 accent-[#81b64c]" />
                  <span className="text-sm font-semibold">Fixed Colors</span>
                </label>
                {isAdvancedOpen && (
                  <div className="space-y-2">
                    <AdvancedSelect
                      value={getSideToMove(fenValue)}
                      onChange={() => {}}
                      options={[getSideToMove(fenValue)]}
                    />
                    <AdvancedSelect
                      value={gameResult}
                      onChange={setGameResult}
                      options={RESULT_OPTIONS}
                    />
                    <AdvancedInput
                      value={minRating}
                      onChange={(event) => handleMinRatingChange(event.target.value)}
                      onBlur={normalizeMinRating}
                      inputMode="numeric"
                      min="1000"
                      step="1"
                      placeholder="Min Rating"
                    />
                    <div className="grid grid-cols-[78px_1fr] gap-2">
                      <AdvancedSelect
                        value={yearOperator}
                        onChange={setYearOperator}
                        options={COMPARISON_OPTIONS}
                      />
                      <AdvancedInput placeholder="Year" />
                    </div>
                    <div className="grid grid-cols-[78px_1fr] gap-2">
                      <AdvancedSelect
                        value={movesOperator}
                        onChange={setMovesOperator}
                        options={COMPARISON_OPTIONS}
                      />
                      <AdvancedInput placeholder="Moves" />
                    </div>
                    <input
                      value={fenValue}
                      onChange={(event) => setFenValue(event.target.value)}
                      placeholder="FEN"
                      className="h-9 w-full bg-[#373430] border border-[#53504c] px-3 text-sm text-[#d7d6d4] placeholder:text-[#8b8987] outline-none"
                    />
                    <MiniBoard fen={fenValue} />
                  </div>
                )}
              </div>
              <div className="flex items-center justify-between pt-2">
                <button
                  type="submit"
                  disabled={isPlayersLoading}
                  className="bg-[#81b64c] hover:bg-[#8ac653] disabled:opacity-70 text-white px-9 py-2 text-sm font-black shadow-md"
                >
                  Search
                </button>
                <button
                  type="button"
                  onClick={() => setIsAdvancedOpen((current) => !current)}
                  className="flex items-center gap-2 text-[#bab9b8] hover:text-white text-sm font-bold"
                >
                  {isAdvancedOpen ? 'Hide' : 'Advanced'}
                  {isAdvancedOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                </button>
              </div>
            </form>
          </section>

          <section className="bg-[#1f1e1b] px-4 py-5">
            <h2 className="text-xl font-black text-white border-b border-[#3d3a37] pb-3 mb-2">
              Latest comments
            </h2>
            {latestComments.map((comment) => (
              <div key={comment} className="py-2.5 border-b border-[#3d3a37] last:border-b-0 text-sm font-semibold">
                {comment}
              </div>
            ))}
          </section>
        </aside>
      </section>
    </div>
  </div>
  );
};

export default PlayerCatalogView;
