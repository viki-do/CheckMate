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

const AnalysisFooter = ({ history, viewIndex, onViewMove, onNewClick, onSaveClick, onReviewClick, onDownloadClick }) => (
    <div className="p-2 bg-[#21201d] rounded-b-lg border-t border-[#3c3a37] shrink-0">
        <div className="flex justify-between gap-1 mb-3 px-1 h-12">
            <ControlBtn icon={<ResetArrow size={20} />} onClick={() => onViewMove(0)} />
            <ControlBtn icon={<ChevronLeft size={20} />} onClick={() => onViewMove(viewIndex === -1 ? history.length - 2 : viewIndex - 1)} />
            <ControlBtn icon={<ChevronRight size={20} />} onClick={() => onViewMove(viewIndex === -1 ? -1 : viewIndex + 1)} />
            <ControlBtn icon={<ArrowChevronEnd size={20} />} onClick={() => onViewMove(-1)} />
        </div>
        <div className="flex justify-center items-center text-[#8b8987] pb-1">
            <div className='flex gap-7 text-xs'>
                <FooterAction icon={<New size={20} />} label="New" onClick={onNewClick} />
                <FooterAction icon={<Save size={20} />} label="Save" onClick={onSaveClick} />
                <FooterAction icon={<Review size={20} />} label="Review" onClick={onReviewClick} />
                <FooterAction icon={<Download size={20} />} label="CSV" onClick={onDownloadClick} />
                <FooterAction icon={<MoreHorizontal size={20} />} label="" />
            </div>
        </div>
    </div>
);

export default AnalysisFooter;
