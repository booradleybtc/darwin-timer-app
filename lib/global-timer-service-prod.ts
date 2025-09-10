// Production-ready Global Timer Service
// Uses Redis for shared state across multiple server instances

import { Redis } from 'ioredis'
import { SolanaTokenSwapMonitor } from './solana-monitor'

export interface GlobalTimerState {
  startTime: number
  duration: number
  isActive: boolean
  lastSwapTime: number | null
  lastTrade: {
    type: 'buy' | 'sell'
    amount: number
    dex: string
    signature: string
    timestamp: number
  } | null
  serverTime: number
  instanceId: string
}

export interface ProductionSettings {
  tokenAddress: string
  timerDuration: number
  pollingInterval: number
  isMonitoring: boolean
}

export class ProductionGlobalTimerService {
  private static instance: ProductionGlobalTimerService
  private config: any
  private subscribers: Set<(state: GlobalTimerState) => void> = new Set()
  private updateInterval: NodeJS.Timeout | null = null
  private redis: any = null
  private isRedisAvailable: boolean = false
  private solanaMonitor: SolanaTokenSwapMonitor | null = null

  private constructor() {
    this.initializeRedis()
    this.initializeTimer()
    this.initializeSolanaMonitor()
  }

  static getInstance(): ProductionGlobalTimerService {
    if (!ProductionGlobalTimerService.instance) {
      ProductionGlobalTimerService.instance = new ProductionGlobalTimerService()
    }
    return ProductionGlobalTimerService.instance
  }

  private async initializeRedis() {
    try {
      // Import Redis
      const Redis = await import('ioredis')
      
      if (!process.env.REDIS_URL) {
        throw new Error('REDIS_URL environment variable is required')
      }
      
      this.redis = new Redis.default(process.env.REDIS_URL)
      
      // Wait for Redis to be ready
      await new Promise((resolve, reject) => {
        this.redis.on('ready', () => {
          this.isRedisAvailable = true
          console.log('✅ Redis connected for production timer')
          resolve(true)
        })
        
        this.redis.on('error', (error: Error) => {
          console.error('❌ Redis connection failed:', error)
          reject(error)
        })
      })
    } catch (error) {
      console.error('❌ Redis connection failed:', error)
      throw new Error('Redis connection is required for global timer service')
    }
  }

  private async initializeTimer() {
    try {
      // Check if timer already exists
      const existingTimer = await this.getStoredTimerState()
      
      if (!existingTimer) {
        // Initialize new timer
        const initialState: GlobalTimerState = {
          startTime: Date.now(),
          duration: parseInt(process.env.TIMER_DEFAULT_DURATION || '600000'), // 10 minutes
          isActive: true,
          lastSwapTime: null,
          serverTime: Date.now(),
          instanceId: this.getInstanceId()
        }
        
        await this.storeTimerState(initialState)
        console.log(`[${this.getInstanceId()}] Initialized new global timer`)
      } else {
        console.log(`[${this.getInstanceId()}] Connected to existing global timer`)
      }

      this.startServerTimer()
    } catch (error) {
      console.error(`[${this.getInstanceId()}] Error initializing timer:`, error)
      // Still start the server timer - it will handle initialization on first request
      this.startServerTimer()
    }
  }

  private initializeSolanaMonitor() {
    try {
      // Initialize the Solana monitor
      this.solanaMonitor = new SolanaTokenSwapMonitor()
      
      // Set the callback for when trades are detected
      this.solanaMonitor.setSwapCallback((tradeInfo: any) => {
        console.log(`[${this.getInstanceId()}] Trade detected:`, tradeInfo)
        this.resetTimer(tradeInfo)
      })
      
      // Start monitoring
      this.solanaMonitor.startMonitoring()
      console.log(`[${this.getInstanceId()}] Solana monitor initialized and started`)
    } catch (error) {
      console.error(`[${this.getInstanceId()}] Error initializing Solana monitor:`, error)
    }
  }

  private startServerTimer() {
    const updateInterval = parseInt(process.env.TIMER_UPDATE_INTERVAL || '1000')
    
    this.updateInterval = setInterval(async () => {
      try {
        await this.updateTimerState()
      } catch (error) {
        console.error(`[${this.getInstanceId()}] Error updating timer state:`, error)
      }
    }, updateInterval)
  }

