export const mergeServerHistoryWithLocalTimes = (serverHistory, prevHistory) => {
    if (prevHistory.length === 0) return serverHistory;
    return serverHistory.map((serverMove, index) => {
        const localMove = prevHistory[index];
        if (localMove && localMove.m === serverMove.m) {
            return { ...serverMove, t: localMove.t };
        }
        return serverMove;
    });
};

export const createStartHistory = (initialTime) => ([
    { m: "start", wTime: initialTime, bTime: initialTime, num: 0 }
]);

export const createPlayerMoveEntry = ({
    moveAttempt,
    from,
    to,
    fen,
    elapsed,
    moveNumber,
    whiteTime,
    blackTime,
}) => ({
    m: moveAttempt.san,
    from,
    to,
    fen,
    t: parseFloat(elapsed.toFixed(1)),
    num: moveNumber,
    wTime: whiteTime,
    bTime: blackTime
});

export const createBotMoveEntry = ({
    botMove,
    fen,
    thinkTime,
    moveNumber,
    whiteTime,
    blackTime,
}) => ({
    m: botMove.san,
    from: botMove.from,
    to: botMove.to,
    fen,
    eval: botMove.evaluation,
    t: thinkTime,
    num: moveNumber,
    wTime: whiteTime,
    bTime: blackTime
});
