import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Chess } from "chess.js";
import { ArrowLeft, ChevronDown, ChevronUp, Compass, Download, MoreHorizontal, PencilLine, Plus, Search, Settings, Trash2 } from "lucide-react";
import { ArrowChevronEnd, BoardPlus, ChevronLeft, ChevronRight, DocumentFolderBoard, GameCollections, LayoutListCheck, LoadFromFEN, Magnifier, New, ResetArrow, Review, Save, Share } from "../components/icons/Icons";
import ChessBoardGrid from "../components/ChessBoardGrid";
import AnalyzeEvalBar from "../components/analyze-board/AnalyzeEvalBar";
import AnalyzePlayerInfo from "../components/analyze-board/AnalyzePlayerInfo";
import { DEFAULT_FEN } from "../components/analyze-board/analyzeBoardUtils";
import NewAnalysisModal from "../components/analyze-board/NewAnalysisModal";
import { ControlBtn, FooterAction } from "../components/component_helpers/AnalysisHelpers";
import { MoveNotation } from "../components/move-list/MoveNotation";
import {
    createCollection as createDbCollection,
    loadCollections,
    readLocalCollections,
    removeGameFromCollection,
} from "../services/collectionsService";

const STORAGE_KEY = "checkmate_game_collections";
const PUBLIC_ID_CHARS = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const files = ["a", "b", "c", "d", "e", "f", "g", "h"];
const noop = () => {};
const getSquareName = (row, col) => `${files[col]}${8 - row}`;

const createPublicId = (length = 9) => {
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    return Array.from(randomValues, (value) => PUBLIC_ID_CHARS[value % PUBLIC_ID_CHARS.length]).join("");
};

const slugifyCollectionName = (name) => (
    String(name || "collection")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "") || "collection"
);

const getCollectionSlug = (collection) => {
    const nameSlug = slugifyCollectionName(collection?.name);
    return `${nameSlug}-${collection.publicId}`;
};

const normalizeCollection = (collection) => ({
    ...collection,
    publicId: collection.publicId || createPublicId(),
});

const readCollections = () => {
    try {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map(normalizeCollection);
    } catch {
        return [];
    }
};

const parseMoveText = (moveText) => {
    const chess = new Chess();
    const cleanText = String(moveText || "")
        .replace(/\{[^}]*\}/g, " ")
        .replace(/\([^)]*\)/g, " ")
        .replace(/\$\d+/g, " ")
        .replace(/\d+\.(\.\.)?/g, " ")
        .replace(/\b(1-0|0-1|1\/2-1\/2|\*)\b/g, " ");

    const tokens = cleanText
        .split(/\s+/)
        .map((token) => token.trim().replace(/[!?]+$/g, ""))
        .filter(Boolean);

    for (const token of tokens) {
        chess.move(token);
    }

    return chess.history({ verbose: true });
};

const getMoveRows = (game) => {
    const pgn = `${game.moves || ""} ${game.result || "*"}`.trim();
    let moves = [];

    try {
        const chess = new Chess();
        chess.loadPgn(pgn);
        moves = chess.history({ verbose: true });
    } catch {
        try {
            moves = parseMoveText(game.moves);
        } catch {
            moves = [];
        }
    }

    const rows = [];
    for (let index = 0; index < moves.length; index += 2) {
        rows.push({
            moveNumber: Math.floor(index / 2) + 1,
            white: moves[index] ? { ...moves[index], m: moves[index].san } : null,
            black: moves[index + 1] ? { ...moves[index + 1], m: moves[index + 1].san } : null,
        });
    }
    return rows;
};

const getMoveNotationClassName = (move) => (
    `truncate flex items-center min-w-0 ${move?.m && !/^[NBRQK]/.test(move.m) ? "pl-1" : ""}`
);

const formatPlayer = (name, rating) => (
    [name || "Unknown", rating ? `(${rating})` : ""].filter(Boolean).join(" ")
);

const getOpeningLine = (game) => {
    const eco = String(game.eco || "").trim();
    const opening = String(game.opening || "").trim();
    if (eco && opening) return `${eco} (${opening})`;
    return opening || eco || "Unknown opening";
};

