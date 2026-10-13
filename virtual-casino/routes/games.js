const express = require('express');
const router = express.Router();
const { dbRun, dbGet, dbAll } = require('../db');

// In-memory map to enforce rate limit: max 1 request per second per user
const lastBetTimes = new Map();

const rateLimitGame = (req, res, next) => {
  const userId = req.userId;
  const now = Date.now();
  const lastTime = lastBetTimes.get(userId) || 0;

  if (now - lastTime < 1000) {
    return res.status(429).json({ error: 'Slow down! Limit 1 bet per second.' });
  }

  lastBetTimes.set(userId, now);
  next();
};

// Helper function to validate bet amounts server-side
const validateBet = async (userId, rawBet) => {
  const bet = parseInt(rawBet, 10);
  if (isNaN(bet) || !Number.isInteger(bet) || bet <= 0) {
    return { error: 'Bet amount must be a positive whole number.', status: 400 };
  }

  const user = await dbGet('SELECT balance FROM users WHERE id = ?', [userId]);
  if (!user) {
    return { error: 'User account not found.', status: 404 };
  }

  if (bet > user.balance) {
    return { error: `Insufficient balance! You have ${user.balance} coins.`, status: 400 };
  }

  return { bet, balance: user.balance };
};

// GET /api/games/balance - Fetch user's current balance
router.get('/balance', async (req, res) => {
  try {
    const user = await dbGet('SELECT username, balance FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ username: user.username, balance: user.balance });
  } catch (err) {
    console.error('Balance error:', err);
    return res.status(500).json({ error: 'Failed to retrieve balance.' });
  }
});

// POST /api/games/flip - Coin Flip (Win pays 1.9x -> 5% house edge)
router.post('/flip', rateLimitGame, async (req, res) => {
  try {
    const { bet: rawBet, choice } = req.body;

    // Validate choice ('heads' or 'tails')
    const cleanChoice = (choice || '').trim().toLowerCase();
    if (cleanChoice !== 'heads' && cleanChoice !== 'tails') {
      return res.status(400).json({ error: 'Please choose either "heads" or "tails".' });
    }

    // Validate bet against current balance
    const check = await validateBet(req.userId, rawBet);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }

    const { bet, balance } = check;

    // Server-side outcome generation (50% heads, 50% tails)
    const outcome = Math.random() < 0.5 ? 'heads' : 'tails';
    const won = (cleanChoice === outcome);

    // HOUSE EDGE MATH:
    // Payout is 1.9x bet. Expected Value = (0.5 * 1.9) + (0.5 * 0) = 0.95 -> 5% house edge
    const payout = won ? Math.floor(bet * 1.9) : 0;
    const netChange = won ? (payout - bet) : -bet;
    const newBalance = balance + netChange;

    // Update balance in SQLite
    await dbRun('UPDATE users SET balance = ? WHERE id = ?', [newBalance, req.userId]);

    // Record in transactions log
    const resultText = won
      ? `Won +${netChange} coins (chose ${cleanChoice}, landed ${outcome})`
      : `Lost -${bet} coins (chose ${cleanChoice}, landed ${outcome})`;

    await dbRun(
      'INSERT INTO transactions (user_id, amount, game, result) VALUES (?, ?, ?, ?)',
      [req.userId, netChange, 'Coin Flip', resultText]
    );

    return res.json({
      won,
      outcome,
      choice: cleanChoice,
      payout,
      netChange,
      newBalance,
      message: won ? `🎉 Winner! Landed on ${outcome}! (+${netChange} coins)` : `😢 Lost! Landed on ${outcome}. (-${bet} coins)`
    });
  } catch (err) {
    console.error('Flip error:', err);
    return res.status(500).json({ error: 'Failed to process coin flip.' });
  }
});

// POST /api/games/dice - Pick 1-6 (Win pays 5x -> ~16.7% house edge)
router.post('/dice', rateLimitGame, async (req, res) => {
  try {
    const { bet: rawBet, choice: rawChoice } = req.body;

    const choice = parseInt(rawChoice, 10);
    if (isNaN(choice) || choice < 1 || choice > 6) {
      return res.status(400).json({ error: 'Please pick a die number between 1 and 6.' });
    }

    const check = await validateBet(req.userId, rawBet);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }

    const { bet, balance } = check;

    // Server-side random integer between 1 and 6
    const roll = Math.floor(Math.random() * 6) + 1;
    const won = (choice === roll);

    // HOUSE EDGE MATH:
    // Payout is 5x bet. Expected Value = (1/6 * 5) + (5/6 * 0) = 5/6 = 0.8333 -> ~16.7% house edge
    const payout = won ? (bet * 5) : 0;
    const netChange = won ? (payout - bet) : -bet;
    const newBalance = balance + netChange;

    await dbRun('UPDATE users SET balance = ? WHERE id = ?', [newBalance, req.userId]);

    const resultText = won
      ? `Won +${netChange} coins (picked ${choice}, rolled ${roll})`
      : `Lost -${bet} coins (picked ${choice}, rolled ${roll})`;

    await dbRun(
      'INSERT INTO transactions (user_id, amount, game, result) VALUES (?, ?, ?, ?)',
      [req.userId, netChange, 'Dice Roll', resultText]
    );

    return res.json({
      won,
      roll,
      choice,
      payout,
      netChange,
      newBalance,
      message: won ? `🎲 Direct Hit! Rolled a ${roll}! (+${netChange} coins)` : `🎲 Missed! Rolled a ${roll}. (-${bet} coins)`
    });
  } catch (err) {
    console.error('Dice error:', err);
    return res.status(500).json({ error: 'Failed to process dice roll.' });
  }
});