  private async updateTimerState() {
    const currentState = await this.getCurrentState()
    const updatedState: GlobalTimerState = {
      ...currentState,
      serverTime: Date.now(),
      instanceId: this.getInstanceId()
    }

    // Store updated state
    await this.storeTimerState(updatedState)

    // Notify local subscribers
    this.notifySubscribers(updatedState)

    // Publish to Redis for other instances (if available)
    if (this.isRedisAvailable) {
      try {
        await this.redis.publish(
          `${this.getKeyPrefix()}:timer:updates`,
          JSON.stringify(updatedState)
        )
      } catch (error) {
        console.error('Error publishing to Redis:', error)
      }
    }
  }

  async getCurrentState(): Promise<GlobalTimerState> {
    console.log(`[${this.getInstanceId()}] Getting current state, Redis available: ${this.isRedisAvailable}`)
    const state = await this.getStoredTimerState()
    
    if (!state) {
      // Initialize a new timer state if none exists
      console.log(`[${this.getInstanceId()}] No existing state found, creating new timer state`)
      const initialState: GlobalTimerState = {
        startTime: Date.now(),
        duration: parseInt(process.env.TIMER_DEFAULT_DURATION || '600000'), // 10 minutes
        isActive: true,
        lastSwapTime: null,
        lastTrade: null,
        serverTime: Date.now(),
        instanceId: this.getInstanceId()
      }
      
      await this.storeTimerState(initialState)
      console.log(`[${this.getInstanceId()}] Initialized new timer state`)
      return initialState
    }

    const now = Date.now()
    const elapsed = now - state.startTime
    const remaining = Math.max(0, state.duration - elapsed)

    console.log(`[${this.getInstanceId()}] Returning existing state:`, {
      startTime: state.startTime,
      elapsed: elapsed,
      remaining: remaining,
      isActive: remaining > 0
    })

    return {
      ...state,
      serverTime: now,
      isActive: remaining > 0
    }
  }

  async resetTimer(tradeInfo?: any) {
    console.log(`[${this.getInstanceId()}] Resetting global timer`)
    console.log(`[${this.getInstanceId()}] Redis available: ${this.isRedisAvailable}`)
    
    // Get current state to preserve lastTrade if no new trade info provided
    const currentState = await this.getCurrentState()
    
    const resetState: GlobalTimerState = {
      startTime: tradeInfo ? Date.now() : currentState.startTime, // Only reset startTime for new trades
      duration: parseInt(process.env.TIMER_DEFAULT_DURATION || '600000'),
      isActive: true,
      lastSwapTime: tradeInfo ? Date.now() : currentState.lastSwapTime, // Only update lastSwapTime for new trades
      lastTrade: tradeInfo ? {
        type: tradeInfo.type,
        amount: tradeInfo.amount,
        dex: tradeInfo.dex,
        signature: tradeInfo.signature,
        timestamp: tradeInfo.timestamp
      } : currentState.lastTrade, // Preserve existing trade info if no new trade
      serverTime: Date.now(),
      instanceId: this.getInstanceId()
    }

    console.log(`[${this.getInstanceId()}] Reset state created:`, resetState)

    // Store reset state
    await this.storeTimerState(resetState)
    console.log(`[${this.getInstanceId()}] Timer state stored in Redis`)

    // Notify local subscribers
    this.notifySubscribers(resetState)
    console.log(`[${this.getInstanceId()}] Local subscribers notified`)

    // Publish reset event (if Redis available)
    if (this.isRedisAvailable) {
      try {
        await this.redis.publish(
          `${this.getKeyPrefix()}:timer:reset`,
          JSON.stringify(resetState)
        )
        console.log(`[${this.getInstanceId()}] Reset event published to Redis`)
      } catch (error) {
        console.error('Error publishing reset to Redis:', error)
      }
    }

    // Log event
    await this.logTimerEvent('reset', resetState)
    console.log(`[${this.getInstanceId()}] Reset event logged`)
  }

