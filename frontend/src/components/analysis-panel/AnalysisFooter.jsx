import { Download, MoreHorizontal } from 'lucide-react';
import {
    ArrowChevronEnd,
    ChevronLeft,
    ChevronRight,
    New,
    ResetArrow,
    Review,
    Save,
} from '../icons/Icons';
import { ControlBtn, FooterAction } from '../component_helpers/AnalysisHelpers';

const AnalysisFooter = ({ history, viewIndex, canSave = false, canReview = true, hasStartingPosition = false, onViewMove, onNewClick, onSaveClick, onReviewClick, onDownloadClick }) => {
    const hasMoves = history.length > 0;
    const latestIndex = history.length - 1;
    const previousIndex = hasStartingPosition && viewIndex <= 0
        ? -2
        : (viewIndex === -1 ? latestIndex - 1 : viewIndex - 1);
    const nextIndex = hasStartingPosition && viewIndex < -1
        ? 0
        : (viewIndex >= latestIndex ? -1 : viewIndex + 1);
    const handleViewMove = (targetIndex) => {
        if (!hasMoves) return;
        onViewMove(targetIndex);
    };

    return (
    <div className="p-2 bg-[#21201d] rounded-b-lg border-t border-[#3c3a37] shrink-0">
        <div className="flex justify-between gap-1 mb-3 px-1 h-12">
            <ControlBtn icon={<ResetArrow size={20} />} onClick={() => handleViewMove(hasStartingPosition ? -2 : 0)} disabled={!hasMoves} />
            <ControlBtn
                icon={<ChevronLeft size={20} />}
                onClick={() => onViewMove(previousIndex, {
                    keepReviewPanel: hasStartingPosition && viewIndex === 0 && previousIndex <= -2,
                })}
                disabled={!hasMoves}
            />
            <ControlBtn icon={<ChevronRight size={20} />} onClick={() => handleViewMove(nextIndex)} disabled={!hasMoves} />
            <ControlBtn icon={<ArrowChevronEnd size={20} />} onClick={() => handleViewMove(-1)} disabled={!hasMoves} />
        </div>
        <div className="flex justify-center items-center text-[#8b8987] pb-1">
            <div className='flex gap-7 text-xs'>
                <FooterAction icon={<New size={20} />} label="New" onClick={onNewClick} />
                <FooterAction icon={<Save size={20} />} label="Save" onClick={onSaveClick} disabled={!canSave} />
                <FooterAction icon={<Review size={20} />} label="Review" onClick={onReviewClick} disabled={!canReview} />
                <FooterAction icon={<Download size={20} />} label="CSV" onClick={onDownloadClick} />
                <FooterAction icon={<MoreHorizontal size={20} />} label="" />
            </div>
        </div>
    </div>
    );
};

export default AnalysisFooter;
