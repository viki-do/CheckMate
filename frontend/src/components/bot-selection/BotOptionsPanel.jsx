import Switch from './Switch';
import TimeGroup from './TimeGroup';
import { GameTypeBlitz, GameTypeBullet, GameTypeRapid } from '../icons/Icons';

const BotOptionsPanel = ({ selectedBot, timeControl, features, onSetTime, onToggleFeature }) => (
    <div className="flex flex-col animate-in fade-in slide-in-from-top-4 duration-200">
        <button
            className={`w-full py-4 mb-6 rounded-lg font-bold border-2 transition-all 
            ${timeControl === 'No Timer' ? 'border-[#81b64c] bg-[#2b2a27] text-white' : 'border-transparent bg-[#3d3a37] text-[#989795]'}`}
            onClick={() => onSetTime('No Timer')}
        >
            No Timer
        </button>
        <TimeGroup label="Bullet" Icon={GameTypeBullet} color="text-yellow-500" times={['1 min', '1 | 1', '2 | 1']} current={timeControl} onSelect={onSetTime} />
        <TimeGroup label="Blitz" Icon={GameTypeBlitz} color="text-yellow-400" times={['3 | 2', '5 min', '5 | 5']} current={timeControl} onSelect={onSetTime} />
        <TimeGroup label="Rapid" Icon={GameTypeRapid} color="text-[#81b64c]" times={['10 min', '15 | 10', '30 min', '10 | 5', '20 min', '60 min']} current={timeControl} onSelect={onSetTime} />

        {selectedBot?.id === 'engine' && (
            <div className="mt-4 pt-6 border-t border-[#3d3a37] flex flex-col gap-4 pb-4">
                <Switch label="Evaluation Bar" active={features.evalBar} onClick={() => onToggleFeature('evalBar')} />
                <Switch label="Threat Arrows" active={features.threatArrows} onClick={() => onToggleFeature('threatArrows')} desc="Green arrows show moves to consider." />
                <Switch label="Suggestion Arrows" active={features.suggestionArrows} onClick={() => onToggleFeature('suggestionArrows')} />
                <Switch label="Move Feedback" active={features.moveFeedback} onClick={() => onToggleFeature('moveFeedback')} />
                <Switch label="Engine" active={features.engine} onClick={() => onToggleFeature('engine')} />
            </div>
        )}
    </div>
);

export default BotOptionsPanel;
