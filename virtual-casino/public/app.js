// ══════════════════════════════════════════════════════════════════════════════
// VIRTUAL CASINO — CLIENT-SIDE JAVASCRIPT (VANILLA JS)
// Handles DOM interactions, animations, and asynchronous fetch() API calls.
// ══════════════════════════════════════════════════════════════════════════════

// State to track current player balance in memory for quick frontend checks
let currentBalance = 0;

// Helper: Format numbers with commas (e.g. 1000 -> 1,000)
function formatNumber(num) {
  return Number(num).toLocaleString();
}

// Helper: Show notification toast banner on dashboard
function showToast(message, type = 'info') {
  const toast = document.getElementById('gameMessage');
  if (!toast) return;

  toast.className = `toast-message toast-${type}`;
  toast.textContent = message;
  toast.classList.remove('d-none');

  // Auto-hide toast after 4 seconds
  clearTimeout(toast.dataset.timer);
  toast.dataset.timer = setTimeout(() => {
    toast.classList.add('d-none');
  }, 4000);
}

// Helper: Show error/success messages on Auth forms (Login / Signup)
function showAuthAlert(message, isError = true) {
  const alertBox = document.getElementById('authAlert');
  if (!alertBox) return;

  alertBox.className = `alert ${isError ? 'alert-danger' : 'alert-success'}`;
  alertBox.textContent = message;
  alertBox.classList.remove('d-none');
}

// ─── 1. AUTHENTICATION PAGES (SIGNUP & LOGIN) ────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const signupForm = document.getElementById('signupForm');
  const loginForm = document.getElementById('loginForm');

  // Handle Signup submission
  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const submitBtn = document.getElementById('submitBtn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating account...';

      try {
        const res = await fetch('/api/auth/signup', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok) {
          showAuthAlert(data.error || 'Failed to sign up.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign Up & Claim 1,000 Coins';
          return;
        }

        showAuthAlert('Account created! Redirecting to dashboard...', false);
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 800);
      } catch (err) {
        showAuthAlert('Network error. Is the server running?');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Sign Up & Claim 1,000 Coins';
      }
    });
  }

  // Handle Login submission
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const username = document.getElementById('username').value.trim();
      const password = document.getElementById('password').value;
      const submitBtn = document.getElementById('submitBtn');

      submitBtn.disabled = true;
      submitBtn.textContent = 'Logging in...';

      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });
        const data = await res.json();

        if (!res.ok) {
          showAuthAlert(data.error || 'Invalid credentials.');
          submitBtn.disabled = false;
          submitBtn.textContent = 'Log In';
          return;
        }

        showAuthAlert('Logged in! Redirecting...', false);
        setTimeout(() => {
          window.location.href = 'dashboard.html';
        }, 500);
      } catch (err) {
        showAuthAlert('Network error. Is the server running?');
        submitBtn.disabled = false;
        submitBtn.textContent = 'Log In';
      }
    });
  }

  // ─── 2. DASHBOARD INITIALIZATION ───────────────────────────────────────────
  if (document.body.classList.contains('dashboard-body')) {
    initDashboard();
  }
});

// Main dashboard bootstrapper
async function initDashboard() {
  // 1. Initial user verification and balance check
  const authenticated = await fetchBalance();
  if (!authenticated) return; // Redirect already triggered

  // 2. Load transaction history and leaderboard data
  fetchHistory();
  fetchLeaderboard();

  // 3. Setup event listeners
  setupTabNavigation();
  setupQuickBetButtons();
  setupGameForms();
  setupActionButtons();
  initMultiplayerDuel();
}

// ─── BALANCE & AUTH CHECK ───────────────────────────────────────────────────
async function fetchBalance() {
  try {
    const res = await fetch('/api/games/balance');
    if (res.status === 401) {
      // User is not authenticated; redirect to login
      window.location.href = 'login.html';
      return false;
    }

    const data = await res.json();
    currentBalance = data.balance;

    const balanceEl = document.getElementById('balanceDisplay');
    const userEl = document.getElementById('userGreeting');

    if (balanceEl) balanceEl.textContent = formatNumber(data.balance);
    if (userEl) userEl.textContent = data.username;
    return true;
  } catch (err) {
    console.error('Failed to fetch balance:', err);
    return false;
  }
}

