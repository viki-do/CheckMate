import { useEffect, useState } from 'react';
import axios from 'axios';
import { BookOpen, ChevronDown, ChevronUp, Compass, Download, Filter, List, PencilLine, Settings, Share2, Trash2 } from 'lucide-react';
import { DocumentFolderBoard, GameCollections, New } from '../icons/Icons';
import { TabItem } from '../component_helpers/AnalysisHelpers';
import AnalysisMoveRows from './AnalysisMoveRows';
import EngineLinesSection from './EngineLinesSection';

const getGamesMoveRows = (history) => {
    const rows = [];
    for (let index = 0; index < history.length; index += 2) {
        rows.push({
            moveNumber: Math.floor(index / 2) + 1,
            white: history[index],
            black: history[index + 1],
        });
    }
    return rows;
};

const ActiveAnalysisView = ({
    history,
    viewIndex,
    openingName,
    currentFen,
    gameInfo,
    currentMoveData,
    engineLinesToDisplay,
    statusText,
    resultLabel,
    onViewMove,
    activeTab = 'analysis',
    hideTabs = false,
    onAnalysisTabClick,
    onGamesTabClick,
    onExploreTabClick,
    onTooltipChange,
    hideMoveJudgement = false,
    showOnlyActiveMoveLabels = false,
    revealedMoveLabelIndex = null,
    apiBase,
    token,
}) => {
    const [isGamesRowOpen, setIsGamesRowOpen] = useState(true);
    const [exploreRows, setExploreRows] = useState([]);
    const [exploreTotal, setExploreTotal] = useState(0);
    const [isExploreLoading, setIsExploreLoading] = useState(false);
    const [didLoadExploreStats, setDidLoadExploreStats] = useState(false);
    const [exploreError, setExploreError] = useState('');
    const gamesMoveRows = getGamesMoveRows(history);
    const hasGameHeader = Boolean(gameInfo?.white || gameInfo?.black || gameInfo?.result);
    const exploreMoveKey = history.map((move) => move?.m).filter(Boolean).join(',');
    const exploreLineText = history.map((move, index) => (
        `${index % 2 === 0 ? `${Math.floor(index / 2) + 1}. ` : ''}${move.m}`
    )).join(' ');

    useEffect(() => {
        if (activeTab !== 'explore' || !apiBase || !token || didLoadExploreStats) return;

        let isMounted = true;
        const loadExploreStats = async () => {
            setIsExploreLoading(true);
            try {
                setExploreError('');
                const endpoint = exploreMoveKey
                    ? `${apiBase}/database/explore/next-moves?moves=${encodeURIComponent(exploreMoveKey)}`
                    : `${apiBase}/database/explore/next-moves`;
                const res = await axios.get(endpoint, {
                    headers: { Authorization: `Bearer ${token}` },
                });
                if (!isMounted) return;
                setExploreRows(res.data?.rows || []);
                setExploreTotal(res.data?.total_games || 0);
                setDidLoadExploreStats(true);
            } catch (err) {
                console.error('Explore stats failed:', err);
                if (isMounted) {
                    setExploreError('Could not load explore data');
                    setDidLoadExploreStats(true);
                }
            } finally {
                if (isMounted) setIsExploreLoading(false);
            }
        };

        loadExploreStats();
        return () => { isMounted = false; };
    }, [activeTab, apiBase, token, didLoadExploreStats, exploreMoveKey]);

    useEffect(() => {
        setExploreRows([]);
        setExploreTotal(0);
        setExploreError('');
        setDidLoadExploreStats(false);
    }, [exploreMoveKey]);

    return (
    <div className="flex flex-col h-full">
        {!hideTabs && <div className="flex bg-[#21201d] border-b border-[#3c3a37] shrink-0">
            <TabItem icon={<New size={18} />} label="Analysis" active={activeTab === 'analysis'} onClick={onAnalysisTabClick} />
            <TabItem icon={<DocumentFolderBoard size={18} />} label="Games" active={activeTab === 'games'} onClick={onGamesTabClick} />
            <TabItem icon={<Compass size={18} strokeWidth={2.7} />} label="Explore" active={activeTab === 'explore'} onClick={onExploreTabClick} />
        </div>}

        {activeTab === 'games' ? (
            <div className="flex-1 bg-[#262421] flex flex-col">
                <div className="h-12 px-4 flex items-center justify-between border-b border-[#3c3a37]/50 shrink-0">
                    <button type="button" className="flex items-center gap-2 text-[#bab9b8] hover:text-white text-[14px] font-bold">
                        <GameCollections size={19} /> Add Games
                    </button>
                    <div className="flex items-center gap-4 text-[#a8a7a5]">
                        <button type="button" className="hover:text-white"><Share2 size={18} strokeWidth={3} /></button>
                        <button type="button" className="hover:text-white"><List size={20} strokeWidth={3} /></button>
                    </div>
                </div>
                <div className={`border-b border-[#3c3a37] ${isGamesRowOpen ? 'bg-[#302f2c]' : 'bg-[#24231f]'} shrink-0`}>
                    <button
                        type="button"
                        onClick={() => setIsGamesRowOpen((current) => !current)}
                        className={`w-full px-4 grid grid-cols-[minmax(0,1fr)_38px] gap-2 text-left items-center ${isGamesRowOpen ? 'pt-3 pb-2' : 'h-16'}`}
                    >
                        <div className="min-w-0">
                            <div className="text-[#d7d6d4] text-[14px] font-bold leading-5">White</div>
                            <div className="text-[#d7d6d4] text-[14px] font-bold leading-5">Black</div>
                        </div>
                        <div className="flex items-center justify-end gap-2 text-[#d7d6d4] text-[14px] font-bold">
                            <span>*</span>
                            {isGamesRowOpen ? (
                                <ChevronUp size={18} strokeWidth={3} className="text-[#bab9b8]" />
                            ) : (
                                <ChevronDown size={18} strokeWidth={3} className="text-[#bab9b8]" />
                            )}
                        </div>
                    </button>
                    {isGamesRowOpen && (
                    <>
                    <div className="px-4 pb-3 max-h-[190px] overflow-y-auto collection-scrollbar">
                        {gamesMoveRows.length > 0 ? (
                            gamesMoveRows.map((row, rowIndex) => (
                                <div
                                    key={row.moveNumber}
                                    className={`grid grid-cols-[54px_1fr_1fr] h-8 px-3 items-center text-[#c9c8c5] text-[14px] font-bold ${rowIndex % 2 === 0 ? 'bg-[#34332f]' : 'bg-[#302f2c]'}`}
                                >
                                    <div className="text-[#9f9e9b]">{row.moveNumber}.</div>
                                    <button
                                        type="button"
                                        onClick={() => row.white && onViewMove(row.moveNumber * 2 - 2)}
                                        className={`text-left truncate ${viewIndex === row.moveNumber * 2 - 2 ? 'text-white' : 'hover:text-white'}`}
                                    >
                                        {row.white?.m || ''}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => row.black && onViewMove(row.moveNumber * 2 - 1)}
                                        className={`text-left truncate ${viewIndex === row.moveNumber * 2 - 1 ? 'text-white' : 'hover:text-white'}`}
                                    >
                                        {row.black?.m || ''}
                                    </button>
                                </div>
                            ))
                        ) : (
                            <div className="h-20 flex items-center justify-center text-[#8f8e8b] text-[13px] font-semibold">
                                No move list available
                            </div>
                        )}
                    </div>
                    <div className="h-10 px-4 pb-3 flex items-center justify-between text-[#9f9e9b]">
                        <div className="flex items-center gap-4">
                            <button type="button" title="Remove from collection" className="hover:text-white">
                                <Trash2 size={23} strokeWidth={2.6} />
                            </button>
                            <button type="button" title="Edit note" className="hover:text-white">
                                <PencilLine size={23} strokeWidth={2.6} />
                            </button>
                        </div>
                        <div className="flex items-center gap-5">
                            <button type="button" title="Review" className="hover:text-white">
                                <New size={24} />
                            </button>
                            <button type="button" title="Download" className="hover:text-white">
                                <Download size={22} strokeWidth={3} />
                            </button>
                        </div>
                    </div>
                    </>
                    )}
                </div>
                <div className="flex-1 bg-[#262421]" />
            </div>
        ) : activeTab === 'explore' ? (
            <div className="flex-1 bg-[#262421] flex flex-col min-h-0">
                <div className="px-3 py-2 flex items-center justify-between bg-[#262421] shrink-0">
                    <div className="flex items-center gap-2">
                        <div className="w-7 h-3.5 bg-[#3c3a37] rounded-full relative">
                            <div className="absolute left-0.5 top-0.5 w-2.5 h-2.5 bg-[#81b64c] rounded-full" />
                        </div>
                        <span className="text-[10px] font-bold text-[#bab9b8] uppercase tracking-tighter">Analysis</span>
                    </div>
                    <div className="text-[#8b8987] text-[11px] flex items-center gap-1 opacity-80">
                        <Settings size={12} className="rotate-90" /> depth=20
                    </div>
                </div>

                <div className="px-2 pt-1 shrink-0 border-b border-[#3c3a37]/50">
                    <EngineLinesSection
                        currentMoveData={currentMoveData}
                        engineLinesToDisplay={engineLinesToDisplay}
                        onTooltipChange={onTooltipChange}
                        hideMoveJudgement
                    />
                </div>

                <div className="h-10 px-3 flex items-center gap-2 border-b border-[#3c3a37]/60 text-[#bab9b8] shrink-0">
                    <Compass size={18} strokeWidth={2.5} />
                    <span className="text-[14px] font-semibold truncate">
                        {exploreLineText || 'Starting Position'}
                    </span>
                </div>

                <div className="flex-1 overflow-y-auto no-scrollbar px-3 py-4 min-h-0">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <div className="text-[#d7d6d4] text-[15px] font-bold">All Database Games</div>
                            <div className="text-[#8f8e8b] text-[11px] font-semibold">{exploreTotal.toLocaleString()} games</div>
                        </div>
                        <button type="button" className="text-[#bdbbb8] hover:text-white" title="Filter">
                            <Filter size={20} fill="currentColor" />
                        </button>
                    </div>

                    {isExploreLoading ? (
                        <div className="h-24 flex items-center justify-center text-[#8f8e8b] text-[13px] font-semibold">
                            Loading explore data...
                        </div>
                    ) : exploreError ? (
                        <div className="h-24 flex items-center justify-center text-[#f87171] text-[13px] font-semibold">
                            {exploreError}
                        </div>
                    ) : exploreRows.length === 0 ? (
                        <div className="h-24 flex items-center justify-center text-[#8f8e8b] text-[13px] font-semibold">
                            No database move stats yet
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {exploreRows.map((row) => {
                                const whiteWidth = Math.max(0, Math.min(100, Number(row.white_win_percent) || 0));
                                const drawWidth = Math.max(0, Math.min(100 - whiteWidth, Number(row.draw_percent) || 0));
                                const blackWidth = Math.max(0, 100 - whiteWidth - drawWidth);
                                const evalValue = typeof row.eval === 'number'
                                    ? `${row.eval > 0 ? '+' : ''}${row.eval.toFixed(2)}`
                                    : (row.eval || '-');
                                return (
                                    <div key={row.move} className="grid grid-cols-[105px_58px_74px_58px_minmax(0,1fr)] items-center gap-2 text-[14px] font-bold">
                                        <div className="text-white truncate">{row.display_move || row.move}</div>
                                        <div className="text-[#bab9b8] text-right">{Math.round(row.percent)}%</div>
                                        <div className="text-[#bab9b8] text-right">{Number(row.games || 0).toLocaleString()}</div>
                                        <div className={`h-[22px] rounded-[3px] flex items-center justify-center ${String(evalValue).startsWith('-') ? 'bg-[#2f2d29] text-white' : 'bg-white text-[#3c3a37]'}`}>
                                            {evalValue}
                                        </div>
                                        <div className="h-[22px] bg-[#3a3835] rounded-[3px] overflow-hidden flex text-[12px] font-black">
                                            <div className="bg-white text-[#77736f] flex items-center pl-2" style={{ width: `${whiteWidth}%` }}>
                                                {Math.round(row.white_win_percent)}%
                                            </div>
                                            <div className="bg-[#77736f]" style={{ width: `${drawWidth}%` }} />
                                            <div className="flex-1 bg-[#3a3835] text-white flex items-center justify-end pr-2" style={{ width: `${blackWidth}%` }}>
                                                {Math.round(row.black_win_percent)}%
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        ) : (
        <>
            <div className="px-3 py-2 flex items-center justify-between bg-[#262421] shrink-0">
            <div className="flex items-center gap-2">
                <div className="w-7 h-3.5 bg-[#3c3a37] rounded-full relative cursor-pointer">
                    <div className="absolute left-0.5 top-0.5 w-2.5 h-2.5 bg-[#81b64c] rounded-full" />
                </div>
                <span className="text-[10px] font-bold text-[#bab9b8] uppercase tracking-tighter">Analysis</span>
            </div>
            <div className="text-[#8b8987] text-[11px] flex items-center gap-1 opacity-80">
                <Settings size={12} className="rotate-90"/> depth=20
            </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar bg-[#262421] px-2 pt-1 flex flex-col min-h-0">
            <EngineLinesSection
                currentMoveData={currentMoveData}
                engineLinesToDisplay={engineLinesToDisplay}
                onTooltipChange={onTooltipChange}
                hideMoveJudgement={hideMoveJudgement}
            />

            <div className="flex items-center justify-between py-2 px-1 text-[11px] text-[#8b8987] border-b border-[#3c3a37]/50 mt-1 shrink-0">
                <span className="truncate">{statusText || openingName || "Analysis started"}</span>
                <BookOpen size={14} className="shrink-0 ml-2" />
            </div>

            {hasGameHeader && (
                <div className="min-h-[42px] px-2.5 flex items-center justify-between border-b border-[#3c3a37]/70 bg-[#24231f] shrink-0">
                    <div className="min-w-0 flex items-baseline gap-1.5 text-[15px] font-black">
                        {gameInfo?.white ? <span className="truncate text-white">{gameInfo.white}</span> : null}
                        {(gameInfo?.white || gameInfo?.black) ? <span className="text-[#bdbbb8] shrink-0">-</span> : null}
                        {gameInfo?.black ? <span className="truncate text-white">{gameInfo.black}</span> : null}
                        {gameInfo?.result ? <span className="text-[#bdbbb8] font-bold shrink-0">{gameInfo.result}</span> : null}
                    </div>
                    <button type="button" className="ml-3 text-[#bdbbb8] hover:text-white shrink-0" title="Edit game details">
                        <PencilLine size={20} strokeWidth={3} />
                    </button>
                </div>
            )}

            <AnalysisMoveRows
                history={history}
                viewIndex={viewIndex}
                currentFen={currentFen}
                resultLabel={resultLabel}
                statusText={statusText}
                currentMoveData={currentMoveData}
                onViewMove={onViewMove}
                showOnlyActiveMoveLabels={showOnlyActiveMoveLabels}
                revealedMoveLabelIndex={revealedMoveLabelIndex}
            />
        </div>
        </>
        )}
    </div>
    );
};

export default ActiveAnalysisView;
