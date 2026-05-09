import { ArrowLeft, ChevronDown, ChevronsLeft, ChevronsRight, MoreHorizontal, Plus, Search, Star } from "lucide-react";
import { GameCollections, LoadFromFEN } from "../components/icons/Icons";

const START_BOARD = [
    ["black_rook", "black_knight", "black_bishop", "black_queen", "black_king", "black_bishop", "black_knight", "black_rook"],
    Array(8).fill("black_pawn"),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill(null),
    Array(8).fill("white_pawn"),
    ["white_rook", "white_knight", "white_bishop", "white_queen", "white_king", "white_bishop", "white_knight", "white_rook"],
];

const files = ["a", "b", "c", "d", "e", "f", "g", "h"];

const PlayerStrip = ({ color, position }) => (
    <div className={`ml-12 h-12 flex items-center gap-3 ${position === "bottom" ? "mt-2" : "mb-2"}`}>
        <div className={`w-10 h-10 rounded ${color === "White" ? "bg-[#eeeeec]" : "bg-[#3a3936]"} flex items-end justify-center overflow-hidden shrink-0`}>
            <i className={`fas fa-user text-[32px] ${color === "White" ? "text-[#d0d0ce]" : "text-[#151515]"}`}></i>
        </div>
        <div className="text-white text-[17px] font-black leading-none">{color}</div>
    </div>
);

