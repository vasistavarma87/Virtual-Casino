# 🎰 Virtual Casino — Real-Time Multiplayer & Single-Player (Simulation)

> ⚠️ **EDUCATIONAL SIMULATION ONLY**: This project is strictly for educational and learning purposes. All coins are 100% fake virtual simulation tokens. There is NO real money, NO cryptocurrency, and NO payment gateway.

A full-stack, real-time Virtual Casino web application built with vanilla JavaScript, Node.js, Express, SQLite, and Socket.IO.

---

## 🌟 Features

- **🛡️ Secure Authentication**:
  - User registration and login with `bcrypt` password hashing (10 salt rounds).
  - JWT (JSON Web Token) sessions stored securely in `httpOnly` cookies to protect against XSS token theft.
  - Automatic starting balance of **1,000 Simulation Coins**.
- **🪙 Single-Player Games (Server-Authoritative)**:
  - **Coin Flip**: Bet on Heads or Tails with realistic 3D flipping animation. Win pays 1.9x (~5% house edge).
  - **Dice Roll**: Choose 1–6 with rolling animation. Win pays 5x (~16.7% house edge).
  - **Slot Machine**: 3 spinning reels with blur animations. 3-match = 10x, 2-match = 2x (~6% house edge).
- **⚔️ Real-Time Multiplayer PvP Coin Flip Duels**:
  - Live rooms powered by **Socket.IO**.
  - Player A creates a duel, sets a bet, and receives a unique 5-character room code (e.g. `XY7K2`).
  - Player B joins via room code on another device or browser.
  - Both bets are locked server-side.
  - Synchronized **3-2-1 countdown** and server-side coin toss.
  - Winner receives `bet × 1.9` (5% house edge on total pot), loser gets 0.
  - Automatic refunds on opponent disconnect during countdown.
  - 60-second inactivity auto-expiration on created rooms.
- **🎁 Daily Bonus & Economy**:
  - Daily bonus granting +200 coins every 24 hours.
  - Balance reset button to restore 1,000 coins anytime.
- **📜 Live Stats**:
  - Top 10 balance leaderboard.
  - Real-time transaction history log for bets, wins, and duels.

---

## 🛠️ Tech Stack

- **Backend**: Node.js, Express.js, Socket.IO
- **Database**: SQLite (via `sqlite3` driver with auto-table creation)
- **Authentication**: `bcrypt`, `jsonwebtoken` (JWT), `cookie-parser`
- **Frontend**: Plain HTML5, CSS3 (Custom Dark Theme & Animations), Vanilla JavaScript (no frameworks)

---

## 📂 Project Structure

```text
virtual-casino/
├── server.js              # HTTP & Socket.IO server entry point
├── socket.js              # Real-time duel rooms, timers & matchmaking
├── db.js                  # SQLite database connection & schema
├── package.json           # Dependencies and startup scripts
├── routes/
│   ├── auth.js            # Signup, login, logout, /me endpoints
│   └── games.js           # Single-player games & balance transactions
└── public/
    ├── index.html         # Landing page with simulation notice
    ├── login.html         # Login page
    ├── signup.html        # Registration page
    ├── dashboard.html     # Games & PvP duel arena
    ├── style.css          # Styling & 3D animations
    ├── app.js             # Client-side Socket.IO & fetch handlers
    ├── heads.png          # Coin heads artwork
    └── tails.png          # Coin tails artwork
```

---

## 🚀 Getting Started

### 1. Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher)
- [Git](https://git-scm.com/)

### 2. Installation
```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/virtual-casino.git

# Navigate into the project directory
cd virtual-casino

# Install dependencies
npm install
```

### 3. Run the Application
```bash
# Start server
npm start

# Or run with nodemon in development mode
npm run dev
```

Open your browser at **http://localhost:3000** to start playing!

---

## 📜 License
MIT License. Built strictly as an educational learning project.