const getGameYear = (game) => {
    const date = String(game.date || "").trim();
    const match = date.match(/\d{4}/);
    return match ? match[0] : "";
};

const sortGamesByAddedAt = (games) => (
    [...games].sort((a, b) => {
        const bTime = Date.parse(b.addedAt || b.createdAt || "") || 0;
        const aTime = Date.parse(a.addedAt || a.createdAt || "") || 0;
        return bTime - aTime;
    })
);

const StaticBoard = () => {
    const staticGameLogic = {
        fen: DEFAULT_FEN,
        selectedSquare: null,
        lastMove: { from: null, to: null },
        validMoves: [],
        premoves: [],
        isDragging: false,
        hoverSquare: null,
        mousePos: { x: 0, y: 0 },
        isAlert: false,
        status: "viewing",
        viewIndex: -1,
        getSquareName,
        isFlipped: false,
        handleMouseUp: noop,
    };

    return (
        <div className="app-board-size relative shadow-2xl">
            <ChessBoardGrid
                gameLogic={staticGameLogic}
                onMouseDown={noop}
                onMouseUp={noop}
                onDrop={noop}
            />
        </div>
    );
};

const StaticBoardSection = () => (
    <div className="flex flex-col justify-center items-center gap-2">
        <AnalyzePlayerInfo color="black" pieces={[]} diff={0} />
        <StaticBoard />
        <AnalyzePlayerInfo color="white" pieces={[]} diff={0} />
    </div>
);

const CountBadge = ({ children }) => (
    <span className="ml-2 px-1.5 py-0.5 rounded bg-[#4a4946] text-[#bab9b8] text-[11px] font-semibold">{children}</span>
);

const CollectionCard = ({ collection, onSelect }) => (
    <button onClick={() => onSelect(collection.id)} className="w-full h-16 text-left px-4 border-b border-[#343330] bg-[#24231f] hover:bg-[#2a2926] transition-colors flex items-center gap-4">
        <img
            src="/assets/icons/advanced-tactics.png"
            alt=""
            className="w-7 h-7 rounded object-cover shrink-0"
            draggable="false"
        />
        <div className="min-w-0 flex-1 truncate text-[#d7d6d4] text-[15px] font-semibold">
            {collection.name}
        </div>
        <CountBadge>{collection.gameCount || 0}</CountBadge>
    </button>
);

const CollectionsFooter = ({ onNewClick }) => (
    <div className="border-t border-[#343330] px-3 py-3 shrink-0 bg-[#1f1e1b]">
        <div className="flex justify-between gap-1 mb-3 px-1 h-12">
            <ControlBtn icon={<ResetArrow size={20} />} onClick={noop} />
            <ControlBtn icon={<ChevronLeft size={20} />} onClick={noop} />
            <ControlBtn icon={<ChevronRight size={20} />} onClick={noop} />
            <ControlBtn icon={<ArrowChevronEnd size={20} />} onClick={noop} />
        </div>
        <div className="flex justify-center items-center text-[#8b8987] pb-1">
            <div className="flex gap-7 text-xs">
                <FooterAction icon={<New size={20} />} label="New" onClick={onNewClick} />
                <FooterAction icon={<Save size={20} />} label="Save" onClick={noop} />
                <FooterAction icon={<Review size={20} />} label="Review" onClick={noop} />
                <FooterAction icon={<Download size={20} />} label="CSV" onClick={noop} />
                <FooterAction icon={<MoreHorizontal size={20} />} label="" onClick={noop} />
            </div>
        </div>
    </div>
);

