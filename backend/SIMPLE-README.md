# Darwin Timer - Simple Backend (No Redis!)

A super simple backend for the Darwin Timer that stores everything in memory. No Redis, no external dependencies, just pure Node.js!

## Why This is Better

- ✅ **No Redis dependency** - One less thing to break
- ✅ **Faster** - No network calls to external services
- ✅ **Simpler** - Just Express.js and in-memory state
- ✅ **More reliable** - No connection issues
- ✅ **Cheaper** - No Redis hosting costs

## How It Works

1. **In-Memory State** - Timer state stored in a simple JavaScript object
2. **Persistent Server** - Render keeps the server running, so state persists
3. **Solana Monitoring** - Still monitors for trades and resets timer
4. **Simple API** - Same endpoints as before, just simpler implementation

## API Endpoints

### GET /api/timer
Returns current timer state
```json
{
  "success": true,
  "data": {
    "startTime": 1757534730440,
    "duration": 600000,
    "isActive": true,
    "lastSwapTime": 1757534730440,
    "lastTrade": {
      "type": "buy",
      "amount": 348.86,
      "dex": "Unknown",
      "signature": "...",
      "timestamp": 1757534730428
    },
    "serverTime": 1757535062824,
    "instanceId": "render-simple"
  }
}
```

### POST /api/timer
Resets the timer
```json
{
  "success": true,
  "data": { /* timer state */ }
}
```

### GET /health
Health check
```json
{
  "status": "healthy",
  "redis": "not_used",
  "solana": "monitoring",
  "timer": "active",
  "timestamp": 1757535062824
}
```

## Environment Variables

Only 2 required:
- `TOKEN_ADDRESS` - Solana token address to monitor
- `HELIUS_API_KEY` - Helius API key for Solana data

## Deployment

1. **Deploy to Render** - Use the `render.yaml` file
2. **No Redis setup needed** - Just deploy the web service
3. **Update frontend** - Point to the new backend URL

## Local Development

```bash
cd backend
npm install
npm run dev
```

That's it! Super simple and reliable. 🚀
