import { useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Database,
  Download,
  Globe,
  Loader2,
  X,
} from 'lucide-react';
import DetailGameRow from './DetailGameRow';
import ResultBar from './ResultBar';
import SearchBox from './SearchBox';
import { latestComments } from '../../constants/databasePlayers';
import { getPlayerFacts, getPlayerImage } from '../../utils/databaseFormatters';

const ResultBarSkeleton = ({ label }) => (
  <div>
    <div className="text-[#bab9b8] font-bold text-lg mb-1">
      {label} <span className="inline-block h-5 w-14 bg-[#3c3a37] align-middle" />
    </div>
    <div className="h-7 w-full bg-[#3c3a37] overflow-hidden">
      <div className="h-full w-2/3 bg-[#4a4742]" />
    </div>
  </div>
);

const PlayerProfileView = ({
  selectedPlayer,
  playerProfile,
  games,
  gamesPage,
  gamesTotalPages,
  detailFilters,
  gamesSort,
  isGamesLoading,
  onBack,
  onDetailFiltersChange,
  onDetailSearch,
  onGamesSortChange,
  onGamesPageChange,
  onOpenGame,
}) => {
  const [isSortOpen, setIsSortOpen] = useState(false);
  const facts = getPlayerFacts(selectedPlayer.name);
  const profile = playerProfile;
  const isProfileLoading = !profile;
  const image = getPlayerImage(selectedPlayer.name);
  const sortOptions = [
    { value: 'rating_white', label: 'Rating (White)' },
    { value: 'rating_black', label: 'Rating (Black)' },
    { value: 'year_desc', label: 'Year (Most Recent)' },
    { value: 'year_asc', label: 'Year (Oldest)' },
    { value: 'moves_desc', label: 'Moves (Most)' },
    { value: 'moves_asc', label: 'Moves (Fewest)' },
  ];
  const sortLabel = sortOptions.find((option) => option.value === gamesSort)?.label || 'Year (Most Recent)';

  const handleSortSelect = (nextSort) => {
    setIsSortOpen(false);
    onGamesSortChange(nextSort);
  };

  return (
    <div className="min-h-screen bg-[#302e2b] text-[#d7d6d4] p-4 md:p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <header className="flex items-center justify-between mb-8">
          <button onClick={onBack} className="flex items-center gap-4 text-left group">
            <img src="/assets/moves/chess_database.svg" alt="" className="w-12 h-12" />
            <h1 className="text-3xl md:text-4xl font-black text-white group-hover:text-[#f0efed]">
              Chess Games Database
            </h1>
          </button>
          <button onClick={onBack} className="hidden md:flex items-center gap-2 text-[#bab9b8] hover:text-white font-bold">
            <ArrowLeft size={18} />
            Back to players
          </button>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_360px] gap-7">
          <main className="bg-[#262421] px-5 md:px-8 py-8">
            <div className="grid grid-cols-1 md:grid-cols-[370px_1fr] gap-8">
              <div>
                <div className="h-[310px] bg-[#e8e7e5] overflow-hidden flex items-center justify-center">
                  {image ? (
                    <img src={image} alt={selectedPlayer.name} className="w-full h-full object-cover object-top" />
                  ) : (
                    <img src="/assets/options/DarkKing.webp" alt="" className="h-[120%] opacity-35 object-contain translate-y-7" />
                  )}
                </div>
                {facts.photoCredit && (
                  <p className="text-sm text-[#bab9b8] mt-2">{facts.photoCredit}</p>
                )}
              </div>

              <div>
                <div className="flex items-center gap-3 mb-6">
                  <span className="bg-[#b92033] text-white px-2 py-1 text-xl font-black">{facts.title}</span>
                  <h2 className="text-3xl font-black text-white leading-tight">{selectedPlayer.name}</h2>
                </div>

                <dl className="space-y-2 text-lg">
                  <div className="flex gap-3">
                    <dt className="font-black text-white">Full name</dt>
                    <dd>{facts.fullName}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="font-black text-white">Born</dt>
                    <dd>{facts.born}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="font-black text-white">Place of birth</dt>
                    <dd>{facts.birthplace}</dd>
                  </div>
                  <div className="flex gap-3">
                    <dt className="font-black text-white">Federation</dt>
                    <dd>{facts.federation}</dd>
                  </div>
                </dl>

                <div className="mt-9">
                  <h3 className="text-2xl font-black text-white mb-3">Profiles</h3>
                  <div className="flex items-center gap-4 text-[#81b64c]">
                    <Database size={28} />
                    <X size={28} className="text-white" />
                    <span className="text-[#3182ce] text-2xl font-black leading-none">f</span>
                    <span className="text-[#f04468] text-2xl font-black leading-none">ig</span>
                    <span className="text-[#8b5cf6] text-2xl font-black leading-none">tw</span>
                    <Globe size={28} className="text-[#22a9e0]" />
                  </div>
                </div>
              </div>
            </div>

            {isProfileLoading ? (
              <div className="mt-10 space-y-4">
                <ResultBarSkeleton label="Total Games" />
                <ResultBarSkeleton label="As White" />
                <ResultBarSkeleton label="As Black" />
              </div>
            ) : (
              <div className="mt-10 space-y-4">
                <ResultBar
                  label="Total Games"
                  total={profile.games}
                  wins={profile.wins}
                  draws={profile.draws}
                  losses={profile.losses}
                />
                <ResultBar
                  label="As White"
                  total={profile.as_white}
                  wins={profile.white_wins}
                  draws={profile.white_draws}
                  losses={profile.white_losses}
                />
                <ResultBar
                  label="As Black"
                  total={profile.as_black}
                  wins={profile.black_wins}
                  draws={profile.black_draws}
                  losses={profile.black_losses}
                />
              </div>
            )}

            <div className="mt-10 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <h2 className="text-3xl font-black text-white">{selectedPlayer.name} Chess Games</h2>
              <div className="flex items-center gap-5 text-[#d7d6d4]">
                <div
                  className="relative"
                  onMouseLeave={() => setIsSortOpen(false)}
                >
                  <button
                    onClick={() => setIsSortOpen((current) => !current)}
                    className="flex items-center gap-2 hover:text-white font-bold"
                  >
                    {sortLabel}
                    {isSortOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
                  </button>
                  {isSortOpen && (
                    <div className="absolute right-0 top-full mt-1 w-60 bg-[#262421] border border-[#3d3a37] rounded-md shadow-2xl overflow-hidden z-20">
                      {sortOptions.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => handleSortSelect(option.value)}
                          className={`w-full px-7 py-2 text-left text-lg font-bold hover:bg-[#34312d] ${
                            gamesSort === option.value ? 'bg-[#302d29] text-white' : 'text-[#bab9b8]'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <Download size={22} className="text-[#8b8987]" />
              </div>
            </div>

            <div className="mt-7 bg-[#1d1b18]">
              <div className="grid grid-cols-[1fr_80px_80px_80px_34px] gap-3 px-3 py-3 text-[#bab9b8] text-sm font-black">
                <div>Players</div>
                <div>Result</div>
                <div>Moves</div>
                <div>Year</div>
                <div className="justify-self-end w-4 h-4 border border-[#8b8987]" />
              </div>
              {isGamesLoading ? (
                <div className="h-48 flex items-center justify-center">
                  <Loader2 size={24} className="animate-spin text-[#81b64c]" />
                </div>
              ) : games.length ? (
                games.map((game) => (
                  <DetailGameRow
                    key={game.id}
                    game={game}
                    onOpenGame={onOpenGame}
                  />
                ))
              ) : (
                <div className="h-48 flex items-center justify-center text-[#8b8987]">No games found</div>
              )}
            </div>

            <div className="mt-6 flex justify-center">
              <div className="flex items-center">
                <button
                  onClick={() => onGamesPageChange(gamesPage - 1)}
                  disabled={gamesPage <= 1 || isGamesLoading}
                  className="p-3 bg-[#312e2b] disabled:opacity-40 hover:bg-[#3d3a37]"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="px-5 py-3 bg-[#21201d] text-white font-bold">
                  {gamesPage} / {gamesTotalPages}
                </span>
                <button
                  onClick={() => onGamesPageChange(gamesPage + 1)}
                  disabled={gamesPage >= gamesTotalPages || isGamesLoading}
                  className="p-3 bg-[#312e2b] disabled:opacity-40 hover:bg-[#3d3a37]"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            </div>
          </main>

          <aside className="space-y-7">
            <section className="bg-[#262421] px-5 py-6">
              <div className="flex items-center justify-between border-b border-[#3d3a37] pb-4 mb-5">
                <h2 className="text-2xl font-black text-white">Games</h2>
                <ChevronRight size={32} className="text-[#a6a4a1]" />
              </div>
              <p className="text-lg mb-5">Select an opening or player to search</p>
              <div className="space-y-4">
                <SearchBox
                  value={detailFilters.opening}
                  onChange={(opening) => onDetailFiltersChange((current) => ({ ...current, opening }))}
                  placeholder="Opening"
                />
                <SearchBox value={selectedPlayer.name} onChange={() => {}} readOnly placeholder="Player 1" />
                <SearchBox
                  value={detailFilters.player2}
                  onChange={(player2) => onDetailFiltersChange((current) => ({ ...current, player2 }))}
                  placeholder="Player 2"
                />
                <label className="flex items-center gap-3 text-[#bab9b8]">
                  <input
                    type="checkbox"
                    checked={detailFilters.fixedColors}
                    onChange={(event) => onDetailFiltersChange((current) => ({ ...current, fixedColors: event.target.checked }))}
                    className="w-4 h-4 accent-[#81b64c]"
                  />
                  Fixed Colors
                </label>
                <div className="flex items-center justify-between pt-2">
                  <button
                    onClick={onDetailSearch}
                    disabled={isGamesLoading}
                    className="bg-[#81b64c] hover:bg-[#8ac653] disabled:opacity-70 text-white px-12 py-3 font-black shadow-md"
                  >
                    Search
                  </button>
                  <button className="flex items-center gap-2 text-[#bab9b8] hover:text-white font-bold">
                    Advanced
                    <ChevronDown size={18} />
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-[#262421] px-5 py-6">
              <h2 className="text-2xl font-black text-white border-b border-[#3d3a37] pb-4 mb-3">
                Latest comments
              </h2>
              {latestComments.map((comment) => (
                <div key={comment} className="py-3 border-b border-[#3d3a37] last:border-b-0">
                  {comment}
                </div>
              ))}
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
};

export default PlayerProfileView;
