import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, CalendarDays, Check, ChevronDown, ChevronUp, Copy, Download, Info, PencilLine, Plus, Search, Settings, Share2, Trash2, X } from 'lucide-react';
import axios from 'axios';
import GameHistoryTypeIcon from './game-history/GameHistoryTypeIcon';
import ActiveAnalysisView from './analysis-panel/ActiveAnalysisView';
import AnalysisFooter from './analysis-panel/AnalysisFooter';
import AnalysisTooltipBoard from './analysis-panel/AnalysisTooltipBoard';
import EmptyAnalysisMenu from './analysis-panel/EmptyAnalysisMenu';
import { DocumentFolderBoard, Review } from './icons/Icons';
import { buildAnalysisCsv, buildMoveRows } from './move-list/moveListUtils';
import {
    DEFAULT_FEN,
    getCurrentMoveData,
    getDisplayLines,
} from './analysis-panel/analysisPanelUtils';

const COLLECTIONS_STORAGE_KEY = 'checkmate_game_collections';
const PUBLIC_ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

const createPublicId = (length = 9) => {
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    return Array.from(randomValues, (value) => PUBLIC_ID_CHARS[value % PUBLIC_ID_CHARS.length]).join('');
};

const slugifyCollectionName = (name) => (
    String(name || 'collection')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'collection'
);

const getCollectionSlug = (collection) => `${slugifyCollectionName(collection?.name)}-${collection.publicId}`;

const getCollectionGames = (collection) => (
    Array.isArray(collection?.games) ? collection.games : []
);

const normalizeCollection = (collection) => ({
    ...collection,
    publicId: collection.publicId || createPublicId(),
});

const readCollections = () => {
    try {
        return JSON.parse(localStorage.getItem(COLLECTIONS_STORAGE_KEY) || '[]').map(normalizeCollection);
    } catch {
        return [];
    }
};

const writeCollections = (collections) => {
    localStorage.setItem(COLLECTIONS_STORAGE_KEY, JSON.stringify(collections));
};

const collectionIconForIndex = (index) => {
    const icons = ['/assets/icons/advanced-tactics.png', '/assets/moves/collections.svg', '/assets/icons/advanced-tactics.png'];
    return icons[index % icons.length];
};

const buildHistoryCollectionGame = ({ game, history = [], details = {}, username = '' }) => {
    const whiteName = game?.iWasWhite ? (username || 'White') : (game?.opponent || 'Black');
    const blackName = game?.iWasWhite ? (game?.opponent || 'Black') : (username || 'White');
    const moveList = (history || []).filter((move) => move?.m && move.m !== 'start');
    const moveText = moveList.map((move, index) => {
        const notation = move.san || move.m;
        if (index % 2 === 0) return `${Math.floor(index / 2) + 1}. ${notation}`;
        return notation;
    }).join(' ');
    const opening = details?.opening || {};
    const openingName = typeof opening === 'string' ? opening : (opening?.name || '');

    return {
        id: game?.id || crypto.randomUUID(),
        source: 'game-history',
        white: whiteName,
        black: blackName,
        white_elo: game?.iWasWhite ? game?.myElo : game?.elo,
        black_elo: game?.iWasWhite ? game?.elo : game?.myElo,
        result: details?.result || game?.result || '*',
        date: game?.date || new Date().toISOString().slice(0, 10),
        event: 'Game History',
        site: 'Checkmate',
        eco: typeof opening === 'string' ? '' : (opening?.eco || ''),
        opening: openingName,
        moves: moveText,
        analysisHistory: moveList,
        startingFen: DEFAULT_FEN,
        fen: moveList[moveList.length - 1]?.fen || DEFAULT_FEN,
        gameInfo: {
            white: whiteName,
            black: blackName,
            result: details?.result || game?.result || '*',
            white_rating: game?.iWasWhite ? game?.myElo : game?.elo,
            black_rating: game?.iWasWhite ? game?.elo : game?.myElo,
        },
        createdAt: new Date().toISOString(),
        addedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
    };
};

const addGamesToCollection = (collectionIdentifier, gamesToAdd) => {
    const collections = readCollections();
    let targetCollection = null;
    const updatedCollections = collections.map((collection) => {
        const isTarget = collection.id === collectionIdentifier
            || collection.publicId === collectionIdentifier
            || getCollectionSlug(collection) === collectionIdentifier;
        if (!isTarget) return collection;
        const existingGames = getCollectionGames(collection);
        const nextGames = [...existingGames];

        gamesToAdd.forEach((game) => {
            const existingIndex = nextGames.findIndex((savedGame) => String(savedGame.id) === String(game.id));
            if (existingIndex >= 0) {
                nextGames[existingIndex] = {
                    ...game,
                    addedAt: nextGames[existingIndex].addedAt || game.addedAt,
                    updatedAt: new Date().toISOString(),
                };
            } else {
                nextGames.unshift(game);
            }
        });

        targetCollection = {
            ...collection,
            games: nextGames,
            gameCount: nextGames.length,
            updatedAt: new Date().toISOString(),
        };
        return targetCollection;
    });

    writeCollections(updatedCollections);
    window.dispatchEvent(new CustomEvent('checkmate:collections-updated'));
    return targetCollection;
};

const formatCollectionDate = (value) => {
    const timestamp = Date.parse(value || '');
    if (!timestamp) return '';
    return new Intl.DateTimeFormat('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
    }).format(new Date(timestamp));
};

const DeleteCollectionModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[9000] flex items-center justify-center bg-black/70">
            <div className="relative w-[330px] rounded-xl bg-[#24231f] border border-[#45433f] shadow-2xl px-8 pt-9 pb-6">
                <button
                    type="button"
                    onClick={onClose}
                    className="absolute right-4 top-3 text-[#9f9e9b] hover:text-white text-[34px] leading-none font-semibold"
                    aria-label="Close delete collection dialog"
                >
                    &times;
                </button>
                <h2 className="text-center text-white text-[24px] leading-7 font-black mb-4">Delete Collection?</h2>
                <p className="text-center text-[#a7a5a2] text-[16px] leading-5 font-bold mb-7">
                    Do you want to remove this<br />collection?
                </p>
                <div className="grid grid-cols-2 gap-3">
                    <button type="button" onClick={onClose} className="h-[50px] rounded-xl bg-gradient-to-b from-[#3f3d3a] to-[#302f2c] border border-[#4a4845] text-[#eeeeec] text-[19px] font-bold shadow-lg hover:from-[#4a4845] hover:to-[#383633]">
                        Cancel
                    </button>
                    <button type="button" onClick={onConfirm} className="h-[50px] rounded-xl bg-gradient-to-b from-[#ff463c] to-[#ed2424] border border-[#ff5a51] text-white text-[19px] font-bold shadow-lg hover:from-[#ff5b52] hover:to-[#ff302f]">
                        Delete
                    </button>
                </div>
            </div>
        </div>
    );
};

