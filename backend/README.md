# Darwin Timer Backend

A persistent backend server for the Darwin Timer application, designed to run on Render.com with proper state management.

## Features

- ✅ **Persistent Timer State** - Uses Redis for reliable state storage
- ✅ **Solana Monitoring** - Automatically detects token swaps and resets timer
- ✅ **REST API** - Clean API endpoints for frontend integration
- ✅ **Health Monitoring** - Built-in health check endpoint
- ✅ **Error Handling** - Robust error handling and logging

## API Endpoints

### GET /api/timer
Returns the current timer state
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
      "amount": 1686.79,
      "dex": "Unknown",
      "signature": "...",
      "timestamp": 1757534730428
    },
    "serverTime": 1757535062824,
    "instanceId": "render-backend"
  }
}
```

### POST /api/timer
Resets the timer (manual reset)
```json
{
  "success": true,
  "data": { /* timer state */ }
}
```

### GET /health
Health check endpoint
```json
{
  "status": "healthy",
  "redis": true,
  "timestamp": 1757535062824
}
```

## Environment Variables

- `REDIS_URL` - Redis connection string
- `TOKEN_ADDRESS` - Solana token address to monitor
- `HELIUS_API_KEY` - Helius API key for Solana data
- `PORT` - Server port (default: 3001)

## Deployment to Render

1. **Connect GitHub Repository** to Render
2. **Create Web Service** with these settings:
   - Build Command: `cd backend && npm install`
   - Start Command: `cd backend && npm start`
   - Environment: `Node`
3. **Add Environment Variables**:
   - `REDIS_URL` (from Redis database)
   - `TOKEN_ADDRESS`
   - `HELIUS_API_KEY`
4. **Deploy!**

## Local Development

```bash
cd backend
npm install
npm run dev
```

The server will start on `http://localhost:3001`