const PrivacyOption = ({ value, selected, onChange, children }) => (
    <label className="flex items-center gap-2 text-[#c7c6c3] text-[14px] font-semibold cursor-pointer">
        <input
            type="radio"
            name="privacy"
            value={value}
            checked={selected === value}
            onChange={() => onChange(value)}
            className="sr-only"
        />
        <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center ${selected === value ? "border-[#bab9b8]" : "border-[#8a8986]"}`}>
            {selected === value && <span className="w-2 h-2 rounded-full bg-[#bab9b8]" />}
        </span>
        <span>{children}</span>
        <span className="w-4 h-4 rounded-full bg-[#bab9b8] text-[#2c2b28] text-[11px] font-semibold flex items-center justify-center">i</span>
    </label>
);

const NewCollectionModal = ({ isOpen, onClose, onCreate }) => {
    const [name, setName] = useState("");
    const [privacy, setPrivacy] = useState("public");
    const [participants, setParticipants] = useState([]);
    const [isAddingParticipant, setIsAddingParticipant] = useState(false);
    const [participantName, setParticipantName] = useState("");

    useEffect(() => {
        if (!isOpen) return;
        setName("");
        setPrivacy("public");
        setParticipants([]);
        setIsAddingParticipant(false);
        setParticipantName("");
    }, [isOpen]);

    if (!isOpen) return null;

    const canCreate = name.trim().length > 0;
    const addParticipant = () => {
        const cleaned = participantName.trim();
        if (!cleaned) return;
        setParticipants((prev) => [...prev, cleaned]);
        setParticipantName("");
        setIsAddingParticipant(false);
    };

    const handleSubmit = (event) => {
        event.preventDefault();
        if (!canCreate) return;
        onCreate({
            id: crypto.randomUUID(),
            publicId: createPublicId(),
            name: name.trim(),
            ownerName: localStorage.getItem("chessUsername") || "VikhiKeh",
            privacy,
            participants,
            createdAt: new Date().toISOString(),
        });
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75">
            <form onSubmit={handleSubmit} className="w-[min(500px,calc(100vw-32px))] rounded-lg bg-[#272522] border border-[#3a3936] shadow-2xl overflow-hidden">
                <div className="h-15 px-5 flex items-center justify-between bg-[#1f1e1b]">
                    <h2 className="text-white text-[20px] font-semibold">New Collection</h2>
                    <button type="button" onClick={onClose} className="text-[#8f8e8b] hover:text-white">
                        <span className="text-[34px] leading-none" aria-hidden="true">&times;</span>
                    </button>
                </div>

                <div className="px-5 py-5">
                    <label className="block text-[#bab9b8] text-[15px] font-semibold mb-3">Collection Name</label>
                    <input
                        autoFocus
                        value={name}
                        onChange={(event) => setName(event.target.value)}
                        className="w-full h-11 rounded border border-[#55534f] bg-[#3a3936] px-3 text-[#eeeeec] text-[15px] font-bold outline-none focus:border-[#8bc34a]"
                    />

                    <div className="my-6 h-px bg-[#3a3936]" />

                    <div className="text-[#bab9b8] text-[15px] font-semibold mb-4">Privacy</div>
                    <div className="space-y-3">
                        <PrivacyOption value="public" selected={privacy} onChange={setPrivacy}>Public</PrivacyOption>
                        <PrivacyOption value="private" selected={privacy} onChange={setPrivacy}>Private</PrivacyOption>
                        <PrivacyOption value="community" selected={privacy} onChange={setPrivacy}>Community</PrivacyOption>
                    </div>

                    <div className="my-6 h-px bg-[#3a3936]" />

                    <div className="flex items-center gap-2 text-[#bab9b8] text-[15px] font-semibold mb-4">
                        Participants <CountBadge>{participants.length}</CountBadge>
                    </div>

                    {participants.length > 0 && (
                        <div className="mb-4 flex flex-wrap gap-2">
                            {participants.map((participant) => (
                                <span key={participant} className="rounded bg-[#343330] px-2 py-1 text-[12px] font-bold text-[#d7d6d4]">
                                    {participant}
                                </span>
                            ))}
                        </div>
                    )}

                    {isAddingParticipant ? (
                        <div className="flex gap-2">
                            <input
                                value={participantName}
                                onChange={(event) => setParticipantName(event.target.value)}
                                placeholder="Username or email"
                                className="h-10 flex-1 rounded border border-[#55534f] bg-[#3a3936] px-3 text-[#eeeeec] text-[14px] font-bold outline-none focus:border-[#8bc34a]"
                            />
                            <button type="button" onClick={addParticipant} className="h-10 px-4 rounded bg-[#3a3936] text-[#d7d6d4] text-[13px] font-semibold hover:bg-[#45433f]">
                                Add
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsAddingParticipant(true)}
                            className="mx-auto flex items-center gap-3 text-[#c7c6c3] hover:text-white text-[15px] font-semibold"
                        >
                            <Plus size={22} strokeWidth={3} /> Add Participant
                        </button>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-3 bg-[#24231f] px-5 py-5">
                    <button type="button" onClick={onClose} className="h-11 rounded bg-gradient-to-b from-[#3a3936] to-[#2f2e2b] text-[#eeeeec] text-[14px] font-semibold hover:from-[#45433f] hover:to-[#343330]">
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={!canCreate}
                        className={`h-11 rounded text-[14px] font-semibold ${canCreate ? "bg-gradient-to-b from-[#6da64b] to-[#4f823a] text-white hover:from-[#7fba58] hover:to-[#5e9443]" : "bg-[#4d6f39] text-[#9fb58d] cursor-not-allowed"}`}
                    >
                        Create
                    </button>
                </div>
            </form>
        </div>
    );
};

const DeleteGameModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
            <div className="relative w-[min(360px,calc(100vw-32px))] rounded-xl bg-[#24231f] border border-[#45433f] shadow-2xl px-5 sm:px-8 pt-8 pb-6">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-3.5 top-2.5 text-[#9f9e9b] hover:text-white text-[32px] leading-none font-semibold"
                    aria-label="Close delete game dialog"
                >
                    &times;
                </button>

                <h2 className="text-center text-white text-[24px] leading-7 font-bold mb-3">
                    Delete Game?
                </h2>
                <p className="text-center text-[#a7a5a2] text-[16px] leading-5 font-bold mb-6">
                    Do you want to remove this game<br />
                    from this collection?
                </p>

                <div className="grid grid-cols-2 gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-[50px] rounded-xl bg-gradient-to-b from-[#3f3d3a] to-[#302f2c] border border-[#4a4845] text-[#eeeeec] text-[19px] font-bold shadow-lg hover:from-[#4a4845] hover:to-[#383633]"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        className="h-[50px] rounded-xl bg-gradient-to-b from-[#ff463c] to-[#ed2424] border border-[#ff5a51] text-white text-[19px] font-bold shadow-lg hover:from-[#ff5b52] hover:to-[#ff302f]"
                    >
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

const CollectionGameRow = ({ game, isOpen, onToggle, onRemove, onReview }) => {
    const moveRows = useMemo(() => getMoveRows(game), [game]);
    const year = getGameYear(game);
    const summaryLine = [game.result, game.event || game.site].filter(Boolean).join(" ");

    return (
        <div className={`border-b border-[#343330] transition-colors ${isOpen ? "bg-[#302f2c]" : "bg-[#24231f] hover:bg-[#2a2926]"}`}>
            <button
                type="button"
                onClick={onToggle}
                className={`w-full px-4 grid grid-cols-[minmax(0,1fr)_70px_58px] gap-2 text-left items-center ${isOpen ? "min-h-24 py-3" : "h-16"}`}
            >
                <div className="min-w-0">
                    <div className="text-[#d7d6d4] text-[13px] font-bold truncate leading-4">{formatPlayer(game.white, game.white_elo)}</div>
                    <div className="mt-1 text-[#d7d6d4] text-[13px] font-bold truncate leading-4">{formatPlayer(game.black, game.black_elo)}</div>
                </div>
                <div className="text-right text-[#d7d6d4] text-[13px] font-bold leading-4 whitespace-nowrap">{game.result || "*"}</div>
                <div className="flex items-center justify-end gap-2 text-[#9f9e9b] text-[13px] font-bold">
                    <span>{year}</span>
                    <span
                        role="button"
                        tabIndex={0}
                        onClick={(event) => {
                            event.stopPropagation();
                            onToggle();
                        }}
                        onKeyDown={(event) => {
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.stopPropagation();
                            onToggle();
                        }}
                        className="h-8 w-8 -mr-2 flex items-center justify-center hover:text-white"
                        title={isOpen ? "Collapse game" : "Expand game"}
                    >
                        {isOpen ? <ChevronUp size={19} strokeWidth={3} /> : <ChevronDown size={19} strokeWidth={3} />}
                    </span>
                </div>
            </button>

            {isOpen && (
                <div className="px-4 pb-3">
                    <div className="text-[#d7d6d4] text-[14px] font-semibold leading-6">
                        {summaryLine && <div>{summaryLine}</div>}
                        {game.date && <div>{game.date}</div>}
                        <div>{getOpeningLine(game)}</div>
                    </div>

                    <div className="mt-3 max-h-[168px] overflow-y-auto collection-scrollbar pr-1 rounded-sm bg-[#2f2e2b]">
                        {moveRows.length ? (
                            moveRows.slice(0, 24).map((row) => (
                                <div
                                    key={row.moveNumber}
                                    className="grid grid-cols-[54px_1fr_1fr] h-8 px-3 items-center odd:bg-[#34332f] text-[#c9c8c5] text-[14px] font-bold"
                                >
                                    <div className="text-[#9f9e9b]">{row.moveNumber}.</div>
                                    <div className={getMoveNotationClassName(row.white)}>
                                        {row.white ? <MoveNotation move={row.white} isBlack={false} /> : ""}
                                    </div>
                                    <div className={getMoveNotationClassName(row.black)}>
                                        {row.black ? <MoveNotation move={row.black} isBlack /> : ""}
                                    </div>
                                </div>
                            ))
                        ) : (
                            <div className="h-20 flex items-center justify-center text-[#8f8e8b] text-[13px] font-semibold">
                                No move list available
                            </div>
                        )}
                    </div>

                    <div className="mt-3 h-10 flex items-center justify-between text-[#9f9e9b]">
                        <div className="flex items-center gap-4">
                            <button
                                type="button"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onRemove(game.id);
                                }}
                                title="Remove from collection"
                                className="hover:text-white"
                            >
                                <Trash2 size={23} strokeWidth={2.6} />
                            </button>
                            <button type="button" title="Edit note" className="hover:text-white">
                                <PencilLine size={23} strokeWidth={2.6} />
                            </button>
                        </div>
                        <div className="flex items-center gap-5">
                            <button
                                type="button"
                                title="New analysis"
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onReview(game.id);
                                }}
                                className="hover:text-white"
                            >
                                <New size={24} />
                            </button>
                            <button type="button" title="Download" className="hover:text-white">
                                <Download size={22} strokeWidth={3} />
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const CollectionDetailPanel = ({ collection, initialOpenGameId, onBack, onNewAnalysis, onAddGames, onRemoveGame, onOpenGame, onAnalysisTab, onReviewGame, onSettings }) => {
    const games = useMemo(() => sortGamesByAddedAt(Array.isArray(collection.games) ? collection.games : []), [collection.games]);
    const [openGameId, setOpenGameId] = useState(undefined);

    useEffect(() => {
        setOpenGameId(undefined);
    }, [collection.id]);

    useEffect(() => {
        if (!games.length) {
            setOpenGameId(null);
            return;
        }
        if (openGameId === undefined) {
            const initialGame = initialOpenGameId && games.find((game) => String(game.id) === String(initialOpenGameId));
            const nextOpenGameId = String(initialGame?.id || games[0].id);
            setOpenGameId(nextOpenGameId);
            onOpenGame(nextOpenGameId);
            return;
        }
        if (openGameId === null) return;

        const currentExists = games.some((game) => String(game.id) === String(openGameId));
        if (!currentExists) {
            setOpenGameId(games.length ? String(games[0].id) : null);
        }
    }, [collection.id, games, openGameId, initialOpenGameId]);

    return (
    <div className="app-panel-size bg-[#24231f] rounded-md shadow-2xl border border-[#252420] flex flex-col overflow-hidden shrink-0">
        <div className="h-15 relative flex items-center px-5 border-b border-[#3a3936] shrink-0">
            <button onClick={onBack} className="absolute left-4 text-[#a8a7a5] hover:text-white">
                <ArrowLeft size={27} strokeWidth={3} />
            </button>
            <div className="mx-auto flex items-center gap-3 min-w-0 max-w-[330px]">
                <img
                    src="/assets/icons/advanced-tactics.png"
                    alt=""
                    className="w-8 h-8 rounded object-cover shrink-0"
                    draggable="false"
                />
                <h1 className="truncate text-white text-[22px] font-semibold">{collection.name}</h1>
            </div>
            <button type="button" onClick={() => onSettings(openGameId || games[0]?.id)} className="absolute right-4 text-[#a8a7a5] hover:text-white">
                <Settings size={27} strokeWidth={3} />
            </button>
        </div>

        <div className="grid grid-cols-3 h-16 border-b border-[#343330] shrink-0">
            <button
                type="button"
                onClick={() => onAnalysisTab(openGameId || games[0]?.id)}
                className="flex flex-col items-center justify-center gap-1.5 bg-[#1f1e1b] text-[#bab9b8] hover:text-white"
            >
                <New size={20} />
                <span className="text-[12px] font-semibold">Analysis</span>
            </button>
            <button type="button" className="flex flex-col items-center justify-center gap-1.5 text-white">
                <DocumentFolderBoard size={22} />
                <span className="text-[12px] font-semibold">Games</span>
            </button>
            <button type="button" className="flex flex-col items-center justify-center gap-1.5 bg-[#1f1e1b] text-[#bab9b8]">
                <Compass size={20} strokeWidth={2.7} />
                <span className="text-[12px] font-semibold">Explore</span>
            </button>
        </div>

        <div className="h-15 px-4 flex items-center justify-between border-b border-[#343330] shrink-0">
            <div className="text-[#d7d6d4] text-[15px] font-semibold">
                By <span className="text-white">{collection.ownerName || localStorage.getItem("chessUsername") || "VikhiKeh"}</span>
            </div>
            <div className="flex items-center gap-4 text-[#a8a7a5]">
                <button className="hover:text-white"><Magnifier size={23} /></button>
                <button className="hover:text-white"><Share size={22} /></button>
                <button className="hover:text-white"><BoardPlus size={23} /></button>
                <button className="hover:text-white"><LayoutListCheck size={23} /></button>
            </div>
        </div>

        <div className="h-12 px-4 flex items-center justify-end border-b border-[#343330] shrink-0">
            <button type="button" className="flex items-center gap-2 text-[#bab9b8] hover:text-white text-[14px] font-bold">
                Recently Added <ChevronDown size={17} strokeWidth={3} />
            </button>
        </div>

        <div className="flex-1 overflow-y-auto collection-scrollbar">
            {games.length > 0 ? (
                games.map((game) => (
                    <CollectionGameRow
                        key={game.id}
                        game={game}
                        isOpen={String(openGameId) === String(game.id)}
                        onToggle={() => setOpenGameId((current) => {
                            const nextOpenGameId = String(current) === String(game.id) ? null : String(game.id);
                            if (nextOpenGameId) onOpenGame(nextOpenGameId);
                            return nextOpenGameId;
                        })}
                        onRemove={(gameId) => onRemoveGame(collection.id, gameId)}
                        onReview={onReviewGame}
                    />
                ))
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-8">
                    <div className="text-[#9f9e9b] mb-5">
                        <LoadFromFEN size={46} />
                    </div>
                    <div className="text-[#d7d6d4] text-[18px] font-semibold mb-2">No Games in Collection</div>
                    <div className="text-[#9f9e9b] text-[14px] font-semibold mb-8">Games added to collection will appear here.</div>
                    <button onClick={onAddGames} className="h-12 px-6 rounded-md bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white text-[16px] font-semibold shadow-md hover:from-[#9bd45c] hover:to-[#6cb64e]">
                        Add Games
                    </button>
                </div>
            )}
        </div>

        <CollectionsFooter onNewClick={onNewAnalysis} />
    </div>
    );
};

