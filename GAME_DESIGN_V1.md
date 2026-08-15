# Pot & Arena — Game Design Document (v1)

**Status:** Design only (no code yet)  
**Goal:** Fun async multiplayer game with luck pots + skill/loadout battles, dual currency, cosmetics, and a **locked** real-money withdrawal path that can be enabled later without a rewrite.

**Working title:** Pot & Arena (rename later)

---

## 1. Pillars

1. **Async first** — Join, leave, come back. Rooms live on the server.
2. **Two thrills per match** — Luck crowns a **Coin Pot King**; loadout + RNG clash crowns an **Arena Champ** (can be different people).
3. **Two currencies** — Coins (scarcer, jackpot fantasy) and Gems (progress/upgrades/cosmetics).
4. **Always something to do** — Free-play rooms exist even if you’re broke on bets.
5. **Fair and readable** — Full combat + draw logs; replays after the fact.
6. **Real money later, not never** — Ledger and wallet types support cash-out, feature-flagged **OFF** until legal approval.
7. **Scope Grok can ship** — Strong juice on few moments; limited avatar system; auto-resolved battles (not a real-time fighter).

---

## 2. Core loop

```
Browse / create room
  → Pay entry (free / coins / gems / ads)
  → Optional: add more tickets while FILLING
  → Close app (progress saved)
  → Push: nearly full / full / results
  → On FULL: server resolves once
       (1) Coin/Gem pot draw (luck)
       (2) Arena clash (stats + loadout + RNG)
  → Replay anytime: draw + fight + full logs
  → Spend rewards on cosmetics / perks / levels
  → Climb seasonal leaderboards / badges
```

---

## 3. Match system (memory, async, scale)

### 3.1 Room is server-authoritative

The client never decides winners, fill counts, or refunds.

### 3.2 Room lifecycle

| Status | Meaning | Player actions |
|--------|---------|----------------|
| `OPEN` | Accepting entries | Join, multi-enter |
| `FILLING` | Same as open (alias ok) | Join, multi-enter |
| `FULL` | Seats filled; locked | Wait / notify |
| `RESOLVING` | Server running draw + clash | — |
| `COMPLETE` | Immutable results + replay | Watch replay, claim UI |
| `CANCELLED` | Timed out or admin cancel | Refund rules apply |

### 3.3 Entry model

- **N** = target number of **tickets** (not necessarily unique users).
- **Multi-entry:** while `OPEN`/`FILLING`, player may buy more tickets (ads / currency / free allowance).
- Optional **max tickets per user** (recommended default: `max(1, floor(N * 0.1))` or hard caps by room template).
- Closing the app **never** removes tickets.

### 3.4 Room templates (v1 ship set)

| Template | N | Typical entry | Purpose |
|----------|---|----------------|---------|
| Free Quick | 10 | Free (rate-limited) or 1 soft ad | Always playable |
| Free Arena | 10–25 | Free | Gem / XP focus |
| Ad Pot | 25 / 100 | B ads per ticket (B = 1–3) | Coin faucet (controlled) |
| Coin stakes | 10 / 25 / 100 | S coins buy-in | Grow coins; risk |
| Gem stakes | 10 / 25 | S gems buy-in | Grow gems faster |
| Event Mega | 1_000 / 10_000 | Platform-only | Later; architecture ready |

User-created rooms (if enabled in v1.1): only from allowed parameter ranges.

### 3.5 Progress UX (“My Matches”)

Each joined room shows:

- Fill: `999 / 10000`
- Your tickets
- Entry type + amount locked
- Status
- CTA: Add ticket | Share | Open when complete

### 3.6 Replays (required)

Store a **replay package**, not video:

- Draw seed + ticket list + pot winner(s)
- Clash seed + per-round combat log
- Cosmetic snapshots at lock time
- Timeline events for client animation

Client can scrub: **Draw → Fight → Loot → Logs**.

### 3.7 Push notifications