// POST /api/games/slots - 3 Reels Slot Machine
// 3-match = 10x, 2-match = 2x, else lose
router.post('/slots', rateLimitGame, async (req, res) => {
  try {
    const { bet: rawBet } = req.body;

    const check = await validateBet(req.userId, rawBet);
    if (check.error) {
      return res.status(check.status).json({ error: check.error });
    }

    const { bet, balance } = check;

    // 7 distinct symbols:
    // P(3-match) = 1/49 (~2.04%) -> pays 10x
    // P(2-match) = 18/49 (~36.73%) -> pays 2x
    // Expected Value = (10/49) + (36/49) = 46/49 = 0.9388 -> ~6.12% house edge
    const symbols = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣'];

    const reel1 = symbols[Math.floor(Math.random() * symbols.length)];
    const reel2 = symbols[Math.floor(Math.random() * symbols.length)];
    const reel3 = symbols[Math.floor(Math.random() * symbols.length)];
    const reels = [reel1, reel2, reel3];

    let multiplier = 0;
    let matchType = 'No match';

    if (reel1 === reel2 && reel2 === reel3) {
      multiplier = 10;
      matchType = '3-Match JACKPOT (10x)';
    } else if (reel1 === reel2 || reel2 === reel3 || reel1 === reel3) {
      multiplier = 2;
      matchType = '2-Match Win (2x)';
    }

    const won = multiplier > 0;
    const payout = bet * multiplier;
    const netChange = won ? (payout - bet) : -bet;
    const newBalance = balance + netChange;

    await dbRun('UPDATE users SET balance = ? WHERE id = ?', [newBalance, req.userId]);

    const resultText = won
      ? `Won +${netChange} coins [${reels.join(' ')}] (${matchType})`
      : `Lost -${bet} coins [${reels.join(' ')}]`;

    await dbRun(
      'INSERT INTO transactions (user_id, amount, game, result) VALUES (?, ?, ?, ?)',
      [req.userId, netChange, 'Slots', resultText]
    );

    return res.json({
      won,
      reels,
      matchType,
      multiplier,
      payout,
      netChange,
      newBalance,
      message: won ? `🎰 ${matchType}! (+${netChange} coins)` : `🎰 No match: ${reels.join(' ')} (-${bet} coins)`
    });
  } catch (err) {
    console.error('Slots error:', err);
    return res.status(500).json({ error: 'Failed to process slot spin.' });
  }
});

// GET /api/games/history - Last 10 transactions for the authenticated user
router.get('/history', async (req, res) => {
  try {
    const transactions = await dbAll(
      `SELECT id, amount, game, result, created_at
       FROM transactions
       WHERE user_id = ?
       ORDER BY id DESC
       LIMIT 10`,
      [req.userId]
    );
    return res.json({ transactions });
  } catch (err) {
    console.error('History error:', err);
    return res.status(500).json({ error: 'Failed to retrieve transaction history.' });
  }
});

// GET /api/games/leaderboard - Top 10 users ranked by coin balance
router.get('/leaderboard', async (req, res) => {
  try {
    const leaderboard = await dbAll(
      `SELECT username, balance
       FROM users
       ORDER BY balance DESC
       LIMIT 10`
    );
    return res.json({ leaderboard });
  } catch (err) {
    console.error('Leaderboard error:', err);
    return res.status(500).json({ error: 'Failed to retrieve leaderboard.' });
  }
});

// POST /api/games/bonus - Claim 200 free simulation coins once every 24 hours
router.post('/bonus', async (req, res) => {
  try {
    const user = await dbGet('SELECT balance, last_bonus FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;

    if (user.last_bonus) {
      const lastClaim = parseInt(user.last_bonus, 10);
      const elapsed = now - lastClaim;
      if (elapsed < oneDayMs) {
        const remaining = oneDayMs - elapsed;
        const remainingHours = Math.floor(remaining / (1000 * 60 * 60));
        const remainingMins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        return res.status(400).json({
          error: `Daily bonus already claimed! Next available in ${remainingHours}h ${remainingMins}m.`
        });
      }
    }

    const newBalance = user.balance + 200;
    await dbRun('UPDATE users SET balance = ?, last_bonus = ? WHERE id = ?', [newBalance, now.toString(), req.userId]);

    await dbRun(
      'INSERT INTO transactions (user_id, amount, game, result) VALUES (?, ?, ?, ?)',
      [req.userId, 200, 'Daily Bonus', 'Claimed 200 free daily coins']
    );

    return res.json({
      message: '🎁 Claimed 200 free simulation coins!',
      newBalance
    });
  } catch (err) {
    console.error('Bonus error:', err);
    return res.status(500).json({ error: 'Failed to claim daily bonus.' });
  }
});

// POST /api/games/reset - Reset balance back to 1000 simulation coins
router.post('/reset', async (req, res) => {
  try {
    await dbRun('UPDATE users SET balance = 1000 WHERE id = ?', [req.userId]);

    await dbRun(
      'INSERT INTO transactions (user_id, amount, game, result) VALUES (?, ?, ?, ?)',
      [req.userId, 0, 'Reset', 'Reset balance back to 1,000 coins']
    );

    return res.json({
      message: 'Balance reset back to 1,000 simulation coins.',
      newBalance: 1000
    });
  } catch (err) {
    console.error('Reset error:', err);
    return res.status(500).json({ error: 'Failed to reset balance.' });
  }
});

module.exports = router;