const CollectionSettingsView = ({ collectionContext, onBack, onUpdateCollection, onDeleteCollection }) => {
    const privacy = collectionContext?.privacy || 'private';
    const createdDate = formatCollectionDate(collectionContext?.createdAt);
    const updatedDate = formatCollectionDate(collectionContext?.updatedAt || collectionContext?.createdAt);
    const ownerName = collectionContext?.ownerName || localStorage.getItem('chessUsername') || 'VikhiKeh';
    const [isEditingDetails, setIsEditingDetails] = useState(false);
    const [draftName, setDraftName] = useState(collectionContext?.name || '');
    const [draftDescription, setDraftDescription] = useState(collectionContext?.description || '');

    const resetDraft = () => {
        setDraftName(collectionContext?.name || '');
        setDraftDescription(collectionContext?.description || '');
        setIsEditingDetails(false);
    };

    const saveDraft = () => {
        const nextName = draftName.trim();
        if (!nextName) return;
        onUpdateCollection?.(collectionContext?.id, {
            name: nextName,
            description: draftDescription.trim(),
            updatedAt: new Date().toISOString(),
        });
        setIsEditingDetails(false);
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[#24231f]">
            <div className="h-12 relative flex items-center px-4 border-b border-[#3a3936] bg-[#24231f] shrink-0">
                <button type="button" onClick={onBack} className="absolute left-3 text-[#a8a7a5] hover:text-white">
                    <ArrowLeft size={23} strokeWidth={3} />
                </button>
                <div className="mx-auto flex items-center gap-2.5 min-w-0 max-w-[340px]">
                    <img src="/assets/icons/advanced-tactics.png" alt="" className="w-7 h-7 rounded object-cover shrink-0" draggable="false" />
                    <h1 className="truncate text-[#e2e0dc] text-[18px] font-black">Collection Settings</h1>
                </div>
            </div>

            <div className="flex-1 overflow-hidden">
                <div className={`px-4 ${isEditingDetails ? 'py-3' : 'py-3.5'} flex items-center gap-3`}>
                    <div className="relative w-13 h-13 rounded-sm overflow-hidden shrink-0 bg-[#f1796f]">
                        <img src="/assets/icons/advanced-tactics.png" alt="" className="w-full h-full object-cover opacity-90" draggable="false" />
                        <div className="absolute bottom-0 left-0 right-0 h-4 bg-[#7d211d] flex items-center justify-center text-[8px] font-semibold text-white">EDIT</div>
                    </div>
                    {isEditingDetails ? (
                        <div className="min-w-0 flex-1">
                            <input
                                value={draftName}
                                onChange={(event) => setDraftName(event.target.value)}
                                className="w-full h-8 rounded-md bg-[#343330] border border-[#55534f] px-3 text-[#d7d6d4] text-[14px] font-bold outline-none focus:border-[#8bc34a]"
                            />
                            <input
                                value={draftDescription}
                                onChange={(event) => setDraftDescription(event.target.value)}
                                placeholder="Enter a description"
                                className="mt-2 w-full h-8 rounded-md bg-[#343330] border border-[#55534f] px-3 text-[#d7d6d4] placeholder:text-[#8f8e8b] text-[14px] font-semibold outline-none focus:border-[#8bc34a]"
                            />
                            <div className="mt-2 grid grid-cols-2 gap-3">
                                <button
                                    type="button"
                                    onClick={resetDraft}
                                    className="h-9 rounded-md bg-gradient-to-b from-[#3c3a37] to-[#302f2c] border border-[#45433f] text-[#d7d6d4] text-[14px] font-bold hover:from-[#474541] hover:to-[#383633]"
                                >
                                    Cancel
                                </button>
                                <button
                                    type="button"
                                    onClick={saveDraft}
                                    disabled={!draftName.trim()}
                                    className="h-9 rounded-md bg-gradient-to-b from-[#86c857] to-[#5f9d3c] text-white text-[14px] font-bold disabled:opacity-50 disabled:cursor-not-allowed hover:from-[#91d161] hover:to-[#69aa43]"
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="min-w-0 flex-1">
                                <div className="truncate text-[#d7d6d4] text-[19px] font-black">{collectionContext?.name || 'Collection'}</div>
                                <div className="truncate text-[#9f9e9b] text-[13.5px] font-semibold">
                                    {collectionContext?.description || 'Enter a description'}
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-[#a8a7a5]">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setDraftName(collectionContext?.name || '');
                                        setDraftDescription(collectionContext?.description || '');
                                        setIsEditingDetails(true);
                                    }}
                                    className="hover:text-white"
                                    title="Edit collection"
                                >
                                    <PencilLine size={20} strokeWidth={2.8} />
                                </button>
                                <button type="button" className="hover:text-white" title="Share collection"><Share2 size={20} strokeWidth={3} /></button>
                            </div>
                        </>
                    )}
                </div>

                <div className="px-4 py-2.5 grid grid-cols-2 gap-2.5">
                    <button type="button" className="h-11 rounded-md bg-gradient-to-b from-[#3c3a37] to-[#302f2c] border border-[#45433f] text-[#d7d6d4] text-[14px] font-bold flex items-center justify-center gap-2 hover:from-[#474541] hover:to-[#383633]">
                        <Download size={17} strokeWidth={3} /> Download
                    </button>
                    <button type="button" className="h-11 rounded-md bg-gradient-to-b from-[#3c3a37] to-[#302f2c] border border-[#45433f] text-[#d7d6d4] text-[14px] font-bold flex items-center justify-center gap-2 hover:from-[#474541] hover:to-[#383633]">
                        <Copy size={17} strokeWidth={3} /> Duplicate
                    </button>
                </div>

                <div className="px-4 py-3.5 border-b border-[#383632]">
                    <div className="flex items-start gap-2.5">
                        <button type="button" className="w-9 h-5 rounded-full bg-[#6fb04b] flex items-center justify-end px-0.5">
                            <span className="w-4 h-4 rounded-full bg-[#e6e4df]" />
                        </button>
                        <div>
                            <div className="text-[#c9c8c5] text-[14px] font-semibold">Autosave</div>
                            <div className="mt-0.5 text-[#8f8e8b] text-[12.5px] font-semibold leading-4">Automatically save when changes are made to games in your collection.</div>
                        </div>
                    </div>
                </div>

                <div className="px-4 py-3.5 border-b border-[#383632]">
                    <div className="text-[#d7d6d4] text-[15px] font-bold mb-2.5">Privacy</div>
                    <div className="space-y-2">
                        {['public', 'private', 'community'].map((option) => (
                            <button
                                key={option}
                                type="button"
                                onClick={() => onUpdateCollection?.(collectionContext?.id, { privacy: option, updatedAt: new Date().toISOString() })}
                                className="flex items-center gap-2.5 text-[#c7c6c3] hover:text-white text-[14px] font-bold"
                            >
                                <span className={`w-3 h-3 rounded-full border flex items-center justify-center ${privacy === option ? 'border-[#bab9b8]' : 'border-[#8a8986]'}`}>
                                    {privacy === option && <span className="w-1.5 h-1.5 rounded-full bg-[#bab9b8]" />}
                                </span>
                                <span className="capitalize">{option}</span>
                                <span className="w-3.5 h-3.5 rounded-full bg-[#bab9b8] text-[#2c2b28] flex items-center justify-center"><Info size={10} strokeWidth={3} /></span>
                            </button>
                        ))}
                    </div>
                </div>

                <div className="px-4 py-3.5 border-b border-[#383632]">
                    <div className="text-[#d7d6d4] text-[15px] font-bold">Participants <span className="ml-1 px-1.5 py-0.5 rounded bg-[#5a5955] text-[#d7d6d4] text-[10px]">0</span></div>
                    <button type="button" className="mt-5 mx-auto flex items-center justify-center gap-2 text-[#a8a7a5] hover:text-white text-[14px] font-bold">
                        <Plus size={19} strokeWidth={3} /> Add Participant
                    </button>
                </div>

                <div className="px-4 py-3.5">
                    <div className="text-[#8f8e8b] text-[13px] font-semibold leading-4">
                        {createdDate && <div>Created on {createdDate}</div>}
                        {updatedDate && <div>Last updated on {updatedDate} by {ownerName}</div>}
                    </div>
                    <button
                        type="button"
                        onClick={() => onDeleteCollection?.(collectionContext?.id)}
                        className="mt-3 h-11 px-4 rounded-md bg-gradient-to-b from-[#3c3a37] to-[#302f2c] border border-[#45433f] text-[#ff3b30] text-[14px] font-bold flex items-center gap-2.5 hover:from-[#474541] hover:to-[#383633]"
                    >
                        <Trash2 size={18} strokeWidth={2.8} /> Delete Collection
                    </button>
                </div>
            </div>
        </div>
    );
};

