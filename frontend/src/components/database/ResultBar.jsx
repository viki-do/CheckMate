import { formatNumber, percent } from '../../utils/databaseFormatters';

const ResultBar = ({ label, total, wins, draws, losses }) => {
  const safeTotal = Number(total) || 0;
  const safeWins = Number(wins) || 0;
  const safeDraws = Number(draws) || 0;
  const explicitLosses = losses === undefined || losses === null ? null : Number(losses) || 0;
  const remainderLosses = Math.max(0, safeTotal - safeWins - safeDraws);
  const safeLosses = explicitLosses === null
    ? remainderLosses
    : Math.max(explicitLosses, remainderLosses);
  const winPct = percent(safeWins, safeTotal);
  const drawPct = percent(safeDraws, safeTotal);
  const lossPct = percent(safeLosses, safeTotal);
  const segments = [
    { key: 'win', label: 'Win', value: winPct, color: 'bg-[#f0efed]', text: 'text-[#33312e]' },
    { key: 'draw', label: 'Draw', value: drawPct, color: 'bg-[#676560]', text: 'text-white' },
    { key: 'loss', label: 'Loss', value: lossPct, color: 'bg-[#3e3c39]', text: 'text-white' },
  ];

  return (
    <div>
      <div className="text-[#bab9b8] font-bold text-lg mb-1">
        {label} <span className="text-white">{formatNumber(safeTotal)}</span>
      </div>
      <div className="h-7 w-full bg-[#3c3a37] overflow-hidden flex text-sm font-bold">
        {segments.map((segment) => (
          <div
            key={segment.key}
            className={`${segment.color} ${segment.text} min-w-0 px-2 flex items-center ${segment.key === 'win' ? 'justify-start' : 'justify-end'}`}
            style={{ width: `${segment.value}%` }}
            title={`${segment.value}% ${segment.label}`}
          >
            {segment.value >= 13 ? `${segment.value}% ${segment.label}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ResultBar;
