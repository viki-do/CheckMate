import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

const formatEval = (value) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return value;
    return numericValue > 0 ? `+${numericValue.toFixed(2)}` : numericValue.toFixed(2);
};

const EngineLineSimple = ({ eval: ev, tokens = [], pvUci = [], onMoveEnter, onMoveLeave, onMouseMove }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const hasOverflow = tokens.length > 9;

    if (tokens.length === 0) return null;

    return (
        <div
            className="flex flex-col border-b border-[#34322f] last:border-0"
            onMouseMove={onMouseMove}
            onMouseLeave={onMoveLeave}
        >
            <div className={`flex items-start gap-2 px-3 ${isExpanded ? 'py-1.5' : 'h-[29px] items-center'}`}>
                <div className="w-[52px] h-[19px] flex items-center justify-center rounded-[3px] bg-white text-black text-[12px] font-black shrink-0 shadow-sm">
                    {formatEval(ev)}
                </div>
                <div className={`text-[13px] text-[#c7c6c3] flex-1 font-normal leading-[1.45] tracking-tight min-w-0 ${isExpanded ? 'whitespace-normal' : 'truncate whitespace-nowrap'}`}>
                    {tokens.map((token, tokenIndex) => {
                        const key = `${token.text}-${tokenIndex}`;

                        if (token.isMoveNumber || token.moveIndex === null || !pvUci[token.moveIndex]) {
                            return (
                                <span key={key} className="mr-1 text-[#bdbbb8]">
                                    {token.text}
                                </span>
                            );
                        }

                        return (
                            <button
                                key={key}
                                type="button"
                                onMouseEnter={(e) => onMoveEnter?.(e, token.moveIndex)}
                                onFocus={(e) => onMoveEnter?.(e, token.moveIndex)}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    onMoveEnter?.(e, token.moveIndex);
                                }}
                                className="mr-1 bg-transparent border-0 p-0 text-[#d0cfcc] hover:text-white hover:underline underline-offset-2 cursor-pointer font-normal"
                            >
                                {token.text}
                            </button>
                        );
                    })}
                </div>
                {hasOverflow && (
                    <button
                        type="button"
                        onClick={(e) => {
                            e.stopPropagation();
                            setIsExpanded(!isExpanded);
                        }}
                        className="mt-[1px] p-0 text-[#8b8987] hover:text-white transition-colors shrink-0"
                        aria-label={isExpanded ? 'Collapse engine line' : 'Expand engine line'}
                    >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                )}
            </div>
        </div>
    );
};

export default EngineLineSimple;