const SelectField = ({ label, icon = null }) => (
    <button
        type="button"
        className="h-10 rounded-md bg-[#343330] border border-[#55534f] px-3 flex items-center justify-between text-[#c7c5c2] text-[14px] font-semibold hover:bg-[#3b3936]"
    >
        <span className="truncate flex items-center gap-2">
            {label}
            {icon}
        </span>
        <ChevronDown size={17} strokeWidth={3} className="text-[#a5a29e] shrink-0" />
    </button>
);

const TextFilter = ({ placeholder, icon = null }) => (
    <div className="h-10 rounded-md bg-[#343330] border border-[#55534f] px-3 flex items-center gap-2 text-[#9f9e9b]">
        {icon}
        <input
            placeholder={placeholder}
            className="min-w-0 flex-1 bg-transparent outline-none text-[14px] font-semibold placeholder:text-[#8f8d89] text-[#d7d6d4]"
        />
    </div>
);

const formatHistoryPreview = (history = []) => {
    const moves = (history || []).filter((move) => move?.m && move.m !== 'start');
    if (!moves.length) return 'No moves available';

    return moves.map((move, index) => {
        const notation = move.san || move.m;
        if (index % 2 === 0) {
            return `${Math.floor(index / 2) + 1}. ${notation}`;
        }
        return notation;
    }).join(' ');
};

const BulkAddCollectionModal = ({ isOpen, gamesToAdd, onClose, onSaved }) => {
    const navigate = useNavigate();
    const [collections, setCollections] = useState([]);
    const [filter, setFilter] = useState('');
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setCollections(readCollections());
        setFilter('');
        setIsCreatingCollection(false);
        setNewCollectionName('');
    }, [isOpen]);

    const filteredCollections = useMemo(() => {
        const term = filter.trim().toLowerCase();
        if (!term) return collections;
        return collections.filter((collection) => collection.name.toLowerCase().includes(term));
    }, [collections, filter]);

    if (!isOpen) return null;

    const saveToCollection = (collectionId) => {
        const targetCollection = addGamesToCollection(collectionId, gamesToAdd);
        if (!targetCollection) return;
        onSaved?.(targetCollection);
        onClose();
        navigate(`/analysis/collection/${getCollectionSlug(targetCollection)}/games`);
    };

    const createCollection = () => {
        const name = newCollectionName.trim();
        if (name.length < 2) return;
        const newCollection = {
            id: crypto.randomUUID(),
            publicId: createPublicId(),
            name,
            ownerName: localStorage.getItem('chessUsername') || 'VikhiKeh',
            privacy: 'public',
            participants: [],
            games: [],
            gameCount: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };
        const updatedCollections = [newCollection, ...collections];
        setCollections(updatedCollections);
        writeCollections(updatedCollections);
        setNewCollectionName('');
        setIsCreatingCollection(false);
    };

    return (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center">
            <button type="button" aria-label="Close add to collection" onClick={onClose} className="absolute inset-0 bg-black/75" />
            <div className="relative w-[420px] h-[460px] rounded-lg bg-[#272522] border border-[#3a3936] shadow-2xl overflow-hidden flex flex-col">
                <div className="h-[52px] px-4 flex items-center justify-between bg-[#1f1e1b] shrink-0">
                    <h2 className="text-white text-[18px] font-semibold">Add to Collection</h2>
                    <button type="button" onClick={onClose} className="text-[#8f8e8b] hover:text-white">
                        <X size={24} strokeWidth={3} />
                    </button>
                </div>
                <div className="p-3 border-b border-[#343330] shrink-0">
                    <div className="relative">
                        <Search size={22} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999896]" />
                        <input
                            autoFocus
                            value={filter}
                            onChange={(event) => setFilter(event.target.value)}
                            placeholder="Filter Collections"
                            className="w-full h-11 bg-[#3a3936] border border-[#55534f] rounded-md pl-10 pr-3 text-[#d7d6d4] placeholder:text-[#8b8987] text-[14px] font-semibold outline-none focus:border-[#8bc34a]"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto collection-scrollbar">
                    {filteredCollections.length > 0 ? (
                        filteredCollections.map((collection, index) => {
                            const games = getCollectionGames(collection);
                            return (
                                <button
                                    type="button"
                                    key={collection.id}
                                    onClick={() => saveToCollection(collection.id)}
                                    className="w-full h-[53px] px-3 flex items-center gap-3 border-b border-[#343330] text-left hover:bg-[#302f2c]"
                                >
                                    <img src={collectionIconForIndex(index)} alt="" className="w-7 h-7 rounded object-cover shrink-0" draggable="false" />
                                    <div className="min-w-0 flex-1 truncate text-[#d7d6d4] text-[15px] font-semibold">
                                        {collection.name} <span className="text-[#8f8e8b]">({games.length} {games.length === 1 ? 'game' : 'games'})</span>
                                    </div>
                                    <Plus size={26} strokeWidth={3} className="text-[#bab9b8]" />
                                </button>
                            );
                        })
                    ) : (
                        <div className="h-full flex items-center justify-center text-[#8f8e8b] text-[14px] font-semibold">No collections found</div>
                    )}
                </div>
                <div className="p-3 border-t border-[#343330] bg-[#24231f] shrink-0">
                    {isCreatingCollection ? (
                        <div className="flex gap-2">
                            <input
                                value={newCollectionName}
                                onChange={(event) => setNewCollectionName(event.target.value)}
                                placeholder="Collection name"
                                className="h-10 flex-1 rounded-md bg-[#3a3936] border border-[#55534f] px-3 text-[#d7d6d4] text-[14px] font-semibold outline-none focus:border-[#8bc34a]"
                            />
                            <button type="button" onClick={createCollection} className="h-10 px-4 rounded-md bg-[#81b64c] text-white text-[13px] font-bold">
                                Create
                            </button>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setIsCreatingCollection(true)}
                            className="w-full h-12 rounded-lg bg-gradient-to-b from-[#3f3d3a] to-[#302f2c] border border-[#4a4845] text-[#eeeeec] text-[19px] font-bold shadow flex items-center justify-center gap-3 hover:from-[#4a4845] hover:to-[#383633]"
                        >
                            <Plus size={25} strokeWidth={3} /> Create New Collection
                        </button>
                    )}
                    <button type="button" className="mx-auto mt-3 flex items-center justify-center gap-2 text-[#bab9b8] hover:text-white text-[13px] font-bold">
                        <Copy size={17} strokeWidth={2.7} /> Copy Shareable Link
                    </button>
                </div>
            </div>
        </div>
    );
};

