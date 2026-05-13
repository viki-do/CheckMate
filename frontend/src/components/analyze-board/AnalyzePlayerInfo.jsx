import { Settings } from 'lucide-react';
import AnalyzeCapturedRow from './AnalyzeCapturedRow';

const AnalyzePlayerInfo = ({ color, pieces, diff, onDragOver }) => {
    const isWhite = color === 'white';

    return (
        <div
            className="w-170 h-12 flex items-center justify-between text-[#bab9b8]"
            onDragOver={onDragOver}
        >
            <div className="flex items-start gap-3">
                <div className="pt-1">
                    <div className={`w-8 h-8 rounded flex items-end justify-center overflow-hidden shrink-0 ${isWhite ? 'bg-[#eeeeec] border border-black/10 shadow-sm' : 'bg-[#3a3936] border border-white/5'}`}>
                        <i className={`fas fa-user text-[26px] ${isWhite ? 'text-[#d0d0ce]' : 'text-[#151515]'}`}></i>
                        <span className="sr-only">{isWhite ? 'W' : 'B'}</span>
                    </div>
                </div>
                <div className="flex flex-col pt-1">
                    <span className="font-bold text-[15px] leading-none text-[#f0f0ee]">
                        {isWhite ? 'White' : 'Black'}
                    </span>
                    <AnalyzeCapturedRow
                        pieces={pieces}
                        side={color}
                        diff={diff}
                    />
                </div>
            </div>
            {!isWhite && <Settings size={18} className="cursor-pointer hover:text-white transition-colors" />}
        </div>
    );
};

export default AnalyzePlayerInfo;