| Event | Who |
|-------|-----|
| Entry confirmed | Entrant |
| 75% / 90% full | Entrants |
| Full / results ready | Entrants |
| You won pot / arena | Winners |
| Room cancelled + refund | Entrants |

In-app notification inbox for users who deny OS push.

---

## 4. Economy

### 4.1 Currencies

| Asset | Code | Role | Scarcity |
|-------|------|------|----------|
| **Coins** | `COIN` | Jackpot / stake / prestige / **future cash path** | Harder |
| **Gems** | `GEM` | Upgrades, many cosmetics, battle growth | Medium |
| **Cash credits** (locked) | `CASH` | Withdrawal-eligible units | Off until legal |
| **XP / Level** | `XP` | Character progression | Soft |
| **Tickets** | ephemeral | Room entries | — |

**Display names:** Coins 🪙 · Gems 💎 · (Cash hidden/locked in UI)

### 4.2 Future real-money path (built from day one, OFF)

Implement a **double-entry ledger**, not a single mutable integer:

```
account_balances: user_id, asset_code, amount
ledger_entries: id, user_id, asset_code, delta, reason, ref_type, ref_id, created_at
```

Reasons include: `ad_ticket_reward_pot`, `stake_escrow`, `stake_refund`, `pot_win`, `arena_win`, `cancel_penalty`, `iap_grant`, `cosmetic_purchase`, `withdrawal_hold`, `withdrawal_paid`, …

**Feature flags:**

- `withdrawals_enabled = false`
- `cash_asset_visible = false`
- `iap_cashable = false`

**When legal approves**, enable without rewrite:

1. Define conversion: e.g. eligible COIN → CASH at policy rate, or mark a slice of COIN as cashable.
2. KYC + geo gates + min withdraw.
3. Payout provider integration reading the same ledger.

**Invariant (always):**

> Never pay out more value than the system escrowed or accrued for that liability.

Mode A ad pots: prize funded by policy on ad credits.  
Mode B stakes: prize funded by escrowed buy-ins minus rake.

### 4.3 Sources (how you earn)

| Source | Coins | Gems | Notes |
|--------|-------|------|-------|
| **Luck pot win** | ★★★ Primary | Small secondary optional | Main coin faucet; keep controlled |
| **Arena / clash win** | Pity crumbs optional | ★★★ Primary | Skill/loadout fantasy |
| **Participation** | Tiny or 0 | Small | Avoid empty rounds |
| **Badges / seasons** | — | Rewards | Collection |
| **Free rooms** | Low | Medium | Always available |
| **IAP** (later) | Careful | Cosmetics / gem packs | Prefer non-cashable |
| **Ads** | Indirect (ticket into pot) | Rare bonus | Ads buy **tickets**, not free mint spam |

### 4.4 Sinks (how you spend)

| Sink | Coins | Gems | Both? |
|------|-------|------|-------|
| Stakes into coin rooms | Yes | — | — |
| Stakes into gem rooms | — | Yes | — |
| Character upgrades / perks | Sometimes | **Primary** | High tiers: both |
| Draw styles (dice, spinner…) | Mid | Mid | Signature styles: both |
| Avatar cosmetics | Flex skins: coins | Competitive dyes: gems | Prestige: both |
| Consumables (insta-kill charges etc.) | — | Yes | — |
| Season pass cosmetics (later) | — | — | Real $ IAP |

### 4.5 Conversion (coins ↔ gems)

**v1 recommendation: NO open exchange.**

Why:

- Stops leaderboards becoming “who converted the most.”
- Keeps coins scarce if they ever map to cash.
- Avoids infinite arbitrage with rake games.

**If added later:** one-way COIN → GEM only, heavy rake (e.g. 20–30%), daily cap, **does not** increase competitive rating.

**Never** in early design: GEM → COIN if COIN is cash-path.

### 4.6 Rake

