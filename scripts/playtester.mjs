#!/usr/bin/env node
/**
 * Fun Playtester Agent
 * Plays the whole loop via API and scores: easy? fun? friction?
 *
 * Usage: node scripts/playtester.mjs [baseUrl]
 */
const BASE = process.argv[2] || 'http://127.0.0.1:3847';

const log = [];
const friction = [];
const fun = [];

function note(msg) {
  log.push(msg);
  console.log('  ·', msg);
}
function fri(msg) {
  friction.push(msg);
  console.log('  ⚠ FRICTION:', msg);
}
function yay(msg) {
  fun.push(msg);
  console.log('  ★ FUN:', msg);
}

async function req(path, { method = 'GET', body, token } = {}) {
  const t0 = Date.now();
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const ms = Date.now() - t0;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || res.statusText);
    err.status = res.status;
    err.data = data;
    err.ms = ms;
    throw err;
  }
  if (ms > 800) fri(`Slow ${method} ${path} (${ms}ms)`);
  return { data, ms };
}

async function main() {
  console.log('\n🎮 PLAYTESTER AGENT — Pot & Arena');
  console.log('   Target:', BASE);
  console.log('   Job: play like a new user. Report if it was fun & easy.\n');

  let steps = 0;
  const tStart = Date.now();

  // 1 Health
  try {
    await req('/health');
    note('Server alive');
  } catch (e) {
    console.log('\n❌ VERDICT: BROKEN — server not reachable\n');
    process.exit(1);
  }

  // 2 Guest
  steps++;
  const { data: auth } = await req('/auth/guest', {
    method: 'POST',
    body: { displayName: 'PlayBot' },
  });
  const token = auth.token;
  if (!token) fri('No token from guest signup');
  else note(`Guest ok (${auth.user?.displayName})`);
  if (!auth.disclaimer || auth.disclaimer.length < 200) {
    /* fine */
  } else {
    fri('Signup dumps a wall of legal disclaimer text at the player');
  }

  // 3 Character — should be one action
  steps++;
  const { data: char, ms: charMs } = await req('/me/character', {
    method: 'POST',
    token,
    body: { gender: 'boy', displayName: 'PlayBot' },
  });
  if (char.user?.characterReady && char.user?.gender === 'boy') {
    yay('Character created in one API call');
  } else fri('Character create unclear');
  note(`Character ready in ${charMs}ms`);

  // 4 One-tap play path: create small room → join → fill → complete
  steps++;
  const tPlay = Date.now();
  let room;
  try {
    const created = await req('/rooms/custom', {
      method: 'POST',
      token,
      body: { mode: 'random', n: 5 },
    });
    room = created.data;
    note(`Created pit N=${room.n}`);
  } catch (e) {
    fri(`Cannot create starter pit: ${e.message}`);
    // try join any free
    const { data: list } = await req('/rooms');
    room = (list.rooms || []).find((r) => r.entry_type === 'FREE');
    if (!room) throw e;
    note('Fell back to existing free room');
  }

  steps++;
  await req(`/rooms/${room.id}/join`, {
    method: 'POST',
    token,
    body: { mockAd: true },
  });
  note('Joined with ticket');

  steps++;
  const { data: finished, ms: fillMs } = await req(`/rooms/${room.id}/fill-bots`, {
    method: 'POST',
    token,
  });
  const playMs = Date.now() - tPlay;

  if (finished.status !== 'COMPLETE') {
    fri(`Match did not complete (status=${finished.status})`);
  } else {
    yay(`Full match resolved in ${playMs}ms server-side`);
  }

  const rep = finished.replay || {};
  if (rep.pot?.winnerTicketNumber) {
    yay(`Lucky number draw exists (#${rep.pot.winnerTicketNumber} → ${rep.pot.winnerName})`);
  } else fri('No pot winner in replay — RNG moment missing');

  if (rep.arena?.winnerName) {
    yay(`Pit champ: ${rep.arena.winnerName}`);
  } else fri('No arena winner');

  const humans = finished.human_tickets ?? 1;
  const house = finished.house_tickets ?? 0;
  if (house > 0) note(`House filled ${house} seats (cold start works)`);
  if (humans < 1) fri('No human tickets counted');

  // 5 Wallet moved?
  const { data: me } = await req('/me', { token });
  note(`Wallet 🪙${me.balances?.COIN} 💎${me.balances?.GEM}`);

  // 6 Count "noise" surfaces a new user might hit
  const advanced = [
    '/upgrades/tree',
    '/room-unlocks',
    '/leaderboards/fame/all',
  ];
  for (const p of advanced) {
    try {
      await req(p, { token: p.includes('unlock') ? token : undefined });
    } catch {
      /* optional */
    }
  }
  fri(
    'Product still exposes Upgrade trees, room unlock ladders, PvP gem stakes, leaderboards — easy to overwhelm if shown first'
  );
  yay('Happy path API only needs: guest → character → create/join → fill → results');

  // Score
  const totalMs = Date.now() - tStart;
  const frictionScore = friction.length;
  const funScore = fun.length;

  let ease = 10 - frictionScore * 1.2;
  let enjoyment = 3 + funScore * 1.1;
  ease = Math.max(0, Math.min(10, ease));
  enjoyment = Math.max(0, Math.min(10, enjoyment));

  // Heuristics
  if (playMs < 3000 && finished.status === 'COMPLETE') enjoyment = Math.min(10, enjoyment + 1);
  if (steps > 8) {
    ease -= 2;
    fri(`Too many steps in happy path (${steps})`);
  } else {
    yay(`Happy path only ${steps} main steps`);
  }

  const overall = (ease * 0.55 + enjoyment * 0.45);
  let verdict;
  if (overall >= 7.5 && frictionScore <= 3) verdict = 'FUN & EASY enough to keep polishing';
  else if (overall >= 5) verdict = 'OKAY bones — still too noisy / not joyful enough';
  else verdict = 'SUCKS for a new player — simplify harder';

  console.log('\n══════════════════════════════════════');
  console.log(' PLAYTESTER REPORT');
  console.log('══════════════════════════════════════');
  console.log(` Ease:       ${ease.toFixed(1)} / 10`);
  console.log(` Fun:        ${enjoyment.toFixed(1)} / 10`);
  console.log(` Overall:    ${overall.toFixed(1)} / 10`);
  console.log(` Friction:   ${frictionScore} issues`);
  console.log(` Fun beats:  ${funScore}`);
  console.log(` Time:       ${totalMs}ms`);
  console.log(`\n VERDICT: ${verdict}`);
  if (friction.length) {
    console.log('\n Fix first:');
    friction.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  console.log('══════════════════════════════════════\n');

  // Exit code for CI
  process.exit(overall >= 5 ? 0 : 2);
}

main().catch((e) => {
  console.error('\n❌ PLAYTESTER CRASHED:', e.message);
  process.exit(1);
});
