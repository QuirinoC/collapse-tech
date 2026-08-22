# CoachGG

Super Smash Bros Ultimate player analysis tool. Enter your [start.gg](https://start.gg) user slug and get real-time win rate stats as your game history streams in.

**Live:** https://coach.collapsetechnologies.com

---

## Features

| Tab | What it shows |
|---|---|
| 🗺️ **Stages** | Win rate per legal stage (animated cards with stage art) |
| 🎮 **Characters** | Win rate per character you played |
| ⚔️ **Stage Counterpick** | Your characters → win rate per stage (accordion) |
| 🥊 **Character Counterpick** | Your characters → win rate vs. each opponent character |

- **Real-time streaming** — stats update live page-by-page, animated transitions
- **Sort** — toggle between % win rate or # wins (applies to cards AND chips within rows)
- **Mobile-friendly** — responsive layout, horizontal-scroll tab strip, no side overflow
- **Deep-link** — `?slug=bc954a2e` starts analysis immediately

---

## Architecture

```
┌──────────────────────────────────────────────────────────────┐
│  Browser                           Mobile (Expo Go)          │
│  index.html / app.js / styles.css  App.tsx                   │
│         │ SignalR WebSocket              │ SignalR client     │
└─────────┼──────────────────────────────-┼────────────────────┘
          │ /analysishub                  │
          ▼                              ▼
┌──────────────────────────────────────────────────────────────┐
│               ASP.NET Core 8  (src/)                         │
│                                                              │
│  GET  /            → static/index.html                       │
│  GET  /health      → {"status":"healthy"}                    │
│  WS   /analysishub → AnalysisHub (SignalR)                   │
│                                                              │
│  AnalysisHub.Subscribe(slug)                                 │
│    1. Redis hit? version check (StatsVersion v4) → instant   │
│    2. Raw games cached? recompute stats → fast               │
│    3. JobManager.RunJob() → full start.gg API fetch          │
│                                                              │
│  StartGGService → GraphQL pages (30 games/page)              │
│    └─ each page → AggregationService.ComputeAll()            │
│         └─ broadcast Progress(partialStats) to client        │
└─────────────────────────┬────────────────────────────────────┘
                          │
              ┌───────────┴──────────┐
              ▼                      ▼
┌─────────────────────┐   ┌─────────────────────────────────┐
│ Redis sidecar        │   │    start.gg GraphQL API         │
│                      │   │  api.start.gg/gql/alpha         │
│  games:{slug}  24h   │   │                                 │
│  jobstate:{slug} 1h  │   │  Auth: Bearer token              │
│  ephemeral at zero   │   │  Rate limit: 80 req/min         │
└─────────────────────┘   └─────────────────────────────────┘
```

---

## Quick Start

### Prerequisites
- .NET 8 SDK
- Redis

### Local
```bash
export STARTGG_APIKEY=your_start_gg_token
export REDIS_CONNECTION=localhost:6379
dotnet run --project src/CoachGG.csproj
```

### Mobile
```bash
cd mobile/
npm install
npx expo start   # scan QR with Expo Go
```

### E2E Tests
```bash
npm install
npx playwright test --reporter=line
# Runs against https://coach.collapsetechnologies.com
```

---

## API Reference

### REST

| Endpoint | Description |
|---|---|
| `GET /health` | `{"status":"healthy","timestamp":"..."}` |
| `GET /counterpicker/{slug}` | Blocking full analysis (REST fallback) |

### SignalR Hub (`/analysishub`)

**Client → Hub:**
```
Subscribe(slug: string)
```

**Hub → Client:**
```
JobQueued({slug, message})          ← job accepted
Progress({slug, currentPage,        ← live update per page
          totalPages, partialStats})
JobComplete({slug, stats})          ← final results
JobError({slug, error})             ← failure
```

### Stats Payload
```json
{
  "winrateByStage": {
    "Battlefield": { "total": 10, "winCount": 6, "winRate": 60.0 }
  },
  "winrateByCharacter": {
    "Ness": { "total": 10, "winCount": 6, "winRate": 60.0 }
  },
  "winrateStageByCharacter": {
    "Ness": { "Battlefield": { "total": 5, "winCount": 3, "winRate": 60.0 } }
  },
  "winrateByOpponentCharacter": {
    "Mario": { "total": 5, "winCount": 3, "winRate": 60.0 }
  },
  "winrateMyCharByOpponentChar": {
    "Ness": { "Mario": { "total": 3, "winCount": 2, "winRate": 66.7 } }
  }
}
```

---

## Environment Variables

| Variable | Description |
|---|---|
| `STARTGG_APIKEY` | start.gg personal access token |
| `REDIS_CONNECTION` | StackExchange.Redis string e.g. `localhost:6379` |
| `REDIS_URL` | Full URL e.g. `rediss://default:token@host:6379` (Upstash format, auto-parsed) |
| `ASPNETCORE_URLS` | Default `http://+:8080` |

---

## Deployment (Azure Container Apps)

CoachGG deploys as a scale-to-zero Azure Container App. SignalR runs in-process through the ASP.NET Core SDK; Azure SignalR Service is not provisioned. A Redis sidecar scales with the app and loses its cache when the replica reaches zero. Deployments are manual through the **Deploy CoachGG** GitHub Actions workflow.

The app is capped at one replica because SignalR groups and active job ownership are process-local. See [`Infrastructure/Azure`](Infrastructure/Azure/README.md) for deployment, cost, and custom-domain details.

---

## Project Structure

```
apps/coach-gg/
├── Dockerfile                 # Multi-stage .NET 8 production build
├── Infrastructure/Azure/      # Scale-to-zero Container Apps deployment
├── playwright.config.ts       # E2E test config (baseURL = prod)
├── tests/
│   └── e2e.spec.ts            # 9 Playwright tests
├── src/
│   ├── Program.cs             # Bootstrap, routes, Redis URL parsing
│   ├── Hubs/
│   │   └── AnalysisHub.cs     # SignalR hub entry point
│   ├── Services/
│   │   ├── AggregationService.cs  # 5 win-rate computations
│   │   ├── Constants.cs           # StatsVersion, SkipCharacters, char map
│   │   ├── JobManager.cs          # Job deduplication
│   │   ├── RedisService.cs        # Redis cache wrapper
│   │   └── StartGGService.cs      # GraphQL client + retry
│   ├── Models/
│   │   ├── GameData.cs        # Raw API models
│   │   ├── JobState.cs        # Job state + StatsVersion
│   │   └── Stats.cs           # PlayerStats, StatEntry
│   └── static/
│       ├── index.html         # App shell
│       ├── app.js             # SignalR client, rendering, sort
│       └── styles.css         # Dark theme, responsive
└── mobile/                    # React Native / Expo
    └── App.tsx
```
