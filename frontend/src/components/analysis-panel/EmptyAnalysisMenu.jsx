import { Upload } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LoadPrevious } from '../icons/Icons';

const cardBaseClass = "rounded-lg border border-[#3f3d39] bg-gradient-to-b from-[#3a3935] to-[#2c2a27] text-[#e7e6e3] shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_2px_6px_rgba(0,0,0,0.22)] hover:from-[#42403c] hover:to-[#302f2b] transition-colors";

const AssetIcon = ({ name, size = 26, className = "" }) => (
    <img
        src={`/assets/icons/${name}`}
        alt=""
        width={size}
        height={size}
        className={`shrink-0 object-contain ${className}`}
        draggable="false"
    />
);

const AnalysisCard = ({ icon, label, onClick, className = "" }) => (
    <button
        type="button"
        onClick={onClick}
        className={`${cardBaseClass} h-[54px] w-full flex items-center justify-center gap-3 px-4 text-[18px] font-black ${className}`}
    >
        <span className="text-[#d5d4d1]">{icon}</span>
        <span>{label}</span>
    </button>
);

const EmptyAnalysisMenu = ({ onSetupClick, onStartAnalysis, onExploreClick, onGameHistoryClick }) => {
    const navigate = useNavigate();
    const [analysisInput, setAnalysisInput] = useState('');

    const openSavedAnalysis = () => {
        window.open('/analysis/saved', '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="flex flex-col h-full bg-[#262421] overflow-hidden">
            <div className="flex-1 overflow-hidden px-4 pt-3.5 pb-2 flex flex-col">
                <div>
                <div className="space-y-2.5">
                    <AnalysisCard icon={<AssetIcon name="classroom.svg" />} label="Classroom" />
                    <AnalysisCard icon={<AssetIcon name="explorer.svg" />} label="Explore" onClick={onExploreClick} />
                    <AnalysisCard
                        icon={<AssetIcon name="board-stack-green.svg" />}
                        label="Game Collections"
                        onClick={() => navigate('/analysis/collections')}
                    />
                </div>

                <div className="mt-3.5 rounded-lg border border-[#3f3d39] bg-[#393733] overflow-hidden">
                    <textarea
                        value={analysisInput}
                        onChange={(event) => setAnalysisInput(event.target.value)}
                        className="w-full h-[150px] bg-transparent px-3 py-3 text-[13px] font-semibold text-[#d0cfcc] placeholder:text-[#8c8a86] focus:outline-none resize-none overflow-y-auto pgn-input-scrollbar"
                        placeholder="Paste your FEN, PGN(s), or drag & drop your PGN file here."
                    />
                    <button
                        type="button"
                        className="w-full h-[46px] flex items-center justify-center gap-2 border-t border-[#4a4844] text-[#d3d2cf] hover:text-white hover:bg-[#403e3a] transition-colors text-[14px] font-bold"
                    >
                        <Upload size={18} strokeWidth={3} />
                        Upload File
                    </button>
                </div>

                <div className="mt-2.5 grid grid-cols-2 gap-2">
                    <AnalysisCard
                        icon={<AssetIcon name="tactics-basic.svg" size={24} />}
                        label="Saved Analysis"
                        onClick={openSavedAnalysis}
                        className="h-[50px] text-[15px]"
                    />
                    <AnalysisCard
                        icon={<AssetIcon name="board-challenge-link.svg" size={24} />}
                        label="Import Study"
                        className="h-[50px] text-[15px]"
                    />
                    <AnalysisCard
                        icon={<AssetIcon name="board-archive.svg" size={24} />}
                        label="Game History"
                        onClick={onGameHistoryClick}
                        className="h-[50px] text-[15px]"
                    />
                    <AnalysisCard
                        icon={<AssetIcon name="board-pen.svg" size={24} />}
                        label="Set Up Position"
                        onClick={onSetupClick}
                        className="h-[50px] text-[15px]"
                    />
                </div>
                </div>

                <button
                    type="button"
                    onClick={() => onStartAnalysis(analysisInput)}
                    className="mt-auto mb-auto w-full h-[54px] rounded-lg bg-[#79b548] hover:bg-[#8bc455] text-white text-[22px] font-black shadow-[inset_0_1px_0_rgba(255,255,255,0.16),0_3px_0_rgba(0,0,0,0.25)] transition-colors"
                >
                    Start Analysis
                </button>
            </div>

            <button
                type="button"
                className="h-[44px] px-5 flex items-center gap-3 border-t border-[#34322f] bg-[#1f1e1b] text-[#bdbbb8] hover:text-white text-[14px] font-bold shrink-0"
            >
                <LoadPrevious size={18} />
                Load Previous
            </button>
        </div>
    );
};

export default EmptyAnalysisMenu;
