import { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { useParams, useNavigate } from 'react-router-dom';
import ProfileGameHistory from '../components/profile/ProfileGameHistory';
import ProfileHeader from '../components/profile/ProfileHeader';
import ProfileSearchPanel from '../components/profile/ProfileSearchPanel';
import ProfileTabs from '../components/profile/ProfileTabs';
import { API_BASE } from '../config/api';

const ProfilePage = ({ archiveMode = false }) => {
    const { username: urlUsername } = useParams();
    const navigate = useNavigate();

    const [user, setUser] = useState({ username: '', email: '', provider: '', bio: '', about_me: '', avatar_url: '', joined: 'Apr 8, 2026' });
    const [history, setHistory] = useState([]);
    const [historyTotal, setHistoryTotal] = useState(0);
    const [isHistoryLoading, setIsHistoryLoading] = useState(false);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [selectedGameType] = useState("All Recent Games");
    const [isResultOpen, setIsResultOpen] = useState(false);
    const [selectedResult, setSelectedResult] = useState("Any Result");
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [dropdownDirection, setDropdownDirection] = useState('down');
    const [dropdownStyle, setDropdownStyle] = useState({});
    const resultButtonRef = useRef(null);
    const [showStartDate, setShowStartDate] = useState(false);
    const [showEndDate, setShowEndDate] = useState(false);
    const [startDate, setStartDate] = useState("");
    const [endDate, setEndDate] = useState("");

    const token = localStorage.getItem('chessToken');

    const calculateDropdownStyle = useCallback((direction = dropdownDirection) => {
        if (!resultButtonRef.current) return {};
        const rect = resultButtonRef.current.getBoundingClientRect();
        const listHeight = 520;

        const style = {
            width: rect.width,
            left: rect.left,
            position: 'fixed',
            zIndex: 9999
        };

        if (direction === 'up') {
            const calculatedTop = Math.max(10, rect.top - listHeight);
            style.top = calculatedTop + 'px';
            style.maxHeight = (rect.top - calculatedTop + 40) + 'px';
        } else {
            style.top = rect.bottom + 'px';
            style.maxHeight = (window.innerHeight - rect.bottom - 10) + 'px';
        }
        return style;
    }, [dropdownDirection]);

    const toggleResultDropdown = (event) => {
        event.stopPropagation();
        let nextDirection = dropdownDirection;

        if (!isResultOpen && resultButtonRef.current) {
            const rect = resultButtonRef.current.getBoundingClientRect();
            const spaceBelow = window.innerHeight - rect.bottom;
            const spaceAbove = rect.top;
            nextDirection = spaceBelow < 450 && spaceAbove > spaceBelow ? 'up' : 'down';
            setDropdownDirection(nextDirection);
            setDropdownStyle(calculateDropdownStyle(nextDirection));
        }

        setIsResultOpen(!isResultOpen);
        setIsDropdownOpen(false);
    };

    useEffect(() => {
        let isMounted = true;
        axios.get(`${API_BASE}/profile`, { headers: { Authorization: `Bearer ${token}` } })
            .then((res) => {
                if (isMounted) setUser(res.data);
            })
            .catch((err) => {
                console.error("Profil hiba:", err);
            });

        return () => { isMounted = false; };
    }, [token, archiveMode]);

    useEffect(() => {
        const targetUsername = urlUsername || user.username || localStorage.getItem('chessUsername');
        if (!targetUsername) return;

        let isMounted = true;
        setIsHistoryLoading(true);
        const limit = archiveMode ? 50 : 5;

        axios.get(`${API_BASE}/user-games/${encodeURIComponent(targetUsername)}?offset=0&limit=${limit}`)
            .then((res) => {
                if (!isMounted) return;
                setHistory(res.data.games || []);
                setHistoryTotal(res.data.total || 0);
            })
            .catch((err) => {
                console.error("Game history hiba:", err);
                if (isMounted) {
                    setHistory([]);
                    setHistoryTotal(0);
                }
            })
            .finally(() => {
                if (isMounted) setIsHistoryLoading(false);
            });

        return () => { isMounted = false; };
    }, [archiveMode, urlUsername, user.username]);

    useEffect(() => {
        const closeAll = () => { setIsDropdownOpen(false); setIsResultOpen(false); };
        window.addEventListener('click', closeAll);
        return () => window.removeEventListener('click', closeAll);
    }, []);

    const handleSeeMore = () => {
        navigate(`/member/${user.username}/games`);
    };

    const handleTabClick = (tab) => {
        if (tab === 'Overview') navigate('/profile');
        if (tab === 'Games') handleSeeMore();
    };

    return (
        <div className="min-h-screen bg-[#1e1e1e] text-[#bab9b8] font-sans pb-10">
            <div className="max-w-6xl mx-auto pt-8 px-4">
                <ProfileHeader user={user} urlUsername={urlUsername} />

                <ProfileTabs archiveMode={archiveMode} onTabClick={handleTabClick} />

                <div className="flex flex-col lg:flex-row gap-6 mt-6 items-start">
                    <ProfileGameHistory
                        history={history}
                        total={historyTotal}
                        isLoading={isHistoryLoading}
                        username={urlUsername || user.username}
                        archiveMode={archiveMode}
                        onSeeMore={handleSeeMore}
                    />

                    <ProfileSearchPanel
                        selectedGameType={selectedGameType}
                        selectedResult={selectedResult}
                        isResultOpen={isResultOpen}
                        isAdvancedOpen={isAdvancedOpen}
                        resultButtonRef={resultButtonRef}
                        dropdownStyle={dropdownStyle}
                        showStartDate={showStartDate}
                        showEndDate={showEndDate}
                        startDate={startDate}
                        endDate={endDate}
                        onGameTypeToggle={() => setIsDropdownOpen(!isDropdownOpen)}
                        onResultToggle={toggleResultDropdown}
                        onResultSelect={(label) => {
                            setSelectedResult(label);
                            setIsResultOpen(false);
                        }}
                        onAdvancedToggle={() => setIsAdvancedOpen(!isAdvancedOpen)}
                        onStartDateToggle={() => {
                            setShowStartDate(!showStartDate);
                            setShowEndDate(false);
                        }}
                        onEndDateToggle={() => {
                            setShowEndDate(!showEndDate);
                            setShowStartDate(false);
                        }}
                        onStartDateSelect={(date) => {
                            setStartDate(date);
                            setShowStartDate(false);
                        }}
                        onEndDateSelect={(date) => {
                            setEndDate(date);
                            setShowEndDate(false);
                        }}
                    />
                </div>
            </div>
        </div>
    );
};

export default ProfilePage;
