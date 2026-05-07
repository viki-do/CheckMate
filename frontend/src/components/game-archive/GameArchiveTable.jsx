import GameArchiveRow from './GameArchiveRow';

const GameArchiveTable = ({ games, username, isLoading }) => (
    <div className="bg-[#262421] border border-[#3c3a37] overflow-hidden rounded-b-lg">
        <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-[#1e1e1e] text-[#8b8987] font-bold uppercase text-[10px] tracking-wider">
                <tr>
                    <th className="p-4 w-16"></th>
                    <th className="px-2 py-3">Players</th>
                    <th className="px-4 py-3 text-center">Result</th>
                    <th className="px-4 py-3 text-center">Accuracy</th>
                    <th className="px-4 py-3 text-center">Moves</th>
                    <th className="px-4 py-3 text-right">Date <i className="fas fa-caret-down ml-1"></i></th>
                    <th className="px-4 py-3 w-10 text-center"><input type="checkbox" className="accent-[#81b64c]" /></th>
                </tr>
            </thead>
            <tbody className="divide-y divide-[#3c3a37]">
                {isLoading && (
                    <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-[#8b8987] font-bold">Loading games...</td>
                    </tr>
                )}
                {!isLoading && games.length === 0 && (
                    <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-[#8b8987] font-bold">No games yet</td>
                    </tr>
                )}
                {!isLoading && games.map((game) => (
                    <GameArchiveRow key={game.id} game={game} username={username} />
                ))}
            </tbody>
        </table>
    </div>
);

export default GameArchiveTable;
