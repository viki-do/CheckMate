import React, { useEffect } from 'react';
import { useOutletContext, useNavigate } from 'react-router-dom';
import BotSelectionPanel from './BotSelectionPanel';
import MoveListPanel from './MoveListPanel';

const BotSelectionOrGame = () => {
    const context = useOutletContext();
    const navigate = useNavigate();

    // Adatok kinyerése a contextből
    const { 
        gameId, 
        status, 
        isLoading, 
        handleBotSelect, 
        handleTimeChange, 
        handleSelectionColorChange, 
        setPreviewOpponent,
        isGameActiveUI,
    } = context;

    // --- DIAGNOSZTIKAI LOGOK ---
    useEffect(() => {
        
    }, [gameId, status, isLoading, isGameActiveUI]);

    /**
     * 1. LÉPÉS: Várakozás
     */
    if (isLoading) {
       
        return <div className="flex-1 bg-[#262421]" />;
    }

   
    if (gameId && gameId !== "null") {
    
        return (
            <MoveListPanel 
                {...context} 
                onFlipBoard={() => context.setIsFlipped(!context.isFlipped)} 
            />
        );
    }

    /**
     * 3. LÉPÉS: Alapértelmezett állapot
     * Ha nincs gameId (null), akkor visszatérünk a választóhoz.
     */
    return (
        <BotSelectionPanel 
            onBack={() => navigate('/play')}
            onSelectBot={handleBotSelect}
            onTimeChange={handleTimeChange}
            onColorChange={handleSelectionColorChange}
            onPreviewChange={setPreviewOpponent}
        />
    );
};

export default BotSelectionOrGame;
