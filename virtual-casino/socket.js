// ══════════════════════════════════════════════════════════════════════════════
// REAL-TIME MULTIPLAYER PVP COIN FLIP DUEL — SOCKET.IO LOGIC
// Server-authoritative state, room management, countdowns, and database updates.
// ══════════════════════════════════════════════════════════════════════════════

const jwt = require('jsonwebtoken');
const { dbRun, dbGet } = require('./db');

// In-memory active rooms store: roomCode -> Room Object
const rooms = new Map();

// In-memory rate limiting map: socketId -> timestamp of last action
const rateLimits = new Map();

// Helper: Generate a unique 5-character alphanumeric room code (omits confusing characters like 0, O, 1, I)
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return rooms.has(code) ? generateRoomCode() : code;
}

// Helper: Check rate limit (1 action per second per socket)
function checkRateLimit(socketId) {
  const now = Date.now();
  const last = rateLimits.get(socketId) || 0;
  if (now - last < 1000) {
    return false;
  }
  rateLimits.set(socketId, now);
  return true;
}

// Helper: Start server-authoritative 3-2-1 countdown and resolve duel
function startCountdownAndFlip(io, room) {
  let count = 3;
  io.to(room.code).emit('countdown', { n: count });

  room.countdownTimer = setInterval(async () => {
    // If the room was destroyed mid-countdown (e.g. disconnect), cancel timer
    if (!rooms.has(room.code) || room.status !== 'in_progress') {
      clearInterval(room.countdownTimer);
      return;
    }

    count--;
    if (count > 0) {
      io.to(room.code).emit('countdown', { n: count });
    } else {
      clearInterval(room.countdownTimer);
      room.countdownTimer = null;
      await resolveDuel(io, room);
    }
  }, 1000);
}

// Helper: Server-side coin flip and database payouts
async function resolveDuel(io, room) {
  try {
    // Random server-side outcome: 50% chance heads, 50% chance tails
    const winningSide = Math.random() < 0.5 ? 'heads' : 'tails';

    // Host is heads, Guest is tails
    const winner = (winningSide === 'heads') ? room.host : room.guest;
    const loser = (winningSide === 'heads') ? room.guest : room.host;

    // HOUSE EDGE MATH:
    // Both players had `room.bet` locked and deducted upon duel start.
    // Total pot = 2 * bet.
    // Winner receives bet * 1.9 (5% house edge on total pot).
    // Net profit for winner = payout - bet = +0.9 * bet.
    // Loser gets 0 (net change = -bet).
    const payout = Math.floor(room.bet * 1.9);
    const winnerProfit = payout - room.bet;

    // Credit payout to winner in SQLite
    await dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [payout, winner.userId]);

    // Record audit transactions for both players
    await dbRun(
      'INSERT INTO transactions (user_id, amount, game, result) VALUES (?, ?, ?, ?)',
      [winner.userId, winnerProfit, 'PvP Duel', `Won duel vs ${loser.username} (landed ${winningSide})`]
    );

    await dbRun(
      'INSERT INTO transactions (user_id, amount, game, result) VALUES (?, ?, ?, ?)',
      [loser.userId, -room.bet, 'PvP Duel', `Lost duel vs ${winner.username} (landed ${winningSide})`]
    );

    // Fetch updated balances from DB to synchronize clients
    const winnerDb = await dbGet('SELECT balance FROM users WHERE id = ?', [winner.userId]);
    const loserDb = await dbGet('SELECT balance FROM users WHERE id = ?', [loser.userId]);

    // Broadcast result to both players in the room
    io.to(room.code).emit('duel_result', {
      winnerId: winner.userId,
      loserId: loser.userId,
      winnerUsername: winner.username,
      loserUsername: loser.username,
      winningSide,
      payout,
      bet: room.bet,
      balances: {
        [winner.userId]: winnerDb ? winnerDb.balance : null,
        [loser.userId]: loserDb ? loserDb.balance : null
      }
    });

    // Clean up room state
    const hostSocket = io.sockets.sockets.get(room.host.socketId);
    const guestSocket = io.sockets.sockets.get(room.guest.socketId);
    if (hostSocket) {
      hostSocket.roomCode = null;
      hostSocket.leave(room.code);
    }
    if (guestSocket) {
      guestSocket.roomCode = null;
      guestSocket.leave(room.code);
    }
    rooms.delete(room.code);
  } catch (err) {
    console.error('Error resolving duel:', err);
    io.to(room.code).emit('duel_cancelled', { reason: 'An unexpected server error occurred during resolution.' });
    rooms.delete(room.code);
  }
}

