const botCategories = [
    { id: 'beginner', name: 'Beginner', elo: 250, icon: '/assets/bot-players/martin.png', bots: [
        { id: 'martin', name: 'Martin', elo: 250, img: '/assets/bot-players/martin.png', style: 'attacker' },
        { id: 'elenore', name: 'Elenore', elo: 400, img: '/assets/bot-players/elenore.png', style: 'defensive' },
        { id: 'oliver', name: 'Oliver', elo: 500, img: '/assets/bot-players/oliver.png', style: 'positional' },
        { id: 'janjay', name: 'Janjay', elo: 600, img: '/assets/bot-players/janjay.png', style: 'universal' },
        { id: 'beginner_stockfish', name: 'Stockfish', elo: 850, img: '/assets/logos/chess.png', style: 'stockfish', isEngine: true },
    ]},
    { id: 'intermediate', name: 'Intermediate', elo: 1100, icon: '/assets/bot-players/laura.png', bots: [
        { id: 'laura', name: 'Laura', elo: 1100, img: '/assets/bot-players/laura.png', style: 'attacker' },
        { id: 'sven', name: 'Sven', elo: 1200, img: '/assets/bot-players/sven.png', style: 'defensive' },
        { id: 'ali', name: 'Ali', elo: 1300, img: '/assets/bot-players/ali.png', style: 'positional' },
        { id: 'jade', name: 'Jade', elo: 1400, img: '/assets/bot-players/jade.png', style: 'universal' },
        { id: 'intermediate_stockfish', name: 'Stockfish', elo: 1500, img: '/assets/logos/chess.png', style: 'stockfish', isEngine: true },
    ]},
    { id: 'advanced', name: 'Advanced', elo: 1500, icon: '/assets/bot-players/pierre.png', bots: [
        { id: 'isabel', name: 'Isabel', elo: 1500, img: '/assets/bot-players/isabel.png', style: 'attacker' },
        { id: 'pierre', name: 'Pierre', elo: 1700, img: '/assets/bot-players/pierre.png', style: 'defensive' },
        { id: 'fatima', name: 'Fatima', elo: 1900, img: '/assets/bot-players/fatima.png', style: 'positional' },
        { id: 'oscar', name: 'Oscar', elo: 2000, img: '/assets/bot-players/oscar.png', style: 'universal' },
        { id: 'advanced_stockfish', name: 'Stockfish', elo: 2100, img: '/assets/logos/chess.png', style: 'stockfish', isEngine: true },
    ]},
    { id: 'master', name: 'Master', elo: 2200, icon: '/assets/bot-players/nora.png', bots: [
        { id: 'nora', name: 'Nora', elo: 2200, img: '/assets/bot-players/nora.png', style: 'attacker' },
        { id: 'wei', name: 'Wei', elo: 2300, img: '/assets/bot-players/wei.png', style: 'defensive' },
        { id: 'luke', name: 'Luke', elo: 2390, img: '/assets/bot-players/luke.png', style: 'positional' },
        { id: 'sofia', name: 'Sofia', elo: 2450, img: '/assets/bot-players/sofia.png', style: 'universal' },
        { id: 'master_stockfish', name: 'Stockfish', elo: 2500, img: '/assets/logos/chess.png', style: 'stockfish', isEngine: true },
    ]},
];

const engineEloSteps = [
    250, 400, 550, 700, 850, 1000,
    1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900, 2000,
    2100, 2200, 2300, 2400, 2500, 2600, 2700,
    2900, 3200,
];

export { botCategories, engineEloSteps };
