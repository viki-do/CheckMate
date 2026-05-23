import { Search, X } from 'lucide-react';

const SearchBox = ({ value, onChange, placeholder, readOnly = false, compact = false }) => (
  <div className={`flex items-center bg-[#373430] border border-[#53504c] px-2 ${compact ? 'h-9' : 'h-11'}`}>
    <Search size={compact ? 18 : 22} className="text-[#a6a4a1] shrink-0" />
    <input
      value={value}
      onChange={(event) => onChange(event.target.value)}
      readOnly={readOnly}
      placeholder={placeholder}
      className={`w-full bg-transparent outline-none px-2 text-[#d7d6d4] placeholder:text-[#8b8987] ${compact ? 'text-sm' : ''}`}
    />
    {value && !readOnly && (
      <button onClick={() => onChange('')} type="button" className="text-[#bab9b8] hover:text-white">
        <X size={compact ? 16 : 20} />
      </button>
    )}
  </div>
);

export default SearchBox;
