import { resultOptions } from '../../constants/profileData';
import CustomCalendar from './CustomCalendar';
import SimpleSelect from './SimpleSelect';

const ResultDropdown = ({ options, dropdownStyle, onSelect }) => (
    <div className="fixed bg-white border border-gray-300 shadow-2xl py-1 flex flex-col overflow-y-auto z-[9999]" style={dropdownStyle}>
        {options.map((opt, i) => (
            <div
                key={i}
                onClick={() => {
                    if (opt.type !== 'header') onSelect(opt.label);
                }}
                className={`px-4 py-1.5 text-[13px] transition-colors ${opt.type === 'header' ? 'text-black font-bold cursor-default pt-2 pb-1' : 'text-black cursor-pointer hover:bg-[#5da9ff] hover:text-white'} ${opt.type === 'sub' ? 'pl-8' : ''}`}
            >
                {opt.type === 'sub' ? `- ${opt.label}` : opt.label}
            </div>
        ))}
    </div>
);

const DateSelector = ({ value, placeholder, isOpen, onToggle, onSelect }) => (
    <div className="relative flex-1">
        <div onClick={onToggle} className="w-full bg-[#1e1e1e] border border-[#3c3a37] p-2.5 rounded text-[11px] text-[#bab9b8] flex justify-between items-center cursor-pointer hover:border-[#666]">
            <span>{value || placeholder}</span> <i className="far fa-calendar text-[#666]"></i>
        </div>
        {isOpen && <CustomCalendar onSelect={onSelect} />}
    </div>
);

const ProfileSearchPanel = ({
    selectedGameType,
    selectedResult,
    isResultOpen,
    isAdvancedOpen,
    resultButtonRef,
    dropdownStyle,
    showStartDate,
    showEndDate,
    startDate,
    endDate,
    onGameTypeToggle,
    onResultToggle,
    onResultSelect,
    onAdvancedToggle,
    onStartDateToggle,
    onEndDateToggle,
    onStartDateSelect,
    onEndDateSelect,
}) => (
    <div className="profile-search-panel w-full lg:w-[320px] flex flex-col gap-4">
        <div className="bg-[#262421] p-5 rounded-lg border border-[#3c3a37] h-auto flex flex-col relative">
            <h3 className="font-bold text-white text-[15px] mb-4">Search Games</h3>

            <div className="space-y-3">
                <SimpleSelect label={selectedGameType} onClick={onGameTypeToggle} />

                <div className="relative" ref={resultButtonRef}>
                    <SimpleSelect label={selectedResult} onClick={onResultToggle} />
                    {isResultOpen && (
                        <ResultDropdown
                            options={resultOptions}
                            dropdownStyle={dropdownStyle}
                            onSelect={onResultSelect}
                        />
                    )}
                </div>

                <input type="text" placeholder="Opponent" className="w-full bg-[#1e1e1e] border border-[#3c3a37] p-2.5 rounded text-sm text-white outline-none placeholder-[#666] hover:border-[#454241] focus:border-[#81b64c]" />

                {isAdvancedOpen && (
                    <div className="space-y-3 pt-1 animate-in fade-in duration-200">
                        {["Opponent Title", "Openings", "Color", "Match Type", "Newest", "Rated + Unrated"].map(l => (
                            <SimpleSelect key={l} label={l} />
                        ))}

                        <div className="flex gap-2 relative">
                            <DateSelector
                                value={startDate}
                                placeholder="Start Date"
                                isOpen={showStartDate}
                                onToggle={onStartDateToggle}
                                onSelect={onStartDateSelect}
                            />
                            <DateSelector
                                value={endDate}
                                placeholder="End Date"
                                isOpen={showEndDate}
                                onToggle={onEndDateToggle}
                                onSelect={onEndDateSelect}
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[11px] font-bold text-[#8b8987] uppercase tracking-tighter">Rating Range</label>
                            <div className="flex gap-2 w-full">
                                <div className="flex-1 min-w-0">
                                    <input type="text" placeholder="Min" className="w-full bg-[#1e1e1e] border border-[#3c3a37] p-2.5 rounded text-sm text-white outline-none placeholder-[#666] hover:border-[#454241]" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <input type="text" placeholder="Max" className="w-full bg-[#1e1e1e] border border-[#3c3a37] p-2.5 rounded text-sm text-white outline-none placeholder-[#666] hover:border-[#454241]" />
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="flex gap-2 pt-1">
                    <button className="flex-1 bg-[#81b64c] hover:bg-[#a3d16a] text-white font-bold py-2.5 rounded shadow-lg transition-all text-sm">Search</button>
                    <button className="flex-1 bg-[#3c3a37] hover:bg-[#4a4845] text-white font-bold py-2.5 rounded text-sm">Reset</button>
                </div>
            </div>

            <button onClick={onAdvancedToggle} className="w-full text-center text-[11px] font-bold text-[#8b8987] hover:text-white uppercase tracking-widest pt-4 flex items-center justify-center gap-1 transition-colors">
                {isAdvancedOpen ? 'Hide' : 'Advanced'} <i className={`fas fa-chevron-${isAdvancedOpen ? 'up' : 'down'} text-[8px]`}></i>
            </button>
        </div>
    </div>
);

export default ProfileSearchPanel;
