import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import axios from 'axios';
import { API_BASE, profileAvatarSrc } from '../config/api';

const getAvatarSrc = profileAvatarSrc;

const Navbar = () => {
    const navigate = useNavigate();
    const location = useLocation();
    const username = localStorage.getItem('chessUsername');
    const [isPlayHovered, setIsPlayHovered] = useState(false);
    const [isOtherHovered, setIsOtherHovered] = useState(false);
    const [avatarUrl, setAvatarUrl] = useState("");

    useEffect(() => {
        const token = localStorage.getItem('chessToken');
        if (!token) return;

        let isMounted = true;
        axios.get(`${API_BASE}/profile`, {
            headers: { Authorization: `Bearer ${token}` },
        }).then((res) => {
            if (isMounted) setAvatarUrl(res.data.avatar_url || "");
        }).catch(() => {});

        const handleAvatarUpdated = (event) => {
            setAvatarUrl(event.detail?.avatarUrl || "");
        };
        window.addEventListener("profile-avatar-updated", handleAvatarUpdated);

        return () => {
            isMounted = false;
            window.removeEventListener("profile-avatar-updated", handleAvatarUpdated);
        };
    }, []);

    const handleLogout = () => {
        localStorage.clear();
        navigate('/login');
        window.location.reload();
    };

    const isActive = (path) => location.pathname.startsWith(path);

    return (
        <aside className="fixed inset-x-0 bottom-0 z-[1000] h-16 border-t border-[#3c3a37] bg-[#262421] md:sticky md:top-0 md:left-0 md:h-screen md:w-36 md:shrink-0 md:flex-col md:border-r md:border-t-0 md:py-4 lg:w-40 flex">
            {/* Logo */}
            <div
                onClick={() => navigate('/home')}
                className="hidden flex-col items-center gap-1 mb-8 no-underline text-white group px-2 text-center cursor-pointer md:flex"
            >
                <img
                    src="/assets/logos/chess.png"
                    className="w-10 transition-transform group-hover:scale-110"
                    alt="logo"
                />
                <span className="font-bold text-lg leading-tight tracking-tight">
                    Checkmate<span className="text-[#81b64c]">.com</span>
                </span>
            </div>

            <nav className="relative grid flex-1 grid-cols-5 gap-1 px-1 py-1 md:flex md:flex-col md:py-0">
                
                {/* --- PLAY DROPDOWN CONTAINER --- */}
                <div 
                    className="relative"
                    onMouseEnter={() => setIsPlayHovered(true)}
                    onMouseLeave={() => setIsPlayHovered(false)}
                >
                    {isPlayHovered && (
                        <div className="absolute left-full top-0 w-2 h-48 z-[1990]" />
                    )}
                    <NavItem
                        to="/play"
                        icon={
                            <img 
                                src="/assets/logos/play.png" 
                                alt="Bots" 
                                className="w-5 h-5 object-contain" 
                            />
                        }
                        label="Play"
                        active={isActive('/play')}
                    />

                    {/* DROPDOWN MENU */}
                    {isPlayHovered && (
                        <div className="absolute left-full top-0 ml-1 w-72 bg-[#171614] border border-[#3c3a37] rounded-r-lg shadow-2xl py-2 z-[2000] overflow-hidden">
                            <DropdownItem 
                                icon={
                                    <img 
                                        src="/assets/logos/play.png" 
                                        alt="Bots" 
                                        className="w-5 h-5 object-contain" 
                                    />
                                }
                                label="Play Online" 
                                onClick={() => navigate('/play')} 
                            />
                            <DropdownItem 
                                icon={
                                    <img 
                                        src="/assets/moves/device-bot.svg" 
                                        alt="Bots" 
                                        className="w-5 h-5 object-contain" 
                                    />
                                } 
                                label="Play Bots" 
                                onClick={() => navigate('/play/bots')} 
                            />
                            <DropdownItem 
                                icon={
                                    <img 
                                        src="/assets/logos/coachmagnus-icon.png" 
                                        alt="Bots" 
                                        className="w-5 h-5 object-contain" 
                                    />
                                }
                                label="Play Coach" 
                                onClick={() => navigate('/analysis')} 
                            />
                            <DropdownItem 
                                icon={
                                    <img 
                                        src="/assets/logos/board-archive.svg" 
                                        alt="Bots" 
                                        className="w-5 h-5 object-contain" 
                                    />
                                }
                                label="Game History" 
                                onClick={() => navigate(`/member/${username}/games`)} 
                            />
                        </div>
                    )}
                </div>

                <NavItem
                    to="/puzzles"
                    icon={
                        <img 
                            src="/assets/logos/puzzle.png" 
                            alt="Bots" 
                            className="w-5 h-5 object-contain" 
                        />
                    }
                    label="Puzzles"
                    active={isActive('/puzzles')}
                />
                <NavItem
                    to="/learn"
                    icon={
                        <img 
                            src="/assets/logos/learn.png" 
                            alt="Bots" 
                            className="w-5 h-5 object-contain" 
                        />
                    }
                    label="Learn"
                    active={isActive('/learn')}
                />
    
                <a 
                    href="/analysis"
                    onClick={() => {
                        // Töröljük a cache-t a biztonság kedvéért még az újratöltés előtt
                        localStorage.removeItem('chess_analysis_cache');
                        // Ha már ott vagyunk, az href alapból újratöltené, de így biztosabb:
                        if (window.location.pathname === '/analysis') {
                            window.location.reload();
                        }
                    }}
                    className="no-underline" // hogy ne legyen kék/aláhúzott
                >
                    <NavItem
                        to="/analysis"
                        icon={
                            <img 
                                src="/assets/moves/analysis.svg" 
                                alt="Analysis" 
                                className="w-5 h-5 object-contain" 
                            />
                        }
                        label="Analysis"
                        active={isActive('/analysis')}
                    />
                </a>

                <div
                    className="relative"
                    onMouseEnter={() => setIsOtherHovered(true)}
                    onMouseLeave={() => setIsOtherHovered(false)}
                >
                    {isOtherHovered && (
                        <div className="absolute left-full top-0 w-2 h-28 z-[1990]" />
                    )}
                    <button
                        className={`w-full h-full flex flex-col md:flex-row items-center justify-center md:justify-start gap-1 md:gap-3 px-2 md:px-3 py-2 md:py-3 rounded-lg transition-all relative group cursor-pointer ${
                            isOtherHovered
                                ? 'bg-[#312e2b] text-white shadow-sm'
                                : 'text-[#bab9b8] hover:bg-[#312e2b] hover:text-white'
                        }`}
                    >
                        <span className={`${isOtherHovered ? 'text-[#81b64c]' : 'text-[#bab9b8] group-hover:text-white'}`}>
                            <MoreHorizontal size={20} />
                        </span>
                        <span className="text-[11px] md:text-[15px] font-bold leading-none">Other</span>
                    </button>

                    {isOtherHovered && (
                        <div className="absolute left-full top-0 ml-1 w-72 bg-[#171614] border border-[#3c3a37] rounded-r-lg shadow-2xl py-2 z-[2000] overflow-hidden">
                            <DropdownItem
                                icon={
                                    <img 
                                        src="/assets/moves/collections.svg" 
                                        alt="Bots" 
                                        className="w-5 h-5 object-contain" 
                                    />
                                }
                                label="Collections"
                                onClick={() => navigate('/analysis/collections')}
                            />
                            <DropdownItem
                                icon={
                                    <img 
                                        src="/assets/moves/chess_database.svg" 
                                        alt="Bots" 
                                        className="w-5 h-5 object-contain" 
                                    />
                                }
                                label="Game Database"
                                onClick={() => navigate('/games')}
                            />
                        </div>
                    )}
                </div>
            </nav>

            {/* Footer Buttons */}
            <div className="mt-auto hidden flex-col gap-2 px-2 pt-4 border-t border-[#3c3a37] md:flex">
                <div
                    onClick={() => navigate(`/member/${username}`)}
                    className={`w-full min-w-0 flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-all ${location.pathname.startsWith('/member') ? 'bg-[#312e2b] text-white' : 'text-[#bab9b8] hover:bg-[#312e2b] hover:text-white'}`}
                >
                    <div className="w-6 h-6 bg-[#3c3a37] rounded flex justify-center items-center overflow-hidden">
                        <img src={getAvatarSrc(avatarUrl)} alt="Profile" className="w-full h-full object-cover" />
                    </div>
                    <span className="text-sm font-semibold truncate">{username}</span>
                </div>
                <button
                    onClick={handleLogout}
                    className="w-full flex items-center justify-center gap-2 px-3 py-2 text-[#bab9b8] hover:bg-[#312e2b] hover:text-white rounded-lg transition-all cursor-pointer"
                    title="Logout"
                >
                    <span className="text-sm font-bold">Log Out</span>
                    <ImageIcon src="/assets/logos/logout.svg" alt="Logout" className="w-5 h-5" />
                </button>
            </div>
        </aside>
    );
};

