import { formatBarScaleEval } from '../../utils/evaluationDisplay.js';

const getTerminalClassName = (winner) => {
    if (winner === 'white') return 'bg-white';
    if (winner === 'black') return 'bg-[#111]';
    return 'bg-[#8b8986]';
};

const AnalyzeEvalBar = ({ whiteBarHeight, currentEvalValue, terminalResult = null, terminalWinner = null, perspective = 'white' }) => {
    const isTerminal = Boolean(terminalResult);
    const labelIsDark = terminalWinner !== 'black';

    return (
    <div className={`app-board-height hidden w-5 ${isTerminal ? getTerminalClassName(terminalWinner) : 'bg-[#262421]'} rounded-sm overflow-hidden flex-col-reverse relative border border-[#3c3a37] shrink-0 shadow-lg md:flex lg:w-8`}>
        {!isTerminal && <div className="bg-white w-full transition-all duration-700 ease-out" style={{ height: `${whiteBarHeight}%` }} />}
            <span className="absolute bottom-2 left-0 w-full text-center text-[10px] font-bold uppercase">
                <span className={labelIsDark ? 'text-black' : 'text-white'}>
                    {formatBarScaleEval(currentEvalValue, terminalResult, perspective)}
                </span>
            </span>
    </div>
    );
};

export default AnalyzeEvalBar;
