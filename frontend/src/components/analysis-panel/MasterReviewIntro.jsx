import { useState } from 'react';
import { ChevronDown, ChevronUp, Search, Star } from 'lucide-react';
import { moves as moveAssets } from '../../constants/review';
import { getPlayerImage } from '../../utils/databaseFormatters';

const SUMMARY_REVIEW_ROWS = [
  { key: 'brilliant', label: 'Brilliant', textColor: 'text-[#35d7bd]' },
  { key: 'great', label: 'Great', textColor: 'text-[#80aede]' },
  { key: 'best', label: 'Best', textColor: 'text-[#81b64c]' },
  { key: 'mistake', label: 'Mistake', textColor: 'text-[#ffa459]' },
  { key: 'miss', label: 'Miss', textColor: 'text-[#ff746d]' },
  { key: 'blunder', label: 'Blunder', textColor: 'text-[#fa412d]' },
];

const EXPANDED_REVIEW_ROWS = [
  { key: 'brilliant', label: 'Brilliant', textColor: 'text-[#35d7bd]' },
  { key: 'great', label: 'Great', textColor: 'text-[#80aede]' },
  { key: 'book', label: 'Book', textColor: 'text-[#d8ad86]' },
  { key: 'best', label: 'Best', textColor: 'text-[#81b64c]' },
  { key: 'excellent', label: 'Excellent', textColor: 'text-[#81b64c]' },
  { key: 'good', label: 'Good', textColor: 'text-[#8dbc6b]' },
  { key: 'inaccuracy', label: 'Inaccuracy', textColor: 'text-[#f0c15c]' },
  { key: 'mistake', label: 'Mistake', textColor: 'text-[#ffa459]' },
  { key: 'miss', label: 'Miss', textColor: 'text-[#ff746d]' },
  { key: 'blunder', label: 'Blunder', textColor: 'text-[#fa412d]' },
];

const ALL_REVIEW_ROWS = EXPANDED_REVIEW_ROWS;
const DEFAULT_AVATAR_SRC = '/assets/icons/noavatar.gif';

const buildCounts = (history = []) => {
  const counts = {
    white: Object.fromEntries(ALL_REVIEW_ROWS.map((row) => [row.key, 0])),
    black: Object.fromEntries(ALL_REVIEW_ROWS.map((row) => [row.key, 0])),
  };

  history.forEach((move, index) => {
    const side = index % 2 === 0 ? 'white' : 'black';
    const label = String(move.analysisLabel || '').toLowerCase();
    if (label in counts[side]) counts[side][label] += 1;
  });

  return counts;
};

const REVIEW_GRID = 'grid-cols-[150px_78px_38px_78px]';

const formatAccuracy = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : '-';
};

const calculateAccuracy = (history = [], side) => {
  const losses = history
    .filter((move, index) => (side === 'white' ? index % 2 === 0 : index % 2 === 1))
    .map((move) => Number(move.winChanceLoss))
    .filter((loss) => Number.isFinite(loss));

  if (!losses.length) return null;

  const moveAccuracies = losses.map((loss) => 100 * Math.pow(Math.max(0, 1 - loss), 32));
  const average = moveAccuracies.reduce((sum, value) => sum + value, 0) / moveAccuracies.length;
  return Math.max(average, 5);
};

const PlayerAvatar = ({ name, imageSrc, isWinner = false }) => {
  const image = imageSrc || getPlayerImage(name);

  return (
    <div className={`w-15 h-15 rounded-md overflow-hidden bg-[#f2f2f2] flex items-center justify-center ${
      isWinner ? 'border-4 border-[#81b64c]' : ''
    }`}>
      {image ? (
        <img src={image} alt={name} className="w-full h-full object-cover object-top" />
      ) : (
        <img src={DEFAULT_AVATAR_SRC} alt="" className="w-full h-full object-cover opacity-70" />
      )}
    </div>
  );
};

const MetricCell = ({ value, highlight = false }) => (
  <div className={`w-14 h-9 px-2 rounded-md flex items-center justify-center text-lg font-semibold ${
    highlight ? 'bg-[#f2f2f2] text-[#333]' : 'bg-[#2b2926] text-white'
  }`}>
    {value}
  </div>
);

const LoadingDots = () => (
  <span className="inline-flex w-8 justify-center gap-0.5" aria-label="Loading">
    <span className="animate-bounce [animation-delay:-0.2s]">.</span>
    <span className="animate-bounce [animation-delay:-0.1s]">.</span>
    <span className="animate-bounce">.</span>
  </span>
);

const PhaseIcon = ({ type }) => (
  <img
    src={moveAssets[type]?.src}
    alt=""
    className="w-6 h-6 justify-self-center object-contain"
  />
);

