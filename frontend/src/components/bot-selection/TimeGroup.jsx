const TimeGroup = ({ label, icon, Icon, color, times, current, onSelect }) => (
    <div className="mb-4">
        <div className="flex items-center gap-2 mb-2 text-[#989795] text-[11px] font-black uppercase tracking-widest">
            {Icon ? <Icon size={16} className={color} /> : <i className={`fas ${icon} ${color}`}></i>} {label}
        </div>
        <div className="grid grid-cols-3 gap-2">
            {times.map(t => (
                <button
                    key={t}
                    onClick={() => onSelect(t)}
                    className={`py-3 rounded-lg text-[13px] font-bold transition-all border-2
                    ${current === t ? 'border-[#81b64c] bg-[#2b2a27] text-white' : 'border-transparent bg-[#3d3a37] text-[#bab9b8] hover:text-white'}`}
                >
                    {t}
                </button>
            ))}
        </div>
    </div>
);

export default TimeGroup;