const LoadGameHistoryView = ({ apiBase, token, onBack, onLoadGame }) => {
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const [games, setGames] = useState([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isAddingGames, setIsAddingGames] = useState(false);
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [expandedGameId, setExpandedGameId] = useState(null);
    const [gameMovePreviews, setGameMovePreviews] = useState({});
    const [gameHistories, setGameHistories] = useState({});
    const [gameDetails, setGameDetails] = useState({});
    const [selectedGameIds, setSelectedGameIds] = useState([]);
    const [pendingCollectionGames, setPendingCollectionGames] = useState([]);
    const username = localStorage.getItem('chessUsername') || '';
    const targetCollectionSlug = searchParams.get('addGamesToCollection');
    const selectedGameIdSet = useMemo(() => new Set(selectedGameIds.map(String)), [selectedGameIds]);
    const allGamesSelected = games.length > 0 && games.every((game) => selectedGameIdSet.has(String(game.id)));

    useEffect(() => {
        if (!apiBase || !username) return;
        let isMounted = true;
        setIsLoading(true);
        axios.get(`${apiBase}/user-games/${encodeURIComponent(username)}?offset=0&limit=500`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        })
            .then((res) => {
                if (isMounted) setGames(res.data?.games || []);
            })
            .catch(() => {
                if (isMounted) setGames([]);
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => { isMounted = false; };
    }, [apiBase, token, username]);

    const ensureGameHistory = async (gameId) => {
        if (gameHistories[gameId]) {
            return {
                history: gameHistories[gameId],
                details: gameDetails[gameId] || {},
            };
        }
        if (!apiBase) return { history: [], details: {} };

        setGameMovePreviews((current) => ({ ...current, [gameId]: current[gameId] || 'Loading moves...' }));
        const res = await axios.get(`${apiBase}/game/${gameId}/history`, {
            headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        });
        const loadedHistory = (res.data?.history || []).filter((move) => move?.m && move.m !== 'start');
        const details = res.data || {};
        setGameHistories((current) => ({ ...current, [gameId]: loadedHistory }));
        setGameDetails((current) => ({ ...current, [gameId]: details }));
        setGameMovePreviews((current) => ({ ...current, [gameId]: formatHistoryPreview(loadedHistory) }));
        return { history: loadedHistory, details };
    };

    const toggleSelectedGame = (gameId) => {
        setSelectedGameIds((current) => (
            current.some((id) => String(id) === String(gameId))
                ? current.filter((id) => String(id) !== String(gameId))
                : [...current, gameId]
        ));
    };

    const toggleAllSelected = () => {
        setSelectedGameIds(allGamesSelected ? [] : games.map((game) => game.id));
    };

    const toggleGame = async (gameId) => {
        if (expandedGameId === gameId) {
            setExpandedGameId(null);
            return;
        }

        setExpandedGameId(gameId);
        if (gameHistories[gameId]) {
            onLoadGame?.(games.find((game) => game.id === gameId), gameHistories[gameId], gameDetails[gameId] || {});
            return;
        }
        if (!apiBase || gameMovePreviews[gameId]) return;

        try {
            const { history, details } = await ensureGameHistory(gameId);
            onLoadGame?.(games.find((game) => game.id === gameId), history, details);
        } catch {
            setGameMovePreviews((current) => ({ ...current, [gameId]: 'No moves available' }));
        }
    };

    const handleAddSelectedGames = async () => {
        if (!selectedGameIds.length) return;
        setIsAddingGames(true);
        try {
            const selectedGames = [];
            for (const gameId of selectedGameIds) {
                const game = games.find((item) => String(item.id) === String(gameId));
                if (!game) continue;
                const { history, details } = await ensureGameHistory(gameId);
                selectedGames.push(buildHistoryCollectionGame({ game, history, details, username }));
            }

            if (!selectedGames.length) return;
            if (targetCollectionSlug) {
                const updatedCollection = addGamesToCollection(targetCollectionSlug, selectedGames);
                if (updatedCollection) {
                    navigate(`/analysis/collection/${getCollectionSlug(updatedCollection)}/games`);
                    return;
                }
            }
            setPendingCollectionGames(selectedGames);
        } finally {
            setIsAddingGames(false);
        }
    };

    return (
        <div className="flex-1 flex flex-col min-h-0 bg-[#24231f]">
            <div className="h-[52px] relative flex items-center px-4 border-b border-[#3a3936] shrink-0">
                <button type="button" onClick={onBack} className="absolute left-4 text-[#a8a7a5] hover:text-white">
                    <ArrowLeft size={27} strokeWidth={3} />
                </button>
                <div className="mx-auto flex items-center gap-2.5">
                    <DocumentFolderBoard size={26} className="text-[#c7c5c2]" />
                    <h1 className="text-white text-[19px] font-black">Load From Game History</h1>
                </div>
            </div>

            <div className="px-3 py-3 space-y-2 shrink-0 border-b border-[#34322f]">
                <TextFilter placeholder="Search Username" icon={<Search size={25} strokeWidth={3} className="text-[#a8a7a5]" />} />
                <div className="grid grid-cols-2 gap-2">
                    <SelectField label="Any Result" />
                    <SelectField label="All Recent Games" />
                    <TextFilter placeholder="Opponent" />
                    <SelectField label="Opponent Title" />
                    {isAdvancedOpen && (
                        <>
                            <SelectField label="Newest" />
                            <SelectField label="Opening" />
                            <SelectField label="Rated + Unrated" />
                            <SelectField label="Color" />
                            <TextFilter placeholder="Start Date" icon={<CalendarDays size={18} strokeWidth={2.7} className="ml-auto text-[#b8b6b2]" />} />
                            <TextFilter placeholder="End Date" icon={<CalendarDays size={18} strokeWidth={2.7} className="ml-auto text-[#b8b6b2]" />} />
                            <SelectField label="Match Type" />
                            <TextFilter placeholder="Rating Min" />
                            <TextFilter placeholder="Rating Max" />
                        </>
                    )}
                </div>
                <div className="grid grid-cols-[1fr_112px_112px] items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setIsAdvancedOpen((current) => !current)}
                        className="justify-self-start flex items-center gap-1 text-[#00a7d9] hover:text-[#33c4ec] text-[13px] font-semibold"
                    >
                        {isAdvancedOpen ? 'Hide' : 'Advanced'}
                        {isAdvancedOpen ? <ChevronUp size={16} strokeWidth={3} /> : <ChevronDown size={16} strokeWidth={3} />}
                    </button>
                    <button type="button" className="h-10 rounded-md bg-gradient-to-b from-[#86c857] to-[#5f9d3c] text-white text-[14px] font-black hover:from-[#91d161] hover:to-[#69aa43]">
                        Search
                    </button>
                    <button type="button" className="h-10 rounded-md bg-gradient-to-b from-[#3c3a37] to-[#302f2c] border border-[#45433f] text-[#d7d6d4] text-[14px] font-black hover:from-[#474541] hover:to-[#383633]">
                        Reset
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-[48px_1fr_68px_1fr_68px_26px_50px_58px_34px] h-9 items-center px-3 bg-[#1f1e1b] text-[#bab9b8] text-[11px] font-semibold border-b border-[#34322f] shrink-0">
                <div />
                <div>Player</div>
                <div>Rating</div>
                <div>Player</div>
                <div>Rating</div>
                <div />
                <div>Result</div>
                <div>Time</div>
                <button
                    type="button"
                    onClick={toggleAllSelected}
                    className={`h-5 w-5 rounded border flex items-center justify-center ${allGamesSelected ? 'bg-[#a9aaa6] border-[#a9aaa6] text-[#33322f]' : 'border-[#8f8e8b] text-transparent hover:border-white'}`}
                    aria-label={allGamesSelected ? 'Unselect all games' : 'Select all games'}
                >
                    <Check size={15} strokeWidth={4} />
                </button>
            </div>

            <div className="flex-1 overflow-y-auto collection-scrollbar">
                {isLoading ? (
                    <div className="h-24 flex items-center justify-center text-[#8f8e8b] text-[13px] font-semibold">Loading games...</div>
                ) : games.length === 0 ? (
                    <div className="h-24 flex items-center justify-center text-[#8f8e8b] text-[13px] font-semibold">No games yet</div>
                ) : (
                    <>
                    {games.map((game) => {
                        const whitePlayer = game.iWasWhite
                            ? { name: username || 'VikhiKeh', rating: game.myElo }
                            : { name: game.opponent || 'Opponent', rating: game.elo };
                        const blackPlayer = !game.iWasWhite
                            ? { name: username || 'VikhiKeh', rating: game.myElo }
                            : { name: game.opponent || 'Opponent', rating: game.elo };
                        const resultClass = game.result === '1-0' || game.result === '0-1'
                            ? (game.win ? 'text-[#81b64c]' : 'text-[#ff4438]')
                            : 'text-[#d7d6d4]';

                        const isExpanded = expandedGameId === game.id;
                        const isSelected = selectedGameIdSet.has(String(game.id));

                        return (
                            <div key={game.id} className="border-b border-[#34322f]">
                                <button
                                    type="button"
                                    onClick={() => toggleGame(game.id)}
                                    className="w-full grid grid-cols-[48px_1fr_68px_1fr_68px_26px_50px_58px_34px] h-9 items-center px-3 text-left text-[14px] font-bold text-[#bab9b8] hover:bg-[#2d2b28]"
                                >
                                    <div className="flex items-center">
                                        <GameHistoryTypeIcon game={game} size={22} />
                                    </div>
                                    <div className="truncate text-[#c7c5c2]">{whitePlayer.name}</div>
                                    <div className="text-[#8f8e8b]">({whitePlayer.rating ?? '-'})</div>
                                    <div className="truncate text-[#c7c5c2]">{blackPlayer.name}</div>
                                    <div className="text-[#8f8e8b]">({blackPlayer.rating ?? '-'})</div>
                                    <div className="text-[#d0cfcc] flex justify-center">
                                        {isExpanded ? <ChevronUp size={16} fill="currentColor" /> : <ChevronDown size={16} fill="currentColor" />}
                                    </div>
                                    <div className={resultClass}>{game.result || '*'}</div>
                                    <div className="text-[#8f8e8b]">{game.type || '--'}</div>
                                    <span
                                        role="checkbox"
                                        aria-checked={isSelected}
                                        tabIndex={0}
                                        onClick={(event) => {
                                            event.stopPropagation();
                                            toggleSelectedGame(game.id);
                                        }}
                                        onKeyDown={(event) => {
                                            if (event.key !== 'Enter' && event.key !== ' ') return;
                                            event.preventDefault();
                                            event.stopPropagation();
                                            toggleSelectedGame(game.id);
                                        }}
                                        className={`h-5 w-5 rounded border flex items-center justify-center ${isSelected ? 'bg-[#a9aaa6] border-[#a9aaa6] text-[#33322f]' : 'border-[#8f8e8b] text-transparent hover:border-white'}`}
                                        aria-label={isSelected ? 'Unselect game' : 'Select game'}
                                    >
                                        <Check size={15} strokeWidth={4} />
                                    </span>
                                </button>
                                {isExpanded && (
                                    <div className="px-3 pb-3 pt-1 text-[#c7c5c2] text-[14px] leading-5 font-bold">
                                        {gameMovePreviews[game.id] || 'Loading moves...'}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    {selectedGameIds.length > 0 && (
                        <div className="sticky bottom-3 px-3 pt-3 pointer-events-none">
                            <button
                                type="button"
                                onClick={handleAddSelectedGames}
                                disabled={isAddingGames}
                                className="pointer-events-auto w-full h-12 rounded-lg bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white text-[20px] font-black shadow-xl disabled:opacity-70 hover:from-[#9bd45c] hover:to-[#6cb64e]"
                            >
                                {isAddingGames ? 'Adding Games...' : `Add ${selectedGameIds.length} ${selectedGameIds.length === 1 ? 'Game' : 'Games'}`}
                            </button>
                        </div>
                    )}
                    </>
                )}
            </div>
            <BulkAddCollectionModal
                isOpen={pendingCollectionGames.length > 0}
                gamesToAdd={pendingCollectionGames}
                onClose={() => setPendingCollectionGames([])}
                onSaved={() => setSelectedGameIds([])}
            />
        </div>
    );
};

const AnalysisPanel = ({
    history,
    openingName,
    onSaveClick,
    onNewClick,
    canSave,
    canReview = true,
    viewIndex,
    onViewMove,
    onReviewClick,
    onSetupClick,
    onStartAnalysis,
    currentFen,
    initialAnalysis,
    gameInfo,
    statusText,
    resultLabel,
    activeTab = 'analysis',
    onAnalysisTabClick,
    onGamesTabClick,
    onExploreTabClick,
    collectionContext,
    onCollectionBackClick,
    collectionSettingsMode = false,
    onCollectionSettingsClick,
    onCollectionSettingsBackClick,
    onUpdateCollection,
    onDeleteCollection,
    onReviewBackClick,
    reviewMode = false,
    hideMoveJudgement = false,
    hasStartingPosition = false,
    showOnlyActiveMoveLabels = false,
    revealedMoveLabelIndex = null,
    apiBase,
    token,
    onLoadGameHistoryGame,
}) => {
    const [tooltip, setTooltip] = useState({ x: 0, y: 0, visible: false, fen: null });
    const [isCollectionSettingsOpen, setIsCollectionSettingsOpen] = useState(false);
    const [isDeleteCollectionOpen, setIsDeleteCollectionOpen] = useState(false);
    const [utilityView, setUtilityView] = useState(null);
    const showCollectionSettings = collectionSettingsMode || isCollectionSettingsOpen;
    const isActive = history.length > 0 || Boolean(initialAnalysis) || (currentFen && currentFen !== DEFAULT_FEN);
    const shouldShowActiveView = isActive || activeTab === 'explore';
    const isGameHistoryOpen = utilityView === 'gameHistory';
    const currentMoveData = getCurrentMoveData({ history, viewIndex, currentFen, initialAnalysis });
    const engineLinesToDisplay = getDisplayLines({ history, viewIndex, initialAnalysis, currentMoveData });
    const handleDownloadTable = () => {
        if (!history || history.length === 0) return;

        const csvContent = buildAnalysisCsv(buildMoveRows(history));
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `sandbox_analysis_${new Date().getTime()}.csv`);
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="relative w-[480px] h-[744px] bg-[#262421] rounded-lg flex flex-col shadow-xl border border-[#3c3a37] overflow-hidden font-sans">
            {collectionContext && showCollectionSettings ? (
                <CollectionSettingsView
                    collectionContext={collectionContext}
                    onBack={collectionSettingsMode ? onCollectionSettingsBackClick : () => setIsCollectionSettingsOpen(false)}
                    onUpdateCollection={onUpdateCollection}
                    onDeleteCollection={() => setIsDeleteCollectionOpen(true)}
                />
            ) : collectionContext && (
                <div className="h-15 relative flex items-center px-5 border-b border-[#3a3936] bg-[#24231f] shrink-0">
                    <button type="button" onClick={onCollectionBackClick} className="absolute left-4 text-[#a8a7a5] hover:text-white">
                        <ArrowLeft size={27} strokeWidth={3} />
                    </button>
                    <div className="mx-auto flex items-center gap-3 min-w-0 max-w-[330px]">
                        <img
                            src="/assets/icons/advanced-tactics.png"
                            alt=""
                            className="w-8 h-8 rounded object-cover shrink-0"
                            draggable="false"
                        />
                        <h1 className="truncate text-white text-[22px] font-semibold">{collectionContext.name}</h1>
                    </div>
                    <button
                        type="button"
                        onClick={onCollectionSettingsClick || (() => setIsCollectionSettingsOpen(true))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-11 w-11 flex items-center justify-center text-[#a8a7a5] hover:text-white"
                        aria-label="Collection settings"
                    >
                        <Settings size={27} strokeWidth={3} />
                    </button>
                </div>
            )}
            {!collectionContext && (
                <div className="h-[52px] flex items-center justify-center gap-2 border-b border-[#3a3936] bg-[#24231f] shrink-0 relative">
                    {onReviewBackClick && (
                        <button
                            type="button"
                            onClick={onReviewBackClick}
                            className="absolute left-4 text-[#a8a7a5] hover:text-white transition-colors"
                            aria-label="Back to review"
                        >
                            <ArrowLeft size={27} strokeWidth={3} />
                        </button>
                    )}
                    {reviewMode ? (
                        <Review size={29} className="text-[#d7d6d4] shrink-0" />
                    ) : (
                        <img
                            src="/assets/icons/magnifier-analysis.svg"
                            alt=""
                            className="w-[29px] h-[29px] object-contain shrink-0"
                            draggable="false"
                        />
                    )}
                    <h1 className="text-white text-[22px] font-black">{reviewMode ? 'Game Review' : 'Analysis'}</h1>
                </div>
            )}
            {!showCollectionSettings && <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {isGameHistoryOpen ? (
                    <LoadGameHistoryView
                        apiBase={apiBase}
                        token={token}
                        onBack={() => setUtilityView(null)}
                        onLoadGame={onLoadGameHistoryGame}
                    />
                ) : !shouldShowActiveView ? (
                    <EmptyAnalysisMenu
                        onSetupClick={onSetupClick}
                        onStartAnalysis={onStartAnalysis}
                        onExploreClick={onExploreTabClick}
                        onGameHistoryClick={() => setUtilityView('gameHistory')}
                    />
                ) : (
                    <ActiveAnalysisView
                        history={history}
                        viewIndex={viewIndex}
                        openingName={openingName}
                        currentFen={currentFen}
                        gameInfo={gameInfo}
                        currentMoveData={currentMoveData}
                        engineLinesToDisplay={engineLinesToDisplay}
                        statusText={statusText}
                        resultLabel={resultLabel}
                        onViewMove={onViewMove}
                        activeTab={activeTab}
                        hideTabs={reviewMode}
                        onAnalysisTabClick={onAnalysisTabClick}
                        onGamesTabClick={onGamesTabClick}
                        onExploreTabClick={onExploreTabClick}
                        apiBase={apiBase}
                        token={token}
                        onTooltipChange={setTooltip}
                        hideMoveJudgement={hideMoveJudgement}
                        showOnlyActiveMoveLabels={showOnlyActiveMoveLabels}
                        revealedMoveLabelIndex={revealedMoveLabelIndex}
                    />
                )}
            </div>}

            {(shouldShowActiveView || isGameHistoryOpen) && !showCollectionSettings && (
                <AnalysisFooter
                    history={history}
                    viewIndex={viewIndex}
                    onViewMove={onViewMove}
                    onNewClick={onNewClick}
                    canSave={isGameHistoryOpen ? false : canSave}
                    canReview={isGameHistoryOpen ? false : canReview}
                    hasStartingPosition={isGameHistoryOpen ? history.length > 0 : hasStartingPosition}
                    onSaveClick={isGameHistoryOpen ? undefined : onSaveClick}
                    onReviewClick={isGameHistoryOpen ? undefined : onReviewClick}
                    onDownloadClick={isGameHistoryOpen ? undefined : handleDownloadTable}
                />
            )}

            {collectionContext && showCollectionSettings && (
                <AnalysisFooter
                    history={history}
                    viewIndex={viewIndex}
                    onViewMove={onViewMove}
                    onNewClick={onNewClick}
                    canSave={canSave}
                    canReview={canReview}
                    hasStartingPosition={hasStartingPosition}
                    onSaveClick={onSaveClick}
                    onReviewClick={onReviewClick}
                    onDownloadClick={handleDownloadTable}
                />
            )}

            <DeleteCollectionModal
                isOpen={isDeleteCollectionOpen}
                onClose={() => setIsDeleteCollectionOpen(false)}
                onConfirm={() => {
                    setIsDeleteCollectionOpen(false);
                    onDeleteCollection?.(collectionContext?.id);
                }}
            />
            <AnalysisTooltipBoard tooltip={tooltip} />
        </div>
    );
};

export default AnalysisPanel;
