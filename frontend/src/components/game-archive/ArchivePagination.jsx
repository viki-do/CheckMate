const ArchivePagination = ({ total = 0 }) => (
    <div className="bg-[#262421] border-x border-t border-[#3c3a37] flex justify-between items-center px-4 py-2">
        <span className="text-[11px] font-bold text-[#8b8987]">Total: {total}</span>
        <div className="flex gap-1">
            <button className="w-7 h-7 flex items-center justify-center bg-[#3c3a37] text-[#666] rounded-sm text-xs"><i className="fas fa-chevron-left"></i></button>
            {[1, 2, 3, 4, 5].map(n => (
                <button key={n} className={`w-7 h-7 rounded-sm font-bold text-xs ${n === 1 ? 'bg-[#454241] text-white' : 'text-[#bab9b8] hover:bg-[#312e2b]'}`}>{n}</button>
            ))}
            <button className="w-7 h-7 flex items-center justify-center bg-[#312e2b] text-[#bab9b8] rounded-sm text-xs"><i className="fas fa-chevron-right"></i></button>
            <button className="px-3 h-7 bg-[#312e2b] text-[#bab9b8] rounded-sm text-[11px] font-bold ml-1">Last</button>
        </div>
    </div>
);

export default ArchivePagination;