// Animate balance update on wins or losses
function updateBalanceDisplay(newBalance) {
  currentBalance = newBalance;
  const balanceEl = document.getElementById('balanceDisplay');
  if (balanceEl) {
    balanceEl.textContent = formatNumber(newBalance);
    balanceEl.classList.remove('pulse');
    void balanceEl.offsetWidth; // Trigger reflow to restart CSS animation
    balanceEl.classList.add('pulse');
  }
}

// ─── TAB NAVIGATION ─────────────────────────────────────────────────────────
function setupTabNavigation() {
  const tabs = document.querySelectorAll('.tab-btn');
  const panels = document.querySelectorAll('.game-panel');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      tabs.forEach((t) => t.classList.remove('active'));
      panels.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      const targetId = `tab-${tab.dataset.tab}`;
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');
    });
  });
}

// ─── QUICK BET CHIP BUTTONS (+10, +50, +100, Max) ───────────────────────────
function setupQuickBetButtons() {
  const chipButtons = document.querySelectorAll('.btn-chip');
  chipButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetInput = document.getElementById(btn.dataset.target);
      if (!targetInput) return;

      if (btn.classList.contains('btn-max')) {
        targetInput.value = Math.max(1, currentBalance);
      } else {
        targetInput.value = parseInt(btn.dataset.val, 10);
      }
    });
  });
}

