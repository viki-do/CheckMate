import GameHistoryTypeIcon from "../game-history/GameHistoryTypeIcon";

const PlayerLine = ({ player, isWhite, won }) => (
    <div className="flex items-center gap-2">
        <div className={`w-3 h-3 ${isWhite ? 'bg-white' : 'bg-[#3c3a37]'} rounded-sm ${won ? 'ring-2 ring-[#81b64c]' : ''}`}></div>
        {player.isMe && <span className="text-blue-400 text-[10px]"><i className="fas fa-gem"></i></span>}
        <span className={`text-[13px] ${player.isMe ? 'font-bold text-white' : 'text-[#bab9b8]'}`}>
            {player.name} <span className="text-[#666] font-normal">({player.elo ?? '-'})</span>
        </span>
    </div>
);

const GameArchiveRow = ({ game, username }) => {
    const whiteWon = game.result === "1-0";
    const blackWon = game.result === "0-1";
    const isDraw = game.result === "1/2-1/2";
    const isOngoing = game.result === "*";
    const whitePlayer = game.iWasWhite ? { name: username || "Viki", elo: game.myElo, isMe: true } : { name: game.opponent, elo: game.elo, isMe: false };
    const blackPlayer = !game.iWasWhite ? { name: username || "Viki", elo: game.myElo, isMe: true } : { name: game.opponent, elo: game.elo, isMe: false };

    return (
        <tr className="hover:bg-[#2b2926] transition-colors cursor-pointer group h-[85px]">
            <td className="px-4 py-2 text-center align-middle">
                <GameHistoryTypeIcon game={game} size={24} />
            </td>

            <td className="px-2 py-2">
                <div className="flex flex-col gap-1.5">
                    <PlayerLine player={whitePlayer} isWhite won={whiteWon} />
                    <PlayerLine player={blackPlayer} isWhite={false} won={blackWon} />
                </div>
            </td>

            <td className="px-4 py-2">
                <div className="flex items-center justify-center gap-3">
                    <div className="flex flex-col text-[13px] font-bold text-[#8b8987] leading-tight text-right w-4">
                        <span className={whiteWon || isDraw ? 'text-white' : ''}>{isOngoing ? '-' : isDraw ? '1/2' : whiteWon ? '1' : '0'}</span>
                        <span className={blackWon || isDraw ? 'text-white' : ''}>{isOngoing ? '-' : isDraw ? '1/2' : blackWon ? '1' : '0'}</span>
                    </div>
                    <div className={`w-6 h-6 flex items-center justify-center rounded-sm ${isDraw || isOngoing ? 'bg-[#3c3a37]' : game.win ? 'bg-[#81b64c]' : 'bg-[#fa412d]'}`}>
                        <i className={`fas ${isDraw || isOngoing ? 'fa-equals text-[8px]' : game.win ? 'fa-plus' : 'fa-minus'} text-[10px] text-white`}></i>
                    </div>
                </div>
            </td>

            <td className="px-4 py-2 text-center">
                <div className="flex flex-col text-[12px] font-bold leading-tight items-center">
                    <span className="text-[#8b8987]">{Array.isArray(game.accuracy) ? game.accuracy[0] : '-'}</span>
                    <span className="text-white">{Array.isArray(game.accuracy) ? game.accuracy[1] : '-'}</span>
                </div>
            </td>

            <td className="px-4 py-2 text-center text-white font-medium text-[13px]">{game.moves ?? '-'}</td>
            <td className="px-4 py-2 text-right text-white text-[13px] whitespace-nowrap font-medium">{game.date || '-'}</td>
            <td className="px-4 py-2 text-center"><input type="checkbox" className="accent-[#81b64c]" /></td>
        </tr>
    );
};

export default GameArchiveRow;
