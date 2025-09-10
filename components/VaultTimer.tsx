'use client'

import React, { useState, useEffect } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Clock, Wifi, WifiOff, RotateCcw, Bug, Settings } from 'lucide-react'
import { useTimer } from '@/contexts/TimerContext'
import { getTimeSynchronizer } from '@/lib/time-sync'
import { SolanaTokenSwapMonitor } from '@/lib/solana-monitor'

export function VaultTimer() {
  const { timeLeft, isActive, lastTrade, resetTimer, isInitialized } = useTimer()
  const [isSynced, setIsSynced] = useState(false)
  const [syncStatus, setSyncStatus] = useState<'syncing' | 'synced' | 'error'>('syncing')

  // Check sync status
  useEffect(() => {
    const timeSync = getTimeSynchronizer()
    
    const checkSync = () => {
      const synced = timeSync.isSynced()
      setIsSynced(synced)
      setSyncStatus(synced ? 'synced' : 'syncing')
    }
    
    checkSync()
    const interval = setInterval(checkSync, 5000)
    
    return () => clearInterval(interval)
  }, [])

  // Format time as HH:MM:SS
  const formatTime = (milliseconds: number) => {
    const totalSeconds = Math.floor(milliseconds / 1000)
    const hours = Math.floor(totalSeconds / 3600)
    const minutes = Math.floor((totalSeconds % 3600) / 60)
    const seconds = totalSeconds % 60

    return {
      hours: hours.toString().padStart(2, '0'),
      minutes: minutes.toString().padStart(2, '0'),
      seconds: seconds.toString().padStart(2, '0')
    }
  }

  const { hours, minutes, seconds } = formatTime(timeLeft)

  // Debug function to check recent transactions
  const debugRecentTransactions = async () => {
    console.log('🔍 Starting debug check...')
    const monitor = new SolanaTokenSwapMonitor()
    await monitor.debugRecentTransactions(5)
  }

  const debugSpecificTransaction = async () => {
    console.log('🔍 Analyzing specific transaction...')
    const monitor = new SolanaTokenSwapMonitor()
    await monitor.debugSpecificTransaction('MXSceriLN6vGwFYuDqxZuQJCKjsiGFkJyk2iahvLuSiFLBTHEqNJ9asmXkEW6vPRyQPY999ZEEUtsRDEf3jUdbq')
  }

  return (
    <Card 
      className="border-white/20 p-5 shadow-lg ring-1 ring-white/10 backdrop-blur-md" 
      style={{ 
        background: 'linear-gradient(135deg, rgba(255, 255, 255, 0.08) 0%, rgba(0, 0, 0, 0.12) 100%)', 
        borderRadius: '8px' 
      }}
    >
      <div className="flex items-center justify-center gap-2 mb-4">
        <Clock className={`w-4 h-4 ${isActive ? 'text-green-400' : 'text-red-400'}`} />
        <span className="text-gray-400 text-sm font-semibold">Global Vault Timer</span>
        <div className="flex items-center gap-1 ml-2">
          {isSynced ? (
            <Wifi className="w-3 h-3 text-green-400" />
          ) : (
            <WifiOff className="w-3 h-3 text-yellow-400" />
          )}
        </div>
        {!isActive && (
          <span className="text-red-400 text-xs font-medium ml-2">EXPIRED</span>
        )}
      </div>
      <div className="text-center">
        {!isInitialized ? (
          <div className="text-4xl font-bold mb-1 text-gray-400">
            Loading...
          </div>
        ) : (
          <div className={`text-4xl font-bold mb-1 ${isActive ? 'text-white' : 'text-red-400'}`}>
            {hours} : {minutes} : {seconds}
          </div>
        )}
        <div className="flex justify-center gap-8 text-xs text-gray-400 font-semibold">
          <span>Hour</span>
          <span>Minutes</span>
          <span>Seconds</span>
        </div>
        {!isActive && (
          <div className="mt-3 text-xs text-gray-500">
            Waiting for next token swap to reset timer...
          </div>
        )}
        {!isSynced && (
          <div className="mt-2 text-xs text-yellow-400">
            Syncing with global server...
          </div>
        )}
        {lastTrade && (
          <div className="mt-2 text-xs text-blue-400">
            Last {lastTrade.type}: {lastTrade.amount.toFixed(2)} tokens on {lastTrade.dex}
            <div className="text-xs text-gray-500 mt-1">
              Debug: type="{lastTrade.type}", amount={lastTrade.amount}, dex="{lastTrade.dex}"
            </div>
          </div>
        )}
        
        {/* Debug and Testing Buttons */}
        <div className="mt-4 flex justify-center gap-2 flex-wrap">
          <Button
            onClick={resetTimer}
            size="sm"
            variant="outline"
            disabled={!isInitialized}
            className="text-xs border-yellow-400/50 text-yellow-400 hover:bg-yellow-400/10 hover:border-yellow-400 disabled:opacity-50"
          >
            <RotateCcw className="w-3 h-3 mr-1" />
            Manual Reset
          </Button>
          <Button
            onClick={debugRecentTransactions}
            size="sm"
            variant="outline"
            className="text-xs border-blue-400/50 text-blue-400 hover:bg-blue-400/10 hover:border-blue-400"
          >
            <Bug className="w-3 h-3 mr-1" />
            Debug Check
          </Button>
          <Button
            onClick={debugSpecificTransaction}
            size="sm"
            variant="outline"
            className="text-xs border-red-400/50 text-red-400 hover:bg-red-400/10 hover:border-red-400"
          >
            <Bug className="w-3 h-3 mr-1" />
            Test TX
          </Button>
          <Button
            onClick={() => window.open('/admin', '_blank')}
            size="sm"
            variant="outline"
            className="text-xs border-purple-400/50 text-purple-400 hover:bg-purple-400/10 hover:border-purple-400"
          >
            <Settings className="w-3 h-3 mr-1" />
            Admin
          </Button>
        </div>
      </div>
    </Card>
  )
}