// ─── GAME HANDLERS ──────────────────────────────────────────────────────────
function setupGameForms() {
  // ─── GAME 1: COIN FLIP ────────────────────────────────────────────────────
  const flipForm = document.getElementById('flipForm');
  const flipBtn = document.getElementById('flipSubmitBtn');
  const coinVisual = document.getElementById('coinVisual');
  const coinTossWrapper = document.getElementById('coinTossWrapper');
  const coinSideBadge = document.getElementById('coinSideBadge');
  const flipChoiceInputs = document.querySelectorAll('input[name="flipChoice"]');

  // Preview selected side immediately when user clicks Heads or Tails radio button
  function updateSelectedSidePreview(side) {
    if (flipBtn.disabled) return; // Don't interrupt while coin is flipping in air

    if (side === 'tails') {
      coinVisual.className = 'coin-3d is-tails';
      if (coinSideBadge) coinSideBadge.textContent = 'Showing: TAILS (Serpent)';
    } else {
      coinVisual.className = 'coin-3d is-heads';
      if (coinSideBadge) coinSideBadge.textContent = 'Showing: HEADS (Dragon)';
    }
  }

  // Listen to radio changes: when user selects Tails, show Tails IMMEDIATELY!
  flipChoiceInputs.forEach((input) => {
    input.addEventListener('change', () => {
      updateSelectedSidePreview(input.value);
    });
  });

  flipForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bet = parseInt(document.getElementById('flipBet').value, 10);
    const choiceEl = document.querySelector('input[name="flipChoice"]:checked');
    const choice = choiceEl ? choiceEl.value : 'heads';

    if (bet > currentBalance) {
      showToast(`Cannot bet ${bet} coins. Current balance is ${currentBalance}.`, 'lose');
      return;
    }

    flipBtn.disabled = true;
    if (coinSideBadge) coinSideBadge.textContent = 'Flipping in the air...';

    // Start physical toss arc in the air
    if (coinTossWrapper) {
      coinTossWrapper.classList.remove('tossing');
      void coinTossWrapper.offsetWidth;
      coinTossWrapper.classList.add('tossing');
    }

    coinVisual.classList.remove('landed');
    coinVisual.classList.add('flipping');

    // While in the air, alternate faces rapidly so it visibly flips
    const spinInterval = setInterval(() => {
      if (coinVisual.classList.contains('is-heads')) {
        coinVisual.classList.remove('is-heads');
        coinVisual.classList.add('is-tails');
      } else {
        coinVisual.classList.remove('is-tails');
        coinVisual.classList.add('is-heads');
      }
    }, 70);

    try {
      const res = await fetch('/api/games/flip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet, choice })
      });
      const data = await res.json();

      if (!res.ok) {
        clearInterval(spinInterval);
        if (coinTossWrapper) coinTossWrapper.classList.remove('tossing');
        coinVisual.classList.remove('flipping');
        flipBtn.disabled = false;
        showToast(data.error || 'Flip failed.', 'lose');
        updateSelectedSidePreview(choice);
        return;
      }

      // When toss finishes landing (1250ms):
      setTimeout(() => {
        clearInterval(spinInterval);
        if (coinTossWrapper) coinTossWrapper.classList.remove('tossing');
        coinVisual.classList.remove('flipping');

        // Lock in the server outcome with impact bounce:
        if (data.outcome === 'tails') {
          coinVisual.className = 'coin-3d is-tails landed';
          if (coinSideBadge) coinSideBadge.textContent = 'Landed on: TAILS (Serpent)';
        } else {
          coinVisual.className = 'coin-3d is-heads landed';
          if (coinSideBadge) coinSideBadge.textContent = 'Landed on: HEADS (Dragon)';
        }

        setTimeout(() => coinVisual.classList.remove('landed'), 350);

        flipBtn.disabled = false;
        updateBalanceDisplay(data.newBalance);
        showToast(data.message, data.won ? 'win' : 'lose');
        fetchHistory();
        fetchLeaderboard();
      }, 1250);
    } catch (err) {
      clearInterval(spinInterval);
      if (coinTossWrapper) coinTossWrapper.classList.remove('tossing');
      coinVisual.classList.remove('flipping');
      flipBtn.disabled = false;
      showToast('Network error during coin flip.', 'lose');
      updateSelectedSidePreview(choice);
    }
  });

  // Enable tapping directly on the 3D coin to flip
  if (coinVisual) {
    coinVisual.addEventListener('click', () => {
      if (!flipBtn.disabled) {
        flipForm.dispatchEvent(new Event('submit', { cancelable: true }));
      }
    });
  }

  // ─── GAME 2: DICE ROLL ────────────────────────────────────────────────────
  const diceForm = document.getElementById('diceForm');
  const diceBtn = document.getElementById('diceSubmitBtn');
  const diceVisual = document.getElementById('diceVisual');
  const diceFaces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  diceForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bet = parseInt(document.getElementById('diceBet').value, 10);
    const choiceEl = document.querySelector('input[name="diceChoice"]:checked');
    const choice = choiceEl ? parseInt(choiceEl.value, 10) : 1;

    if (bet > currentBalance) {
      showToast(`Cannot bet ${bet} coins. Current balance is ${currentBalance}.`, 'lose');
      return;
    }

    diceBtn.disabled = true;
    diceVisual.classList.remove('landed');
    diceVisual.classList.add('spinning');

    // Rapidly shuffle dice faces while tumbling
    const diceInterval = setInterval(() => {
      diceVisual.textContent = diceFaces[Math.floor(Math.random() * diceFaces.length)];
    }, 60);

    const startTime = Date.now();

    try {
      const res = await fetch('/api/games/dice', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet, choice })
      });
      const data = await res.json();

      // Ensure spinning animation runs for at least 750ms for visual satisfaction
      const elapsed = Date.now() - startTime;
      const remainingDelay = Math.max(0, 750 - elapsed);

      setTimeout(() => {
        clearInterval(diceInterval);
        diceVisual.classList.remove('spinning', 'rolling');
        diceBtn.disabled = false;

        if (!res.ok) {
          showToast(data.error || 'Dice roll failed.', 'lose');
          return;
        }

        // Lock in the actual rolled die face with a landing bounce
        diceVisual.textContent = diceFaces[data.roll - 1] || '🎲';
        diceVisual.classList.add('landed');
        setTimeout(() => diceVisual.classList.remove('landed'), 350);

        updateBalanceDisplay(data.newBalance);
        showToast(data.message, data.won ? 'win' : 'lose');
        fetchHistory();
        fetchLeaderboard();
      }, remainingDelay);
    } catch (err) {
      clearInterval(diceInterval);
      diceVisual.classList.remove('spinning', 'rolling');
      diceBtn.disabled = false;
      showToast('Network error during dice roll.', 'lose');
    }
  });

  // ─── GAME 3: SLOT MACHINE ─────────────────────────────────────────────────
  const slotsForm = document.getElementById('slotsForm');
  const slotsBtn = document.getElementById('slotsSubmitBtn');
  const reel1 = document.getElementById('reel1');
  const reel2 = document.getElementById('reel2');
  const reel3 = document.getElementById('reel3');
  const slotSymbols = ['🍒', '🍋', '🍊', '🍇', '🔔', '💎', '7️⃣'];

  slotsForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const bet = parseInt(document.getElementById('slotsBet').value, 10);

    if (bet > currentBalance) {
      showToast(`Cannot bet ${bet} coins. Current balance is ${currentBalance}.`, 'lose');
      return;
    }

    slotsBtn.disabled = true;

    // Remove any previous stop classes and add active spinning animation
    [reel1, reel2, reel3].forEach((r) => {
      r.classList.remove('stopped');
      r.classList.add('spinning');
    });

    // Rapidly cycle symbols on each reel while spinning
    const interval1 = setInterval(() => {
      reel1.textContent = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
    }, 55);

    const interval2 = setInterval(() => {
      reel2.textContent = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
    }, 55);

    const interval3 = setInterval(() => {
      reel3.textContent = slotSymbols[Math.floor(Math.random() * slotSymbols.length)];
    }, 55);

    const startTime = Date.now();

    try {
      const res = await fetch('/api/games/slots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bet })
      });
      const data = await res.json();

      if (!res.ok) {
        clearInterval(interval1);
        clearInterval(interval2);
        clearInterval(interval3);
        [reel1, reel2, reel3].forEach((r) => r.classList.remove('spinning'));
        slotsBtn.disabled = false;
        showToast(data.error || 'Slot spin failed.', 'lose');
        return;
      }

      const elapsed = Date.now() - startTime;
      const baseDelay = Math.max(0, 600 - elapsed);

      // Cascading reel stop for authentic slot machine feel
      // Reel 1 lands
      setTimeout(() => {
        clearInterval(interval1);
        reel1.classList.remove('spinning');
        reel1.textContent = data.reels[0];
        reel1.classList.add('stopped');
        setTimeout(() => reel1.classList.remove('stopped'), 320);
      }, baseDelay);

      // Reel 2 lands
      setTimeout(() => {
        clearInterval(interval2);
        reel2.classList.remove('spinning');
        reel2.textContent = data.reels[1];
        reel2.classList.add('stopped');
        setTimeout(() => reel2.classList.remove('stopped'), 320);
      }, baseDelay + 250);

      // Reel 3 lands & display results
      setTimeout(() => {
        clearInterval(interval3);
        reel3.classList.remove('spinning');
        reel3.textContent = data.reels[2];
        reel3.classList.add('stopped');
        setTimeout(() => reel3.classList.remove('stopped'), 320);

        slotsBtn.disabled = false;
        updateBalanceDisplay(data.newBalance);
        showToast(data.message, data.won ? 'win' : 'lose');
        fetchHistory();
        fetchLeaderboard();
      }, baseDelay + 500);
    } catch (err) {
      clearInterval(interval1);
      clearInterval(interval2);
      clearInterval(interval3);
      [reel1, reel2, reel3].forEach((r) => r.classList.remove('spinning'));
      slotsBtn.disabled = false;
      showToast('Network error during slots spin.', 'lose');
    }
  });
}