| Context | Rake | Destination |
|---------|------|-------------|
| Coin stake pots | 5–10% | House / season prize pool |
| Gem stake pots | 5–10% | House / season |
| Ad pots (virtual) | 0–10% for fun tuning | Season pool |
| Cancel penalty | 10% of stake | Burn or house (see §7) |

### 4.7 “Bigger virtual payouts” while not real money

For **ad-ticket rooms** (fun mode):

```
tickets_total = N  (or sum of tickets)
pot_coins = tickets_total * COIN_PER_TICKET   // e.g. 1 coin per ticket, or B coins if B ads
// NOT real eCPM math in v1 client copy
winner_coins = pot_coins * (1 - rake)
```

Example: N=100, B=1, 1 coin/ticket → pot 100 → winner ~90–100 coins.

For **stake rooms**:

```
gross = N * stake_per_ticket   // actually sum of escrowed stakes
pot = gross * (1 - rake)
```

### 4.8 What is slightly harder to get?

**Coins** (ads → luck pot is the main path):

- Fewer free coin rooms
- Coin pots need ads or coin stakes
- Arena pays mostly gems
- Daily caps on free coin crumbs

**Gems** flow from playing battles often → upgrades → better clash → more gems (soft progress loop).

---

## 5. Character progression & battles

### 5.1 Scope of graphics / customization (Grok-shippable + IAP-ready)

**Not building:** full 3D character creator, hundreds of mesh parts, city builder.

**Building:**

| Layer | v1 content budget | Notes |
|-------|-------------------|--------|
| Base fighters | 4–6 archetypes | Tank, Striker, Rogue, Support, Jester, Elemental |
| Recolors / palettes | 8–12 | Cheap unlocks |
| Aura / VFX | 6–10 | Mid premium |
| Win pose / entry flair | 4–6 | |
| Weapon / held prop | 6–8 | Reads in clash |
| Nameplate / frame | 8–12 | Leaderboard flex |
| Draw styles | 5–8 | Dice, spinner, terminal, crystal, plinko… |

Art direction: **bold 2D/2.5D characters**, punchy VFX, high-quality **reveal and clash scenes** (the “theater”), simple menus.

Customizable enough that people **want** cosmetics; not so deep that production never ends.

### 5.2 Character stats (level + upgrades)

Each player has one **Active Fighter** (can own multiple later).

**Core stats (integers):**

| Stat | Effect in clash |
|------|-----------------|
| **Power** | Raises damage roll ceiling |
| **Vitality** | HP |
| **Speed** | Turn order / multi-hit chance |
| **Luck** | Crit / insta-kill attempt chance (soft) |
| **Guard** | Block chance / damage reduction |

**Level 1–50 (v1 cap)**  
XP from matches (play + win arena + badges).  
Each level: small stat budget auto-applied by archetype + **1 upgrade point** for manual spend.

**Upgrade model (hybrid, not pure % inflation):**

- Flat stat points (readable)
- A few **%** nodes at milestones (e.g. +5% Power at Lv 10/20/30)
- **Perk ranks** (see consumable/passive perks)

Avoid pure “biggest number always wins.”

### 5.3 Battle resolution philosophy

**Hybrid: stats weight RNG; upsets possible.**

Design target:

- Equal level, equal gear → ~50/50
- +10 levels advantage → favorites win **~70–80%**, not 99%
- Extreme underdog still has **highlight-reel** outs (insta-kill, multi-crit) but rare

Pseudo-model (implementation sketch):

```
For each round until one HP <= 0 or max rounds:
  attacker = higher speed (ties: RNG)
  hit_roll = random(1, 100)
  if hit_roll < defender.block_chance: log BLOCK; continue
  dmg = random(power * 0.6, power * 1.1) * archetype_mod
  if crit: dmg *= crit_mult
  if insta_attempt succeeds and not defended: HP = 0
  apply dmg; append combat log line
```

**Insta-kill system (your idea, tuned):**

