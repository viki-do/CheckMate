import { io } from "socket.io-client";
import { SOCKET_URL } from "./config/api";

// Csak akkor hozzuk létre a kapcsolatot, ha még nincs
export const socket = io(SOCKET_URL, {
    autoConnect: false, // Majd mi indítjuk el manuálisan
    reconnection: true,
});
