import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { Check, Copy, Plus, Search, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const COLLECTIONS_STORAGE_KEY = 'checkmate_game_collections';
const PUBLIC_ID_CHARS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MotionDiv = motion.div;

const createPublicId = (length = 9) => {
    const randomValues = new Uint32Array(length);
    crypto.getRandomValues(randomValues);
    return Array.from(randomValues, (value) => PUBLIC_ID_CHARS[value % PUBLIC_ID_CHARS.length]).join('');
};

const getCollectionGames = (collection) => (
    Array.isArray(collection?.games) ? collection.games : []
);

const readCollections = () => {
    try {
        return JSON.parse(localStorage.getItem(COLLECTIONS_STORAGE_KEY) || '[]')
            .map((collection) => ({ ...collection, publicId: collection.publicId || createPublicId() }));
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

const slugifyCollectionName = (name) => (
    String(name || 'collection')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'collection'
);

const getCollectionSlug = (collection) => `${slugifyCollectionName(collection?.name)}-${collection.publicId}`;

const SaveCollectionModal = ({ isOpen, onClose, game, onSaved }) => {
    const navigate = useNavigate();
    const [collections, setCollections] = useState([]);
    const [filter, setFilter] = useState('');
    const [lastAddedCollectionId, setLastAddedCollectionId] = useState(null);
    const [isCreatingCollection, setIsCreatingCollection] = useState(false);
    const [newCollectionName, setNewCollectionName] = useState('');

    useEffect(() => {
        if (!isOpen) return;
        setCollections(readCollections());
        setFilter('');
        setLastAddedCollectionId(null);
        setIsCreatingCollection(false);
        setNewCollectionName('');
    }, [isOpen]);

    const filteredCollections = useMemo(() => {
        const term = filter.trim().toLowerCase();
        if (!term) return collections;
        return collections.filter((collection) => collection.name.toLowerCase().includes(term));
    }, [collections, filter]);

    if (!isOpen) return null;

    const addGameToCollection = (collectionId) => {
        if (!game) return;
        let didAdd = false;
        let targetCollection = null;
        const updatedCollections = collections.map((collection) => {
            if (collection.id !== collectionId) return collection;
            const games = getCollectionGames(collection);
            const exists = games.some((savedGame) => String(savedGame.id) === String(game.id));
            const nextGames = exists
                ? games.map((savedGame) => (
                    String(savedGame.id) === String(game.id)
                        ? { ...game, addedAt: savedGame.addedAt || game.addedAt, updatedAt: new Date().toISOString() }
                        : savedGame
                ))
                : [game, ...games];
            didAdd = !exists;
            targetCollection = {
                ...collection,
                games: nextGames,
                gameCount: nextGames.length,
                updatedAt: new Date().toISOString(),
            };
            return targetCollection;
        });
        setCollections(updatedCollections);
        writeCollections(updatedCollections);
        setLastAddedCollectionId(didAdd ? collectionId : null);
        if (targetCollection) {
            onSaved?.(targetCollection);
            navigate(`/analysis/collection/${getCollectionSlug(targetCollection)}/${encodeURIComponent(game.id)}/analysis`, { replace: true });
        }
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

    const copyShareableLink = async () => {
        if (!game) return;
        const collection = collections.find((item) => getCollectionGames(item).some((savedGame) => String(savedGame.id) === String(game.id)));
        const path = collection
            ? `/analysis/collection/${getCollectionSlug(collection)}/${encodeURIComponent(game.id)}/analysis`
            : `/analysis?game=${encodeURIComponent(game.id)}`;
        const url = `${window.location.origin}${path}`;
        try {
            await navigator.clipboard.writeText(url);
        } catch {
            // Clipboard permission can fail in insecure contexts; the modal should remain usable.
        }
    };

    return (
        <div className="fixed inset-0 z-[6000] flex items-center justify-center">
            <MotionDiv
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/75"
            />
            <MotionDiv
                initial={{ opacity: 0, scale: 0.96 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.96 }}
                className="relative w-[420px] h-[460px] rounded-lg bg-[#272522] border border-[#3a3936] shadow-2xl overflow-hidden flex flex-col"
            >
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
                            const alreadyAdded = games.some((savedGame) => String(savedGame.id) === String(game?.id));
                            const wasJustAdded = lastAddedCollectionId === collection.id && alreadyAdded;
                            return (
                                <button
                                    type="button"
                                    key={collection.id}
                                    onClick={() => addGameToCollection(collection.id)}
                                    className="w-full h-[53px] px-3 flex items-center gap-3 border-b border-[#343330] text-left hover:bg-[#302f2c]"
                                >
                                    <img
                                        src={collectionIconForIndex(index)}
                                        alt=""
                                        className="w-7 h-7 rounded object-cover shrink-0"
                                        draggable="false"
                                    />
                                    <div className="min-w-0 flex-1 truncate text-[#d7d6d4] text-[15px] font-semibold">
                                        {collection.name} <span className="text-[#8f8e8b]">({games.length} {games.length === 1 ? 'game' : 'games'})</span>
                                    </div>
                                    {alreadyAdded ? (
                                        <Check size={23} strokeWidth={3} className={wasJustAdded ? 'text-[#81b64c]' : 'text-[#8f8e8b]'} />
                                    ) : (
                                        <Plus size={26} strokeWidth={3} className="text-[#bab9b8]" />
                                    )}
                                </button>
                            );
                        })
                    ) : (
                        <div className="h-full flex items-center justify-center text-[#8f8e8b] text-[14px] font-semibold">
                            No collections found
                        </div>
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
                    <button type="button" onClick={copyShareableLink} className="mx-auto mt-3 flex items-center justify-center gap-2 text-[#bab9b8] hover:text-white text-[13px] font-bold">
                        <Copy size={17} strokeWidth={2.7} /> Copy Shareable Link
                    </button>
                </div>
            </MotionDiv>
        </div>
    );
};

export default SaveCollectionModal;