// ─── 3. ACTION BUTTONS (BONUS, RESET, LOGOUT) ───────────────────────────────
function setupActionButtons() {
  // Daily Bonus (+200 coins)
  const bonusBtn = document.getElementById('bonusBtn');
  if (bonusBtn) {
    bonusBtn.addEventListener('click', async () => {
      bonusBtn.disabled = true;
      try {
        const res = await fetch('/api/games/bonus', { method: 'POST' });
        const data = await res.json();

        if (!res.ok) {
          showToast(data.error || 'Failed to claim bonus.', 'info');
        } else {
          showToast(data.message, 'win');
          updateBalanceDisplay(data.newBalance);
          fetchHistory();
        }
      } catch (err) {
        showToast('Error claiming bonus.', 'lose');
      } finally {
        bonusBtn.disabled = false;
      }
    });
  }

  // Reset Balance to 1,000 Coins
  const resetBtn = document.getElementById('resetBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', async () => {
      if (!confirm('Are you sure you want to reset your balance back to 1,000 simulation coins?')) {
        return;
      }
      try {
        const res = await fetch('/api/games/reset', { method: 'POST' });
        const data = await res.json();
        if (res.ok) {
          showToast(data.message, 'info');
          updateBalanceDisplay(data.newBalance);
          fetchHistory();
          fetchLeaderboard();
        }
      } catch (err) {
        showToast('Error resetting balance.', 'lose');
      }
    });
  }

  // Log Out (Clears httpOnly cookie)
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      try {
        await fetch('/api/auth/logout', { method: 'POST' });
        window.location.href = 'login.html';
      } catch (err) {
        window.location.href = 'login.html';
      }
    });
  }

  // Manual refresh buttons for tables
  const refreshHistory = document.getElementById('refreshHistoryBtn');
  if (refreshHistory) refreshHistory.addEventListener('click', fetchHistory);

  const refreshLeaderboard = document.getElementById('refreshLeaderboardBtn');
  if (refreshLeaderboard) refreshLeaderboard.addEventListener('click', fetchLeaderboard);
}

