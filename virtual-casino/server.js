const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

// Import db module to automatically connect and create SQLite tables on startup
require('./db');

// Import auth routes, shared JWT_SECRET, and games router
const { router: authRouter, JWT_SECRET } = require('./routes/auth');
const gamesRouter = require('./routes/games');
const initSocket = require('./socket');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Middleware 1: Parse incoming JSON request bodies
app.use(express.json());

// Middleware 2: Parse cookies sent with HTTP requests (to read httpOnly JWT)
app.use(cookieParser());

// Middleware 3: Serve static frontend files (HTML, CSS, client-side JS)
app.use(express.static(path.join(__dirname, 'public')));

// ─── AUTHENTICATION MIDDLEWARE ───────────────────────────────────────────────
// Verifies the JWT cookie on incoming HTTP requests.
// If valid, extracts the userId and attaches it to `req.userId`.
// If invalid or missing, rejects the request with HTTP 401 Unauthorized.
const auth = (req, res, next) => {
  const token = req.cookies && req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: Please log in to access this feature.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next(); // Pass control to the next route handler
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid. Please log in again.' });
  }
};

// Public authentication routes (signup, login, logout, me)
app.use('/api/auth', authRouter);

// Protected games routes (requires valid auth middleware)
app.use('/api/games', auth, gamesRouter);

// ─── WIRE UP REAL-TIME SOCKET.IO SERVER ─────────────────────────────────────
initSocket(io, JWT_SECRET);

// Start HTTP + WebSocket server
server.listen(PORT, () => {
  console.log('====================================================');
  console.log(`🎰 Virtual Casino running at: http://localhost:${PORT}`);
  console.log('⚠️  SIMULATION ONLY — FAKE COINS ONLY — NO REAL MONEY');
  console.log('⚔️  REAL-TIME MULTIPLAYER PVP COIN FLIP DUELS READY');
  console.log('====================================================');
});