| Perk | Effect |
|------|--------|
| Insta-Kill Chance | +X% to attempt when attack roll ≥ threshold (e.g. natural 90+) |
| Insta-Kill Charges | 0–3 per battle: spends a charge to convert a successful attempt |
| Anti-Insta / Guardian | Block or survive first insta once (1–3 ranks) |
| Iron Will | Reduce insta success against you |

So: high level is favored, not immortal. A level 1 with a lucky charge + opponent whiff can still pop off — rare, legendary, shareable.

### 5.4 Loadout (the “skill” before the fight)

Before room lock (or on join):

1. Choose archetype (if multiple owned)
2. Equip **up to 2 passive perks** + **consumable charges**
3. Equip cosmetics (visual only, unless “style rating” awards)

Skill = **build craft + room selection** (level caps, stake size), plus optional **3-second timing minigame** before clash for a small accuracy/power buff (not pot luck).

### 5.5 Multi-player clash structure (N > 2)

v1 recommendation for clarity + performance:

**Option A — Pair royale (preferred for N≤25)**  
- All entrants ranked by clash power rating  
- Single-elim or Swiss auto-bracket generated from seed  
- Top 1–3 get gem prizes  
- Everyone gets a short “your fight path” replay

**Option B — Score scramble (better for N=100–10k)**  
- Each fighter rolls a **Clash Score** from stats + RNG + perks (one simulation)  
- Sort scores; top K win gems  
- Optional: animate only **your** fight vs a nearby rival ghost for theater  
- Full table available in log

**Mega rooms (1k+):** use Option B only.

Coin pot remains independent: **ticket draw among tickets**.

### 5.6 Dual rewards (always)

| Outcome | Coins | Gems |
|---------|-------|------|
| Pot winner(s) | Large | Small bonus optional |
| Arena top | Pity / 0 | Large |
| Both (Double Crown) | Large | Large + badge |
| Neither | 0–tiny | Participation gems in free rooms |

### 5.7 Combat log (for rewatch + trust + upgrades)

Every battle stores lines like:

```
R1  StrikerA SPEED wins initiative
R1  StrikerA ATTACK roll=73 dmg=14 (Power 18 band)
R1  TankB BLOCK roll=12 < Guard 22 → BLOCKED
R2  TankB ATTACK roll=91 CRIT dmg=22
R2  StrikerA HP 30 → 8
R3  StrikerA INSTA attempt roll=96 need≥90 charge-1 → SUCCESS
R3  TankB GUARDIAN consumes anti-insta → survives at 1 HP
R4  ...
WINNER StrikerA
```

UI tabs on replay:

1. **Show** (animations)  
2. **Draw** (winning ticket / number)  
3. **Fight**  
4. **Log** (filter: only me / full)  
5. **Loot**

This teaches “I need more Guard” better than any tutorial.

---

## 6. Room creation rules

### 6.1 Parameters (v1)

Creator or template sets:

| Param | Description |
|-------|-------------|
| N | Ticket seats |
| Entry asset | FREE / AD / COIN / GEM |
| Stake or B ads | Amount per ticket |
| Max level | Eligibility gate |
| Duration | Auto-cancel timer |
| Rake | Platform default (not fully freeform) |

### 6.2 Max level: hard gate (recommended)

**Rule: you may enter only if `player.level <= room.max_level`.**

Do **not** allow high-level players to enter low-max rooms with stats “capped down.”

Why your cheat instinct is right:

- A level 100 has unlocks, perk ranks, cosmetics passives, combat experience, maybe better consumables.
- Even with numeric caps, **hidden mastery** sandbags low rooms.
- Soft cap invites accusations of smurfing and ruins new-player trust.

**Alternatives if we want mixed lobbies later:**

- Separate **Scaled Exhibition** mode (explicitly casual, no ranked gems)
- Or **Handicap rooms** with visible badges (“handicapped entry”) — not v1

**Free-play** should also offer open brackets: Lv 1–10, 11–20, 21–35, 36–50.

### 6.3 Who can create what

