import { AnimatePresence } from 'framer-motion';
import ChessBoardGrid from '../ChessBoardGrid';
import GameOverPopup from './GameOverPopup';
import PromotionOverlay from './PromotionOverlay';

const ChessBoardArea = ({
    gameLogic,
    boardGameLogic,
    isGameActiveUI,
    isFlipped,
    pendingPromotion,
    delayedShowPopup,
    status,
    reason,
    executeMove,
    handleMouseDown,
    handleMouseUp,
    handleClosePopup,
    onNewGame,
}) => (
    <div className="relative shrink-0 p-0 m-0">
        <div id="chess-board" className="app-board-size bg-[#2b2b2b] relative"
            style={{ pointerEvents: isGameActiveUI ? 'auto' : 'none' }}>
            <ChessBoardGrid
                gameLogic={boardGameLogic || gameLogic}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
            />

            <AnimatePresence>
                <PromotionOverlay
                    isGameActiveUI={isGameActiveUI}
                    pendingPromotion={pendingPromotion}
                    isFlipped={isFlipped}
                    executeMove={executeMove}
                />
            </AnimatePresence>

            <AnimatePresence>
                <GameOverPopup
                    isGameActiveUI={isGameActiveUI}
                    delayedShowPopup={delayedShowPopup}
                    status={status}
                    reason={reason}
                    onClose={handleClosePopup}
                    onNewGame={onNewGame}
                />
            </AnimatePresence>
        </div>
    </div>
);

export default ChessBoardArea;
