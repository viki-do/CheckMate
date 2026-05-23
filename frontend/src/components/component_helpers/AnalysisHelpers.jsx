import React from 'react';
import { ChevronRight, Search } from 'lucide-react';
import { moves as moveAssets } from '../../constants/review';

// Hozzá kell adni az onClick-et a propokhoz és a div-hez is!
export const AnalysisMenuItem = ({ icon, label, onClick }) => (
    <div 
        onClick={onClick} 
        className="flex items-center justify-between p-3 hover:bg-[#312e2b] rounded-md cursor-pointer group transition-colors"
    >
        <div className="flex items-center gap-3">
            <span className="text-[#bab9b8] group-hover:text-white">{icon}</span>
            <span className="text-sm font-bold text-[#bab9b8] group-hover:text-white">{label}</span>
        </div>
        <ChevronRight size={18} className="text-[#5c5a57]" />
    </div>
);

const EvalBox = ({ value }) => {
    const isMate = String(value).startsWith('M');
    const numericEval = parseFloat(value);
    const safeEval = Number.isFinite(numericEval) ? numericEval : 0;
    const isWhiteBetter = isMate ? !String(value).includes('-') : safeEval >= 0;
    return (
        <div className={`w-[52px] h-[22px] flex items-center justify-center rounded-[3px] text-[13px] font-black shrink-0 text-center shadow-sm ${isWhiteBetter ? "bg-white text-black" : "bg-[#121212] text-white border border-white/20"}`}>
            {isMate ? value : (safeEval > 0 ? `+${safeEval.toFixed(2)}` : (safeEval === 0 ? "0.00" : safeEval.toFixed(2)))}
        </div>
    );
};

export const PieceNotation = ({ move, isBlack }) => {
    if (!move || !move.m) return null;

    // Kinyerjük az első karaktert (notációban: N, B, R, Q, K)
    const firstChar = move.m[0];
    
    // Sakk notáció szabály: ha kisbetűvel kezdődik (pl. e4, d5), az gyalog.
    // Ha nem nagybetű, vagy sáncolás (O-O), ne mutasson figurát.
    const isPiece = /^[NBRQK]/.test(firstChar);

    if (!isPiece) return null;

    // Meghatározzuk a színt és a típust a fájlneveidhez
    const color = isBlack ? 'black' : 'white';
    const pieceMap = {
        'N': 'knight',
        'B': 'bishop',
        'R': 'rook',
        'Q': 'queen',
        'K': 'king'
    };

    const pieceType = pieceMap[firstChar];

    return (
        <img 
            src={`/assets/pieces/${color}_${pieceType}.png`} 
            alt={firstChar}
            className="w-[18px] h-[18px] mr-0.5 object-contain inline-block self-center opacity-95"
            // Ha valamiért nem töltene be a kép, ne rontsa el az UI-t
            onError={(e) => { e.target.style.display = 'none'; }}
        />
    );
};

export const EngineLineSpecial = ({ type, eval: ev, text, preview, colorFn, showBorder = true }) => {
    const asset = moveAssets[type?.toLowerCase()];
    const textColor = colorFn(type);
    return (
        <div className={`h-[36px] px-3 cursor-default group ${showBorder ? 'border-b border-[#34322f]' : ''}`}>
            <div className="h-full flex items-center gap-2">
            <EvalBox value={ev} />
            <div className="w-[20px] h-[20px] shrink-0 flex items-center justify-center">
                {asset?.src ? (
                    <img src={asset.src} alt={type} className="w-full h-full object-contain animate-in zoom-in duration-300" />
                ) : (
                    <div className="w-full h-full bg-[#3c3a37] rounded flex items-center justify-center text-[10px]">★</div>
                )}
            </div>
            <div className="flex items-center min-w-0 flex-1 gap-2">
                <span className={`text-[15px] font-black leading-tight truncate ${textColor}`}>{text}</span>
                {preview ? <span className="text-[12px] text-[#bdbbb8] font-bold truncate">{preview}</span> : null}
            </div>
            <Search size={16} strokeWidth={3} className="text-[#8f8e8b] group-hover:text-white shrink-0" />
            </div>
        </div>
    );
};


export const MoveItem = ({ move, isActive, onClick, isBlack, prefixText = '' }) => {
    if (!move) return <div className="flex-1" />;
    const asset = moveAssets[move.analysisLabel?.toLowerCase()];
    
    // Megnézzük, hogy figura-e (N, B, R, Q, K)
    const hasPieceIcon = /^[NBRQK]/.test(move.m[0]);
    // Ha van ikon, a maradék szöveget mutatjuk (pl. Nf3 -> f3), ha nincs, az egészet (pl. e4)
    const displayNotation = hasPieceIcon ? move.m.substring(1) : move.m;

    return (
        <div className="flex items-center justify-start h-full">
            <div 
                onClick={onClick} 
                className={`flex items-center h-[26px] px-1.5 rounded cursor-pointer transition-colors font-bold text-[14px] min-w-[60px] relative ${
                    isActive ? 'bg-[#3c3a37] text-white' : 'text-[#bab9b8] hover:bg-[#312e2b] hover:text-white'
                }`}
            >
                {prefixText ? (
                    <span className="mr-1 text-[12px] text-[#8b8987] font-mono select-none shrink-0">
                        {prefixText}
                    </span>
                ) : null}
                <PieceNotation move={move} isBlack={isBlack} />
                
                <span>{displayNotation}</span>

                {move.analysisLabel && (
    <div className="flex items-center ml-1">
        {asset?.src ? (
            <img src={asset.src} className="w-3.5 h-3.5" alt={move.analysisLabel} />
        ) : (
            <span className="text-[10px] bg-green-600 text-white rounded-full px-1">
                {move.analysisLabel[0].toUpperCase()}
            </span>
        )}
    </div>
)}
            </div>
        </div>
    );
};

export const TabItem = ({ icon, label, active, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        className={`flex-1 flex flex-col items-center py-2.5 cursor-pointer transition-colors border-b-2 bg-transparent ${active ? 'bg-[#262421] border-[#81b64c] text-white' : 'border-transparent text-[#8b8987] hover:bg-[#2b2a27]'}`}
    >
        {icon}
        <span className="text-[9px] font-bold mt-1 uppercase tracking-wider">{label}</span>
    </button>
);

export const ControlBtn = ({ icon, onClick, disabled = false }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        className={`flex-1 py-2 bg-[#312e2b] rounded flex items-center justify-center font-bold text-[#bab9b8] border-b-2 border-black/20 transition-all ${
            disabled
                ? 'opacity-35 cursor-not-allowed'
                : 'hover:bg-[#3d3a37] active:border-b-0 active:translate-y-[1px]'
        }`}
    >
        {icon}
    </button>
);

export const FooterAction = ({ icon, label, onClick, disabled = false }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={disabled ? undefined : onClick}
        className={`flex flex-col items-center justify-center gap-0.5 group px-2 bg-transparent border-0 ${
            disabled ? 'cursor-not-allowed opacity-35' : 'cursor-pointer'
        }`}
    >
        <div className={`transition-colors ${disabled ? 'text-[#6f6d69]' : 'text-[#bab9b8] group-hover:text-white'}`}>{icon}</div>
        <span className={`text-[9px] font-bold uppercase ${disabled ? 'text-[#6f6d69]' : 'text-[#8b8987] group-hover:text-white'}`}>{label}</span>
    </button>
);
