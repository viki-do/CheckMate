import React from 'react';

const ReviewDashboard = ({ data }) => {
    if (!data) return null;

    const { overall_accuracy, summary } = data;

    const phaseLabels = {
        opening: "Opening",
        middlegame: "Middlegame",
        endgame: "Endgame"
    };

    return (
        <div className="bg-[#262421] p-5 rounded-xl border border-[#3c3a37] shadow-2xl mb-4 animate-in fade-in slide-in-from-top-4 duration-700">
            {/* Accuracy Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-[#8b8987] text-xs font-black uppercase tracking-widest">Accuracy</h3>
                    <div className="text-4xl font-black text-white">{overall_accuracy}%</div>
                </div>
                <div className="w-16 h-16 rounded-full border-4 border-[#81b64c] flex items-center justify-center bg-[#81b64c]/10">
                    <i className="fas fa-bullseye text-[#81b64c] text-2xl"></i>
                </div>
            </div>

            {/* Phase Breakdown */}
            <div className="grid grid-cols-1 gap-3">
                {Object.entries(summary).map(([phase, info]) => (
                    <div key={phase} className="bg-[#21201d] p-3 rounded-lg border border-[#3c3a37]/50 flex justify-between items-center">
                        <div>
                            <div className="text-white font-bold text-sm">{phaseLabels[phase]}</div>
                            <div className="text-[#8b8987] text-[11px] uppercase font-bold">{info.rating}</div>
                        </div>
                        <div className="text-right">
                            <div className="text-white font-black text-lg">{info.accuracy}%</div>
                            {/* Kis statisztika: hány hiba volt az adott szakaszban */}
                            <div className="flex gap-2 justify-end mt-1">
                                {info.stats.blunder > 0 && <span className="text-[#fa412d] text-[10px] font-bold">?? {info.stats.blunder}</span>}
                                {info.stats.mistake > 0 && <span className="text-[#ffa433] text-[10px] font-bold">? {info.stats.mistake}</span>}
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Coach Quote - Az extra amit kértél */}
            <div className="mt-6 p-3 bg-[#2b2a27] rounded-lg border-l-4 border-[#81b64c] relative">
                <i className="fas fa-quote-left text-[#81b64c]/20 absolute top-2 left-2 text-2xl"></i>
                <p className="text-[#bab9b8] text-sm italic pl-4 leading-relaxed">
                    {overall_accuracy > 85 
                        ? "Impressive game. Your middlegame accuracy made the difference."
                        : "You had some good moments, but the endgame mistakes decided the result."}
                </p>
            </div>
        </div>
    );
};

export default ReviewDashboard;
