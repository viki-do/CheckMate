const ReviewAccuracyButton = ({ gameId, onReview }) => {
    if (!gameId) return null;

    return (
        <button
            type="button"
            onClick={(event) => {
                event.stopPropagation();
                onReview?.(gameId);
            }}
            className="min-w-28 h-10 px-6 rounded bg-[#3a3936] hover:bg-[#4a4946] border border-[#4a4946] shadow-[inset_0_1px_0_rgba(255,255,255,0.08),0_2px_6px_rgba(0,0,0,0.25)] text-white text-sm font-black transition-colors"
        >
            Review
        </button>
    );
};

export default ReviewAccuracyButton;