// Helper: Refund bets and notify remaining player when a player leaves or disconnects during active duel
async function refundAndCloseRoom(io, room, disconnectedSocketId) {
  // Clear any running timers
  if (room.countdownTimer) {
    clearInterval(room.countdownTimer);
    room.countdownTimer = null;
  }
  if (room.timeoutTimer) {
    clearTimeout(room.timeoutTimer);
    room.timeoutTimer = null;
  }

  // If duel was in progress, bets were already deducted from both players. Refund them!
  if (room.status === 'in_progress') {
    try {
      if (room.host) {
        await dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [room.bet, room.host.userId]);
        await dbRun(
          'INSERT INTO transactions (user_id, amount, game, result) VALUES (?, ?, ?, ?)',
          [room.host.userId, 0, 'PvP Duel', 'Duel refunded (opponent left during countdown)']
        );
      }
      if (room.guest) {
        await dbRun('UPDATE users SET balance = balance + ? WHERE id = ?', [room.bet, room.guest.userId]);
        await dbRun(
          'INSERT INTO transactions (user_id, amount, game, result) VALUES (?, ?, ?, ?)',
          [room.guest.userId, 0, 'PvP Duel', 'Duel refunded (opponent left during countdown)']
        );
      }
    } catch (err) {
      console.error('Refund error:', err);
    }

    // Notify whichever player is still in the room
    io.to(room.code).emit('opponent_left', {
      message: 'Opponent left the duel. Your bet has been fully refunded.'
    });
  } else if (room.status === 'waiting') {
    // Only host was waiting; notify if anyone was connected
    io.to(room.code).emit('duel_cancelled', { reason: 'Host cancelled or disconnected from the room.' });
  }

  // Clean up socket references
  const hostSocket = room.host ? io.sockets.sockets.get(room.host.socketId) : null;
  const guestSocket = room.guest ? io.sockets.sockets.get(room.guest.socketId) : null;
  if (hostSocket) { hostSocket.roomCode = null; hostSocket.leave(room.code); }
  if (guestSocket) { guestSocket.roomCode = null; guestSocket.leave(room.code); }

  rooms.delete(room.code);
}

