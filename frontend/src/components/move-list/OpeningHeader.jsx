const OpeningHeader = ({ opening }) => {
    const openingName = typeof opening === "string" ? opening : opening?.name;

    return (
        <div className="p-4 border-b border-[#3c3a37] bg-chess-panel-header flex flex-col justify-center min-h-17.5 transition-all duration-500">
        {openingName ? (
            <div className="animate-in fade-in duration-500">
                <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-[#8b8987] text-[11px] font-bold uppercase tracking-tight italic">
                        Opening
                    </span>
                </div>
                <div className="text-white font-bold text-[15px] leading-tight truncate">
                    {openingName}
                </div>
            </div>
        ) : (
            <div className="text-[#636261] text-sm italic h-full"></div>
        )}
        </div>
    );
};

export default OpeningHeader;
