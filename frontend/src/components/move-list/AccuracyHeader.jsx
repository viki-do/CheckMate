const AccuracyHeader = ({ analysisData }) => {
    if (!analysisData) return null;
    const hasSideAccuracy = analysisData.white_accuracy !== undefined || analysisData.black_accuracy !== undefined;

    if (hasSideAccuracy) {
        return (
            <div className="p-3 bg-chess-panel-header border-b border-[#3c3a37] flex justify-around items-center">
                <div className="text-center">
                    <div className="text-[10px] text-[#8b8987] uppercase font-bold">White</div>
                    <div className="text-xl font-black text-white">{analysisData.white_accuracy ?? '-'}%</div>
                </div>
                <div className="text-center">
                    <div className="text-[10px] text-[#8b8987] uppercase font-bold">Black</div>
                    <div className="text-xl font-black text-white">{analysisData.black_accuracy ?? '-'}%</div>
                </div>
            </div>
        );
    }

    return (
        <div className="p-3 bg-chess-panel-header border-b border-[#3c3a37] flex justify-around items-center">
            <div className="text-center">
                <div className="text-[10px] text-[#8b8987] uppercase font-bold">Accuracy</div>
                <div className="text-xl font-black text-white">{analysisData.overall_accuracy}%</div>
            </div>
        </div>
    );
};

export default AccuracyHeader;