  async updateSettings(settings: ProductionSettings) {
    if (this.isRedisAvailable) {
      try {
        await this.redis.setex(
          `${this.getKeyPrefix()}:settings`,
          86400, // 24 hours TTL
          JSON.stringify(settings)
        )

        // Publish settings update
        await this.redis.publish(
          `${this.getKeyPrefix()}:settings:update`,
          JSON.stringify(settings)
        )
      } catch (error) {
        console.error('Error updating settings in Redis:', error)
      }
    } else {
      // Fallback to in-memory storage
      console.log('Settings updated (in-memory):', settings)
    }
  }

  async getSettings(): Promise<ProductionSettings | null> {
    if (this.isRedisAvailable) {
      try {
        const settingsJson = await this.redis.get(`${this.getKeyPrefix()}:settings`)
        return settingsJson ? JSON.parse(settingsJson) : null
      } catch (error) {
        console.error('Error getting settings from Redis:', error)
        return null
      }
    }
    
    // Fallback to default settings
    return {
      tokenAddress: process.env.TOKEN_ADDRESS || '9VxExA1iRPbuLLdSJ2rB3nyBxsyLReT4aqzZBMaBaY1p',
      timerDuration: parseInt(process.env.TIMER_DEFAULT_DURATION || '600000'),
      pollingInterval: parseInt(process.env.SOLANA_POLLING_INTERVAL || '3000'),
      isMonitoring: true
    }
  }

  private notifySubscribers(state: GlobalTimerState) {
    this.subscribers.forEach(callback => {
      try {
        callback(state)
      } catch (error) {
        console.error('Error notifying subscriber:', error)
      }
    })
  }

  subscribe(callback: (state: GlobalTimerState) => void) {
    this.subscribers.add(callback)
    // Immediately send current state
    this.getCurrentState().then(callback).catch(console.error)
    
    return () => {
      this.subscribers.delete(callback)
    }
  }

  private async storeTimerState(state: GlobalTimerState) {
    try {
      if (!this.redis || !this.isRedisAvailable) {
        console.log('Redis not ready yet, cannot store timer state')
        return
      }
      
      await this.redis.setex(
        `${this.getKeyPrefix()}:timer:state`,
        3600, // 1 hour TTL
        JSON.stringify(state)
      )
    } catch (error) {
      console.error('Error storing timer state in Redis:', error)
      throw error
    }
  }

  private async getStoredTimerState(): Promise<GlobalTimerState | null> {
    try {
      if (!this.redis || !this.isRedisAvailable) {
        console.log('Redis not ready yet, returning null')
        return null
      }
      
      const stateJson = await this.redis.get(`${this.getKeyPrefix()}:timer:state`)
      if (stateJson) {
        const state = JSON.parse(stateJson)
        console.log(`[${this.getInstanceId()}] Retrieved timer state from Redis:`, {
          startTime: state.startTime,
          isActive: state.isActive,
          lastTrade: state.lastTrade ? 'exists' : 'null'
        })
        return state
      }
      return null
    } catch (error) {
      console.error('Error getting timer state from Redis:', error)
      return null // Return null instead of throwing to prevent crashes
    }
  }

  private async logTimerEvent(event: string, state: GlobalTimerState) {
    const eventData = {
      event,
      timestamp: Date.now(),
      instanceId: this.getInstanceId(),
      state
    }

    if (this.isRedisAvailable) {
      try {
        // Store in Redis with TTL
        await this.redis.lpush(
          `${this.getKeyPrefix()}:events`,
          JSON.stringify(eventData)
        )
        
        // Keep only last 1000 events
        await this.redis.ltrim(`${this.getKeyPrefix()}:events`, 0, 999)
      } catch (error) {
        console.error('Error logging event to Redis:', error)
      }
    } else {
      // Fallback to console logging
      console.log('Timer Event:', eventData)
    }
  }

  async getRecentEvents(limit: number = 100) {
    if (this.isRedisAvailable) {
      try {
        const events = await this.redis.lrange(
          `${this.getKeyPrefix()}:events`,
          0,
          limit - 1
        )
        
        return events.map((event: string) => JSON.parse(event))
      } catch (error) {
        console.error('Error getting events from Redis:', error)
        return []
      }
    }
    
    return []
  }

