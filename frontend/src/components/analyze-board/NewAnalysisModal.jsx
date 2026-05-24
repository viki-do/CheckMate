import { motion } from 'framer-motion';
import { SetUpPosition } from '../icons/Icons';

const MotionDiv = motion.div;

const NewAnalysisModal = ({ isOpen, onClose, onConfirm }) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[7000] flex items-center justify-center">
            <MotionDiv
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={onClose}
                className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            />

            <MotionDiv
                initial={{ opacity: 0, scale: 0.9, y: 20 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.9, y: 20 }}
                className="relative w-[min(400px,calc(100vw-32px))] bg-[#262421] rounded-xl shadow-2xl border border-[#3c3a37] p-5 sm:p-8 overflow-hidden text-center"
            >
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-[#8b8987] hover:text-white transition-colors"
                >
                    <SetUpPosition size={20} className="rotate-45" />
                </button>

                <h2 className="text-white text-2xl font-bold mb-2">Start New Analysis?</h2>
                <p className="text-[#bab9b8] text-sm mb-8">
                    Any unsaved progress will be lost.
                </p>

                <div className="flex gap-4">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-[#3d3a37] hover:bg-[#45423e] text-white font-bold rounded-lg transition-colors shadow-lg"
                    >
                        Cancel
                    </button>

                    <button
                        onClick={onConfirm}
                        className="flex-1 py-3 bg-[#fa412d] hover:bg-[#ff5a4a] text-white font-bold rounded-lg transition-colors shadow-lg"
                    >
                        New Analysis
                    </button>
                </div>
            </MotionDiv>
        </div>
    );
};

export default NewAnalysisModal;
