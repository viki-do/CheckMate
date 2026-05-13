import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, Compass, Download, MoreHorizontal, Plus, Search, Settings } from "lucide-react";
import { ArrowChevronEnd, BoardPlus, ChevronLeft, ChevronRight, DocumentFolderBoard, GameCollections, LayoutListCheck, LoadFromFEN, Magnifier, New, ResetArrow, Review, Save, Share } from "../components/icons/Icons";
import ChessBoardGrid from "../components/ChessBoardGrid";
import AnalyzeEvalBar from "../components/analyze-board/AnalyzeEvalBar";
import AnalyzePlayerInfo from "../components/analyze-board/AnalyzePlayerInfo";
import { DEFAULT_FEN } from "../components/analyze-board/analyzeBoardUtils";
import { ControlBtn, FooterAction } from "../components/component_helpers/AnalysisHelpers";

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
        <div className="w-170 h-170 relative shadow-2xl">
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

const CollectionsFooter = ({ onNewCollection }) => (
    <div className="border-t border-[#343330] px-3 py-3 shrink-0 bg-[#1f1e1b]">
        <div className="flex justify-between gap-1 mb-3 px-1 h-12">
            <ControlBtn icon={<ResetArrow size={20} />} onClick={noop} />
            <ControlBtn icon={<ChevronLeft size={20} />} onClick={noop} />
            <ControlBtn icon={<ChevronRight size={20} />} onClick={noop} />
            <ControlBtn icon={<ArrowChevronEnd size={20} />} onClick={noop} />
        </div>
        <div className="flex justify-center items-center text-[#8b8987] pb-1">
            <div className="flex gap-7 text-xs">
                <FooterAction icon={<New size={20} />} label="New" onClick={onNewCollection} />
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
            <form onSubmit={handleSubmit} className="w-[500px] rounded-lg bg-[#272522] border border-[#3a3936] shadow-2xl overflow-hidden">
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

const CollectionDetailPanel = ({ collection, onBack, onNewCollection, onAddGames }) => (
    <div className="w-[480px] h-[744px] bg-[#24231f] rounded-md shadow-2xl border border-[#252420] flex flex-col overflow-hidden shrink-0">
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
            <button className="absolute right-4 text-[#a8a7a5] hover:text-white">
                <Settings size={27} strokeWidth={3} />
            </button>
        </div>

        <div className="grid grid-cols-3 h-16 border-b border-[#343330] shrink-0">
            <button className="flex flex-col items-center justify-center gap-1.5 bg-[#1f1e1b] text-[#bab9b8]">
                <Search size={20} strokeWidth={3} />
                <span className="text-[12px] font-semibold">Analysis</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-1.5 text-white">
                <DocumentFolderBoard size={22} />
                <span className="text-[12px] font-semibold">Games</span>
            </button>
            <button className="flex flex-col items-center justify-center gap-1.5 bg-[#1f1e1b] text-[#bab9b8]">
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

        <div className="flex-1 overflow-y-auto">
            {Array.isArray(collection.games) && collection.games.length > 0 ? (
                collection.games.map((game) => (
                    <div key={game.id} className="px-4 py-3 border-b border-[#343330] hover:bg-[#2a2926] transition-colors">
                        <div className="text-[#e2e1df] text-[14px] font-semibold truncate">
                            {game.white} vs {game.black}
                        </div>
                        <div className="mt-1 text-[#9f9e9b] text-[12px] font-semibold truncate">
                            {[game.result, game.date, game.eco || game.opening].filter(Boolean).join(" - ")}
                        </div>
                    </div>
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

        <CollectionsFooter onNewCollection={onNewCollection} />
    </div>
);

const GameCollectionsPanel = ({ collections, searchTerm, onSearchChange, onNewCollection, onSelectCollection }) => {
    const filteredCollections = useMemo(() => {
        const term = searchTerm.trim().toLowerCase();
        if (!term) return collections;
        return collections.filter((collection) => collection.name.toLowerCase().includes(term));
    }, [collections, searchTerm]);

    return (
    <div className="w-[480px] h-[744px] bg-[#1f1e1b] rounded-md shadow-2xl border border-[#252420] flex flex-col overflow-hidden shrink-0">
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

        <CollectionsFooter onNewCollection={onNewCollection} />
    </div>
    );
};

const GameCollectionsPage = () => {
    const navigate = useNavigate();
    const { collectionSlug } = useParams();
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [searchTerm, setSearchTerm] = useState("");
    const [collections, setCollections] = useState(() => {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]").map(normalizeCollection);
        } catch {
            return [];
        }
    });

    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
    }, [collections]);

    const handleCreateCollection = (collection) => {
        setCollections((prev) => [collection, ...prev]);
        setSearchTerm("");
        navigate(`/analysis/collection/${getCollectionSlug(collection)}/games`);
    };

    const selectedCollection = collectionSlug
        ? collections.find((collection) => getCollectionSlug(collection) === collectionSlug)
        : null;

    const handleSelectCollection = (collectionId) => {
        const collection = collections.find((item) => item.id === collectionId);
        if (!collection) return;
        navigate(`/analysis/collection/${getCollectionSlug(collection)}/games`);
    };

    return (
        <div className="flex h-screen w-full bg-[#302f2c] text-[#bab9b8] px-6 py-4 gap-6 overflow-hidden select-none font-sans items-center">
            <AnalyzeEvalBar whiteBarHeight={51} currentEvalValue={0.4} />
            <StaticBoardSection />
            {selectedCollection ? (
                <CollectionDetailPanel
                    collection={selectedCollection}
                    onBack={() => navigate("/analysis/collections")}
                    onNewCollection={() => setIsModalOpen(true)}
                    onAddGames={() => navigate("/analysis")}
                />
            ) : (
                <GameCollectionsPanel
                    collections={collections}
                    searchTerm={searchTerm}
                    onSearchChange={setSearchTerm}
                    onNewCollection={() => setIsModalOpen(true)}
                    onSelectCollection={handleSelectCollection}
                />
            )}
            <NewCollectionModal
                isOpen={isModalOpen}
                onClose={() => setIsModalOpen(false)}
                onCreate={handleCreateCollection}
            />
        </div>
    );
};

export default GameCollectionsPage;