  async getStats() {
    const state = await this.getCurrentState()
    const events = await this.getRecentEvents(1000)
    
    const resets = events.filter((e: any) => e.event === 'reset').length
    const uptime = Date.now() - state.startTime
    
    return {
      connectedClients: await this.getConnectedClientsCount(),
      totalResets: resets,
      uptime,
      lastReset: state.lastSwapTime,
      instanceId: this.getInstanceId(),
      activeInstances: await this.getActiveInstances(),
      redisAvailable: this.isRedisAvailable
    }
  }

  async getMonitoringStats() {
    // Get real-time monitoring stats from the Solana monitor
    if (this.solanaMonitor) {
      try {
        const stats = this.solanaMonitor.getCostStats()
        return {
          mode: stats.mode,
          currentInterval: stats.currentInterval,
          currentCost: stats.currentCost,
          minCost: stats.minCost,
          maxCost: stats.maxCost,
          range: stats.range,
          lastTrade: stats.lastTrade,
          consecutiveErrors: stats.consecutiveErrors
        }
      } catch (error) {
        console.error('Error getting monitoring stats from Solana monitor:', error)
      }
    }
    
    // Fallback to default values if monitor is not available
    return {
      mode: 'balanced',
      currentInterval: 60,
      currentCost: 240,
      minCost: 120,
      maxCost: 480,
      range: '30s - 2 min',
      lastTrade: null,
      consecutiveErrors: 0
    }
  }

  async updateMonitoringConfig(config: any) {
    // Store monitoring configuration in Redis
    if (this.isRedisAvailable) {
      try {
        await this.redis.setex(
          `${this.getKeyPrefix()}:monitoring:config`,
          86400, // 24 hours TTL
          JSON.stringify(config)
        )
        console.log('✅ Monitoring configuration updated in Redis')
      } catch (error) {
        console.error('❌ Error storing monitoring config:', error)
      }
    }
    
    // Update the Solana monitor with new configuration
    if (this.solanaMonitor && config.tokenAddress) {
      try {
        this.solanaMonitor.updateTokenAddress(config.tokenAddress)
        console.log(`✅ Solana monitor token address updated to ${config.tokenAddress}`)
      } catch (error) {
        console.error('❌ Error updating Solana monitor token address:', error)
      }
    }
  }

  async setPollingSpeed(mode: 'conservative' | 'balanced' | 'aggressive' | 'ultra') {
    // Store polling speed in Redis
    if (this.isRedisAvailable) {
      try {
        await this.redis.setex(
          `${this.getKeyPrefix()}:monitoring:speed`,
          86400, // 24 hours TTL
          mode
        )
        console.log(`✅ Polling speed set to ${mode} mode`)
      } catch (error) {
        console.error('❌ Error storing polling speed:', error)
      }
    }
    
    // Update the Solana monitor with the new polling speed
    if (this.solanaMonitor) {
      try {
        this.solanaMonitor.setPollingSpeed(mode)
        console.log(`✅ Solana monitor polling speed updated to ${mode}`)
      } catch (error) {
        console.error('❌ Error updating Solana monitor polling speed:', error)
      }
    }
  }

  private async getConnectedClientsCount() {
    // This would integrate with your WebSocket/SSE connection tracking
    // For now, return a mock value
    return Math.floor(Math.random() * 100) + 10
  }

  private async getActiveInstances() {
    if (this.isRedisAvailable) {
      try {
        const keys = await this.redis.keys(`${this.getKeyPrefix()}:instance:*`)
        return keys.length
      } catch (error) {
        console.error('Error getting active instances:', error)
        return 1
      }
    }
    
    return 1
  }

  private getInstanceId(): string {
    // Use a consistent instance ID for production to prevent timer resets
    // In Vercel, we want all instances to share the same timer state
    return process.env.INSTANCE_ID || 'vercel-production'
  }

  private getKeyPrefix(): string {
    return process.env.REDIS_KEY_PREFIX || 'darwin-timer'
  }

  destroy() {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
    }
    this.subscribers.clear()
    
    if (this.redis) {
      this.redis.disconnect()
    }
  }
}