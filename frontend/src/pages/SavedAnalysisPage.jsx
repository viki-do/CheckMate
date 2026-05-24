import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Trash2 } from "lucide-react";
import {
    deleteSavedAnalysis,
    loadSavedAnalyses,
    readLocalSavedAnalyses,
} from "../services/savedAnalysesService";

const compactMoveText = (game) => {
    const moves = String(game?.moves || game?.pgn || "").replace(/\s+/g, " ").trim();
    if (!moves) return "No moves saved yet";
    return moves.length > 96 ? `${moves.slice(0, 96)}...` : moves;
};

const getSavedAt = (game) => (
    Date.parse(game?.addedAt || game?.updatedAt || game?.createdAt || game?.date || "") || 0
);

const formatDate = (timestamp) => {
    if (!timestamp) return "Saved analysis";
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(timestamp));
};

const formatRelativeTime = (timestamp) => {
    if (!timestamp) return "";

    const diffMs = Date.now() - timestamp;
    const absMs = Math.max(0, diffMs);
    const minutes = Math.floor(absMs / 60000);
    const hours = Math.floor(absMs / 3600000);
    const days = Math.floor(absMs / 86400000);

    if (minutes < 1) return "just now";
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
    if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
    return `${days} day${days === 1 ? "" : "s"} ago`;
};

const buildSavedAnalyses = (savedAnalyses) => (
    savedAnalyses
        .map((game) => ({
            ...game,
            savedAt: getSavedAt(game),
        }))
        .sort((a, b) => b.savedAt - a.savedAt)
);

const SavedAnalysisRow = ({ item, onOpen, onDelete }) => (
    <div
        role="button"
        tabIndex={0}
        onClick={() => onOpen(item)}
        onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onOpen(item);
            }
        }}
        className="grid grid-cols-[minmax(0,1fr)_112px_28px] gap-4 px-5 py-4 border-b border-[#393733] hover:bg-[#262521] transition-colors cursor-pointer"
    >
        <div className="min-w-0">
            <div className="text-[#deddda] text-[15px] font-bold mb-1.5">{formatDate(item.savedAt)}</div>
            <div className="text-[#8f8d89] text-[15px] font-semibold truncate">{compactMoveText(item)}</div>
        </div>
        <div className="text-[#deddda] text-[14px] font-bold pt-0.5 text-right whitespace-nowrap">
            {formatRelativeTime(item.savedAt)}
        </div>
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                onDelete(item);
            }}
            className="mt-0.5 h-6 w-6 flex items-center justify-center rounded text-[#9c9a96] hover:text-[#e5e3df] hover:bg-[#34322f] transition-colors"
            aria-label="Delete saved analysis"
        >
            <Trash2 size={16} strokeWidth={2.7} />
        </button>
    </div>
);

const SavedAnalysisPage = () => {
    const navigate = useNavigate();
    const [savedItems, setSavedItems] = useState(readLocalSavedAnalyses);

    useEffect(() => {
        let isMounted = true;
        loadSavedAnalyses().then((items) => {
            if (isMounted) setSavedItems(items);
        });
        return () => { isMounted = false; };
    }, []);

    const savedAnalyses = useMemo(() => buildSavedAnalyses(savedItems), [savedItems]);

    const handleDelete = async (item) => {
        await deleteSavedAnalysis(item.id);
        setSavedItems((current) => current.filter((game) => String(game.id) !== String(item.id)));
    };

    const handleOpen = (item) => {
        navigate(`/analysis/saved/${encodeURIComponent(item.id)}/analysis`);
    };

    return (
        <div className="min-h-screen bg-[#302f2c] text-[#d7d6d4] px-8 py-6 font-sans">
            <div className="mx-auto max-w-[1380px]">
                <header className="flex items-center gap-4 mb-7">
                    <img
                        src="/assets/icons/magnifier-analysis.svg"
                        alt=""
                        className="w-12 h-12 object-contain"
                        draggable="false"
                    />
                    <h1 className="text-[34px] leading-none font-black tracking-normal text-white">
                        Saved Analysis
                    </h1>
                </header>

                <div className="grid grid-cols-[minmax(0,1fr)_360px] gap-7 items-start">
                    <section className="rounded-md bg-[#22211e] min-h-[620px] shadow-[0_2px_10px_rgba(0,0,0,0.18)] overflow-hidden">
                        {savedAnalyses.length > 0 ? (
                            savedAnalyses.map((item) => (
                                <SavedAnalysisRow
                                    key={item.id}
                                    item={item}
                                    onOpen={handleOpen}
                                    onDelete={handleDelete}
                                />
                            ))
                        ) : (
                            <div className="h-[360px] flex flex-col items-center justify-center text-center px-7">
                                <div className="text-[#deddda] text-[19px] font-bold mb-2">No saved analysis yet</div>
                                <div className="text-[#8f8d89] text-[14px] font-semibold max-w-md">
                                    Save an analysis from the analysis board and it will appear here.
                                </div>
                            </div>
                        )}
                    </section>

                    <aside className="rounded-md bg-[#22211e] p-4 shadow-[0_2px_10px_rgba(0,0,0,0.18)]">
                        <h2 className="text-white text-[21px] font-black mb-4">Saved Analysis</h2>
                        <div className="h-px bg-[#3a3935] mb-4" />
                        <button
                            type="button"
                            onClick={() => navigate("/analysis")}
                            className="w-full h-[48px] rounded-md bg-gradient-to-b from-[#86c857] to-[#5f9d3c] hover:from-[#91d161] hover:to-[#69aa43] text-white text-[17px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_3px_0_rgba(0,0,0,0.25)] transition-colors"
                        >
                            New Analysis
                        </button>
                    </aside>
                </div>
            </div>
        </div>
    );
};

export default SavedAnalysisPage;