const StaticBoard = () => (
    <div className="w-[728px]">
        <PlayerStrip color="Black" position="top" />
        <div className="flex items-stretch gap-3">
            <div className="w-9 bg-[#2b2a27] relative">
                <div className="absolute bottom-0 left-0 right-0 h-[51%] bg-[#f3f3f1]"></div>
                <span className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[#2d2c29] text-[11px] font-bold">0.4</span>
            </div>
            <div className="grid grid-cols-8 w-170 h-170 rounded-sm overflow-hidden">
                {START_BOARD.flatMap((row, rowIndex) => row.map((piece, colIndex) => {
                    const isDark = (rowIndex + colIndex) % 2 === 1;
                    return (
                        <div
                            key={`${rowIndex}-${colIndex}`}
                            className={`relative flex items-center justify-center ${isDark ? "bg-[#769954]" : "bg-[#eeeed2]"}`}
                        >
                            {colIndex === 0 && (
                                <span className={`absolute top-1 left-1.5 text-[18px] font-bold ${isDark ? "text-[#eeeed2]" : "text-[#769954]"}`}>
                                    {8 - rowIndex}
                                </span>
                            )}
                            {rowIndex === 7 && (
                                <span className={`absolute bottom-0.5 right-1.5 text-[16px] font-bold ${isDark ? "text-[#eeeed2]" : "text-[#769954]"}`}>
                                    {files[colIndex]}
                                </span>
                            )}
                            {piece && (
                                <img
                                    src={`/assets/pieces/${piece}.png`}
                                    alt=""
                                    draggable="false"
                                    className="w-[88%] h-[88%] object-contain select-none pointer-events-none"
                                />
                            )}
                        </div>
                    );
                }))}
            </div>
        </div>
        <PlayerStrip color="White" position="bottom" />
    </div>
);

const CountBadge = ({ children }) => (
    <span className="ml-2 px-1.5 py-0.5 rounded bg-[#4a4946] text-[#bab9b8] text-[11px] font-black">{children}</span>
);

const FooterButton = ({ icon, label, disabled = false }) => (
    <button
        disabled={disabled}
        className={`flex flex-col items-center justify-center gap-1 text-[13px] font-black ${disabled ? "text-[#6f6e6b]" : "text-[#9f9e9b] hover:text-white"}`}
    >
        {icon}
        {label && <span>{label}</span>}
    </button>
);

const GameCollectionsPanel = () => (
    <div className="w-[450px] h-[740px] bg-[#1f1e1b] rounded-md shadow-2xl border border-[#252420] flex flex-col overflow-hidden">
        <div className="h-15 flex items-center px-5 gap-3 shrink-0">
            <button className="text-[#a8a7a5] hover:text-white">
                <ArrowLeft size={27} strokeWidth={3} />
            </button>
            <GameCollections size={26} className="text-[#a8a7a5]" />
            <h1 className="text-white text-[20px] font-black">Game Collections</h1>
        </div>

        <div className="px-4 pb-3 flex items-center gap-3 shrink-0">
            <div className="relative flex-1">
                <Search size={23} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#999896]" />
                <input
                    readOnly
                    placeholder="Search Game Collections"
                    className="w-full h-11 bg-[#343330] border border-[#4a4845] rounded-md pl-10 pr-3 text-[#d7d6d4] placeholder:text-[#8b8987] text-[14px] font-semibold outline-none"
                />
            </div>
            <button className="flex items-center gap-1 text-[#8f8e8b] hover:text-white font-black text-[14px]">
                Sort <ChevronDown size={18} />
            </button>
            <button className="h-11 px-4 rounded-md bg-gradient-to-b from-[#8bc34a] to-[#5fa444] text-white text-[14px] font-black shadow-md hover:from-[#9bd45c] hover:to-[#6cb64e]">
                New
            </button>
        </div>

        <div className="grid grid-cols-2 border-b border-[#3a3936] shrink-0">
            {[
                ["Your collections", "0", true],
                ["Shared with you", "0", false],
            ].map(([label, count, active]) => (
                <button
                    key={label}
                    className={`h-14 px-4 text-left text-[14px] font-black relative ${active ? "text-[#d7d6d4]" : "text-[#92918f]"}`}
                >
                    {label}<CountBadge>{count}</CountBadge>
                    {active && <span className="absolute left-0 right-0 bottom-0 h-1 bg-[#d7d6d4]"></span>}
                </button>
            ))}
        </div>

        <div className="flex-1 flex flex-col items-center justify-center text-center px-8">
            <div className="text-[#d7d6d4] mb-6">
                <LoadFromFEN size={44} />
            </div>
            <div className="text-[#d7d6d4] text-[14px] font-black mb-6">You haven't created any Game Collections yet</div>
            <button className="h-11 px-5 rounded-md bg-gradient-to-b from-[#3a3936] to-[#2d2c29] text-[#d7d6d4] text-[14px] font-black shadow hover:from-[#45433f] hover:to-[#343330]">
                Create Collection
            </button>
        </div>

        <div className="border-t border-[#343330] px-3 py-3 shrink-0">
            <div className="grid grid-cols-4 gap-2 mb-4">
                <button className="h-12 rounded-lg bg-gradient-to-b from-[#2c2b28] to-[#242320] text-[#777673] flex items-center justify-center"><ChevronsLeft size={27} /></button>
                <button className="h-12 rounded-lg bg-gradient-to-b from-[#2c2b28] to-[#242320] text-[#777673] flex items-center justify-center"><ArrowLeft size={27} /></button>
                <button className="h-12 rounded-lg bg-gradient-to-b from-[#2c2b28] to-[#242320] text-[#777673] flex items-center justify-center rotate-180"><ArrowLeft size={27} /></button>
                <button className="h-12 rounded-lg bg-gradient-to-b from-[#2c2b28] to-[#242320] text-[#777673] flex items-center justify-center"><ChevronsRight size={27} /></button>
            </div>
            <div className="grid grid-cols-4 items-center">
                <FooterButton icon={<Search size={23} />} label="New" />
                <FooterButton icon={<Plus size={23} />} label="Save" disabled />
                <FooterButton icon={<Star size={23} />} label="Review" disabled />
                <FooterButton icon={<MoreHorizontal size={25} />} label="" />
            </div>
        </div>
    </div>
);

const GameCollectionsPage = () => (
    <div className="h-screen bg-[#302f2c] text-white px-6 overflow-hidden">
        <div className="h-full mx-auto flex items-center justify-center gap-6">
            <StaticBoard />
            <GameCollectionsPanel />
        </div>
    </div>
);

export default GameCollectionsPage;
