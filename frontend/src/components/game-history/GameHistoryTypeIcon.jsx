import {
    GameTypeBlitz,
    GameTypeBullet,
    GameTypeComputer,
    GameTypeDaily,
    GameTypeRapid,
} from "../icons/Icons";

const BULLET_CONTROLS = new Set(["1 min", "1 | 1", "2 | 1"]);
const BLITZ_CONTROLS = new Set(["3 min", "3 | 2", "5 min", "5 | 5", "5 | 2"]);
const RAPID_CONTROLS = new Set(["10 min", "15 | 10", "30 min", "10 | 5", "20 min", "60 min"]);

export const isComputerGame = (game) => {
    const opponent = String(game?.opponent || "").toLowerCase();
    return Boolean(game?.isBot) || ["engine", "stockfish"].includes(opponent);
};

export const normalizeTimeControl = (type) => (
    String(type || "")
        .toLowerCase()
        .replace(/\s*\|\s*/g, " | ")
        .replace(/\s+/g, " ")
        .trim()
);

export const getGameType = (game) => {
    if (isComputerGame(game)) {
        return "computer";
    }

    const control = normalizeTimeControl(game?.type);

    if (BULLET_CONTROLS.has(control)) {
        return "bullet";
    }

    if (BLITZ_CONTROLS.has(control)) {
        return "blitz";
    }

    if (RAPID_CONTROLS.has(control)) {
        return "rapid";
    }

    return "daily";
};

const TYPE_CONFIG = {
    computer: { Icon: GameTypeComputer, color: "text-blue-300", label: "" },
    bullet: { Icon: GameTypeBullet, color: "text-[#f7c631]", label: "Bullet" },
    blitz: { Icon: GameTypeBlitz, color: "text-[#f7c631]", label: "Blitz" },
    rapid: { Icon: GameTypeRapid, color: "text-[#81b64c]", label: "Rapid" },
    daily: { Icon: GameTypeDaily, color: "text-yellow-500", label: "Daily" },
};

const GameHistoryTypeIcon = ({ game, size = 24, showLabel = true }) => {
    const type = getGameType(game);
    const { Icon, color, label } = TYPE_CONFIG[type];

    if (type === "computer") {
        return (
            <div className={`${color} opacity-80 flex items-center justify-center`}>
                <Icon size={size} />
            </div>
        );
    }

    return (
        <div className="flex flex-col items-center justify-center">
            <div className={`${color} flex items-center justify-center`}>
                <Icon size={size} />
            </div>
            {showLabel && (
                <div className="text-[9px] uppercase font-bold text-[#666] mt-1 whitespace-nowrap">
                    {label}
                </div>
            )}
        </div>
    );
};

export default GameHistoryTypeIcon;
