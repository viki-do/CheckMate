
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { HeaderSection, StatBar, StatListItem, PlayButton, BoardCard } from '../components/component_helpers/PageHelpers';
import React , { useMemo } from 'react';
import { Chess } from 'chess.js';
import GameHistoryTypeIcon from '../components/game-history/GameHistoryTypeIcon';
import ReviewAccuracyButton from '../components/game-history/ReviewAccuracyButton';

const HomePage = () => {
    const navigate = useNavigate();
    const startFen = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1";
    const [reviewGame, setReviewGame] = React.useState(null);
    const [gameHistory, setGameHistory] = React.useState([]);
    const [isHistoryLoading, setIsHistoryLoading] = React.useState(false);
    const [avatarUrl, setAvatarUrl] = React.useState("");
    const username = localStorage.getItem('chessUsername');
    const avatarSrc = avatarUrl ? `http://localhost:8000${avatarUrl}` : "";

    React.useEffect(() => {
        const fetchLatest = async () => {
            try {
                const res = await axios.get(`http://localhost:8000/get-latest-review-game`, {
                    headers: { Authorization: `Bearer ${localStorage.getItem('chessToken')}` }
                });
                setReviewGame(res.data);
            } catch (err) {
                console.error("Nem sikerült betölteni a review játékot");
            }
        };
        fetchLatest();
    }, []);

    React.useEffect(() => {
        if (!username) return;

        let isMounted = true;
        setIsHistoryLoading(true);

        axios.get(`http://localhost:8000/user-games/${encodeURIComponent(username)}?offset=0&limit=5`)
            .then((res) => {
                if (isMounted) setGameHistory(res.data.games || []);
            })
            .catch(() => {
                if (isMounted) setGameHistory([]);
            })
            .finally(() => {
                if (isMounted) setIsHistoryLoading(false);
            });

        return () => { isMounted = false; };
    }, [username]);

    React.useEffect(() => {
        let isMounted = true;
        axios.get(`http://localhost:8000/profile`, {
            headers: { Authorization: `Bearer ${localStorage.getItem('chessToken')}` }
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

    return (
    <div className="flex flex-col p-10 bg-[#2f2e2a] min-h-screen font-sans text-[#bab9b8]">
        
        {/* --- 1. FELHASZNÁLÓI FEJLÉC --- */}
        <div className="flex items-center gap-3 mb-10 w-fit">
            <button
                type="button"
                onClick={() => navigate(`/member/${username || 'user'}`)}
                className="w-10 h-10 bg-[#3c3a37] rounded flex items-center justify-center overflow-hidden transition-colors hover:bg-[#4a4845] cursor-pointer"
                aria-label="Open profile"
            >
                {avatarSrc ? (
                    <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
                ) : (
                    <i className="fas fa-user text-white"></i>
                )}
            </button>
            <h1 className="text-xl font-bold text-white flex items-center gap-2">
                <button
                    type="button"
                    onClick={() => navigate(`/member/${username || 'user'}`)}
                    className="font-bold text-white cursor-pointer"
                >
                    {username || "username" }
                </button>
                <span className="text-sm cursor-help" title="Hungary">🇭🇺</span>
                <span className="text-blue-400 text-xs">💎</span>
            </h1>
        </div>

        {/* --- 2. FELSŐ DASHBOARD SZEKCIÓ --- */}
        <div className="flex flex-row gap-8 items-start mb-12">
            <div className="flex flex-col w-72">
                <div className="flex items-center gap-4 mb-6 h-16">
                    <span className="text-6xl">🔥</span>
                    <div className="flex flex-col">
                        <span className="text-xs uppercase font-black text-[#8b8987] tracking-wider leading-none mb-1">Streak</span>
                        <span className="text-xl font-black text-white leading-none">2 Day Streak</span>
                    </div>
                </div>
                <div className="flex flex-col gap-2">
                    <PlayButton iconSrc="/assets/icons/rapid.svg" label="Play 10 min" isMain={true} onClick={() => navigate('/play')} />
                    <PlayButton iconSrc="/assets/logos/play.png" label="New Game" />
                    <PlayButton iconSrc="/assets/moves/device-bot.svg" label="Play Bots" />
                    <PlayButton iconSrc="/assets/icons/handshake.svg" label="Play a Friend" />
                </div>
            </div>

            <div className="flex flex-col w-72">
                <HeaderSection 
                    icon={<img src="https://www.chess.com/bundles/web/images/color-icons/puzzles.svg" className="w-16 h-16" alt="" />}
                    title="Puzzles" sub="200" extra="🔥 3"
                />
                <BoardCard label="Solve Puzzle" onClick={() => navigate('/puzzles')}>
                    <MiniChessBoard fen={startFen} />
                </BoardCard>
            </div>

            <div className="flex flex-col w-72">
                <HeaderSection 
                    icon={
                        <img 
                            src="/assets/logos/learn.png" 
                            alt="Learn" 
                            className="w-16 h-16 object-contain" 
                        />
                    }
                    title="Next Lesson" sub="Using Your Knights"
                />
                <BoardCard label="Start Lesson" onClick={() => navigate('/learn')}>
                    <MiniChessBoard fen={startFen} />
                </BoardCard>
            </div>

            <div className="flex flex-col w-72">
                <HeaderSection 
                    icon={
                        <img 
                            src="/assets/moves/analysis.svg" 
                            alt="Analysis" 
                            className="w-16 h-16 object-contain" 
                        />
                    }
                    title="Game Review" 
                    sub={reviewGame ? `Review vs ${reviewGame.opponent}` : "No games to review"}
                />
                <BoardCard 
                    label={reviewGame ? `Review vs ${reviewGame.opponent}` : "Play a game first"} 
                    onClick={() => {
                        if(reviewGame) {
                            navigate(`/play/archive/${reviewGame.game_id}`);
                        } else {
                            navigate('/play');
                        }
                    }}
                >
                    <MiniChessBoard fen={reviewGame?.last_fen || startFen} />
                </BoardCard>
            </div>
        </div>

        {/* --- 3. ALSÓ SZEKCIÓ (Minden ikon és méret szinkronban) --- */}
        <div className="flex flex-col lg:flex-row gap-8 items-stretch mb-10">
            
            {/* BAL OLDAL - GAME HISTORY (Archive Ikonokkal) */}
            <div className="flex-1 bg-[#262421] rounded-lg border border-[#3c3a37] flex flex-col overflow-hidden">
                <div 
                    onClick={() => navigate(`/games/archive/${username}`)} 
                    className="p-4 border-b border-[#3c3a37] bg-[#2b2926] flex justify-between items-center cursor-pointer group hover:bg-[#312e2b] transition-colors h-[57px] shrink-0"
                >
                    <h3 className="font-bold text-white text-lg">Game History</h3>
                </div>
                
                <div className="flex-1 overflow-hidden">
                    <table className="w-full text-left text-md border-collapse">
                        <thead className="bg-[#1e1e1e] text-[#8b8987] font-bold uppercase text-[10px] tracking-wider">
                            <tr>
                                <th className="p-4 w-16"></th> 
                                <th className="px-2 py-3">Players</th>
                                <th className="px-4 py-3 text-center">Result</th>
                                <th className="px-4 py-3 text-center">Accuracy</th>
                                <th className="px-4 py-3 text-center">Moves</th>
                                <th className="px-4 py-3 text-right pr-6">Date</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-[#3c3a37]">
                            {isHistoryLoading && (
                                <tr>
                                    <td colSpan="6" className="px-4 py-8 text-center text-[#8b8987] font-bold">Loading games...</td>
                                </tr>
                            )}
                            {!isHistoryLoading && gameHistory.length === 0 && (
                                <tr>
                                    <td colSpan="6" className="px-4 py-8 text-center text-[#8b8987] font-bold">No games yet</td>
                                </tr>
                            )}
                            {!isHistoryLoading && gameHistory.slice(0, 5).map((game) => {
                                const whiteWon = game.result === "1-0";
                                const blackWon = game.result === "0-1";
                                const isDraw = game.result === "1/2-1/2";
                                const isOngoing = game.result === "*";
                                const hasAccuracy = Array.isArray(game.accuracy);
                                
                                // Pontos Ikon Logika a GameArchive alapján

                                const whitePlayer = game.iWasWhite 
                                    ? { name: username || "Viki", elo: game.myElo, isMe: true } 
                                    : { name: game.opponent, elo: game.elo, isMe: false };

                                const blackPlayer = !game.iWasWhite 
                                    ? { name: username || "Viki", elo: game.myElo, isMe: true } 
                                    : { name: game.opponent, elo: game.elo, isMe: false };

                                return (
                                    <tr
                                        key={game.id}
                                        className="hover:bg-[#2b2926] transition-colors h-[70px] group cursor-pointer"
                                        onClick={() => navigate(`/play/archive/${game.id}`)}
                                    >
                                        {/* KATEGÓRIA IKON (Tűpontos Archive másolat) */}
                                        <td className="px-4 py-2 text-center align-middle">
                                            <GameHistoryTypeIcon game={game} size={24} />
                                        </td>

                                        {/* Players */}
                                        <td className="px-2 py-2">
                                            <div className="flex flex-col gap-1.5">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-3.5 h-3.5 bg-white rounded-sm ${whiteWon ? 'ring-2 ring-[#81b64c]' : ''}`}></div>
                                                    {whitePlayer.isMe && <span className="text-blue-400 text-[10px]"><i className="fas fa-gem"></i></span>}
                                                    <span className={`text-[14px] ${whitePlayer.isMe ? 'font-bold text-white' : 'text-[#bab9b8]'}`}>
                                                        {whitePlayer.name} <span className="text-[#666] font-normal">({whitePlayer.elo ?? '-'})</span>
                                                    </span>
                                                </div>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-3.5 h-3.5 bg-[#3c3a37] rounded-sm ${blackWon ? 'ring-2 ring-[#81b64c]' : ''}`}></div>
                                                    {blackPlayer.isMe && <span className="text-blue-400 text-[10px]"><i className="fas fa-gem"></i></span>}
                                                    <span className={`text-[14px] ${blackPlayer.isMe ? 'font-bold text-white' : 'text-[#bab9b8]'}`}>
                                                        {blackPlayer.name} <span className="text-[#666] font-normal">({blackPlayer.elo ?? '-'})</span>
                                                    </span>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Result */}
                                        <td className="px-4 py-2">
                                            <div className="flex items-center justify-center gap-3">
                                                <div className="flex flex-col text-[14px] font-bold text-[#8b8987] leading-tight text-right w-4">
                                                    <span className={whiteWon || isDraw ? 'text-white' : ''}>{isOngoing ? '-' : isDraw ? '1/2' : (whiteWon ? '1' : '0')}</span>
                                                    <span className={blackWon || isDraw ? 'text-white' : ''}>{isOngoing ? '-' : isDraw ? '1/2' : (blackWon ? '1' : '0')}</span>
                                                </div>
                                                <div className={`w-6 h-6 flex items-center justify-center rounded-sm ${isDraw || isOngoing ? 'bg-[#3c3a37]' : (game.win ? 'bg-[#81b64c]' : 'bg-[#fa412d]')}`}>
                                                    <i className={`fas ${isDraw || isOngoing ? 'fa-equals text-[8px]' : (game.win ? 'fa-plus' : 'fa-minus')} text-[10px] text-white`}></i>
                                                </div>
                                            </div>
                                        </td>

                                        {/* Accuracy */}
                                        <td className="px-4 py-2 text-center">
                                            {hasAccuracy ? (
                                                <div className="flex flex-col text-[12px] font-bold leading-tight items-center">
                                                    <span className="text-[#8b8987]">{game.accuracy[0] ?? '-'}</span>
                                                    <span className="text-white">{game.accuracy[1] ?? '-'}</span>
                                                </div>
                                            ) : (
                                                <ReviewAccuracyButton gameId={game.id} onReview={(id) => navigate(`/play/archive/${id}`)} />
                                            )}
                                        </td>

                                        {/* Moves */}
                                        <td className="px-4 py-2 text-center text-white font-bold text-[14px]">{game.moves ?? '-'}</td>

                                        {/* Date */}
                                        <td className="px-4 py-2 text-right text-[#bab9b8] text-[13px] whitespace-nowrap font-medium pr-6">{game.date || '-'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* JOBB OLDAL - STATS */}
            <div className="w-full lg:w-80 bg-[#262421] rounded-lg border border-[#3c3a37] flex flex-col overflow-hidden h-full">
                <div className="p-4 border-b border-[#3c3a37] bg-[#2b2926] flex justify-between items-center h-[57px] shrink-0">
                    <h3 className="font-bold text-white text-[15px]">Stats</h3>
                    <i className="fas fa-chevron-right text-[#666] text-xs"></i>
                </div>

                <div className="flex-1 flex flex-col justify-between py-4 px-4">
                    <div className="space-y-1">
                        <StatListItem icon="fa-chess-board" label="Games" value="195" />
                        <StatListItem icon="fa-puzzle-piece" label="Puzzles" value="1064" />
                        <StatListItem icon="fa-graduation-cap" label="Lessons" value="20" />
                    </div>
                    <hr className="border-[#3c3a37]" />
                    <div className="space-y-1">
                        <StatListItem icon="fa-bolt" label="Blitz" value="500" color="text-yellow-500" hasArrow />
                        <StatListItem icon="fa-sun" label="Daily" value="1171" color="text-orange-500" hasArrow />
                        <StatListItem icon="fa-stopwatch" label="Rapid" value="484" color="text-[#81b64c]" hasArrow />
                        <StatListItem icon="fa-puzzle-piece" label="Puzzles" value="1407" color="text-[#fa412d]" hasArrow />
                        <StatListItem icon="fa-puzzle-piece" label="Puzzle Rush" value="14" color="text-[#e67e22]" isPuzzleRush hasArrow />
                    </div>
                    <hr className="border-[#3c3a37]" />
                    <div className="flex items-center justify-between p-2 hover:bg-[#312e2b] rounded cursor-pointer group transition-colors">
                        <div className="flex items-center gap-3">
                            <i className="fas fa-lightbulb text-yellow-400 w-5 text-center text-lg"></i>
                            <span className="text-[14px] font-bold text-[#bab9b8] group-hover:text-white transition-colors">Insights</span>
                        </div>
                        <i className="fas fa-chevron-right text-[#666] text-xs group-hover:text-white"></i>
                    </div>
                </div>
            </div>
        </div>
    </div>
);
};

const MiniChessBoard = ({ fen }) => {
    const squares = useMemo(() => {
        const chess = new Chess(fen);
        const board = chess.board();
        const result = [];
        for (let row = 0; row < 8; row++) {
            for (let col = 0; col < 8; col++) {
                const square = board[row][col];
                const squareName = `${String.fromCharCode(97 + col)}${8 - row}`;
                const isDark = (row + col) % 2 !== 0;
                result.push({ square: squareName, piece: square, isDark });
            }
        }
        return result;
    }, [fen]);

    return (
        <div className="w-[288px] h-[288px] grid grid-cols-8 grid-rows-8 border-collapse">
            {squares.map(({ square, piece, isDark }) => (
                <div key={square} className={`aspect-square relative flex items-center justify-center ${isDark ? 'bg-[#769656]' : 'bg-[#eeeed2]'}`}>
                    {piece && (
                        <img 
                            src={`/assets/pieces/${piece.color === 'w' ? 'white' : 'black'}_${piece.type === 'q' ? 'queen' : piece.type === 'n' ? 'knight' : piece.type === 'r' ? 'rook' : piece.type === 'b' ? 'bishop' : piece.type === 'p' ? 'pawn' : 'king'}.png`}
                            alt={`${piece.color}${piece.type}`}
                            className="w-[90%] h-[90%] object-contain select-none"
                        />
                    )}
                </div>
            ))}
        </div>
    );
};



export default HomePage;

