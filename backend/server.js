const express = require('express');
const cors = require('cors');
const { createClient } = require('redis');
const { SolanaTokenSwapMonitor } = require('./solana-monitor');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Redis connection
let redis = null;
let isRedisConnected = false;

async function initializeRedis() {
  try {
    if (process.env.REDIS_URL) {
      redis = createClient({
        url: process.env.REDIS_URL
      });
      
      redis.on('error', (err) => {
        console.error('Redis Client Error:', err);
        isRedisConnected = false;
      });
      
      await redis.connect();
      await redis.ping();
      isRedisConnected = true;
      console.log('✅ Redis connected successfully');
    }
  } catch (error) {
    console.error('❌ Failed to initialize Redis:', error);
    isRedisConnected = false;
  }
}

// Timer state management
class TimerService {
  constructor() {
    this.solanaMonitor = null;
    this.initializeSolanaMonitor();
  }

  async getCurrentState() {
    try {
      if (isRedisConnected && redis) {
        const stateJson = await redis.get('darwin-timer:state');
        if (stateJson) {
          const state = JSON.parse(stateJson);
          const now = Date.now();
          const elapsed = now - state.startTime;
          const remaining = Math.max(0, state.duration - elapsed);
          
          return {
            ...state,
            serverTime: now,
            isActive: remaining > 0
          };
        }
      }
      
      // Create new state if none exists
      const initialState = {
        startTime: Date.now(),
        duration: 600000, // 10 minutes
        isActive: true,
        lastSwapTime: null,
        lastTrade: null,
        serverTime: Date.now(),
        instanceId: 'render-backend'
      };
      
      if (isRedisConnected && redis) {
        await redis.setex('darwin-timer:state', 3600, JSON.stringify(initialState));
      }
      
      return initialState;
    } catch (error) {
      console.error('Error getting timer state:', error);
      throw error;
    }
  }

  async resetTimer(tradeInfo = null) {
    try {
      const resetState = {
        startTime: Date.now(),
        duration: 600000, // 10 minutes
        isActive: true,
        lastSwapTime: Date.now(),
        lastTrade: tradeInfo ? {
          type: tradeInfo.type,
          amount: tradeInfo.amount,
          dex: tradeInfo.dex,
          signature: tradeInfo.signature,
          timestamp: tradeInfo.timestamp
        } : null,
        serverTime: Date.now(),
        instanceId: 'render-backend'
      };
      
      if (isRedisConnected && redis) {
        await redis.setex('darwin-timer:state', 3600, JSON.stringify(resetState));
      }
      
      return resetState;
    } catch (error) {
      console.error('Error resetting timer:', error);
      throw error;
    }
  }

  initializeSolanaMonitor() {
    try {
      if (process.env.TOKEN_ADDRESS && process.env.HELIUS_API_KEY) {
        this.solanaMonitor = new SolanaTokenSwapMonitor();
        this.solanaMonitor.setSwapCallback(async (tradeInfo) => {
          console.log('🔄 Trade detected, resetting timer:', tradeInfo);
          await this.resetTimer(tradeInfo);
        });
        this.solanaMonitor.startMonitoring();
        console.log('✅ Solana monitoring started');
      }
    } catch (error) {
      console.error('❌ Failed to initialize Solana monitor:', error);
    }
  }
}

const timerService = new TimerService();

// API Routes
app.get('/api/timer', async (req, res) => {
  try {
    const state = await timerService.getCurrentState();
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

app.post('/api/timer', async (req, res) => {
  try {
    const state = await timerService.resetTimer();
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
    redis: isRedisConnected,
    timestamp: Date.now()
  });
});

// Start server
async function startServer() {
  await initializeRedis();
  
  app.listen(PORT, () => {
    console.log(`🚀 Backend server running on port ${PORT}`);
    console.log(`📊 Redis connected: ${isRedisConnected}`);
    console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  });
}

startServer().catch(console.error);
