const { Connection, PublicKey } = require('@solana/web3.js');

class SolanaTokenSwapMonitor {
  constructor() {
    this.tokenAddress = process.env.TOKEN_ADDRESS;
    this.heliusApiKey = process.env.HELIUS_API_KEY;
    this.swapCallback = null;
    this.isMonitoring = false;
    this.monitorInterval = null;
    this.lastCheckedSignature = null;
  }

  setSwapCallback(callback) {
    this.swapCallback = callback;
  }

  async startMonitoring() {
    if (this.isMonitoring) return;
    
    this.isMonitoring = true;
    console.log('🔍 Starting Solana token swap monitoring...');
    
    // Check for swaps every 30 seconds
    this.monitorInterval = setInterval(async () => {
      try {
        await this.checkForSwaps();
      } catch (error) {
        console.error('Error checking for swaps:', error);
      }
    }, 30000);
    
    // Initial check
    await this.checkForSwaps();
  }

  stopMonitoring() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
      this.monitorInterval = null;
    }
    this.isMonitoring = false;
    console.log('⏹️ Stopped Solana monitoring');
  }

  async checkForSwaps() {
    try {
      if (!this.tokenAddress || !this.heliusApiKey) {
        console.log('⚠️ Missing token address or Helius API key');
        return;
      }

      const response = await fetch(
        `https://api.helius.xyz/v0/addresses/${this.tokenAddress}/transactions?api-key=${this.heliusApiKey}&limit=10`
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      if (data && data.length > 0) {
        // Check for new transactions since last check
        const newTransactions = this.lastCheckedSignature 
          ? data.filter(tx => tx.signature !== this.lastCheckedSignature)
          : data.slice(0, 1); // Only check the most recent one on first run

        for (const tx of newTransactions) {
          await this.analyzeTransaction(tx);
        }

        // Update last checked signature
        if (data.length > 0) {
          this.lastCheckedSignature = data[0].signature;
        }
      }
    } catch (error) {
      console.error('Error checking for swaps:', error);
    }
  }

  async analyzeTransaction(transaction) {
    try {
      // Simple analysis - look for token transfers
      const tokenTransfers = transaction.tokenTransfers || [];
      
      if (tokenTransfers.length > 0) {
        const transfer = tokenTransfers[0];
        
        // Determine if it's a buy or sell based on token flow
        const isBuy = transfer.fromUserAccount === this.tokenAddress;
        const isSell = transfer.toUserAccount === this.tokenAddress;
        
        if (isBuy || isSell) {
          const tradeInfo = {
            type: isBuy ? 'buy' : 'sell',
            amount: transfer.tokenAmount || 0,
            dex: 'Unknown', // Could be enhanced to detect specific DEX
            signature: transaction.signature,
            timestamp: transaction.timestamp * 1000 // Convert to milliseconds
          };

          console.log('🔄 Trade detected:', tradeInfo);
          
          if (this.swapCallback) {
            await this.swapCallback(tradeInfo);
          }
        }
      }
    } catch (error) {
      console.error('Error analyzing transaction:', error);
    }
  }
}

module.exports = { SolanaTokenSwapMonitor };
