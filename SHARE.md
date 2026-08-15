# Share Pot & Arena (free, no tunnel)

**Host:** [Render](https://render.com) free web service (Docker one-box: API + web).

**Play URL:** https://pot-and-arena.onrender.com

That link is the full game — **nothing runs on your Mac**.

## For playtesters

1. Open the Render URL above.
2. First load after idle may take **30–60 seconds** (free instances sleep).
3. Guest login is automatic / create character and play.
4. **Boards → Players** — see who is on this server (real humans).
5. **Betting Pit** — host or join a **humans-only** coin/gem table. Share the room link.

## Notes

- Mock store purchases work (no real money).
- Progress is saved on the server and **backed up** to a private GitHub repo so free-tier restarts don’t wipe everything. First open after idle can still be slow (cold start).
- Dev cheats (`/me/gems/grant`, unlock-all) are **off** in production (`ALLOW_DEV_IAP=0`).

## Deploy / redeploy

```bash
cd Projects/pot-and-arena
./scripts/deploy-render.sh   # rebuilds web into server/public + prints steps
# commit + push to GitHub, then Render auto-deploys (see render.yaml)
```

One-time: GitHub repo + Render **New → Blueprint** on this repo (uses `render.yaml`).

Legacy Fly script (if you still have quota): `./scripts/deploy-fly.sh`
