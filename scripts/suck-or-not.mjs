#!/usr/bin/env node
/**
 * SUCK-OR-NOT battery — run many full matches, score REAL fun signals.
 * Not "did the API return 200" — "would a human want round 2?"
 *
 * Usage: node scripts/suck-or-not.mjs [runs=100] [baseUrl]
 */
const RUNS = Math.max(1, Number(process.argv[2]) || 100);
const BASE = process.argv[3] || 'http://127.0.0.1:3847';

async function req(path, { method = 'GET', body, token } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `${res.status} ${path}`);
  return data;
}

function estimateWatchSec(events) {
  let ms = 500;
  for (const e of events || []) {
    const t = e.t;
    if (t === 'round') ms += 280;
    else if (t === 'block') ms += e.featured ? 520 : 380;
    else if (t === 'hit' || t === 'crit') ms += e.featured || e.atkId ? 420 : 280;
    else if (t === 'ko') ms += 500;
    else if (t === 'win') ms += 600;
  }
  return ms / 1000;
}

function scoreMatch(sample) {
  const reasons = [];
  let fun = 5;
  let ease = 8;

  if (!sample.ok) {
    return { fun: 0, ease: 0, suck: true, reasons: ['match failed: ' + sample.err] };
  }

  const { hero, battle, potYou, watchSec, fighters, events, featuredHits } = sample;

  // Watch length sweet spot 6-14s
  if (watchSec < 5) {
    fun -= 1;
    reasons.push('fight too short to feel like a battle');
  } else if (watchSec <= 14) {
    fun += 1.5;
    reasons.push('watch time in sweet spot');
  } else if (watchSec <= 20) {
    fun -= 0.5;
    reasons.push('a bit long');
  } else {
    fun -= 2.5;
    reasons.push(`slog (${watchSec.toFixed(1)}s)`);
  }

  // Cast size
  if (fighters <= 4) {
    fun += 0.8;
    reasons.push('small cast readable');
  } else {
    fun -= 1;
    reasons.push('too many on screen');
  }

  // Hero agency
  if (hero) {
    if (hero.hitsLanded >= 1) {
      fun += 1.2;
      reasons.push('you landed hits');
    } else {
      fun -= 2;
      reasons.push('you never hit anyone');
    }
    if (hero.damageDealt >= 15) {
      fun += 0.8;
      reasons.push(`you dealt ${hero.damageDealt} dmg`);
    }
    if (featuredHits >= 1) {
      fun += 1;
      reasons.push('featured hero moment');
    } else {
      fun -= 1.5;
      reasons.push('no hero spotlight');
    }
    if (hero.won) {
      fun += 1.2;
      reasons.push('you won the pit');
    } else if (hero.survived) {
      fun += 0.3;
    } else {
      fun -= 0.4;
      reasons.push('you died (ok if you hit first)');
    }
  } else {
    fun -= 3;
    ease -= 2;
    reasons.push('no hero in battle');
  }

  // Pot
  if (potYou) {
    fun += 0.6;
    reasons.push('you won pot');
  }

  // Event quality
  const hits = (events || []).filter((e) => ['hit', 'crit', 'ko'].includes(e.t));
  if (hits.length > 20) {
    fun -= 1.5;
    reasons.push('too many chip hits');
  }
  if (hits.length >= 3 && hits.length <= 14) {
    fun += 0.5;
  }

  fun = Math.max(0, Math.min(10, fun));
  ease = Math.max(0, Math.min(10, ease));
  const overall = fun * 0.65 + ease * 0.35;
  const suck = overall < 5.5 || fun < 5;
  return { fun, ease, overall, suck, reasons };
}

