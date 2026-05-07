import { Search, Star } from 'lucide-react';
import { moves as moveAssets } from '../../constants/review';
import { getPlayerImage } from '../../utils/databaseFormatters';

const REVIEW_ROWS = [
  { key: 'brilliant', label: 'Brilliant', textColor: 'text-[#35d7bd]' },
  { key: 'great', label: 'Great', textColor: 'text-[#80aede]' },
  { key: 'best', label: 'Best', textColor: 'text-[#81b64c]' },
  { key: 'mistake', label: 'Mistake', textColor: 'text-[#ffa459]' },
  { key: 'miss', label: 'Miss', textColor: 'text-[#ff746d]' },
  { key: 'blunder', label: 'Blunder', textColor: 'text-[#fa412d]' },
];

const buildCounts = (history = []) => {
  const counts = {
    white: Object.fromEntries(REVIEW_ROWS.map((row) => [row.key, 0])),
    black: Object.fromEntries(REVIEW_ROWS.map((row) => [row.key, 0])),
  };

  history.forEach((move, index) => {
    const side = index % 2 === 0 ? 'white' : 'black';
    const label = String(move.analysisLabel || '').toLowerCase();
    if (label in counts[side]) counts[side][label] += 1;
  });

  return counts;
};

const REVIEW_GRID = 'grid-cols-[1fr_78px_38px_78px]';

const PlayerAvatar = ({ name, isWinner = false }) => {
  const image = getPlayerImage(name);

  return (
    <div className={`w-15 h-15 rounded-md overflow-hidden bg-[#f2f2f2] border-4 flex items-center justify-center ${
      isWinner ? 'border-[#81b64c]' : 'border-transparent'
    }`}>
      {image ? (
        <img src={image} alt={name} className="w-full h-full object-cover object-top" />
      ) : (
        <img src="/assets/options/DarkKing.webp" alt="" className="w-[120%] opacity-35 object-contain translate-y-2" />
      )}
    </div>
  );
};

const MetricCell = ({ value, highlight = false }) => (
  <div className={`w-17 h-12 px-2 rounded-md flex items-center justify-center text-2xl font-black ${
    highlight ? 'bg-[#f2f2f2] text-[#333]' : 'bg-[#2b2926] text-white'
  }`}>
    {value}
  </div>
);

const MasterReviewIntro = ({
  game,
  history,
  isReviewing,
  reviewStarted,
  onStartReview,
}) => {
  const counts = buildCounts(history);
  const hasAnalysis = history.some((move) => move.analysisLabel);
  const whiteAccuracy = hasAnalysis ? '-' : '-';
  const blackAccuracy = hasAnalysis ? '-' : '-';
  const whiteWon = game.result === '1-0';
  const blackWon = game.result === '0-1';

  return (
    <div className="relative w-[480px] h-[744px] bg-[#262421] rounded-lg flex flex-col shadow-xl border border-[#3c3a37] overflow-hidden font-sans">
      <header className="h-16 shrink-0 bg-[#21201d] border-b border-[#3c3a37] flex items-center justify-center relative">
        <div className="flex items-center gap-3 text-white text-[22px] font-black">
          <span className="w-7 h-7 rounded-full bg-[#d7d6d4] text-[#262421] flex items-center justify-center">
            <Star size={19} fill="currentColor" />
          </span>
          Game Review
        </div>
        <Search size={27} className="absolute right-5 text-[#9a9896]" />
      </header>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 py-4 pb-6 min-h-0">
        <div className="h-24 bg-[#45423f] rounded-md overflow-hidden mb-4 relative">
          <div className="absolute inset-x-0 bottom-0 h-12 bg-white" />
          <div className="absolute inset-x-0 top-12 h-0.5 bg-[#bab9b8]" />
          <svg className="absolute inset-0 w-full h-full" viewBox="0 0 440 96" preserveAspectRatio="none">
            <polyline
              points="6,50 35,62 65,66 95,68 125,68 155,62 185,64 215,50 245,70 275,74 305,72 335,74 365,70 395,25 434,18"
              fill="none"
              stroke="#d7d6d4"
              strokeWidth="8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className={`grid ${REVIEW_GRID} items-end gap-x-4 gap-y-3 text-white font-black mb-5`}>
          <div />
          <div className="min-w-0 text-center text-base leading-tight truncate">{game.white}</div>
          <div />
          <div className="min-w-0 text-center text-base leading-tight truncate">{game.black}</div>
          <div className="text-lg">Players</div>
          <div className="flex justify-center"><PlayerAvatar name={game.white} isWinner={whiteWon} /></div>
          <div />
          <div className="flex justify-center"><PlayerAvatar name={game.black} isWinner={blackWon} /></div>
          <div className="text-lg">Accuracy</div>
          <div className="flex justify-center"><MetricCell value={whiteAccuracy} highlight /></div>
          <div />
          <div className="flex justify-center"><MetricCell value={blackAccuracy} /></div>
        </div>

        <div className="border-t border-[#3c3a37] pt-4 space-y-3">
          {REVIEW_ROWS.map((row) => (
            <div key={row.key} className={`grid ${REVIEW_GRID} items-center gap-x-4 text-base font-black`}>
              <div className="text-white">{row.label}</div>
              <div className={`text-center ${row.textColor} text-2xl`}>{counts.white[row.key]}</div>
              <img
                src={moveAssets[row.key]?.src}
                alt=""
                className="w-8 h-8 justify-self-center object-contain"
              />
              <div className={`text-center ${row.textColor} text-2xl`}>{counts.black[row.key]}</div>
            </div>
          ))}
        </div>

        <div className="border-t border-[#3c3a37] mt-7 pt-5 space-y-4">
          <div className={`grid ${REVIEW_GRID} items-center gap-x-4 text-base font-black`}>
            <div className="text-white">Game Rating</div>
            <div className="flex justify-center"><MetricCell value="-" highlight /></div>
            <div />
            <div className="flex justify-center"><MetricCell value="-" /></div>
          </div>
          <div className={`grid ${REVIEW_GRID} items-center gap-x-4 text-base font-black`}>
            <div className="text-white">Opening</div>
            <div className="text-center text-3xl text-[#ffa459]">?</div>
            <div />
            <div className="text-center text-3xl text-[#ffa459]">?</div>
          </div>
          <div className={`grid ${REVIEW_GRID} items-center gap-x-4 text-base font-black`}>
            <div className="text-white">Middlegame</div>
            <div className="text-center text-2xl text-[#8dbc6b]">OK</div>
            <div />
            <div className="text-center text-3xl text-[#ffa459]">?</div>
          </div>
          <div className={`grid ${REVIEW_GRID} items-center gap-x-4 text-base font-black`}>
            <div className="text-white">Endgame</div>
            <div className="text-center text-[#bab9b8]">-</div>
            <div />
            <div className="text-center text-[#bab9b8]">-</div>
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[#1b1a18] bg-[#262421] shrink-0">
        <button
          onClick={onStartReview}
          disabled={isReviewing}
          className="w-full h-16 rounded-lg bg-[#81b64c] hover:bg-[#8ac653] disabled:opacity-70 text-white text-3xl font-black shadow-[0_4px_0_0_#5b8e37] active:translate-y-1 active:shadow-none transition-all"
        >
          {isReviewing ? 'Reviewing...' : reviewStarted ? 'Review Again' : 'Start Review'}
        </button>
      </div>
    </div>
  );
};

export default MasterReviewIntro;