const GameCollectionsPanel = ({ collections, searchTerm, onSearchChange, onNewCollection, onFooterNew, onSelectCollection }) => {
    const filteredCollections = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return collections;
        return collections.filter((collection) => collection.name.toLowerCase().includes(term));
    }, [collections, searchTerm]);

    return (
    <div className="app-panel-size bg-[#1f1e1b] rounded-md shadow-2xl border border-[#252420] flex flex-col overflow-hidden shrink-0">
        <div className="h-15 relative flex items-center px-5 shrink-0">
            <button className="absolute left-5 text-[#a8a7a5] hover:text-white">
                <ArrowLeft size={27} strokeWidth={3} />
            </button>
            <div className="mx-auto flex items-center gap-3">
                <GameCollections size={26} className="text-[#a8a7a5]" />
                <h1 className="text-white text-[20px] font-semibold">Game Collections</h1>
            </div>
        </div>

        <div className="px-4 pb-3 flex items-center gap-3 shrink-0">
            <div className="relative flex-1">
                <Search size={23} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999896]" />
                <input
                    value={searchTerm}
                    onChange={(event) => onSearchChange(event.target.value)}
                    placeholder="Search Game Collections"
                    className="w-full h-11 bg-[#343330] border border-[#4a4845] rounded-md pl-10 pr-3 text-[#d7d6d4] placeholder:text-[#8b8987] text-[14px] font-semibold outline-none"
                />
            </div>
            <button className="flex items-center gap-1 text-[#8f8e8b] hover:text-white font-semibold text-[14px]">
                Sort <ChevronDown size={18} />
            </button>
            <button onClick={onNewCollection} className="h-11 px-4 rounded-md bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white text-[14px] font-semibold shadow-md hover:from-[#9bd45c] hover:to-[#6cb64e]">
                New
            </button>
        </div>

        <div className="grid grid-cols-3 border-b border-[#3a3936] shrink-0">
            {[
                ["Your collections", String(collections.length), true],
                ["Shared with you", "0", false],
                ["Community", "74k", false],
            ].map(([label, count, active]) => (
                <button
                    key={label}
                    className={`h-14 px-4 text-left text-[14px] font-semibold relative ${active ? "text-[#d7d6d4]" : "text-[#92918f]"}`}
                >
                    {label}<CountBadge>{count}</CountBadge>
                    {active && <span className="absolute left-0 right-0 bottom-0 h-1 bg-[#d7d6d4]"></span>}
                </button>
            ))}
        </div>

        <div className="flex-1 overflow-y-auto">
            {filteredCollections.length > 0 ? (
                filteredCollections.map((collection) => (
                    <CollectionCard key={collection.id} collection={collection} onSelect={onSelectCollection} />
                ))
            ) : (
                <div className="h-full flex flex-col items-center justify-center text-center px-8">
                    <div className="text-[#d7d6d4] mb-6">
                        <LoadFromFEN size={44} />
                    </div>
                    <div className="text-[#d7d6d4] text-[14px] font-semibold mb-6">
                        {collections.length > 0 ? "No Game Collections match your search" : "You haven't created any Game Collections yet"}
                    </div>
                    <button onClick={onNewCollection} className="h-11 px-5 rounded-md bg-gradient-to-b from-[#3a3936] to-[#2d2c29] text-[#d7d6d4] text-[14px] font-semibold shadow hover:from-[#45433f] hover:to-[#343330]">
                        Create Collection
                    </button>
                </div>
            )}
        </div>

        <CollectionsFooter onNewClick={onFooterNew} />
    </div>
    );
};