| Room type | Creator |
|-----------|---------|
| Free / standard templates | System + all users |
| High N (1000+) | Platform only |
| High stakes | Level or balance gates |
| Custom N/stake | Clamp to safe ranges |

---

## 7. Cancel, timeout, refunds

### 7.1 Problem

Player puts last 100 coins into N=10000; room never fills → cannot softlock their economy forever.

### 7.2 Auto-cancel

Default **T_fill = 24 hours** (config per template; mega events longer).

On timeout if `tickets < N`:

1. Status → `CANCELLED`
2. **Penalty:** 10% of each entrant’s staked amount **burned** (or to house)
3. **Refund:** 90% of stake returned to same asset
4. **Ad-ticket rooms:** no coin stake → grant **consolation** (small gems or nothing); do not invent huge coin refunds
5. **No pot draw, no arena rewards** from that room
6. Notify all entrants

### 7.3 Manual cancel

| Who | When | Cost |
|-----|------|------|
| System | Timeout / abuse | As above |
| Room creator | Only if fill &lt; 20% and age &lt; 1h | Creator pays extra 5% fee; others 90% refund |
| Entrant | Cannot “unstake” individual tickets after join (prevents abuse) | — |

**No partial reward sharing on cancel.** Clean: refund minus penalty only.

### 7.4 Free-to-play always

Even at 0 coin / 0 gem stakes available:

- Unlimited (rate-limited) **Free Quick** rooms for XP + small gems + cosmetics progress
- Daily free entry tokens
- Ad rooms still available to rebuild coins via luck

Broke on stakes ≠ dead game.

---

## 8. Ads ↔ tickets ↔ coins

### 8.1 Principle

Ads grant **tickets into rooms**, not raw infinite coin mint.

```
watch rewarded ad → server verifies → +1 ticket in room R
when room completes → coin pot paid from virtual pot rules
```

### 8.2 Scarcity of coins (ish)

- Coin-heavy outcomes tied to **winning pots** (low probability per ticket)
- Multi-ticket increases odds and ad revenue (later)
- Daily soft cap on number of ad tickets per user (anti-farm)
- Free rooms pay **gems/XP**, not big coins

### 8.3 Solo fill

Allowed: one user can buy many tickets up to cap / full N.  
If they hold all tickets, they win the coin pot (funded by their own entries’ virtual pot). Fair and simple.

---

## 9. Leaderboards

### 9.1 Boards (seasonal + all-time cosmetics)

| Board | Tracks | Notes |
|-------|--------|------|
| Pot Profit | Coins won − coins staked (play only) | Excludes IAP grants |
| Arena Rating | ELO-like from clash | Skill fantasy |
| Double Crowns | Count pot+arena same match | Prestige |
| Season Fame | Weighted score | Resets |
| Collector | Badges / styles unlocked | Non-pay flex |

### 9.2 Do we care if USD buyers dominate?

**For competitive boards: yes, we care — prevent it.**

Rules:

- IAP cannot directly buy **Arena Rating**
- IAP cosmetics = visual only (or very soft non-ranked bonuses)
- If gem packs exist, gem stakes boards are “wealth” boards — label them honestly or exclude from “Ranked Arena”
- Optional vanity board: **Patrons** (spenders) — separate, not the main glory board

**Pot Profit** can still favor grinders/ad-watchers; that’s ok if coins stay play-earned.

---

## 10. Badges & unlocks (no city builder)

### 10.1 Badge examples (first 15)

1. First Ticket  
2. First Pot King  
3. First Arena Champ  
4. Double Crown  
5. Underdog Arena (win at −10 level disadvantage)  
6. Blocked an Insta  
7. Landed an Insta  
8. Solo Filled a Room  
9. 10-Match Streak (played)  
10. Survived Cancel (got refund)  
11. 100 Tickets Lifetime  
12. Style Collector I (3 draw styles)  
13. Season Top 100  
14. Free-to-Play Specialist (wins without stake rooms)  
15. Log Nerd (open combat log 10 times) — fun meta

