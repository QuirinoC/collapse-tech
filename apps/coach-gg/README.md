# CoachGG

Super Smash Bros Ultimate player analysis tool. Enter your [start.gg](https://start.gg) gamerTag or slug and get real-time win rate stats as your game history streams in.

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
│         │ SignalR WebSocket              │ socket.io-client   │
└─────────┼──────────────────────────────-┼────────────────────┘
          │ /analysishub                  │
          ▼                              ▼
┌──────────────────────────────────────────────────────────────┐
│               ASP.NET Core 8  (src/)                         │
│                                                              │
│  GET  /            → static/index.html                       │
│  GET  /health      → {"status":"healthy"}                    │
│  GET  /search?q=   → SearchService (gamerTag + slug lookup)  │
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
│      Redis           │   │    start.gg GraphQL API         │
│                      │   │  api.start.gg/gql/alpha         │
│  games:{slug}  24h   │   │                                 │
│  jobstate:{slug} 1h  │   │  Auth: Bearer STARTGG_APIKEY    │
│  (with StatsVersion) │   │  Rate limit: 80 req/min         │
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

### Unit Tests
```bash
dotnet test tests/CoachGG.Tests/CoachGG.Tests.csproj
```

---

## Troubleshooting

### Search returns 502/503 instead of results

`GET /search` previously masked upstream start.gg failures as `200 []`
("no players found"). It now fails loudly:

- **502** — start.gg rejected the API key (auth failure) or is unreachable.
- **503** — start.gg rate limit persisted after bounded retries.

The SignalR analysis flow behaves the same way: jobs emit `JobError` with an
actionable message instead of hanging on unbounded retries, and a stale
`Running` job state left in Redis by a restart/redeploy no longer blocks a new
run.

### STARTGG_APIKEY (most common cause)

Search and analysis both fail when the start.gg token configured on the host
is blank, revoked, or expired. The app refuses to boot with a blank key
(startup throws), so a healthy `/health` with failing searches means the
configured token was **rejected by start.gg**, not that it is missing.

To rotate:

1. Log in at [start.gg](https://start.gg) → **Profile → Developer Settings**
   (https://start.gg/admin/profile/developer) → create/copy a personal access
   token.
2. Set it as `STARTGG_APIKEY` in the Render dashboard for service
   `srv-da56cr2jobas73dmulv0` (Environment tab) and redeploy. This secret
   cannot be read from the repo — only from the hosting dashboard.
3. Verify: `curl https://coach.collapsetechnologies.com/search?q=bc954a2e`
   should return a JSON array containing the player, and
   `https://coach.collapsetechnologies.com/?slug=bc954a2e` should stream a
   full analysis to completion.

> **Note:** live validity of the production token could not be verified from
> within this repository (the value lives only in the hosting dashboard).
> Once a valid `STARTGG_APIKEY` is set, search **and** the direct
> `?slug=bc954a2e` deep link complete successfully — verified end-to-end
> locally against a stubbed start.gg API plus the real API's error paths.

### Rate limits

Each search issues a bounded number of start.gg requests (direct lookup +
recent-events pages + major tournaments, capped and aborted early once enough
results are found). If you still hit the ~80 req/min per-token limit, `/search`
returns 503 and analysis emits a `JobError` mentioning the rate limit; retry
after about a minute.

---

## API Reference

### REST

| Endpoint | Description |
|---|---|
| `GET /health` | `{"status":"healthy","timestamp":"..."}` |
| `GET /search?q=<query>` | Player search — by gamerTag or slug. Returns `[{gamerTag, prefix, slug, userId}]` |
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

`REDIS_CONNECTION` or `REDIS_URL` is required in production. `REDIS_URL`
supports standard `redis://` and `rediss://` connection URLs.

---

## Deployment (Render)

CoachGG runs as a Render web service in project **collapse-tech**
(`srv-da56cr2jobas73dmulv0`), built from the app's `Dockerfile`.

1. Render service root directory: `apps/coach-gg`
2. Provision Redis (Render Key Value or another managed Redis service) and set
   `REDIS_URL`, then set `STARTGG_APIKEY`, `ASPNETCORE_ENVIRONMENT=Production`,
   and `FORWARDEDHEADERS__TRUSTPLATFORMPROXY=true`
3. Add `coach.collapsetechnologies.com` as the service's custom domain
4. Push to `main` to auto-deploy

Redis is required for shared game caching, distributed job leases, and the SignalR
backplane. Production refuses to start unless `REDIS_URL` or `REDIS_CONNECTION`
is explicitly configured and reachable. An expired lease allows one replica to
resume work after a crash without duplicating the start.gg request.

---

## Project Structure

```
apps/coach-gg/
├── Dockerfile                 # Multi-stage .NET 8 build (Render)
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
│   │   ├── SearchService.cs       # Hybrid player search + upstream health
│   │   └── StartGGService.cs      # GraphQL client + retry
│   ├── Models/
│   │   ├── GameData.cs        # Raw API models
│   │   ├── JobState.cs        # Job state + StatsVersion
│   │   └── Stats.cs           # PlayerStats, StatEntry
│   ├── static/
│   │   ├── index.html         # App shell
│   │   ├── app.js             # SignalR client, rendering, sort
│   │   └── styles.css         # Dark theme, responsive
├── tests/
│   ├── e2e.spec.ts            # 9 Playwright tests (contract: ?slug=bc954a2e)
│   └── CoachGG.Tests/         # xUnit unit tests (search + aggregation)
└── mobile/                    # React Native / Expo
    └── App.tsx
```