// --- SEGÉDKOMPONENSEK ---

const ImageIcon = ({ src, alt, className = 'w-5 h-5' }) => (
    <img
        src={src}
        alt={alt}
        className={`${className} object-contain`}
    />
);

const NavItem = ({ to, icon, label, active, badge }) => (
    <Link
        to={to}
        className={`relative group flex h-full flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 transition-all md:h-auto md:flex-row md:justify-start md:gap-3 md:px-3 md:py-3 ${
            active
            ? 'bg-[#312e2b] text-white shadow-sm'
            : 'text-[#bab9b8] hover:bg-[#312e2b] hover:text-white'
        }`}
    >
        <span className={`${active ? 'text-[#81b64c]' : 'text-[#bab9b8] group-hover:text-white'}`}>
            {icon}
        </span>
        <span className="text-[11px] md:text-[15px] font-bold leading-none">{label}</span>
        {badge && (
            <span className="absolute right-2 w-5 h-5 bg-[#e74c3c] text-[11px] text-white rounded-full flex items-center justify-center font-bold">
                {badge}
            </span>
        )}
    </Link>
);

const DropdownItem = ({ icon, label, onClick }) => (
    <button 
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-2.5 text-[#bab9b8] hover:bg-[#312e2b] hover:text-white transition-all text-left"
    >
        <span className="text-[#81b64c] opacity-80">{icon}</span>
        <span className="text-sm font-bold">{label}</span>
    </button>
);

export default Navbar;
