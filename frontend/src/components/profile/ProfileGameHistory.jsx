import ProfileGameRow from './ProfileGameRow';

const ProfileGameHistory = ({ history, total, isLoading, username, archiveMode, onSeeMore }) => (
    <div className="profile-game-history flex-1 bg-[#262421] rounded-lg border border-[#3c3a37] overflow-hidden flex flex-col">
        <div className="p-4 border-b border-[#3c3a37] bg-[#2b2926] flex justify-between items-center text-white">
            <h3 className="font-bold text-lg">Game History ({total ?? history.length})</h3>
            <div className="flex gap-4 text-[#666]">
                <i className="far fa-square cursor-pointer hover:text-white transition-colors"></i>
                <i className="far fa-clock cursor-pointer hover:text-white transition-colors"></i>
                <i className="fas fa-download cursor-pointer hover:text-white transition-colors"></i>
            </div>
        </div>

        <table className="w-full text-left text-sm border-collapse">
            <thead className="bg-[#1e1e1e] text-[#8b8987] font-bold uppercase text-[10px] tracking-wider">
                <tr>
                    <th className="p-4 w-12"></th>
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
                {!isLoading && history.length === 0 && (
                    <tr>
                        <td colSpan="7" className="px-4 py-8 text-center text-[#8b8987] font-bold">No games yet</td>
                    </tr>
                )}
                {!isLoading && history.map((game, index) => (
                    <ProfileGameRow key={`${game.id}-${index}`} game={game} username={username} />
                ))}
            </tbody>
        </table>
        {!archiveMode && (
            <div onClick={onSeeMore} className="p-4 bg-[#1e1e1e] hover:bg-[#2b2926] text-center font-bold text-sm cursor-pointer border-t border-[#3c3a37] text-[#bab9b8] transition-colors">
                See More <i className="fas fa-chevron-right ml-2 text-[10px]"></i>
            </div>
        )}
    </div>
);

export default ProfileGameHistory;
