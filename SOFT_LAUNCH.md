# Soft launch (local first)

Friends playtest — **not** App Store. Goal: one fun pit fight in under a minute, then optional campaign / gear.

## Owner checklist (you)

- [ ] Local stack running: `./scripts/soft-launch-local.sh`
- [ ] You can complete: **START → fighter → JOIN A PIT → results**
- [ ] Invite code shows on lobby (soft-launch banner)
- [ ] Feedback button works (message lands in DB)
- [ ] House bots fill empty free pits (cold start)
- [ ] Note 3 things friends get stuck on
- [ ] Review feedback: `curl -s -H "Authorization: Bearer $TOKEN" http://127.0.0.1:3847/playtest/feedback | jq`

## Happy path (tell friends this only)

1. Open the play URL you send them  
2. **START**  
3. Pick race · class · name · look  
4. Tap **JOIN A PIT** (main button)  
5. Watch the fight / draw  
6. Optional: Campaign, Upgrade, invite friends  

Everything else is a side door.

## Local play (same Wi‑Fi)

```bash
./scripts/soft-launch-local.sh
```

- You: http://127.0.0.1:8081  
- Friend on Wi‑Fi: http://YOUR_LAN_IP:8081 (script prints the IP)  
- API: port **3847** (web Metro auto-points at it)

Phone on the same network can use the LAN URL in a browser.

## Feedback

In-app: lobby → **Feedback** (stars + note).

Or API:

```bash
# after logging in as a player (use their token)
curl -s -X POST http://127.0.0.1:3847/playtest/feedback \
  -H "Authorization: Bearer TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"stars":4,"message":"First fight slapped, store confusing"}'
```

## Soft launch flag

- **On by default** (local + when `SOFT_LAUNCH` unset)  
- Off: `SOFT_LAUNCH=0` on the API process  

## What “done enough” looks like for friends

| Must work | Nice later |
|-----------|------------|
| Guest start + character | Perfect sprites |
| Join pit + House fill | Full clan wars |
| Results readable | App Store build |
| Invite code share | Perfect balance |
| Feedback capture | Paid ads |

## Next after local feels good

Ship the same build path you already have for remote host when ready — local soft launch first so friends aren’t testing a broken loop.
