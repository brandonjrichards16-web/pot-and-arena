# Pot & Arena

Async multiplayer: **luck pots** + **fighter arena**, dual currency (coins/gems), leaderboards, House bots for cold start, invite codes. Real-money withdrawals are ledger-ready but **locked**.

## Free host (friends soft launch)

**Render free** — no tunnel, no laptop required.

```bash
./scripts/deploy-render.sh   # rebuilds web → server/public
# push repo to GitHub, then Render → New → Blueprint (uses render.yaml)
```

See `SHARE.md` and `render.yaml`. Free instances sleep after idle; SQLite is ephemeral.

### Quick start (local)

### 1. API server

```bash
cd server
npm install
PORT=3847 node src/index.js
```

API: `http://localhost:3847`  
Health: `GET /health`  
Meta/disclaimer: `GET /meta`

> Port **3847** is used because **8787** is often taken on this machine.

### 2. Mobile (Expo)

```bash
cd mobile
npm install
npx expo start
```

Then press `i` (iOS sim), `a` (Android), or `w` (web).

Set API URL if needed:

```bash
EXPO_PUBLIC_API_URL=http://127.0.0.1:3847 npx expo start
```

## What's implemented (Wave 1)

| Feature | Status |
|---------|--------|
| Guest auth + starter coins/gems | ✅ |
| Async rooms (free / ad / coin / gem) | ✅ |
| Mock ad join | ✅ |
| **House fighters** auto-fill free/ad rooms | ✅ |
| Human-only coin pot on free/ad | ✅ |
| Stake rooms humans-only (no bots) | ✅ |
| Hybrid arena + fight log replay | ✅ |
| Ledger (COIN/GEM/CASH locked) | ✅ |
| Daily / weekly / monthly / all-time boards | ✅ |
| Invite codes + first-match gem reward | ✅ |
| In-app disclaimers | ✅ |
| Cancel unfilled after 24h (90% refund) | ✅ |
| Guilds | Wave 2 (schema hooks only) |

## House bots (cold start)

- After ~12s with ≥1 human in a free/ad room, House seats drip in, then complete the room.
- Labeled **House** in UI — never fake humans.
- **Pot draw ignores bot tickets** on free/ad rooms.
- Stake rooms: no House fill.
- Dev: `POST /rooms/:id/fill-bots` or app button “Speed fill House”.

## Invite growth

- Each user gets a 6-char code.
- Friend signs up with code → linked.
- After friend’s **first completed match**, both get gems.

## Design docs

- `PLAN.md` — simple plan  
- `GAME_DESIGN_V1.md` — full design  

## Scripts

```bash
# server
cd server && PORT=3847 node src/index.js

# wipe DB and restart
cd server && rm -f data/game.db* && PORT=3847 node src/index.js
```
