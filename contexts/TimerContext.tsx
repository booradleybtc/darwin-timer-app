'use client'

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { SolanaTokenSwapMonitor, TradeInfo } from '@/lib/solana-monitor'
import { getWebSocketService, TimerSyncMessage } from '@/lib/websocket-service'
import { GlobalTimerState } from '@/lib/global-timer-service-prod'

interface TimerContextType {
  timeLeft: number
  isActive: boolean
  resetTimer: () => void
  lastSwapTime: number | null
  lastTrade: TradeInfo | null
  isInitialized: boolean
}

const TimerContext = createContext<TimerContextType | undefined>(undefined)

const TIMER_DURATION = 10 * 60 * 1000 // 10 minutes in milliseconds

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION)
  const [isActive, setIsActive] = useState(true)
  const [lastSwapTime, setLastSwapTime] = useState<number | null>(null)
  const [lastTrade, setLastTrade] = useState<TradeInfo | null>(null)
  const [serverTime, setServerTime] = useState<number>(Date.now())
  const [isInitialized, setIsInitialized] = useState(false)
  const monitorRef = useRef<SolanaTokenSwapMonitor | null>(null)
  const wsServiceRef = useRef<ReturnType<typeof getWebSocketService> | null>(null)

  // Function to reset timer
  const resetTimer = useCallback(() => {
    console.log('Timer reset triggered by token swap!')
    
    // Send reset to server - this will sync across all users
    const wsService = getWebSocketService()
    wsService.sendTimerReset()
  }, [])

  // Function to fetch initial state from server
  const fetchInitialState = useCallback(async () => {
    try {
      const response = await fetch('/api/timer')
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          console.log('Fetched initial timer state from server:', data.data)
          updateFromServerState(data.data)
          setIsInitialized(true)
        }
      }
    } catch (error) {
      console.error('Failed to fetch initial timer state:', error)
      setIsInitialized(true) // Still initialize to prevent blocking
    }
  }, [])

  // Function to update local state from server state
  const updateFromServerState = useCallback((state: GlobalTimerState) => {
    setServerTime(state.serverTime)
    setLastSwapTime(state.lastSwapTime)
    setIsActive(state.isActive)
    
    // Update last trade information if available
    if (state.lastTrade) {
      setLastTrade(state.lastTrade)
    }
    
    // Calculate time left based on server time
    const elapsed = state.serverTime - state.startTime
    const remaining = Math.max(0, state.duration - elapsed)
    setTimeLeft(remaining)
  }, [])

  // Initialize global timer synchronization
  useEffect(() => {
    // First, fetch the initial state from the server
    fetchInitialState()

    // Initialize WebSocket service for global sync
    const wsService = getWebSocketService()
    wsServiceRef.current = wsService
    
    wsService.setMessageHandler((message: TimerSyncMessage) => {
      if (message.type === 'initial' && message.data) {
        console.log('Received initial timer state from server')
        updateFromServerState(message.data)
      } else if (message.type === 'update' && message.data) {
        console.log('Received timer update from server')
        updateFromServerState(message.data)
      } else if (message.type === 'ping') {
        // Keep connection alive
        console.log('Received ping from server')
      }
    })

    // Initialize Solana monitoring
    const monitor = new SolanaTokenSwapMonitor()
    monitor.setSwapCallback((tradeInfo: TradeInfo) => {
      console.log('Trade detected:', tradeInfo)
      setLastTrade(tradeInfo)
      resetTimer()
    })
    monitor.startMonitoring()
    monitorRef.current = monitor

    return () => {
      wsService.disconnect()
      if (monitorRef.current) {
        monitorRef.current.stopMonitoring()
      }
    }
  }, [resetTimer, updateFromServerState, fetchInitialState])

  // Local countdown effect (for smooth UI updates)
  useEffect(() => {
    if (!isInitialized || !isActive || timeLeft <= 0) return

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1000) {
          setIsActive(false)
          return 0
        }
        return prev - 1000
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [isInitialized, isActive, timeLeft])

  const value: TimerContextType = {
    timeLeft,
    isActive,
    resetTimer,
    lastSwapTime,
    lastTrade,
    isInitialized
  }

  return (
    <TimerContext.Provider value={value}>
      {children}
    </TimerContext.Provider>
  )
}

export function useTimer() {
  const context = useContext(TimerContext)
  if (context === undefined) {
    throw new Error('useTimer must be used within a TimerProvider')
  }
  return context
}