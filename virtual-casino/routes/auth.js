const express = require('express');
const router = express.Router();
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { dbRun, dbGet } = require('../db');

// JWT secret key constant (Note: In production, always load this from an environment variable: process.env.JWT_SECRET)
const JWT_SECRET = process.env.JWT_SECRET || 'virtual_casino_super_secret_key_2026';

// Middleware to verify JWT token stored in httpOnly cookie
const auth = (req, res, next) => {
  const token = req.cookies && req.cookies.token;
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized: No session found. Please log in.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.userId = decoded.userId;
    req.username = decoded.username;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
};

// POST /api/auth/signup - Register new account with 1000 starting coins
router.post('/signup', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Server-side validation: never trust client inputs
    if (!username || typeof username !== 'string' || username.trim().length < 3) {
      return res.status(400).json({ error: 'Username must be at least 3 characters long.' });
    }
    if (!password || typeof password !== 'string' || password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const cleanUsername = username.trim();

    // Check if username already exists in database
    const existing = await dbGet('SELECT id FROM users WHERE username = ?', [cleanUsername]);
    if (existing) {
      return res.status(400).json({ error: 'Username already taken. Please choose another one.' });
    }

    // Hash password with bcrypt using 10 salt rounds for secure storage
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user in database (starts with default balance of 1000)
    const result = await dbRun(
      'INSERT INTO users (username, password, balance) VALUES (?, ?, 1000)',
      [cleanUsername, hashedPassword]
    );

    const userId = result.lastID;

    // Generate JWT token containing the user identity
    const token = jwt.sign({ userId, username: cleanUsername }, JWT_SECRET, { expiresIn: '24h' });

    // Store JWT securely in httpOnly cookie (client JS cannot read it, preventing XSS token theft)
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // Set to true in production if serving over HTTPS
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    return res.status(201).json({
      message: 'Account created successfully!',
      user: { id: userId, username: cleanUsername, balance: 1000 }
    });
  } catch (err) {
    console.error('Signup error:', err);
    return res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// POST /api/auth/login - Verify credentials and issue JWT cookie
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const cleanUsername = username.trim();

    // Query user by username
    const user = await dbGet('SELECT * FROM users WHERE username = ?', [cleanUsername]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Compare provided plain-text password with hashed password in database
    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    // Generate JWT token
    const token = jwt.sign({ userId: user.id, username: user.username }, JWT_SECRET, { expiresIn: '24h' });

    // Store JWT in httpOnly cookie
    res.cookie('token', token, {
      httpOnly: true,
      secure: false, // Set to true in production if HTTPS
      sameSite: 'lax',
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    });

    return res.json({
      message: 'Logged in successfully!',
      user: { id: user.id, username: user.username, balance: user.balance }
    });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// POST /api/auth/logout - Clear JWT cookie
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  return res.json({ message: 'Logged out successfully.' });
});

// GET /api/auth/me - Verify current logged-in user session
router.get('/me', auth, async (req, res) => {
  try {
    const user = await dbGet('SELECT id, username, balance FROM users WHERE id = ?', [req.userId]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    return res.json({ user });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch session user.' });
  }
});

module.exports = { router, auth, JWT_SECRET };
