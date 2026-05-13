export const buildMoveRows = (history = []) => {
    const movesOnly = history.filter(m => m.m !== "start");
    const rows = [];

    for (let i = 0; i < movesOnly.length; i += 2) {
        rows.push({
            moveNumber: Math.floor(i / 2) + 1,
            white: movesOnly[i],
            black: movesOnly[i + 1] || null
        });
    }

    return rows;
};

export const getHistoryIndex = (history, moveObj) => (
    moveObj ? history.findIndex(h => h.num === moveObj.num) : -1
);

export const getFinalResult = ({ isOngoing, isGameOver, result, status, reason }) => {
    if (isOngoing || !isGameOver) return null;
    if (result) return result;

    if (status === "aborted" || (reason && reason.toLowerCase().includes("aborted"))) {
        return { score: "½-½", winnerText: "Game Aborted", reasonText: "Too few moves" };
    }

    if (reason) {
        const rLower = reason.toLowerCase();

        if (rLower.includes("white wins")) {
            let detail = "by Checkmate";
            if (rLower.includes("resignation")) detail = "by Resignation";
            if (rLower.includes("on time")) detail = "on Time";
            if (rLower.includes("stalemate")) detail = "by Stalemate";
            return { score: "1-0", winnerText: "White Won", reasonText: detail };
        }

        if (rLower.includes("black wins")) {
            let detail = "by Checkmate";
            if (rLower.includes("resignation")) detail = "by Resignation";
            if (rLower.includes("on time")) detail = "on Time";
            if (rLower.includes("stalemate")) detail = "by Stalemate";
            return { score: "0-1", winnerText: "Black Won", reasonText: detail };
        }

        if (rLower.includes("draw")) {
            const reasonDetail = reason.replace(/Draw\s+/i, "");
            return { score: "½-½", winnerText: "Draw", reasonText: reasonDetail || "by Rule" };
        }
    }

    return null;
};

export const buildAnalysisCsv = (rows) => {
    const escapeCsv = (value) => {
        if (value === undefined || value === null) return "";
        const text = String(value);
        return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };

    const formatEval = (value) => {
        if (value === undefined || value === null || value === "") return "";
        return typeof value === "number" && value > 0 ? `+${value}` : value;
    };

    const lineText = (move) => move?.engineLines?.[0]?.continuation || "";

    const headers = [
        "Move",
        "White Notation",
        "White Eval",
        "White Label",
        "White Best Move",
        "White Best Eval",
        "White Eval Loss",
        "White Win Chance Loss",
        "White Best Line",
        "White Time",
        "Black Notation",
        "Black Eval",
        "Black Label",
        "Black Best Move",
        "Black Best Eval",
        "Black Eval Loss",
        "Black Win Chance Loss",
        "Black Best Line",
        "Black Time"
    ];

    const csvRows = [headers.join(",")];

    rows.forEach(row => {
        const wM = row.white ? row.white.m : "";
        const wE = row.white ? formatEval(row.white.eval) : "";
        const wL = row.white?.analysisLabel ? row.white.analysisLabel.toUpperCase() : "GOOD";
        const wBest = row.white?.bestMove || "";
        const wBestEval = row.white ? formatEval(row.white.bestEval) : "";
        const wEvalLoss = row.white?.evalLoss ?? "";
        const wWinLoss = row.white?.winChanceLoss ?? "";
        const wLine = lineText(row.white);
        const wT = row.white && row.white.t !== undefined ? row.white.t : "0.0";

        const bM = row.black ? row.black.m : "";
        const bE = row.black ? formatEval(row.black.eval) : "";
        const bL = row.black?.analysisLabel ? row.black.analysisLabel.toUpperCase() : (row.black ? "GOOD" : "");
        const bBest = row.black?.bestMove || "";
        const bBestEval = row.black ? formatEval(row.black.bestEval) : "";
        const bEvalLoss = row.black?.evalLoss ?? "";
        const bWinLoss = row.black?.winChanceLoss ?? "";
        const bLine = lineText(row.black);
        const bT = row.black && row.black.t !== undefined ? row.black.t : "0.0";

        csvRows.push([
            row.moveNumber,
            wM,
            wE,
            wL,
            wBest,
            wBestEval,
            wEvalLoss,
            wWinLoss,
            wLine,
            `${wT}s`,
            bM,
            bE,
            bL,
            bBest,
            bBestEval,
            bEvalLoss,
            bWinLoss,
            bLine,
            row.black ? `${bT}s` : ""
        ].map(escapeCsv).join(","));
    });

    return csvRows.join("\n");
};
