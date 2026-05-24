const AnalysisLoadingPanel = () => (
    <div className="h-full w-full bg-[#262421] flex flex-col items-center justify-center border border-chess-bg rounded-xl">
        <div className="w-12 h-12 border-4 border-[#81b64c] border-t-transparent rounded-full animate-spin mb-4"></div>
        <div className="text-white font-bold animate-pulse">Coach is analyzing...</div>
        <div className="text-[#8b8987] text-xs mt-2 uppercase">Depth 18</div>
    </div>
);

export default AnalysisLoadingPanel;
