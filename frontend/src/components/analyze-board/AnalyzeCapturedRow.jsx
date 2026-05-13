const AnalyzeCapturedRow = ({ pieces, side, diff }) => {
    if (pieces.length === 0 && diff <= 0) return null;

    const groups = pieces.reduce((acc, piece) => {
        if (!acc[piece]) acc[piece] = [];
        acc[piece].push(piece);
        return acc;
    }, {});

    const order = ['p', 'n', 'b', 'r', 'q'];

    return (
        <div className="flex items-center h-5 mt-1 ml-0.5">
            <div className="flex gap-[2px]">
                {order.map(type => {
                    const group = groups[type];
                    if (!group) return null;

                    return (
                        <div key={type} className="flex relative" style={{ marginRight: group.length > 1 ? '4px' : '0' }}>
                            {group.map((piece, idx) => (
                                <img
                                    key={idx}
                                    src={`/assets/pieces/${side === 'white' ? 'black' : 'white'}_${
                                        piece === 'p' ? 'pawn' : piece === 'n' ? 'knight' :
                                        piece === 'b' ? 'bishop' : piece === 'r' ? 'rook' : 'queen'
                                    }.png`}
                                    className="w-4.5 h-4.5 object-contain"
                                    style={{
                                        marginLeft: idx === 0 ? 0 : '-10px',
                                        zIndex: idx
                                    }}
                                    alt={piece}
                                />
                            ))}
                        </div>
                    );
                })}
            </div>

            {diff > 0 && (
                <span className="text-[11px] font-bold text-[#8b8987] ml-2 leading-none self-center">
                    +{diff}
                </span>
            )}
        </div>
    );
};

export default AnalyzeCapturedRow;
