'use client'

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { GlobalTimerState } from '@/lib/global-timer-service-prod'

interface TimerContextType {
  timeLeft: number
  isActive: boolean
  resetTimer: () => void
  lastSwapTime: number | null
  lastTrade: any | null
  isInitialized: boolean
}

const TimerContext = createContext<TimerContextType | undefined>(undefined)

const TIMER_DURATION = 10 * 60 * 1000 // 10 minutes in milliseconds

export function TimerProvider({ children }: { children: React.ReactNode }) {
  const [timeLeft, setTimeLeft] = useState(TIMER_DURATION)
  const [isActive, setIsActive] = useState(true)
  const [lastSwapTime, setLastSwapTime] = useState<number | null>(null)
  const [lastTrade, setLastTrade] = useState<any | null>(null)
  const [serverTime, setServerTime] = useState<number>(Date.now())
  const [isInitialized, setIsInitialized] = useState(false)

  // Function to reset timer
  const resetTimer = useCallback(async () => {
    console.log('Timer reset triggered!')
    
    try {
      // Send reset to backend server
      const response = await fetch('/api/timer', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ action: 'reset' }),
      })
      
      if (response.ok) {
        const data = await response.json()
        if (data.success && data.data) {
          updateFromServerState(data.data)
        }
      }
    } catch (error) {
      console.error('Error resetting timer:', error)
    }
  }, [updateFromServerState])

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
    
    // Calculate time left based on current time vs start time
    // The server already calculated this correctly, but we need to account for client-server time difference
    const now = Date.now()
    const elapsed = now - state.startTime
    const remaining = Math.max(0, state.duration - elapsed)
    setTimeLeft(remaining)
  }, [])

  // Initialize timer synchronization with simple polling
  useEffect(() => {
    // First, fetch the initial state from the server
    fetchInitialState()

    // Set up polling to get timer updates every 5 seconds
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch('/api/timer')
        if (response.ok) {
          const data = await response.json()
          if (data.success && data.data) {
            updateFromServerState(data.data)
          }
        }
      } catch (error) {
        console.error('Error polling timer state:', error)
      }
    }, 5000)

    return () => {
      clearInterval(pollInterval)
    }
  }, [updateFromServerState, fetchInitialState])

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