// ─── 4. DATA FETCHERS (HISTORY & LEADERBOARD) ───────────────────────────────
async function fetchHistory() {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/games/history');
    if (!res.ok) return;

    const data = await res.json();
    if (!data.transactions || data.transactions.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">No bets recorded yet.</td></tr>';
      return;
    }

    tbody.innerHTML = data.transactions
      .map((tx) => {
        const isWin = tx.amount > 0;
        const isNeutral = tx.amount === 0;
        const amountClass = isNeutral ? 'text-muted' : isWin ? 'text-win' : 'text-lose';
        const sign = tx.amount > 0 ? '+' : '';
        const timeFormatted = new Date(tx.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        return `
          <tr>
            <td><strong>${tx.game}</strong></td>
            <td>${tx.result}</td>
            <td class="${amountClass}">${sign}${formatNumber(tx.amount)}</td>
            <td class="text-muted">${timeFormatted}</td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    console.error('History fetch failed:', err);
  }
}

async function fetchLeaderboard() {
  const tbody = document.getElementById('leaderboardTableBody');
  if (!tbody) return;

  try {
    const res = await fetch('/api/games/leaderboard');
    if (!res.ok) return;

    const data = await res.json();
    if (!data.leaderboard || data.leaderboard.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" class="text-center text-muted">No players yet.</td></tr>';
      return;
    }

    const rankMedals = ['🥇', '🥈', '🥉'];

    tbody.innerHTML = data.leaderboard
      .map((user, index) => {
        const medal = rankMedals[index] || `#${index + 1}`;
        return `
          <tr>
            <td><strong>${medal}</strong></td>
            <td>${user.username}</td>
            <td class="text-win">${formatNumber(user.balance)} coins</td>
          </tr>
        `;
      })
      .join('');
  } catch (err) {
    console.error('Leaderboard fetch failed:', err);
  }
}


// ══════════════════════════════════════════════════════════════════════════════
// 5. REAL-TIME MULTIPLAYER PVP COIN FLIP DUEL (SOCKET.IO)
// ══════════════════════════════════════════════════════════════════════════════
let duelSocket = null;
let currentDuelUser = null;
let activeRoomCode = null;
let waitingCountdownTimer = null;