Badges unlock frames, palettes, or perk slots.

### 10.2 Draw styles (luck theater)

Unlock with coins/gems/badges; equip one:

1. Dice  
2. Wheel spinner  
3. Terminal hacker  
4. Crystal ball  
5. Plinko  
6. Slot reels  
7. (Prestige) Golden abacus  

If you win the pot, **your** style plays for the room replay (flex).

---

## 11. Monetization path (not legal approval)

### Phase 0 — Now (design/build)
- Ads (mock → real)
- Virtual coins/gems
- Cosmetics earnable
- Withdrawals flag OFF

### Phase 1 — Live fun
- Real rewarded ads
- Optional cosmetic IAP (non-cashable)
- Season pass cosmetics

### Phase 2 — Legal-dependent
- Enable `CASH` / withdrawals
- Strict geo, KYC, caps
- Possibly disable or rework gem↔coin and PvP stake rules per jurisdiction

House money before Phase 2: **ads + rake on virtual stakes + IAP cosmetics**.

---

## 12. Anti-abuse (design-level)

- Server-side ad completion verification  
- Ticket caps per room / per day  
- Level gates on high stakes  
- Hard max-level eligibility  
- Ledger immutability (no silent balance edits)  
- Multi-account detection later (device signals)  
- Cancel penalty prevents stake parking exploits  

---

## 13. Screen map (v1)

1. Splash / Auth  
2. Home (balances, featured rooms, My Matches)  
3. Room browser (filters: free, ad, coin, gem, level)  
4. Room detail (fill, tickets, join, share)  
5. Fighter loadout  
6. Results / Replay (show, draw, fight, log, loot)  
7. Shop / Unlocks  
8. Badges  
9. Leaderboards  
10. Settings (notifs, legal placeholders, **Withdrawals: Coming soon / Locked**)  
11. Notification inbox  

---

## 14. Technical implications (for later implementation)

| Need | Approach |
|------|----------|
| Mobile | Expo (React Native) iOS + Android |
| Backend | Auth + Postgres (or equivalent) + jobs |
| Resolver worker | On FULL or timeout → single transactional resolve |
| Pushes | FCM + APNs |
| Ads | Rewarded units; server grant tickets |
| Realtime | Optional; poll + push enough for v1 |
| Feature flags | Remote config for cash features |

---

## 15. Open decisions (defaults chosen)

| Topic | Default for v1 |
|-------|----------------|
| Coin ↔ Gem swap | **None** |
| Max level rooms | **Hard eligibility** |
| Cancel | **24h**, **10% penalty**, **90% refund**, no rewards |
| Clash at large N | **Score scramble + personal highlight** |
| Upset rate | **Hybrid RNG**, favorites win often not always |
| Graphics scope | **Archetypes + layers**, not full creator |
| Cash out | **Ledger ready, UI locked** |
| City builder | **No** |
| Free play | **Always available** |

---

## 16. Build order (when we start coding)

1. Auth + ledger balances (COIN, GEM) + feature flags  
2. Room state machine + join/tickets + My Matches  
3. Mock ads → tickets  
4. Resolve: pot draw + replay seed  
5. Fighter stats + clash resolve + combat log  
6. Results UI + rewatch  
7. Cancels/timeouts/refunds  
8. Loadout + first perks  
9. Badges + first cosmetics/draw styles  
10. Pushes  
11. Free room templates + stake rooms  
12. Leaderboards  
13. (Later) real ads, IAP cosmetics, legal cash  

---

## 17. One-line product promise

> **Watch or stake your way into async rooms, win the coin pot with luck, win the arena with your build, collect styles and badges — and when legal says go, turn on real withdrawals without rebuilding the game.**

---

## Document history

- 2026-08-10 — Initial v1 GDD from product discussions (async rooms, dual currency, hybrid battles, cancel rules, locked cash path).
