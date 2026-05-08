import GameHistoryTypeIcon from "../game-history/GameHistoryTypeIcon";
import ReviewAccuracyButton from "../game-history/ReviewAccuracyButton";
import { useNavigate } from "react-router-dom";

const PlayerLine = ({ player, won, isWhite }) => (
    <div className="flex items-center gap-2">
        <div className={`w-2.5 h-2.5 ${isWhite ? 'bg-white' : 'bg-[#3c3a37]'} rounded-sm ${won ? 'ring-1 ring-[#81b64c]' : ''}`}></div>
        <span className={`text-[13px] truncate ${player.isMe ? 'font-bold text-white' : 'text-[#bab9b8]'}`}>
            {player.name} <span className="text-[#666] font-normal text-[11px]">({player.elo ?? '-'})</span>
        </span>
    </div>
);

const ProfileGameRow = ({ game, username }) => {
    const navigate = useNavigate();
    const whiteWon = game.result === "1-0";
    const blackWon = game.result === "0-1";
    const isDraw = game.result === "1/2-1/2";
    const isOngoing = game.result === "*";
    const hasAccuracy = Array.isArray(game.accuracy);
    const whiteScore = whiteWon ? '1' : isDraw ? '1/2' : '0';
    const blackScore = blackWon ? '1' : isDraw ? '1/2' : '0';
    const whitePlayer = game.iWasWhite ? { name: username, elo: game.myElo, isMe: true } : { name: game.opponent, elo: game.elo, isMe: false };
    const blackPlayer = !game.iWasWhite ? { name: username, elo: game.myElo, isMe: true } : { name: game.opponent, elo: game.elo, isMe: false };
    const resultIconClass = isDraw || isOngoing ? 'bg-[#8b8987]' : game.win ? 'bg-[#81b64c]' : 'bg-[#fa412d]';
    const resultIcon = isDraw || isOngoing ? 'fa-equals' : game.win ? 'fa-plus' : 'fa-minus';

    return (
        <tr
            className="hover:bg-[#2b2926] transition-colors cursor-pointer group h-[60px]"
            onClick={() => navigate(`/play/archive/${game.id}`)}
        >
            <td className="px-4 py-2 w-16 text-center">
                <GameHistoryTypeIcon game={game} size={24} />
            </td>
            <td className="px-2 py-1">
                <div className="flex flex-col justify-center gap-0.5">
                    <PlayerLine player={whitePlayer} won={whiteWon} isWhite />
                    <PlayerLine player={blackPlayer} won={blackWon} isWhite={false} />
                </div>
            </td>
            <td className="px-4 py-2 w-24">
                <div className="flex items-center justify-end gap-3">
                    <div className="flex flex-col text-[13px] font-bold text-[#8b8987] leading-none text-right gap-1.5">
                        <span className={whiteWon || isDraw ? 'text-white' : ''}>{isOngoing ? '-' : whiteScore}</span>
                        <span className={blackWon || isDraw ? 'text-white' : ''}>{isOngoing ? '-' : blackScore}</span>
                    </div>
                    <div className={`w-5 h-5 flex items-center justify-center rounded-sm ${resultIconClass}`}>
                        <i className={`fas ${resultIcon} text-[8px] text-white`}></i>
                    </div>
                </div>
            </td>
            <td className="px-4 py-2 w-20 text-center">
                {hasAccuracy ? (
                    <div className="flex flex-col text-[11px] font-bold leading-none items-center gap-2">
                        <span className="text-[#8b8987]">{game.accuracy[0] ?? '-'}</span>
                        <span className="text-white">{game.accuracy[1] ?? '-'}</span>
                    </div>
                ) : (
                    <ReviewAccuracyButton gameId={game.id} onReview={(id) => navigate(`/play/archive/${id}`)} />
                )}
            </td>
            <td className="px-4 py-2 text-center text-white font-medium text-[13px]">{game.moves ?? '-'}</td>
            <td className="px-4 py-2 text-right text-[#bab9b8] text-[12px] whitespace-nowrap font-medium">{game.date || '-'}</td>
            <td className="px-4 py-2 w-10 text-center align-middle">
                <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-[#454241] bg-[#1e1e1e] accent-[#81b64c]"
                    onClick={(event) => event.stopPropagation()}
                />
            </td>
        </tr>
    );
};

export default ProfileGameRow;
