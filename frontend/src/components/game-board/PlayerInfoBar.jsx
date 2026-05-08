import { CapturedRow } from '../MaterialAdvantage';
import GameClock from './GameClock';

const PlayerInfoBar = ({
    type,
    userName,
    userAvatarUrl,
    opponent,
    previewOpponent,
    material,
    side,
    showClock,
    clockIsLight,
    clockIsActive,
    clockSeconds,
}) => (
    <div className={`w-170 flex items-center justify-between px-1 h-12 ${type === 'top' ? 'mb-1' : 'mt-1'} shrink-0`}>
        <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-[#2b2a27] rounded-md flex items-center justify-center border border-chess-bg overflow-hidden">
                {type === 'top' ? (
                    opponent?.img || previewOpponent?.img ? (
                        <img
                            src={opponent?.img || previewOpponent?.img}
                            alt=""
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <i className="fas fa-robot text-[#808080] text-xl"></i>
                    )
                ) : (
                    userAvatarUrl ? (
                        <img
                            src={userAvatarUrl}
                            alt=""
                            className="w-full h-full object-cover"
                        />
                    ) : (
                        <img
                            src="/assets/icons/noavatar.gif"
                            alt=""
                            className="w-full h-full object-cover opacity-55"
                        />
                    )
                )}
            </div>
            <div className="flex flex-col justify-center">
                <span className="text-[#bab9b8] font-bold text-[14px] leading-none">
                    {type === 'top' ? (opponent?.name || previewOpponent?.name || 'Opponent') : userName}
                </span>

                {type === 'top' && (opponent?.elo || previewOpponent?.elo) && (
                    <span className="text-[#8b8987] text-[11px] font-bold">
                        ({opponent?.elo || previewOpponent?.elo})
                    </span>
                )}
                <CapturedRow
                    pieces={material.pieces}
                    side={side}
                    diff={material.diff}
                />
            </div>
        </div>

        {showClock && (
            <GameClock
                isLight={clockIsLight}
                isActive={clockIsActive}
                currentSeconds={clockSeconds}
            />
        )}
    </div>
);

export default PlayerInfoBar;
