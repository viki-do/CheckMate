import NavBtn from './NavBtn';
import { Download, Trash2 } from 'lucide-react';
import { AddToCollection, New, Review, Share } from '../icons/Icons';

const MoveListControls = ({
    history,
    viewIndex,
    isOngoing,
    showEndGameUI,
    isFlipped,
    lastTimeControl,
    goToMove,
    handleResign,
    startNewGame,
    onFlipBoard,
    setIsSelectingBot,
    offerDraw,
    resetGame,
    handleRunFullAnalysis,
    onGameReviewClick,
    onSelfAnalysisClick,
    onDownloadTable,
    onAddToCollection,
    onDeleteGame,
    isArchiveGame = false,
}) => (
    <div className="bg-chess-panel-header flex flex-col border-t border-[#1b1a18]">
        {showEndGameUI && (
            <div className="p-3 border-b border-chess-bg bg-chess-panel-header animate-in fade-in duration-300">
                <button
                    onClick={onGameReviewClick || handleRunFullAnalysis}
                    className="w-full py-4 bg-[#81b64c] hover:bg-[#a3d16a] text-white font-black rounded-lg flex items-center justify-center gap-2.5 transition-all shadow-lg text-xl"
                >
                    <Review size={26} /> Game Review
                </button>
                <div className="grid grid-cols-2 gap-2 pt-3">
                    <button
                        onClick={() => {
                            resetGame();
                            setIsSelectingBot(true);
                        }}
                        className="py-3 bg-chess-bg hover:bg-[#3d3a37] text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all text-[15px] active:scale-95"
                    >
                        <i className="fas fa-plus"></i> New Bot
                    </button>
                    <button
                        onClick={() => {
                            const myColor = isFlipped ? 'black' : 'white';
                            startNewGame(null, myColor, lastTimeControl);
                        }}
                        className="py-3 bg-chess-bg hover:bg-[#3d3a37] text-white font-bold rounded-lg flex items-center justify-center gap-2 transition-all text-[15px] active:scale-95"
                    >
                        <i className="fas fa-sync-alt"></i> Rematch
                    </button>
                </div>
            </div>
        )}

        <div className="p-3 flex gap-1 bg-chess-panel-header">
            <NavBtn icon="fa-step-backward" onClick={() => goToMove(0)} active={viewIndex !== 0} />
            <NavBtn icon="fa-chevron-left"
                onClick={() => {
                    const currentIdx = viewIndex === -1 ? history.length - 1 : parseInt(viewIndex);
                    if (currentIdx > 0) goToMove(currentIdx - 1);
                }}
                active={viewIndex !== 0}
            />
            <div className="flex-1 bg-chess-bg rounded flex justify-center items-center cursor-pointer hover:bg-[#3b3835]">
                <i className="fas fa-play text-white text-sm"></i>
            </div>
            <NavBtn icon="fa-chevron-right"
                onClick={() => {
                    if (viewIndex === -1) return;
                    const currentIdx = parseInt(viewIndex);
                    if (currentIdx < history.length - 1) goToMove(currentIdx + 1);
                    else goToMove(-1);
                }}
                active={viewIndex !== -1}
            />
            <NavBtn icon="fa-step-forward" onClick={() => goToMove(-1)} active={viewIndex !== -1} />
        </div>

        <div className="p-3 bg-chess-panel-header flex justify-between items-center text-[#989795] border-t border-[#1b1a18]">
            {isOngoing ? (
                <div className="flex gap-4 items-center">
                    <button
                        onClick={offerDraw}
                        className="flex items-center gap-2 hover:text-white transition-colors"
                    >
                        <i className="fas fa-half-circle text-sm"></i>
                        <span className="text-[13px] font-bold">Draw</span>
                    </button>
                    <button onClick={handleResign} className="flex items-center gap-2 hover:text-white transition-colors text-[#e74c3c]"><i className="fas fa-flag text-sm"></i><span className="text-[13px] font-bold">Resign</span></button>
                </div>
            ) : (
                <div className={`flex items-center w-full text-[#bab9b8] ${isArchiveGame ? 'justify-between' : 'justify-center gap-8'}`}>
                    <div className={`flex items-center ${isArchiveGame ? 'gap-5' : 'gap-8'}`}>
                    <button type="button" className="hover:text-white cursor-pointer transition-colors flex items-center" title="Share">
                        <Share size={20} />
                    </button>
                    <button
                        type="button"
                        onClick={onDownloadTable}
                        className="hover:text-white cursor-pointer transition-colors flex items-center"
                        title="Download Spreadsheet"
                    >
                        <Download size={20} strokeWidth={2.7} />
                    </button>
                    <button
                        type="button"
                        onClick={onAddToCollection}
                        className="hover:text-white cursor-pointer transition-colors flex items-center"
                        title="Add to Collection"
                    >
                        <AddToCollection size={21} />
                    </button>
                    {!isArchiveGame && (
                        <i onClick={onFlipBoard} className={`fas fa-sync-alt hover:text-white cursor-pointer transition-all text-lg ${isFlipped ? 'rotate-180 text-[#81b64c]' : ''}`} title="Flip Board"></i>
                    )}
                    {isArchiveGame && (
                        <>
                            <button
                                type="button"
                                onClick={onSelfAnalysisClick}
                                className="hover:text-white cursor-pointer transition-colors flex items-center"
                                title="Self Analysis"
                                aria-label="Self Analysis"
                            >
                                <New size={21} />
                            </button>
                            <button
                                type="button"
                                onClick={onDeleteGame}
                                className="hover:text-[#ff746d] cursor-pointer transition-colors flex items-center"
                                title="Delete Game"
                            >
                                <Trash2 size={20} strokeWidth={2.7} />
                            </button>
                        </>
                    )}
                    </div>
                    {isArchiveGame && (
                        <div className="flex gap-5 items-center">
                            <i onClick={onFlipBoard} className={`fas fa-sync-alt hover:text-white cursor-pointer transition-all text-lg ${isFlipped ? 'rotate-180 text-[#81b64c]' : ''}`} title="Flip Board"></i>
                        </div>
                    )}
                </div>
            )}
            {isOngoing && (
                <i onClick={onFlipBoard} className={`fas fa-sync-alt hover:text-white cursor-pointer transition-transform hover:rotate-180 ${isFlipped ? 'text-[#81b64c]' : ''}`}></i>
            )}
        </div>
    </div>
);

export default MoveListControls;