async function oneRun(i) {
  try {
    const auth = await req('/auth/guest', {
      method: 'POST',
      body: { displayName: `T${i}` },
    });
    const token = auth.token;
    await req('/me/character', {
      method: 'POST',
      token,
      body: { gender: i % 2 ? 'girl' : 'boy', displayName: `T${i}` },
    });
    const room = await req('/rooms/custom', {
      method: 'POST',
      token,
      body: { mode: 'random', n: 4 },
    });
    await req(`/rooms/${room.id}/join`, {
      method: 'POST',
      token,
      body: { mockAd: true },
    });
    const done = await req(`/rooms/${room.id}/fill-bots`, { method: 'POST', token });
    const arena = done.replay?.arena || {};
    const battle = arena.battle || {};
    const events = battle.events || [];
    const heroId = battle.heroUserId;
    const hero = battle.heroStats;
    const featuredHits = events.filter(
      (e) => e.featured && ['hit', 'crit', 'ko'].includes(e.t)
    ).length;
    const potYou = done.replay?.pot?.winnerUserId === heroId;

    return scoreMatch({
      ok: done.status === 'COMPLETE',
      hero,
      battle,
      potYou,
      watchSec: estimateWatchSec(events),
      fighters: (battle.fighters || []).length,
      events,
      featuredHits,
    });
  } catch (e) {
    return scoreMatch({ ok: false, err: e.message });
  }
}

async function main() {
  console.log('\n🧪 SUCK-OR-NOT ×', RUNS, '  ', BASE, '\n');
  try {
    await req('/health');
  } catch {
    console.log('❌ Server down. Start: cd server && npm start\n');
    process.exit(1);
  }

  const results = [];
  const t0 = Date.now();
  // concurrency 8
  const concurrency = 8;
  let next = 0;
  async function worker() {
    while (next < RUNS) {
      const i = next++;
      results.push(await oneRun(i));
      if ((i + 1) % 10 === 0 || i + 1 === RUNS) {
        process.stdout.write(`  … ${i + 1}/${RUNS}\r`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => worker()));
  console.log(`  done ${RUNS} in ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);

  const funs = results.map((r) => r.fun);
  const eases = results.map((r) => r.ease);
  const overalls = results.map((r) => r.overall);
  const suckN = results.filter((r) => r.suck).length;
  const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length;
  const pct = (n) => ((n / RUNS) * 100).toFixed(0);

  // Aggregate reason counts
  const reasonCount = {};
  for (const r of results) {
    for (const reason of r.reasons || []) {
      // normalize
      const key = reason.replace(/\d+/g, 'N');
      reasonCount[key] = (reasonCount[key] || 0) + 1;
    }
  }
  const topReasons = Object.entries(reasonCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  const avgFun = avg(funs);
  const avgEase = avg(eases);
  const avgAll = avg(overalls);
  const suckRate = suckN / RUNS;

  let verdict;
  if (suckRate <= 0.2 && avgFun >= 6.5) verdict = 'NOT SUCK — keep polishing the spectacle';
  else if (suckRate <= 0.45 && avgFun >= 5) verdict = 'MEH — playable, still not addictive';
  else verdict = 'STILL SUCKS — do not ship; cut harder / juice hero fantasy';

  console.log('══════════════════════════════════════');
  console.log(' SUCK-OR-NOT REPORT');
  console.log('══════════════════════════════════════');
  console.log(` Runs:          ${RUNS}`);
  console.log(` Avg fun:       ${avgFun.toFixed(2)} / 10`);
  console.log(` Avg ease:      ${avgEase.toFixed(2)} / 10`);
  console.log(` Avg overall:   ${avgAll.toFixed(2)} / 10`);
  console.log(` Suck rate:     ${pct(suckN)}%  (${suckN}/${RUNS})`);
  console.log(` Fun≥7 rate:    ${pct(results.filter((r) => r.fun >= 7).length)}%`);
  console.log(` Fun<5 rate:    ${pct(results.filter((r) => r.fun < 5).length)}%`);
  console.log(`\n VERDICT: ${verdict}`);
  console.log('\n Top signals:');
  for (const [k, v] of topReasons) {
    console.log(`  ${String(v).padStart(3)}×  ${k}`);
  }
  console.log('══════════════════════════════════════\n');

  // Write JSON summary for history
  const out = {
    at: new Date().toISOString(),
    runs: RUNS,
    avgFun,
    avgEase,
    avgAll,
    suckRate,
    verdict,
    topReasons,
  };
  const fs = await import('fs');
  const path = new URL('../data/suck-or-not-latest.json', import.meta.url);
  try {
    fs.mkdirSync(new URL('../data/', import.meta.url), { recursive: true });
    fs.writeFileSync(path, JSON.stringify(out, null, 2));
  } catch {
    /* ignore */
  }

  process.exit(suckRate > 0.45 ? 2 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
