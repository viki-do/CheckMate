const formatEvalValue = (value) => {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric.toFixed(1);
    return String(value || '0.0');
};

const AnalyzeEvalBar = ({ whiteBarHeight, currentEvalValue }) => (
    <div className="w-8 h-170 bg-[#262421] rounded-sm overflow-hidden flex flex-col-reverse relative border border-[#3c3a37] shrink-0 shadow-lg">
        <div className="bg-white w-full transition-all duration-700 ease-out" style={{ height: `${whiteBarHeight}%` }}>
            <span className="absolute bottom-2 left-0 w-full text-center text-[10px] font-bold text-black uppercase">
                {formatEvalValue(currentEvalValue)}
            </span>
        </div>
    </div>
);

export default AnalyzeEvalBar;
