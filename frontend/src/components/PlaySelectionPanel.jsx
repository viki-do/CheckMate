import React from 'react';
import { Zap, Monitor, GraduationCap, Users } from 'lucide-react';
import { useNavigate, useOutletContext } from 'react-router-dom';

const PlaySelectionPanel = () => { 
    const navigate = useNavigate();
    // Itt vesszük át a GameBoard-tól a döntéshozó függvényt
    const context = useOutletContext();
    const handlePlayBots = context?.handlePlayBotsMenuClick;

    return (
        <div className="h-full w-full bg-[#262421] rounded-xl border border-chess-bg overflow-hidden flex flex-col font-sans">
            <div className="p-5 border-b border-[#1b1a18] bg-chess-panel-header flex items-center justify-center gap-3">
                <img src="/assets/logos/play.png" className="w-12 h-12" alt="king" />
                <h2 className="text-2xl font-bold text-white">Play Chess</h2>
            </div>

            <div className="flex-1 p-4 flex flex-col gap-2 overflow-y-auto no-scrollbar bg-[#2b2926]">
                <ModeButton 
                    icon={
                        <img 
                            src="/assets/moves/time-blitz.svg" 
                            alt="Blitz" 
                            className="w-12 h-12 object-contain" 
                        />
                    }
                    title="Play Online"
                    desc="Play vs a person of similar skill"
                />
                <ModeButton 
                    icon={
                        <img 
                            src="/assets/moves/device-bot.svg" 
                            alt="Bots" 
                            className="w-12 h-12 object-contain" 
                        />
                    }
                    title="Play Bots"
                    desc="Challenge a bot from Easy to Master"
                    highlight={true}
                    // Meghívjuk a függvényt, ami eldönti: folytatás vagy lista
                    onClick={handlePlayBots} 
                />
                <ModeButton 
                    icon={
                        <img 
                            src="/assets/logos/coachmagnus-icon.png" 
                            alt="Coach" 
                            className="w-12 h-12 object-contain" 
                        />
                    }
                    title="Play Coach"
                    desc="Learn as you play a game with Coach"
                />
                <ModeButton 
                    icon={
                        <img 
                            src="/assets/moves/hand-shake.svg" 
                            alt="Friends" 
                            className="w-12 h-12 object-contain" 
                        />
                    }
                    title="Play a Friend"
                    desc="Invite a friend to a game of chess"
                />
            </div>
            
            <div className="p-4 bg-[#262421] border-t border-[#1b1a18] h-20">
                <p className="text-[#666] text-xs text-center italic">Choose a mode to start your journey</p>
            </div>
        </div>
    );
};

const ModeButton = ({ icon, title, desc, onClick, highlight }) => (
    <button 
        onClick={onClick}
        className={`w-full flex items-center gap-4 p-4 rounded-xl transition-all border border-transparent text-left group cursor-pointer
        ${highlight ? 'bg-chess-bg hover:border-white/10' : 'bg-chess-panel-header/40 hover:bg-chess-bg hover:border-white/5'}`}
    >
        <div className="shrink-0 transition-transform group-hover:scale-105">{icon}</div>
        <div className="flex-1">
            <h3 className="text-md font-bold text-white">{title}</h3>
            <p className="text-xs text-[#8b8987]">{desc}</p>
        </div>
    </button>
);

export default PlaySelectionPanel;
