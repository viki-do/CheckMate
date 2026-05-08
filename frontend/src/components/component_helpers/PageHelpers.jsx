
import React from 'react';

 /*---------FOR GAME ARCHIVE--------- */
export const ArchiveSelect = ({ value }) => (
    <div className="relative group">
        <div className="w-full bg-[#1e1e1e] border border-[#3c3a37] p-2.5 rounded text-sm text-[#bab9b8] flex justify-between items-center cursor-pointer hover:border-[#666] transition-colors">
            <span className="font-medium">{value}</span>
            <i className="fas fa-caret-down text-[#666]"></i>
        </div>
    </div>
);

export const StatBar = ({ label, value, color }) => (
    <div className="flex items-center justify-between text-[11px] font-bold">
        <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${color}`}></div>
            <span className="text-[#8b8987] uppercase">{label}</span>
        </div>
        <span className="text-white">{value}%</span>
    </div>
);

export const HeaderSection = ({ icon, title, sub, extra }) => (
    <div className="flex items-center gap-3 mb-6 h-16">
        <div className="shrink-0">{icon}</div>
        <div className="flex flex-col overflow-hidden">
            <span className="text-sm font-bold text-white truncate">{title}</span>
            <span className="text-xs text-[#8b8987] font-bold truncate">
                {sub} {extra && <span className="text-orange-400 ml-1">{extra}</span>}
            </span>
        </div>
    </div>
);

export const StatListItem = ({ icon, label, value, color = "text-[#8b8987]", hasArrow = false, isPuzzleRush = false }) => (
    <div className="flex items-center justify-between p-2 hover:bg-[#312e2b] rounded cursor-pointer group transition-colors">
        <div className="flex items-center gap-3">
            <i className={`fas ${icon} ${color} w-5 text-center text-base`}></i>
            <span className="text-[14px] font-bold text-[#bab9b8] group-hover:text-white transition-colors">{label}</span>
        </div>
        <div className="flex items-center gap-2">
            <span className="text-[14px] font-black text-white flex items-center gap-1">
                {isPuzzleRush && <i className="fas fa-tools text-[10px] text-[#666]"></i>}
                {value}
            </span>
            {hasArrow && <i className="fas fa-chevron-down text-[#666] text-[10px]"></i>}
        </div>
    </div>
);
export const PlayButton = ({ icon, iconSrc, label, onClick, isMain }) => (
    <button onClick={onClick} className="flex items-center gap-4 px-5 h-[79px] rounded-lg bg-[#262421] hover:bg-[#2b2926] border border-[#3c3a37] transition-all group w-full">
        {iconSrc ? (
            <img src={iconSrc} alt="" className={`w-8 h-8 object-contain ${isMain ? '' : 'opacity-75 group-hover:opacity-100'}`} />
        ) : (
            <i className={`fas ${icon} text-2xl ${isMain ? 'text-[#81b64c]' : 'text-[#8b8987] group-hover:text-white'}`}></i>
        )}
        <span className="font-bold text-white text-[15px]">{label}</span>
    </button>
);

export const BoardCard = ({ children, label, onClick }) => (
    <div onClick={onClick} className="bg-[#262421] rounded-lg overflow-hidden cursor-pointer group border border-[#3c3a37] h-[340px] w-[288px] flex flex-col transition-all hover:border-[#4a4845]">
        <div className="w-[288px] h-[288px] relative overflow-hidden flex items-center justify-center bg-[#312e2b]">
            {children}
        </div>
        <div className="h-[52px] w-full flex items-center justify-center bg-[#262421] text-sm font-bold text-white group-hover:bg-[#2b2926] border-t border-[#3c3a37]">
            {label}
        </div>
    </div>
);



