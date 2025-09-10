import { Redis } from '@upstash/redis'

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
  private redis: Redis | null = null
  private isRedisAvailable = false

  private constructor() {
    this.initializeRedis()
  }

  static getInstance(): VercelTimerService {
    if (!VercelTimerService.instance) {
      VercelTimerService.instance = new VercelTimerService()
    }
    return VercelTimerService.instance
  }

  private async initializeRedis() {
    try {
      if (process.env.REDIS_URL) {
        this.redis = new Redis({
          url: process.env.REDIS_URL,
          token: process.env.REDIS_TOKEN
        })
        
        // Test connection
        await this.redis.ping()
        this.isRedisAvailable = true
        console.log('Redis connected successfully for Vercel timer service')
      }
    } catch (error) {
      console.error('Failed to initialize Redis:', error)
      this.isRedisAvailable = false
    }
  }

  private getKeyPrefix(): string {
    return process.env.REDIS_KEY_PREFIX || 'darwin-timer'
  }

  async getCurrentState(): Promise<GlobalTimerState> {
    try {
      // Always try to get from Redis first
      if (this.isRedisAvailable && this.redis) {
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
      
      // Store the new state
      if (this.isRedisAvailable && this.redis) {
        await this.redis.setex(
          `${this.getKeyPrefix()}:timer:state`,
          3600, // 1 hour TTL
          JSON.stringify(initialState)
        )
        console.log('Stored new timer state in Redis')
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
      if (this.isRedisAvailable && this.redis) {
        await this.redis.setex(
          `${this.getKeyPrefix()}:timer:state`,
          3600, // 1 hour TTL
          JSON.stringify(resetState)
        )
        console.log('Stored reset timer state in Redis')
      }
      
      return resetState
    } catch (error) {
      console.error('Error resetting timer:', error)
      throw error
    }
  }
}
