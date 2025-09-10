import { createClient } from 'redis'

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

export class VercelTimerService {
  private static instance: VercelTimerService
  private redis: ReturnType<typeof createClient> | null = null
  private isRedisAvailable = false
  private connectionPromise: Promise<void> | null = null

  private constructor() {
    // Don't initialize Redis in constructor - do it lazily
  }

  static getInstance(): VercelTimerService {
    if (!VercelTimerService.instance) {
      VercelTimerService.instance = new VercelTimerService()
    }
    return VercelTimerService.instance
  }

  private async ensureRedisConnection(): Promise<boolean> {
    // If already connected, return true
    if (this.isRedisAvailable && this.redis) {
      try {
        await this.redis.ping()
        return true
      } catch (error) {
        console.log('Redis connection lost, reconnecting...')
        this.isRedisAvailable = false
        this.redis = null
      }
    }

    // If connection is in progress, wait for it
    if (this.connectionPromise) {
      await this.connectionPromise
      return this.isRedisAvailable
    }

    // Start new connection
    this.connectionPromise = this.initializeRedis()
    await this.connectionPromise
    this.connectionPromise = null
    
    return this.isRedisAvailable
  }

  private async initializeRedis(): Promise<void> {
    try {
      if (process.env.REDIS_URL) {
        // Close existing connection if any
        if (this.redis) {
          try {
            await this.redis.quit()
          } catch (error) {
            // Ignore errors when closing
          }
        }

        this.redis = createClient({
          url: process.env.REDIS_URL,
          socket: {
            connectTimeout: 5000,
            lazyConnect: true
          }
        })
        
        this.redis.on('error', (err) => {
          console.error('Redis Client Error:', err)
          this.isRedisAvailable = false
        })
        
        await this.redis.connect()
        await this.redis.ping()
        this.isRedisAvailable = true
        console.log('Redis connected successfully for Vercel timer service')
      }
    } catch (error) {
      console.error('Failed to initialize Redis:', error)
      this.isRedisAvailable = false
      this.redis = null
    }
  }

  private getKeyPrefix(): string {
    return process.env.REDIS_KEY_PREFIX || 'darwin-timer'
  }

  async getCurrentState(): Promise<GlobalTimerState> {
    try {
      // Ensure Redis connection
      const redisConnected = await this.ensureRedisConnection()
      
      // Try to get from Redis first
      if (redisConnected && this.redis) {
        try {
          const stateJson = await this.redis.get(`${this.getKeyPrefix()}:timer:state`)
          if (stateJson) {
            const state = JSON.parse(stateJson)
            console.log('Retrieved timer state from Redis:', state)
            
            // Calculate current state
            const now = Date.now()
            const elapsed = now - state.startTime
            const remaining = Math.max(0, state.duration - elapsed)
            
            return {
              ...state,
              serverTime: now,
              isActive: remaining > 0
            }
          }
        } catch (error) {
          console.error('Error retrieving from Redis:', error)
          // Continue to create new state
        }
      }
      
      // If no state in Redis, create a new one
      console.log('No timer state found in Redis, creating new state')
      const initialState: GlobalTimerState = {
        startTime: Date.now(),
        duration: parseInt(process.env.TIMER_DEFAULT_DURATION || '600000'),
        isActive: true,
        lastSwapTime: null,
        lastTrade: null,
        serverTime: Date.now(),
        instanceId: 'vercel-production'
      }
      
      // Store the new state if Redis is available
      if (redisConnected && this.redis) {
        try {
          await this.redis.setex(
            `${this.getKeyPrefix()}:timer:state`,
            3600, // 1 hour TTL
            JSON.stringify(initialState)
          )
          console.log('Stored new timer state in Redis')
        } catch (error) {
          console.error('Error storing in Redis:', error)
        }
      }
      
      return initialState
    } catch (error) {
      console.error('Error in getCurrentState:', error)
      // Return a fallback state
      return {
        startTime: Date.now(),
        duration: parseInt(process.env.TIMER_DEFAULT_DURATION || '600000'),
        isActive: true,
        lastSwapTime: null,
        lastTrade: null,
        serverTime: Date.now(),
        instanceId: 'vercel-production'
      }
    }
  }

  async resetTimer(tradeInfo?: any): Promise<GlobalTimerState> {
    try {
      console.log('Resetting timer with trade info:', tradeInfo)
      
      const resetState: GlobalTimerState = {
        startTime: Date.now(),
        duration: parseInt(process.env.TIMER_DEFAULT_DURATION || '600000'),
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
        instanceId: 'vercel-production'
      }
      
      // Store in Redis
      const redisConnected = await this.ensureRedisConnection()
      if (redisConnected && this.redis) {
        try {
          await this.redis.setex(
            `${this.getKeyPrefix()}:timer:state`,
            3600, // 1 hour TTL
            JSON.stringify(resetState)
          )
          console.log('Stored reset timer state in Redis')
        } catch (error) {
          console.error('Error storing reset state in Redis:', error)
        }
      }
      
      return resetState
    } catch (error) {
      console.error('Error resetting timer:', error)
      throw error
    }
  }
}
