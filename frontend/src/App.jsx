import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';
import GameBoard from './pages/GameBoard';
import ProfilePage from './pages/ProfilePage';
import Navbar from './components/Navbar';
import HomePage from './pages/HomePage';
import GameArchive from './pages/GameArchive';
import GameDatabase from './pages/GameDatabase';
import GameCollectionsPage from './pages/GameCollectionsPage';
import SavedAnalysisPage from './pages/SavedAnalysisPage';
import AnalyzeBoard from './components/AnalyzeBoard';
import PlaySelectionPanel from './components/PlaySelectionPanel';
import BotSelectionOrGame from './components/BotSelectionOrGame';
import SettingsProfilePage from './pages/SettingsProfilePage';
import SettingsAccountPage from './pages/SettingsAccountPage';
import ChangeUsernamePage from './pages/ChangeUsernamePage';

import { useChess } from './context/ChessContext';

const App = () => {
    const token = localStorage.getItem('chessToken');
    const isAuthenticated = !!token;

    //A központi Context-ből kérjük el az inicializálót
    const { initializeGame } = useChess();

    // Automatikus inicializálás az oldal betöltésekor
    useEffect(() => {
        if (isAuthenticated) {
            console.log("App: Felhasználó hitelesítve, játék inicializálása...");
            initializeGame();
        }
    }, [isAuthenticated, initializeGame]);

    return (
        <Router>
            <div className="flex min-h-screen bg-[#1e1e1e]">
                {/* A Navbar csak bejelentkezett felhasználóknak látszik */}
                {isAuthenticated && <Navbar />}

                <main className={`flex-1 ${isAuthenticated ? 'overflow-y-auto h-screen' : ''}`}>
                    <Routes>
                        {/* --- PUBLIKUS ÚTVONALAK --- */}
                        <Route 
                            path="/login" 
                            element={!isAuthenticated ? <LoginPage /> : <Navigate to="/home" />} 
                        />
                        <Route 
                            path="/register" 
                            element={!isAuthenticated ? <RegisterPage /> : <Navigate to="/home" />} 
                        />

                        {/* --- VÉDETT ÚTVONALAK --- */}
                        <Route 
                            path="/home" 
                            element={isAuthenticated ? <HomePage /> : <Navigate to="/login" />} 
                        />

                        {/* --- JÁTÉK SZAKASZ (BEÁGYAZOTT ÚTVONALAKKAL) --- */}
                        <Route 
                            path="/play" 
                            element={isAuthenticated ? <GameBoard /> : <Navigate to="/login" />}
                        >
                            {/* Alapértelmezett nézet a /play-en: a trófeás választó panel */}
                            <Route index element={<PlaySelectionPanel />} />
                            
                            {/* A /play/bots útvonalon dől el: botlista VAGY aktív játék */}
                            <Route path="bots" element={<BotSelectionOrGame />} />
                        </Route>
                        <Route
                            path="/play/archive/:archiveGameId"
                            element={isAuthenticated ? <GameBoard /> : <Navigate to="/login" />}
                        >
                            <Route index element={<BotSelectionOrGame />} />
                        </Route>
                        <Route
                            path="/game/bots/:archiveGameId"
                            element={isAuthenticated ? <GameBoard /> : <Navigate to="/login" />}
                        >
                            <Route index element={<BotSelectionOrGame />} />
                        </Route>

                        <Route 
                            path="/analysis" 
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />} 
                        />
                        <Route
                            path="/analysis/games"
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/analysis/explorer"
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/analysis/saved"
                            element={isAuthenticated ? <SavedAnalysisPage /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/analysis/saved/:savedAnalysisId/analysis"
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />}
                        />
                        <Route 
                            path="/analysis/collections" 
                            element={isAuthenticated ? <GameCollectionsPage /> : <Navigate to="/login" />} 
                        />
                        <Route
                            path="/analysis/collection/:collectionSlug/games"
                            element={isAuthenticated ? <GameCollectionsPage /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/analysis/collection/:collectionSlug/:collectionGameId/analysis"
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/analysis/collection/:collectionSlug/:collectionGameId/review"
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/analysis/collection/:collectionSlug/:collectionGameId/games"
                            element={isAuthenticated ? <GameCollectionsPage /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/analysis/collection/:collectionSlug/:collectionGameId/collection-settings"
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />}
                        />
                        <Route 
                            path="/analysis/game/master/:gameId/review" 
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />} 
                        />
                        <Route
                            path="/analysis/game/pgn/:pgnGameId/review"
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/analysis/game/bots/:botSelfAnalysisGameId/analysis"
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/analysis/game/bots/:botReviewGameId/review"
                            element={isAuthenticated ? <AnalyzeBoard /> : <Navigate to="/login" />}
                        />
                        
                        <Route 
                            path="/member/:username" 
                            element={isAuthenticated ? <ProfilePage archiveMode={false} /> : <Navigate to="/login" />} 
                        />

                        <Route 
                            path="/member/:username/games" 
                            element={isAuthenticated ? <ProfilePage archiveMode={true} /> : <Navigate to="/login" />} 
                        />

                        <Route
                            path="/settings/profile"
                            element={isAuthenticated ? <SettingsProfilePage /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/settings/account"
                            element={isAuthenticated ? <SettingsAccountPage /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/settings/change-username"
                            element={isAuthenticated ? <ChangeUsernamePage /> : <Navigate to="/login" />}
                        />

                        <Route 
                            path="/games/archive/:username"
                            element={isAuthenticated ? <GameArchive /> : <Navigate to="/login" />} 
                        />

                        <Route
                            path="/games"
                            element={isAuthenticated ? <GameDatabase /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/games/view/:gameId"
                            element={isAuthenticated ? <GameDatabase /> : <Navigate to="/login" />}
                        />
                        <Route
                            path="/games/:playerSlug"
                            element={isAuthenticated ? <GameDatabase /> : <Navigate to="/login" />}
                        />

                        {/* Alapértelmezett átirányítások */}
                        <Route 
                            path="/profile" 
                            element={<Navigate to={`/member/${localStorage.getItem('chessUsername') || 'user'}`} />} 
                        />
                        <Route 
                            path="/" 
                            element={isAuthenticated ? <Navigate to="/home" /> : <Navigate to="/login" />} 
                        />
                    </Routes>
                </main>
            </div>
        </Router>
    );
};

export default App;
