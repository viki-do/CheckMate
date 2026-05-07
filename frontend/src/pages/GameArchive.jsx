import { useEffect, useState } from 'react';
import axios from 'axios';
import { useParams } from 'react-router-dom';
import ArchivePagination from '../components/game-archive/ArchivePagination';
import ArchiveTabs from '../components/game-archive/ArchiveTabs';
import GameArchiveSidebar from '../components/game-archive/GameArchiveSidebar';
import GameArchiveTable from '../components/game-archive/GameArchiveTable';

const GameArchive = () => {
    const { username: urlUsername } = useParams();
    const [viewMode, setViewMode] = useState('Recent');
    const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
    const [games, setGames] = useState([]);
    const [totalGames, setTotalGames] = useState(0);
    const [isLoading, setIsLoading] = useState(false);
    const username = urlUsername || localStorage.getItem('chessUsername');

    useEffect(() => {
        if (!username) return;

        let isMounted = true;
        setIsLoading(true);

        axios.get(`http://localhost:8000/user-games/${encodeURIComponent(username)}?offset=0&limit=50`)
            .then((res) => {
                if (!isMounted) return;
                setGames(res.data.games || []);
                setTotalGames(res.data.total || 0);
            })
            .catch(() => {
                if (!isMounted) return;
                setGames([]);
                setTotalGames(0);
            })
            .finally(() => {
                if (isMounted) setIsLoading(false);
            });

        return () => { isMounted = false; };
    }, [username]);

    return (
        <div className="min-h-screen bg-[#1e1e1e] text-[#bab9b8] p-4 lg:p-8 font-sans">
            <div className="max-w-7xl mx-auto">
                <div className="flex items-center gap-3 mb-6">
                    <img src="/assets/logos/board-archive.svg" className="w-10 h-10" alt="archive" />
                    <h2 className="text-[26px] font-bold text-white tracking-tight">Game History ({totalGames})</h2>
                </div>

                <div className="flex flex-col lg:flex-row gap-8">
                    <div className="flex-1 min-w-0">
                        <ArchiveTabs viewMode={viewMode} onViewModeChange={setViewMode} />
                        <ArchivePagination total={totalGames} />
                        <GameArchiveTable games={games} username={username} isLoading={isLoading} />
                    </div>

                    <GameArchiveSidebar
                        isAdvancedOpen={isAdvancedOpen}
                        onAdvancedToggle={() => setIsAdvancedOpen(!isAdvancedOpen)}
                    />
                </div>
            </div>
        </div>
    );
};

export default GameArchive;
