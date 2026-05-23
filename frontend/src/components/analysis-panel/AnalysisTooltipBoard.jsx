import ChessBoardGrid from '../ChessBoardGrid';

const AnalysisTooltipBoard = ({ tooltip }) => {
    if (!tooltip.visible || !tooltip.fen) return null;

    return (
        <div
            className="fixed z-[9999] pointer-events-none bg-white p-1 rounded-sm shadow-2xl border-4 border-white animate-in fade-in zoom-in duration-100"
            style={{
                left: tooltip.x - 24,
                top: tooltip.y + 18
            }}
        >
            <div className="absolute -top-2 left-8 w-3 h-3 rotate-45 bg-white" />
            <div className="relative w-40 h-40 overflow-hidden">
                <ChessBoardGrid
                    gameLogic={{
                        fen: tooltip.fen,
                        status: "viewing",
                        history: [],
                        lastMove: tooltip.lastMove || { from: null, to: null },
                        compact: true
                    }}
                />
            </div>
        </div>
    );
};

export default AnalysisTooltipBoard;