// Main Socket.IO initializer module
module.exports = function initSocket(io, jwtSecret) {
  // ─── HANDSHAKE AUTHENTICATION MIDDLEWARE ──────────────────────────────────
  // Reads httpOnly 'token' cookie from socket handshake and validates JWT
  io.use((socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie;
      if (!cookieHeader) {
        return next(new Error('Unauthorized: No authentication cookie found.'));
      }

      // Parse 'token' cookie using regular expression
      const match = cookieHeader.match(/(?:^|;\s*)token=([^;]+)/);
      const token = match ? match[1] : null;

      if (!token) {
        return next(new Error('Unauthorized: Missing session token.'));
      }

      // Verify JWT token signature and expiration
      const decoded = jwt.verify(token, jwtSecret);
      socket.userId = decoded.userId;
      socket.username = decoded.username;
      socket.roomCode = null;
      next();
    } catch (err) {
      return next(new Error('Unauthorized: Invalid or expired session token.'));
    }
  });

  // ─── CONNECTION HANDLER ───────────────────────────────────────────────────
  io.on('connection', (socket) => {
    // EVENT 1: Create Duel Room
    socket.on('create_duel', async ({ bet: rawBet }, callback) => {
      if (typeof callback !== 'function') callback = () => {};

      // Rate limit check
      if (!checkRateLimit(socket.id)) {
        return callback({ error: 'Slow down! Limit 1 action per second.' });
      }

      // Check if user is already participating in an active duel room
      if (socket.roomCode && rooms.has(socket.roomCode)) {
        return callback({ error: 'You are already in an active duel room. Leave it first.' });
      }

      const bet = parseInt(rawBet, 10);
      if (isNaN(bet) || !Number.isInteger(bet) || bet <= 0) {
        return callback({ error: 'Bet amount must be a positive whole number.' });
      }

      try {
        // Verify balance in SQLite database (never trust client)
        const user = await dbGet('SELECT balance FROM users WHERE id = ?', [socket.userId]);
        if (!user) {
          return callback({ error: 'User account not found.' });
        }
        if (user.balance < bet) {
          return callback({ error: `Insufficient balance! You have ${user.balance} coins.` });
        }

        // Generate 5-character unique code
        const roomCode = generateRoomCode();

        // 60-second inactivity timeout for waiting rooms
        const timeoutTimer = setTimeout(() => {
          if (rooms.has(roomCode) && rooms.get(roomCode).status === 'waiting') {
            io.to(roomCode).emit('duel_cancelled', { reason: 'Duel timed out: No opponent joined within 60 seconds.' });
            const s = io.sockets.sockets.get(socket.id);
            if (s) {
              s.roomCode = null;
              s.leave(roomCode);
            }
            rooms.delete(roomCode);
          }
        }, 60000);

        // Store new room state
        const room = {
          code: roomCode,
          bet,
          host: {
            socketId: socket.id,
            userId: socket.userId,
            username: socket.username,
            side: 'heads' // Host is always Heads
          },
          guest: null,
          status: 'waiting',
          timeoutTimer,
          countdownTimer: null,
          createdAt: Date.now()
        };

        rooms.set(roomCode, room);
        socket.roomCode = roomCode;
        socket.join(roomCode);

        return callback({ roomCode });
      } catch (err) {
        console.error('Create duel error:', err);
        return callback({ error: 'Failed to create duel room.' });
      }
    });

    // EVENT 2: Join Duel Room
    socket.on('join_duel', async ({ roomCode: rawCode }, callback) => {
      if (typeof callback !== 'function') callback = () => {};

      // Rate limit check
      if (!checkRateLimit(socket.id)) {
        return callback({ error: 'Slow down! Limit 1 action per second.' });
      }

      if (!rawCode || typeof rawCode !== 'string') {
        return callback({ error: 'Invalid room code.' });
      }

      const roomCode = rawCode.trim().toUpperCase();

      // Check if user is already participating in an active duel
      if (socket.roomCode && rooms.has(socket.roomCode)) {
        return callback({ error: 'You are already in an active duel. Leave it first.' });
      }

      const room = rooms.get(roomCode);
      if (!room || room.status !== 'waiting') {
        return callback({ error: 'Room not found or duel has already started.' });
      }

      // Prevent user from joining their own duel room
      if (room.host.userId === socket.userId) {
        return callback({ error: 'Cannot join your own duel.' });
      }

      // Concurrency lock: immediately change status to avoid race condition of 2 simultaneous joiners
      room.status = 'starting';
      clearTimeout(room.timeoutTimer);
      room.timeoutTimer = null;

      try {
        // Validate joining player's balance in SQLite
        const guestUser = await dbGet('SELECT balance FROM users WHERE id = ?', [socket.userId]);
        if (!guestUser || guestUser.balance < room.bet) {
          room.status = 'waiting'; // Revert status so someone else can join
          return callback({ error: `Insufficient balance! You need ${room.bet} coins to join this duel.` });
        }

        // Validate host player's balance is still sufficient
        const hostUser = await dbGet('SELECT balance FROM users WHERE id = ?', [room.host.userId]);
        if (!hostUser || hostUser.balance < room.bet) {
          rooms.delete(roomCode);
          return callback({ error: 'Duel cancelled: The host no longer has sufficient balance.' });
        }

        // Lock & deduct bets from both players in SQLite
        await dbRun('UPDATE users SET balance = balance - ? WHERE id = ?', [room.bet, room.host.userId]);
        await dbRun('UPDATE users SET balance = balance - ? WHERE id = ?', [room.bet, socket.userId]);

        // Assign guest player to room
        room.guest = {
          socketId: socket.id,
          userId: socket.userId,
          username: socket.username,
          side: 'tails' // Guest is always Tails
        };

        socket.roomCode = roomCode;
        socket.join(roomCode);
        room.status = 'in_progress';

        callback({ ok: true });

        // Broadcast duel_ready to both players in the room
        io.to(roomCode).emit('duel_ready', {
          players: [
            { id: room.host.userId, username: room.host.username, side: 'heads' },
            { id: room.guest.userId, username: room.guest.username, side: 'tails' }
          ],
          bet: room.bet
        });

        // Trigger the 3-2-1 countdown on the server
        startCountdownAndFlip(io, room);
      } catch (err) {
        console.error('Join duel error:', err);
        room.status = 'waiting';
        return callback({ error: 'Failed to join duel room.' });
      }
    });

    // EVENT 3: Cancel Duel (Host cancels before guest joins)
    socket.on('cancel_duel', ({ roomCode: rawCode }, callback) => {
      if (typeof callback !== 'function') callback = () => {};

      if (!checkRateLimit(socket.id)) {
        return callback({ error: 'Slow down! Limit 1 action per second.' });
      }

      const roomCode = (rawCode || socket.roomCode || '').trim().toUpperCase();
      const room = rooms.get(roomCode);

      if (!room) {
        socket.roomCode = null;
        return callback({ ok: true });
      }

      // Only host can cancel a waiting room
      if (room.host.userId !== socket.userId) {
        return callback({ error: 'Only the host can cancel this duel.' });
      }

      if (room.status !== 'waiting') {
        return callback({ error: 'Cannot cancel a duel that has already started.' });
      }

      clearTimeout(room.timeoutTimer);
      io.to(roomCode).emit('duel_cancelled', { reason: 'Host cancelled the duel.' });
      socket.leave(roomCode);
      socket.roomCode = null;
      rooms.delete(roomCode);

      return callback({ ok: true });
    });

    // EVENT 4: Leave Duel / Quit Active Room
    socket.on('leave_duel', async ({ roomCode: rawCode }, callback) => {
      if (typeof callback !== 'function') callback = () => {};

      const roomCode = (rawCode || socket.roomCode || '').trim().toUpperCase();
      const room = rooms.get(roomCode);

      if (room) {
        await refundAndCloseRoom(io, room, socket.id);
      }

      socket.roomCode = null;
      return callback({ ok: true });
    });

    // EVENT 5: Socket Disconnect (Browser tab closed, internet dropped)
    socket.on('disconnect', async () => {
      rateLimits.delete(socket.id);

      if (socket.roomCode && rooms.has(socket.roomCode)) {
        const room = rooms.get(socket.roomCode);
        await refundAndCloseRoom(io, room, socket.id);
      }
    });
  });
};
