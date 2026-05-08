export const getMoveSoundName = (san) => {
    if (!san || san === "start") return null;
    if (san.includes('#')) return 'checkmate';
    if (san.includes('=')) return 'promote';
    if (san.includes('O-O')) return 'castle';
    if (san.includes('+')) return 'move-check';
    if (san.includes('x')) return 'capture';
    return 'move';
};

const normalizeHistoryIndex = (index, historyLength) => {
    if (index === -1) return historyLength - 1;
    const parsed = Number.parseInt(index, 10);
    if (!Number.isFinite(parsed)) return historyLength - 1;
    return Math.max(0, Math.min(historyLength - 1, parsed));
};

export const getHistoryNavigationSoundName = (history = [], currentIndex = -1, nextIndex = -1) => {
    if (!history.length) return null;

    const current = normalizeHistoryIndex(currentIndex, history.length);
    const next = normalizeHistoryIndex(nextIndex, history.length);
    if (current === next) return null;

    const soundMove = next > current ? history[next] : history[current];
    return getMoveSoundName(soundMove?.m);
};

export const getReplayPositionSoundName = (history = [], currentPosition = 0, nextPosition = 0) => {
    const current = Math.max(0, Math.min(history.length, Number(currentPosition) || 0));
    const next = Math.max(0, Math.min(history.length, Number(nextPosition) || 0));
    if (current === next) return null;

    const soundMove = next > current ? history[next - 1] : history[current - 1];
    return getMoveSoundName(soundMove?.m);
};

export const getMoveAttemptSoundName = (chess, moveAttempt) => {
    if (chess.isCheckmate()) return 'checkmate';
    if (chess.isStalemate() || chess.isDraw() || chess.isThreefoldRepetition()) return 'stalemate';
    if (moveAttempt.flags.includes('p') || moveAttempt.flags.includes('cp')) return 'promote';
    if (moveAttempt.flags.includes('k') || moveAttempt.flags.includes('q')) return 'castle';
    if (chess.isCheck()) return 'move-check';
    if (moveAttempt.captured || moveAttempt.flags.includes('e')) return 'capture';
    return 'move';
};

export const renderNotationText = (text) => {
    if (!text || text === "start") return "";
    const icons = { 'K': '♔', 'Q': '♕', 'R': '♖', 'B': '♗', 'N': '♘' };
    const firstChar = text[0];
    if (icons[firstChar]) {
        return (
            <span className="flex items-center">
                <span className="text-[1.3em] mr-0.5 leading-none">{icons[firstChar]}</span>
                {text}
            </span>
        );
    }
    return text;
};