const MasterReviewIntro = ({
  game,
  history,
  isReviewing,
  reviewStarted,
  onStartReview,
  allowStartDuringReview = false,
  showPhaseSummary = true,
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const counts = buildCounts(history);
  const reviewRows = isExpanded ? EXPANDED_REVIEW_ROWS : SUMMARY_REVIEW_ROWS;
  const hasStoredWhiteAccuracy = game.white_accuracy !== null && game.white_accuracy !== undefined;
  const hasStoredBlackAccuracy = game.black_accuracy !== null && game.black_accuracy !== undefined;
  const calculatedWhiteAccuracy = calculateAccuracy(history, 'white');
  const calculatedBlackAccuracy = calculateAccuracy(history, 'black');
  const hasStoredReviewSummary = hasStoredWhiteAccuracy && hasStoredBlackAccuracy && history.some((move) => move?.analysisLabel);
  const isPreparingReview = isReviewing && !reviewStarted && !hasStoredReviewSummary;
  const showWhiteAccuracyLoading = isPreparingReview && !hasStoredWhiteAccuracy;
  const showBlackAccuracyLoading = isPreparingReview && !hasStoredBlackAccuracy;
  const whiteAccuracy = hasStoredWhiteAccuracy
    ? formatAccuracy(game.white_accuracy)
    : (showWhiteAccuracyLoading ? <LoadingDots /> : (calculatedWhiteAccuracy !== null ? formatAccuracy(calculatedWhiteAccuracy) : ''));
  const blackAccuracy = hasStoredBlackAccuracy
    ? formatAccuracy(game.black_accuracy)
    : (showBlackAccuracyLoading ? <LoadingDots /> : (calculatedBlackAccuracy !== null ? formatAccuracy(calculatedBlackAccuracy) : ''));
  const whiteWon = game.result === '1-0';
  const blackWon = game.result === '0-1';
  const whiteRating = game.white_elo || '-';
  const blackRating = game.black_elo || '-';

  return (
    <div className="app-panel-size relative bg-[#262421] rounded-lg flex flex-col shadow-xl border border-[#3c3a37] overflow-hidden font-sans">
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
        {!isExpanded && (
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
        )}

        <div className={`grid ${REVIEW_GRID} items-end gap-x-4 gap-y-3 text-white font-semibold mb-5`}>
          <div />
          <div className="min-w-0 text-center text-base font-bold leading-tight truncate">{game.white}</div>
          <div />
          <div className="min-w-0 text-center text-base font-bold leading-tight truncate">{game.black}</div>
          <div className="text-md">Players</div>
          <div className="flex justify-center"><PlayerAvatar name={game.white} imageSrc={game.white_avatar} isWinner={whiteWon} /></div>
          <div />
          <div className="flex justify-center"><PlayerAvatar name={game.black} imageSrc={game.black_avatar} isWinner={blackWon} /></div>
          <div className="text-md">Accuracy</div>
          <div className="flex justify-center"><MetricCell value={whiteAccuracy} highlight /></div>
          <div />
          <div className="flex justify-center"><MetricCell value={blackAccuracy} /></div>
        </div>

        <div className="border-t border-[#3c3a37] pt-4 space-y-3">
          {reviewRows.map((row) => (
            <div
              key={row.key}
              className={`grid ${REVIEW_GRID} items-center gap-x-4 text-base font-semibold`}
            >
              <div className="text-white">{row.label}</div>
              <div className={`text-center ${row.textColor} text-lg font-bold transition-all ${
                isPreparingReview ? 'opacity-75 blur-[1.2px] animate-pulse' : ''
              }`}>{counts.white[row.key]}</div>
              <img
                src={moveAssets[row.key]?.src}
                alt=""
                className={`w-6 h-6 justify-self-center object-contain transition-all ${
                  isPreparingReview ? 'opacity-75 blur-[1.2px] animate-pulse' : ''
                }`}
              />
              <div className={`text-center ${row.textColor} text-lg font-bold transition-all ${
                isPreparingReview ? 'opacity-75 blur-[1.2px] animate-pulse' : ''
              }`}>{counts.black[row.key]}</div>
            </div>
          ))}
          <div className={`grid ${REVIEW_GRID} items-center gap-x-4 pt-1`}>
            <div />
            <button
              type="button"
              onClick={() => setIsExpanded((value) => !value)}
              className="justify-self-center text-[#9a9896] hover:text-white transition-colors"
              aria-label={isExpanded ? 'Show fewer review rows' : 'Show all review rows'}
            >
              {isExpanded ? <ChevronUp size={32} strokeWidth={4} /> : <ChevronDown size={32} strokeWidth={4} />}
            </button>
            <div />
            <div />
          </div>
        </div>
        {!isExpanded && showPhaseSummary && <div className="border-t border-[#3c3a37] mt-7 pt-5 space-y-4">
          <div className={`grid ${REVIEW_GRID} items-center gap-x-4 text-base font-semibold`}>
            <div className="text-white">Game Rating</div>
            <div className="flex justify-center"><MetricCell value={whiteRating} highlight /></div>
            <div />
            <div className="flex justify-center"><MetricCell value={blackRating} /></div>
          </div>
          <div className={`grid ${REVIEW_GRID} items-center gap-x-4 text-base font-semibold`}>
            <div className="text-white">Opening</div>
            <PhaseIcon type="great" />
            <div />
            <PhaseIcon type="great" />
          </div>
          <div className={`grid ${REVIEW_GRID} items-center gap-x-4 text-base font-semibold`}>
            <div className="text-white">Middlegame</div>
            <PhaseIcon type="excellent" />
            <div />
            <PhaseIcon type="good" />
          </div>
          <div className={`grid ${REVIEW_GRID} items-center gap-x-4 text-base font-semibold`}>
            <div className="text-white">Endgame</div>
            <PhaseIcon type="good" />
            <div />
            <PhaseIcon type="excellent" />
          </div>
        </div>}
      </div>

      <div className="p-4 border-t border-[#1b1a18] bg-[#262421] shrink-0">
        <button
          onClick={onStartReview}
          disabled={isReviewing && !allowStartDuringReview}
          className="w-full h-16 rounded-lg bg-[#81b64c] hover:bg-[#8ac653] disabled:opacity-70 disabled:cursor-wait text-white text-2xl font-black shadow-[0_4px_0_0_#5b8e37] active:translate-y-1 active:shadow-none transition-all"
        >
          {reviewStarted ? 'Review Again' : 'Start Review'}
        </button>
      </div>
    </div>
  );
};

export default MasterReviewIntro;
