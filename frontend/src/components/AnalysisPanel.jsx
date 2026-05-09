import { useState } from 'react';
import ActiveAnalysisView from './analysis-panel/ActiveAnalysisView';
import AnalysisFooter from './analysis-panel/AnalysisFooter';
import AnalysisTooltipBoard from './analysis-panel/AnalysisTooltipBoard';
import EmptyAnalysisMenu from './analysis-panel/EmptyAnalysisMenu';
import { buildAnalysisCsv, buildMoveRows } from './move-list/moveListUtils';
import {
    DEFAULT_FEN,
    getCurrentMoveData,
    getDisplayLines,
} from './analysis-panel/analysisPanelUtils';

const AnalysisPanel = ({
    history,
    openingName,
    onSaveClick,
    onNewClick,
    viewIndex,
    onViewMove,
    onReviewClick,
    onSetupClick,
    currentFen,
    initialAnalysis,
    statusText,
    resultLabel,
}) => {
    const [tooltip, setTooltip] = useState({ x: 0, y: 0, visible: false, fen: null });
    const isActive = history.length > 0 || (currentFen && currentFen !== DEFAULT_FEN);
    const currentMoveData = getCurrentMoveData({ history, viewIndex, currentFen, initialAnalysis });
    const engineLinesToDisplay = getDisplayLines({ history, viewIndex, initialAnalysis, currentMoveData });
    const handleDownloadTable = () => {
        if (!history || history.length === 0) return;

        const csvContent = buildAnalysisCsv(buildMoveRows(history));
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.setAttribute("href", url);
        link.setAttribute("download", `sandbox_analysis_${new Date().getTime()}.csv`);
        link.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="relative w-[480px] h-[744px] bg-[#262421] rounded-lg flex flex-col shadow-xl border border-[#3c3a37] overflow-hidden font-sans">
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                {!isActive ? (
                    <EmptyAnalysisMenu onSetupClick={onSetupClick} />
                ) : (
                    <ActiveAnalysisView
                        history={history}
                        viewIndex={viewIndex}
                        openingName={openingName}
                        currentFen={currentFen}
                        currentMoveData={currentMoveData}
                        engineLinesToDisplay={engineLinesToDisplay}
                        statusText={statusText}
                        resultLabel={resultLabel}
                        onViewMove={onViewMove}
                        onTooltipChange={setTooltip}
                    />
                )}
            </div>

            <AnalysisFooter
                history={history}
                viewIndex={viewIndex}
                onViewMove={onViewMove}
                onNewClick={onNewClick}
                onSaveClick={onSaveClick}
                onReviewClick={onReviewClick}
                onDownloadClick={handleDownloadTable}
            />

            <AnalysisTooltipBoard tooltip={tooltip} />
        </div>
    );
};

export default AnalysisPanel;