const GameCollectionsPage = () => {
    const navigate = useNavigate();
    const { collectionSlug, collectionGameId } = useParams();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [isNewAnalysisModalOpen, setIsNewAnalysisModalOpen] = useState(false);
    const [pendingDeleteGame, setPendingDeleteGame] = useState(null);
    const [searchTerm, setSearchTerm] = useState("");
    const [collections, setCollections] = useState(readLocalCollections);

    useEffect(() => {
        let isMounted = true;
        const refreshCollections = () => {
            loadCollections().then((loadedCollections) => {
                if (isMounted) setCollections(loadedCollections);
            });
        };
        refreshCollections();
        window.addEventListener("storage", refreshCollections);
        window.addEventListener("focus", refreshCollections);
        window.addEventListener("checkmate:collections-updated", refreshCollections);
        return () => {
            isMounted = false;
            window.removeEventListener("storage", refreshCollections);
            window.removeEventListener("focus", refreshCollections);
            window.removeEventListener("checkmate:collections-updated", refreshCollections);
        };
    }, []);

    const handleCreateCollection = async (collection) => {
        const createdCollection = await createDbCollection(collection);
        setCollections((prev) => [createdCollection, ...prev.filter((item) => item.id !== createdCollection.id)]);
        setSearchTerm("");
        navigate(`/analysis/collection/${getCollectionSlug(createdCollection)}/games`);
    };

    const selectedCollection = collectionSlug
        ? collections.find((collection) => getCollectionSlug(collection) === collectionSlug)
        : null;

    const handleSelectCollection = (collectionId) => {
        const collection = collections.find((item) => item.id === collectionId);
        if (!collection) return;
        navigate(`/analysis/collection/${getCollectionSlug(collection)}/games`);
    };

    const handleRemoveGameFromCollection = async (collectionId, gameId) => {
        const updatedCollection = await removeGameFromCollection(collectionId, gameId);
        if (!updatedCollection) return;
        setCollections((prev) => prev.map((collection) => (
            collection.id === updatedCollection.id ? updatedCollection : collection
        )));
    };

    const requestRemoveGameFromCollection = (collectionId, gameId) => {
        setPendingDeleteGame({ collectionId, gameId });
    };

    const confirmRemoveGameFromCollection = async () => {
        if (!pendingDeleteGame) return;
        await handleRemoveGameFromCollection(pendingDeleteGame.collectionId, pendingDeleteGame.gameId);
        setPendingDeleteGame(null);
    };

    return (
        <div className="analysis-shell flex min-h-dvh w-full flex-col items-center bg-[#302f2c] text-[#bab9b8] px-3 py-3 gap-4 overflow-y-auto overflow-x-hidden select-none font-sans md:h-dvh md:flex-row md:justify-center md:px-4 md:py-4 md:gap-4 md:overflow-hidden xl:gap-6 xl:px-6">
            <AnalyzeEvalBar whiteBarHeight={51} currentEvalValue={0.4} />
            <StaticBoardSection />
            {selectedCollection ? (
                <CollectionDetailPanel
                    collection={selectedCollection}
                    initialOpenGameId={collectionGameId ? decodeURIComponent(collectionGameId) : null}
                    onBack={() => navigate("/analysis/collections")}
                    onNewAnalysis={() => setIsNewAnalysisModalOpen(true)}
                    onAddGames={() => navigate(`/analysis?addGamesToCollection=${encodeURIComponent(getCollectionSlug(selectedCollection))}`)}
                    onRemoveGame={requestRemoveGameFromCollection}
                    onOpenGame={(gameId) => navigate(`/analysis/collection/${getCollectionSlug(selectedCollection)}/${encodeURIComponent(gameId)}/games`, { replace: true })}
                    onAnalysisTab={(gameId) => {
                        if (!gameId) return;
                        navigate(`/analysis/collection/${getCollectionSlug(selectedCollection)}/${encodeURIComponent(gameId)}/analysis`);
                    }}
                    onReviewGame={(gameId) => navigate(`/analysis/collection/${getCollectionSlug(selectedCollection)}/${encodeURIComponent(gameId)}/analysis`)}
                    onSettings={(gameId) => {
                        if (!gameId) return;
                        navigate(`/analysis/collection/${getCollectionSlug(selectedCollection)}/${encodeURIComponent(gameId)}/collection-settings`);
                    }}
                />
            ) : (
                <GameCollectionsPanel
                    collections={collections}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    onNewCollection={() => setIsModalOpen(true)}
                    onFooterNew={() => (
                        collections.length > 0 ? navigate("/analysis") : setIsModalOpen(true)
                    )}
                    onSelectCollection={handleSelectCollection}
                />
            )}
            <NewCollectionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreate={handleCreateCollection}
            />
            <NewAnalysisModal
                isOpen={isNewAnalysisModalOpen}
                onClose={() => setIsNewAnalysisModalOpen(false)}
                onConfirm={() => {
                    setIsNewAnalysisModalOpen(false);
                    navigate("/analysis");
                }}
            />
            <DeleteGameModal
                isOpen={Boolean(pendingDeleteGame)}
                onClose={() => setPendingDeleteGame(null)}
                onConfirm={confirmRemoveGameFromCollection}
            />
        </div>
    );
};

export default GameCollectionsPage;