async function initMultiplayerDuel() {
  if (typeof io === 'undefined') {
    console.warn('Socket.IO client library not loaded.');
    return;
  }

  // 1. Fetch current logged-in user profile from /api/auth/me
  try {
    const meRes = await fetch('/api/auth/me');
    if (meRes.ok) {
      const meData = await meRes.json();
      currentDuelUser = meData.user;
    }
  } catch (err) {
    console.error('Failed to get session user for multiplayer:', err);
  }

  // 2. Connect to Socket.IO server (authenticates via httpOnly cookie)
  duelSocket = io();

  // Helper: toggle visibility between lobby, waiting, and active arena views
  function switchDuelView(view) {
    const lobbyView = document.getElementById('duelLobbyView');
    const waitingView = document.getElementById('duelWaitingView');
    const arenaView = document.getElementById('duelArenaView');

    if (lobbyView) lobbyView.classList.toggle('d-none', view !== 'lobby');
    if (waitingView) waitingView.classList.toggle('d-none', view !== 'waiting');
    if (arenaView) arenaView.classList.toggle('d-none', view !== 'arena');
  }

  // Helper: clear the waiting room 60s countdown interval
  function clearWaitingTimer() {
    if (waitingCountdownTimer) {
      clearInterval(waitingCountdownTimer);
      waitingCountdownTimer = null;
    }
  }

  // Helper: start the waiting room visual countdown (60s)
  function startWaitingTimer() {
    clearWaitingTimer();
    let timeLeft = 60;
    const counterEl = document.getElementById('waitingExpiryCounter');
    if (counterEl) counterEl.textContent = timeLeft;

    waitingCountdownTimer = setInterval(() => {
      timeLeft--;
      if (counterEl) counterEl.textContent = Math.max(0, timeLeft);
      if (timeLeft <= 0) {
        clearWaitingTimer();
      }
    }, 1000);
  }

  // ─── DOM EVENT LISTENERS ──────────────────────────────────────────────────

  // Form: Create Duel
  const createForm = document.getElementById('createDuelForm');
  if (createForm) {
    createForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const betInput = document.getElementById('createDuelBet');
      const submitBtn = document.getElementById('createDuelSubmitBtn');
      const bet = parseInt(betInput.value, 10);

      if (isNaN(bet) || bet <= 0) {
        showToast('Please enter a valid bet amount.', 'lose');
        return;
      }
      if (bet > currentBalance) {
        showToast(`Insufficient balance! You have ${formatNumber(currentBalance)} coins.`, 'lose');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Creating Duel...';

      duelSocket.emit('create_duel', { bet }, (res) => {
        submitBtn.disabled = false;
        submitBtn.textContent = '⚔️ Create Duel';

        if (res.error) {
          showToast(res.error, 'lose');
          return;
        }

        activeRoomCode = res.roomCode;
        const codeDisplay = document.getElementById('displayRoomCode');
        const betDisplay = document.getElementById('waitingBetDisplay');

        if (codeDisplay) codeDisplay.textContent = res.roomCode;
        if (betDisplay) betDisplay.textContent = formatNumber(bet);

        startWaitingTimer();
        switchDuelView('waiting');
        showToast(`Duel room ${res.roomCode} created! Share this code with an opponent.`, 'info');
      });
    });
  }

  // Form: Join Duel
  const joinForm = document.getElementById('joinDuelForm');
  if (joinForm) {
    joinForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const codeInput = document.getElementById('joinRoomCode');
      const submitBtn = document.getElementById('joinDuelSubmitBtn');
      const code = codeInput.value.trim().toUpperCase();

      if (!code || code.length !== 5) {
        showToast('Room code must be exactly 5 letters.', 'lose');
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = 'Joining Room...';

      duelSocket.emit('join_duel', { roomCode: code }, (res) => {
        submitBtn.disabled = false;
        submitBtn.textContent = '🚪 Join Duel';

        if (res.error) {
          showToast(res.error, 'lose');
          return;
        }

        activeRoomCode = code;
        showToast('Connected to duel room! Starting match...', 'info');
      });
    });
  }

  // Button: Copy Room Code
  const copyBtn = document.getElementById('copyCodeBtn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const code = document.getElementById('displayRoomCode')?.textContent || '';
      if (!code || code === '-----') return;

      navigator.clipboard.writeText(code).then(() => {
        copyBtn.textContent = '✅ Copied!';
        setTimeout(() => { copyBtn.textContent = '📋 Copy Code'; }, 2000);
      }).catch(() => {
        showToast(`Room Code: ${code}`, 'info');
      });
    });
  }

  // Button: Cancel Waiting Duel
  const cancelBtn = document.getElementById('cancelDuelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      clearWaitingTimer();
      duelSocket.emit('cancel_duel', { roomCode: activeRoomCode }, () => {
        activeRoomCode = null;
        switchDuelView('lobby');
        showToast('Duel room cancelled.', 'info');
      });
    });
  }

  // Button: Return to Lobby
  const leaveBtn = document.getElementById('leaveDuelBtn');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      duelSocket.emit('leave_duel', { roomCode: activeRoomCode }, () => {
        activeRoomCode = null;
        switchDuelView('lobby');
      });
    });
  }

  // ─── SOCKET.IO EVENT LISTENERS ────────────────────────────────────────────

  // 1. Duel Ready: Opponent found, both bets locked, 3-2-1 countdown starting
  duelSocket.on('duel_ready', ({ players, bet }) => {
    clearWaitingTimer();

    const host = players.find((p) => p.side === 'heads');
    const guest = players.find((p) => p.side === 'tails');
    const pot = Math.floor(bet * 1.9);

    // Optimistically deduct bet from user's balance
    updateBalanceDisplay(Math.max(0, currentBalance - bet));

    // Reset arena UI elements
    const hostNameEl = document.getElementById('arenaHostName');
    const guestNameEl = document.getElementById('arenaGuestName');
    const potEl = document.getElementById('arenaPotAmount');
    const countdownEl = document.getElementById('duelCountdown');
    const coinWrapper = document.getElementById('duelCoinWrapper');
    const statusEl = document.getElementById('duelStatusText');
    const resultBanner = document.getElementById('duelResultBanner');
    const actionsEl = document.getElementById('duelArenaActions');

    if (hostNameEl) hostNameEl.textContent = host ? host.username : 'Host';
    if (guestNameEl) guestNameEl.textContent = guest ? guest.username : 'Guest';
    if (potEl) potEl.textContent = `${formatNumber(pot)} Coins`;

    if (countdownEl) {
      countdownEl.classList.remove('d-none');
      countdownEl.textContent = '3';
    }
    if (coinWrapper) coinWrapper.classList.add('d-none');
    if (resultBanner) {
      resultBanner.classList.add('d-none');
      resultBanner.className = 'duel-result-banner d-none';
    }
    if (actionsEl) actionsEl.classList.add('d-none');
    if (statusEl) statusEl.textContent = `Match locked! Flipping in 3 seconds... (Pot: ${formatNumber(pot)} coins)`;

    switchDuelView('arena');
  });

  // 2. Countdown: 3, 2, 1 seconds broadcast from server
  duelSocket.on('countdown', ({ n }) => {
    const countdownEl = document.getElementById('duelCountdown');
    const statusEl = document.getElementById('duelStatusText');

    if (countdownEl) {
      countdownEl.textContent = n;
      countdownEl.classList.remove('pulse');
      void countdownEl.offsetWidth;
      countdownEl.classList.add('pulse');
    }
    if (statusEl) {
      statusEl.textContent = `Flipping in ${n}...`;
    }
  });

  // 3. Duel Result: Coin landed, winner/loser decided, payouts distributed
  duelSocket.on('duel_result', (data) => {
    const { winnerId, winnerUsername, loserUsername, winningSide, payout, bet, balances } = data;
    const isWinner = (currentDuelUser && currentDuelUser.id === winnerId);

    const countdownEl = document.getElementById('duelCountdown');
    const coinWrapper = document.getElementById('duelCoinWrapper');
    const coinVisual = document.getElementById('duelCoinVisual');
    const statusEl = document.getElementById('duelStatusText');
    const resultBanner = document.getElementById('duelResultBanner');
    const actionsEl = document.getElementById('duelArenaActions');

    if (countdownEl) countdownEl.classList.add('d-none');
    if (coinWrapper) coinWrapper.classList.remove('d-none');

    // Trigger 3D Coin Toss & Flip Animation
    if (coinVisual) {
      coinVisual.classList.remove('flipping', 'landed', 'is-heads', 'is-tails');
      if (coinWrapper) coinWrapper.classList.remove('tossing');

      void coinVisual.offsetWidth; // Force DOM reflow

      if (coinWrapper) coinWrapper.classList.add('tossing');
      coinVisual.classList.add('flipping');

      // Land on the winning side after spin
      setTimeout(() => {
        coinVisual.classList.remove('flipping');
        if (coinWrapper) coinWrapper.classList.remove('tossing');
        coinVisual.classList.add(winningSide === 'heads' ? 'is-heads' : 'is-tails');
        coinVisual.classList.add('landed');
      }, 1250);
    }

    if (statusEl) {
      statusEl.textContent = `The coin landed on ${winningSide.toUpperCase()}!`;
    }

    // Display result banner and synchronize database balances after coin lands
    setTimeout(() => {
      if (resultBanner) {
        resultBanner.classList.remove('d-none', 'banner-win', 'banner-lose');
        if (isWinner) {
          const profit = payout - bet;
          resultBanner.classList.add('banner-win');
          resultBanner.innerHTML = `
            <div class="banner-title">🎉 YOU WON THE DUEL!</div>
            <div class="banner-sub">Landed on <strong>${winningSide.toUpperCase()}</strong> &bull; Won <strong>+${formatNumber(profit)} coins</strong> (Total: ${formatNumber(payout)})</div>
          `;
          showToast(`🎉 You won the duel! +${formatNumber(profit)} coins!`, 'win');
        } else {
          resultBanner.classList.add('banner-lose');
          resultBanner.innerHTML = `
            <div class="banner-title">😢 YOU LOST THE DUEL</div>
            <div class="banner-sub">Landed on <strong>${winningSide.toUpperCase()}</strong> (${winnerUsername} won) &bull; -${formatNumber(bet)} coins</div>
          `;
          showToast(`😢 You lost the duel against ${winnerUsername}. (-${formatNumber(bet)} coins)`, 'lose');
        }
      }

      if (actionsEl) actionsEl.classList.remove('d-none');

      // Update client balance from server state
      if (currentDuelUser && balances && balances[currentDuelUser.id] !== undefined && balances[currentDuelUser.id] !== null) {
        updateBalanceDisplay(balances[currentDuelUser.id]);
      } else {
        fetchBalance();
      }

      // Refresh recent transactions and leaderboard tables
      fetchHistory();
      fetchLeaderboard();
    }, 1300);
  });

  // 4. Opponent Left: Host or guest disconnected during active countdown
  duelSocket.on('opponent_left', ({ message }) => {
    clearWaitingTimer();
    const countdownEl = document.getElementById('duelCountdown');
    const statusEl = document.getElementById('duelStatusText');
    const resultBanner = document.getElementById('duelResultBanner');
    const actionsEl = document.getElementById('duelArenaActions');

    if (countdownEl) countdownEl.classList.add('d-none');
    if (statusEl) statusEl.textContent = 'Opponent disconnected.';

    if (resultBanner) {
      resultBanner.className = 'duel-result-banner banner-info';
      resultBanner.innerHTML = `
        <div class="banner-title">⚠️ OPPONENT LEFT</div>
        <div class="banner-sub">${message || 'Your bet has been fully refunded.'}</div>
      `;
      resultBanner.classList.remove('d-none');
    }

    if (actionsEl) actionsEl.classList.remove('d-none');

    showToast(message || 'Opponent left. Bet refunded.', 'info');
    fetchBalance();
    fetchHistory();
  });

  // 5. Duel Cancelled: Host cancelled or room timed out after 60s
  duelSocket.on('duel_cancelled', ({ reason }) => {
    clearWaitingTimer();
    activeRoomCode = null;
    showToast(reason || 'Duel was cancelled.', 'lose');
    switchDuelView('lobby');
  });
}
