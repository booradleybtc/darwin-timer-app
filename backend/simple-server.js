const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Simple in-memory timer state
let timerState = {
  startTime: Date.now(),
  duration: 600000, // 10 minutes
  isActive: true,
  lastSwapTime: null,
  lastTrade: null,
  serverTime: Date.now(),
  instanceId: 'render-simple'
};

// Solana monitoring (simplified)
let isMonitoring = false;
let monitorInterval = null;

class SimpleTimerService {
  constructor() {
    this.startSolanaMonitoring();
  }

  getCurrentState() {
    const now = Date.now();
    const elapsed = now - timerState.startTime;
    const remaining = Math.max(0, timerState.duration - elapsed);
    
    return {
      ...timerState,
      serverTime: now,
      isActive: remaining > 0
    };
  }

  resetTimer(tradeInfo = null) {
    const now = Date.now();
    timerState = {
      startTime: now,
      duration: 600000, // 10 minutes
      isActive: true,
      lastSwapTime: now,
      lastTrade: tradeInfo ? {
        type: tradeInfo.type,
        amount: tradeInfo.amount,
        dex: tradeInfo.dex,
        signature: tradeInfo.signature,
        timestamp: tradeInfo.timestamp
      } : null,
      serverTime: now,
      instanceId: 'render-simple'
    };
    
    console.log('🔄 Timer reset:', tradeInfo ? `Trade: ${tradeInfo.type} ${tradeInfo.amount}` : 'Manual reset');
    return timerState;
  }

  startSolanaMonitoring() {
    if (isMonitoring || !process.env.TOKEN_ADDRESS || !process.env.HELIUS_API_KEY) {
      return;
    }

    isMonitoring = true;
    console.log('🔍 Starting Solana monitoring...');

    // Check for swaps every 30 seconds
    monitorInterval = setInterval(async () => {
      try {
        await this.checkForSwaps();
      } catch (error) {
        console.error('Error checking for swaps:', error);
      }
    }, 30000);

    // Initial check
    this.checkForSwaps();
  }

  async checkForSwaps() {
    try {
      const response = await fetch(
        `https://api.helius.xyz/v0/addresses/${process.env.TOKEN_ADDRESS}/transactions?api-key=${process.env.HELIUS_API_KEY}&limit=5`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data.length > 0) {
        const latestTx = data[0];
        
        // Check if this is a new transaction since last reset
        if (timerState.lastSwapTime && latestTx.timestamp * 1000 > timerState.lastSwapTime) {
          // New transaction detected - reset timer
          const tradeInfo = {
            type: 'buy', // Simplified - assume all are buys
            amount: Math.random() * 1000, // Placeholder amount
            dex: 'Unknown',
            signature: latestTx.signature,
            timestamp: latestTx.timestamp * 1000
          };
          
          this.resetTimer(tradeInfo);
        }
      }
    } catch (error) {
      console.error('Error checking for swaps:', error);
    }
  }
}

const timerService = new SimpleTimerService();

// API Routes
app.get('/api/timer', (req, res) => {
  try {
    const state = timerService.getCurrentState();
    res.json({
      success: true,
      data: state
    });
  } catch (error) {
    console.error('Error in GET /api/timer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get timer state'
    });
  }
});

app.post('/api/timer', (req, res) => {
  try {
    const state = timerService.resetTimer();
    res.json({
      success: true,
      data: state
    });
  } catch (error) {
    console.error('Error in POST /api/timer:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset timer'
    });
  }
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    redis: 'not_used',
    solana: isMonitoring ? 'monitoring' : 'disabled',
    timer: timerService.getCurrentState().isActive ? 'active' : 'expired',
    timestamp: Date.now()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Simple backend server running on port ${PORT}`);
  console.log(`📊 Solana monitoring: ${isMonitoring ? 'enabled' : 'disabled'}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`⏰ Timer state: ${JSON.stringify(timerService.getCurrentState(), null, 2)}`);
});
