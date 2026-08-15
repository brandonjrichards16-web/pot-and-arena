import { useEffect, useMemo, useRef, createElement, useState } from 'react';
import { View, Text, StyleSheet, Platform, Image } from 'react-native';
import { colors } from '../lib/theme';
import { portraitFor, heroPortrait } from '../lib/characters';

/**
 * Spectacle view for large simultaneous pits (25–1000+).
 * Like the title splash pit, but packed & tiny:
 *  - class-colored mini fighters (warrior / ranger / mage)
 *  - everyone swings each volley with arrows / fire / slashes
 * Web: canvas (smooth at N=1000). Native: silhouette Views.
 */
export default function MassPitScene({
  width,
  height,
  fighters = [],
  heroId,
  deadIds, // Set
  aliveCount,
  fieldSize,
  volleyKey = 0,
  /** Real combat hit samples from the volley event: {atkId, defId, classId}[] */
  volleyHits = null,
  koBurst = 0,
  heroHp = 1,
  heroMaxHp = 40,
}) {
  const canvasRef = useRef(null);
  const animRef = useRef(null);
  const volleyStart = useRef(0);
  const [frame, setFrame] = useState(0);

  const layout = useMemo(
    () => packOval(fighters, heroId, width, height),
    [fighters, heroId, width, height]
  );

  // Prefer REAL who-hit-whom from combat; fall back to random sample FX
  const volleyAttacks = useMemo(() => {
    if (!volleyKey) return [];
    if (volleyHits?.length) {
      return attacksFromHits(layout, volleyHits, fieldSize);
    }
    return buildVolleyAttacks(layout, deadIds, volleyKey, fieldSize);
  }, [layout, deadIds, volleyKey, fieldSize, volleyHits]);

  const isWeb = Platform.OS === 'web';

  // Animate ~0.7s of projectiles mid-flight on each volley
  useEffect(() => {
    if (!volleyKey) return;
    volleyStart.current =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    let raf = 0;
    const tick = (now) => {
      const t0 = volleyStart.current;
      const t = (now || Date.now()) - t0;
      setFrame(t);
      if (t < 720) {
        raf = requestAnimationFrame(tick);
        animRef.current = raf;
      }
    };
    raf = requestAnimationFrame(tick);
    animRef.current = raf;
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [volleyKey]);

  useEffect(() => {
    if (!isWeb || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const progress = Math.min(1, frame / 650);
    drawMassPit(ctx, {
      width,
      height,
      layout,
      deadIds,
      volleyKey,
      heroId,
      aliveCount,
      fieldSize,
      attacks: volleyAttacks,
      progress,
    });
  }, [
    isWeb,
    width,
    height,
    layout,
    deadIds,
    volleyKey,
    heroId,
    aliveCount,
    fieldSize,
    volleyAttacks,
    frame,
  ]);

  const hero = layout.find((p) => p.isHero);
  const hpPct = Math.max(0, Math.min(1, (heroHp ?? heroMaxHp) / (heroMaxHp || 1)));

  return (
    <View style={[styles.wrap, { width, height }]}>
      <View style={styles.floor} />
      <View style={styles.rim} />
      <View style={styles.innerGlow} />

      {isWeb
        ? createElement('canvas', {
            ref: canvasRef,
            style: {
              position: 'absolute',
              left: 0,
              top: 0,
              width,
              height,
            },
          })
        : (
          <View style={StyleSheet.absoluteFill}>
            {layout.map((p) => {
              if (p.isHero) return null;
              const dead = deadIds?.has?.(p.userId);
              return (
                <View
                  key={p.userId}
                  style={[
                    styles.sil,
                    {
                      left: p.x - p.s / 2,
                      top: p.y - p.s,
                      width: p.s,
                      height: p.s * 1.35,
                      opacity: dead ? 0.15 : 0.92,
                      backgroundColor: dead
                        ? '#4a3030'
                        : classColor(p.classId, p.race),
                      borderRadius: p.s / 2,
                      transform: [
                        { scaleY: dead ? 0.4 : 1 },
                        { rotate: `${p.tilt}deg` },
                      ],
                    },
                  ]}
                />
              );
            })}
          </View>
        )}

      {/* YOU — full hero art, always readable */}
      {hero ? (
        <View
          style={[
            styles.heroWrap,
            {
              left: hero.x - 28,
              top: hero.y - 36,
            },
          ]}
        >
          <View style={styles.heroRing}>
            <Image
              source={
                hero.race || hero.classId
                  ? heroPortrait({
                      race: hero.race || 'human',
                      classId: hero.classId || 'warrior',
                      gender: hero.gender || 'boy',
                      view: 'front',
                      gearOrigin:
                        hero.gearOrigin || hero.gearSet?.originId || null,
                    })
                  : portraitFor(hero.gender || 'boy', hero.visualTier || 0, {
                      race: hero.race,
                      classId: hero.classId,
                      gearOrigin:
                        hero.gearOrigin || hero.gearSet?.originId || null,
                    })
              }
              style={styles.heroImg}
              resizeMode="contain"
            />
          </View>
          <View style={styles.heroHpTrack}>
            <View style={[styles.heroHpFill, { width: `${hpPct * 100}%` }]} />
          </View>
          <Text style={styles.heroTag}>★ YOU</Text>
        </View>
      ) : null}

      <View style={styles.hudTop} pointerEvents="none">
        <View style={styles.countPill}>
          <Text style={styles.countBig}>{aliveCount}</Text>
          <Text style={styles.countSub}>/ {fieldSize} ALIVE</Text>
        </View>
        <View style={styles.barTrack}>
          <View
            style={[
              styles.barFill,
              {
                width: `${Math.max(2, (aliveCount / Math.max(1, fieldSize)) * 100)}%`,
                backgroundColor:
                  aliveCount / fieldSize > 0.5
                    ? colors.win
                    : aliveCount / fieldSize > 0.2
                      ? colors.gold
                      : colors.danger,
              },
            ]}
          />
        </View>
      </View>

      {koBurst > 0 ? (
        <View style={styles.koBurst} pointerEvents="none">
          <Text style={styles.koBurstText}>−{koBurst}</Text>
          <Text style={styles.koBurstSub}>FELL</Text>
        </View>
      ) : null}

      <View style={styles.hudBot} pointerEvents="none">
        <Text style={styles.hudHint}>
          {fieldSize} in the pit · everyone attacks each volley · ⚔️🏹🔥
        </Text>
      </View>
    </View>
  );
}

/** Paint real combat hits (random who→whom from the server). */
function attacksFromHits(layout, hits, fieldSize) {
  const byId = new Map(layout.map((p) => [p.userId, p]));
  let maxFx = 48;
  if (fieldSize > 80) maxFx = 64;
  if (fieldSize > 200) maxFx = 80;
  if (fieldSize > 500) maxFx = 96;
  if (fieldSize > 800) maxFx = 110;
  const attacks = [];
  for (const h of hits) {
    if (attacks.length >= maxFx) break;
    const atk = byId.get(h.atkId);
    const def = byId.get(h.defId);
    if (!atk || !def) continue;
    const cls = String(h.classId || atk.classId || 'warrior').toLowerCase();
    const kind =
      cls === 'ranger' || cls === 'archer'
        ? 'ranged'
        : cls === 'mage' || cls === 'mystic'
          ? 'magic'
          : 'melee';
    attacks.push({
      kind,
      x0: atk.x,
      y0: atk.y - (atk.s || 8) * 0.2,
      x1: def.x,
      y1: def.y - (def.s || 8) * 0.2,
      seed: hash(String(h.atkId) + String(h.defId)),
    });
  }
  return attacks;
}

/**
 * Fallback FX when hit samples missing — pure random targets (NOT i→i+1 circle).
 */
function buildVolleyAttacks(layout, deadIds, volleyKey, fieldSize) {
  const living = layout.filter((p) => !deadIds?.has?.(p.userId));
  if (living.length < 2) return [];

  let maxFx = 48;
  if (fieldSize > 80) maxFx = 64;
  if (fieldSize > 200) maxFx = 80;
  if (fieldSize > 500) maxFx = 96;
  if (fieldSize > 800) maxFx = 110;

  const attacks = [];
  const n = living.length;
  // Shuffle indices with volley seed so each volley looks different
  const order = living.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = hash(String(volleyKey) + ':' + i) % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  const take = Math.min(maxFx, n);
  for (let k = 0; k < take; k++) {
    const atk = living[order[k]];
    // Independent random target (not neighbor in the ring)
    let tIdx = hash(atk.userId + '|t|' + volleyKey + '|' + k) % n;
    if (living[tIdx].userId === atk.userId) tIdx = (tIdx + 1) % n;
    const def = living[tIdx];
    if (!def || def.userId === atk.userId) continue;
    const cls = String(atk.classId || 'warrior').toLowerCase();
    const kind =
      cls === 'ranger' || cls === 'archer'
        ? 'ranged'
        : cls === 'mage' || cls === 'mystic'
          ? 'magic'
          : 'melee';
    attacks.push({
      kind,
      x0: atk.x,
      y0: atk.y - atk.s * 0.2,
      x1: def.x,
      y1: def.y - def.s * 0.2,
      seed: hash(atk.userId + ':' + volleyKey + ':' + k),
    });
  }
  return attacks;
}

function classColor(classId, race) {
  const c = String(classId || 'warrior').toLowerCase();
  if (c === 'ranger' || c === 'archer') return '#4ade80';
  if (c === 'mage' || c === 'mystic') return '#c084fc';
  // warriors tint by race slightly
  const r = String(race || 'human').toLowerCase();
  if (r === 'ork') return '#f97316';
  if (r === 'elf') return '#38bdf8';
  return '#fbbf24';
}

/** Pack fighters in an oval around a clear hero pocket in the front-center. */
function packOval(fighters, heroId, W, H) {
  const list = fighters.length ? fighters : [];
  const cx = W / 2;
  const cy = H * 0.5;
  const rx = W * 0.42;
  const ry = H * 0.38;
  const n = list.length;
  const baseS =
    n > 600 ? 5 : n > 200 ? 6.5 : n > 80 ? 8 : n > 40 ? 10 : 12;

  const colorsPool = [
    '#a78bfa',
    '#c4b5fd',
    '#818cf8',
    '#f472b6',
    '#fb923c',
    '#34d399',
    '#38bdf8',
    '#fbbf24',
    '#e879f9',
    '#94a3b8',
  ];

  const golden = Math.PI * (3 - Math.sqrt(5));
  const out = [];
  let slot = 0;
  for (let i = 0; i < n; i++) {
    const f = list[i];
    const isHero = f.userId === heroId || f.isHero;
    if (isHero) {
      out.push({
        ...f,
        isHero: true,
        race: f.race || 'human',
        classId: f.classId || 'warrior',
        gender: f.gender || 'boy',
        x: cx,
        y: cy + ry * 0.15,
        s: 22,
        color: colors.gold,
        tilt: 0,
      });
      continue;
    }
    let x;
    let y;
    let tries = 0;
    do {
      const t = slot / Math.max(1, n - 1);
      const r = Math.sqrt(Math.min(1, t * 1.05));
      const ang = slot * golden + (i % 7) * 0.05;
      x = cx + Math.cos(ang) * r * rx;
      y = cy + Math.sin(ang) * r * ry * 0.95;
      slot++;
      tries++;
    } while (
      tries < 8 &&
      Math.hypot(x - cx, y - (cy + ry * 0.15)) < Math.min(rx, ry) * 0.18
    );

    const depth = (y - (cy - ry)) / (2 * ry);
    const s = baseS * (0.75 + depth * 0.55);
    out.push({
      ...f,
      isHero: false,
      race: f.race || 'human',
      classId: f.classId || 'warrior',
      gender: f.gender || 'boy',
      x,
      y,
      s,
      color: classColor(f.classId, f.race) || colorsPool[i % colorsPool.length],
      tilt: ((i * 17) % 21) - 10,
      depth,
    });
  }
  out.sort((a, b) => (a.isHero ? 1 : a.y) - (b.isHero ? 1 : b.y));
  return out;
}

function drawMassPit(
  ctx,
  { width, height, layout, deadIds, volleyKey, attacks, progress }
) {
  ctx.clearRect(0, 0, width, height);

  // Soft sand oval (same vibe as splash pit)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(width / 2, height * 0.52, width * 0.44, height * 0.4, 0, 0, Math.PI * 2);
  const sand = ctx.createRadialGradient(
    width / 2,
    height * 0.5,
    10,
    width / 2,
    height * 0.55,
    Math.max(width, height) * 0.45
  );
  sand.addColorStop(0, 'rgba(210,160,70,0.35)');
  sand.addColorStop(0.7, 'rgba(120,70,25,0.35)');
  sand.addColorStop(1, 'rgba(40,20,10,0.5)');
  ctx.fillStyle = sand;
  ctx.fill();
  ctx.restore();

  const jitter = (volleyKey * 9973) % 1000;
  const p = Math.max(0, Math.min(1, progress || 0));
  // ease-out flight
  const flight = 1 - Math.pow(1 - p, 2.2);

  // Draw living/dead fighters first
  for (const unit of layout) {
    if (unit.isHero) continue;
    const dead = deadIds?.has?.(unit.userId);
    let jx = 0;
    let jy = 0;
    if (!dead && volleyKey > 0) {
      const h = (hash(unit.userId) + jitter) % 1000;
      // Melee lunges a bit toward center of pit on volley
      const lunge = unit.classId === 'ranger' || unit.classId === 'mage' ? 0.35 : 1;
      jx = ((h % 7) - 3) * 1.1 * lunge;
      jy = ((((h / 7) | 0) % 5) - 2) * lunge;
    }
    const x = unit.x + jx;
    const y = unit.y + jy;
    const s = unit.s;
    const col = classColor(unit.classId, unit.race);

    if (dead) {
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = '#5c4035';
      ctx.beginPath();
      ctx.ellipse(x, y + s * 0.2, s * 0.7, s * 0.28, unit.tilt * 0.02, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      continue;
    }

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate((unit.tilt * Math.PI) / 180);

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.ellipse(0, s * 0.55, s * 0.45, s * 0.18, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    ctx.fillStyle = col;
    roundRect(ctx, -s * 0.35, -s * 0.15, s * 0.7, s * 0.85, s * 0.2);
    ctx.fill();

    // head
    ctx.beginPath();
    ctx.arc(0, -s * 0.35, s * 0.38, 0, Math.PI * 2);
    ctx.fillStyle = shadeHex(col, 1.12);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath();
    ctx.arc(-s * 0.1, -s * 0.4, s * 0.1, 0, Math.PI * 2);
    ctx.fill();

    // class pip
    ctx.font = `${Math.max(6, s * 0.55)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(
      unit.classId === 'ranger' ? '🏹' : unit.classId === 'mage' ? '🔥' : '⚔️',
      0,
      s * 0.95
    );

    ctx.restore();
  }

  // Simultaneous attack FX — everyone swinging this volley
  if (volleyKey > 0 && attacks?.length) {
    for (const a of attacks) {
      const x = a.x0 + (a.x1 - a.x0) * flight;
      const y = a.y0 + (a.y1 - a.y0) * flight;
      const ang = Math.atan2(a.y1 - a.y0, a.x1 - a.x0);
      const fade = p > 0.85 ? 1 - (p - 0.85) / 0.15 : 1;

      if (a.kind === 'melee') {
        // Short slash near attacker early, then near target
        const sx = a.x0 + (a.x1 - a.x0) * Math.min(1, flight * 1.15);
        const sy = a.y0 + (a.y1 - a.y0) * Math.min(1, flight * 1.15);
        ctx.save();
        ctx.globalAlpha = 0.75 * fade;
        ctx.strokeStyle = 'rgba(255,240,180,0.9)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(sx - Math.cos(ang + 0.8) * 6, sy - Math.sin(ang + 0.8) * 6);
        ctx.lineTo(sx + Math.cos(ang) * 8, sy + Math.sin(ang) * 8);
        ctx.stroke();
        ctx.restore();
      } else if (a.kind === 'ranged') {
        ctx.save();
        ctx.globalAlpha = fade;
        ctx.translate(x, y);
        ctx.rotate(ang);
        // arrow
        ctx.fillStyle = '#fde68a';
        ctx.fillRect(-6, -1, 10, 2);
        ctx.beginPath();
        ctx.moveTo(6, 0);
        ctx.lineTo(2, -3);
        ctx.lineTo(2, 3);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = '#f87171';
        ctx.fillRect(-8, -2.5, 3, 5);
        ctx.restore();
      } else {
        // firebolt
        ctx.save();
        ctx.globalAlpha = fade;
        const r = 3.5 + (a.seed % 3);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
        g.addColorStop(0, 'rgba(254,240,138,0.95)');
        g.addColorStop(0.45, 'rgba(249,115,22,0.85)');
        g.addColorStop(1, 'rgba(249,115,22,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 2.2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }
  }

  // Outer vignette
  const vig = ctx.createRadialGradient(
    width / 2,
    height / 2,
    Math.min(width, height) * 0.25,
    width / 2,
    height / 2,
    Math.max(width, height) * 0.65
  );
  vig.addColorStop(0, 'rgba(0,0,0,0)');
  vig.addColorStop(1, 'rgba(10,4,20,0.55)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, 0, width, height);
}

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function shadeHex(hex, mult) {
  // accepts #rgb or rgb()
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!m) return hex;
  const r = Math.min(255, Math.round(parseInt(m[1], 16) * mult));
  const g = Math.min(255, Math.round(parseInt(m[2], 16) * mult));
  const b = Math.min(255, Math.round(parseInt(m[3], 16) * mult));
  return `rgb(${r},${g},${b})`;
}

function hash(str) {
  let h = 0;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: colors.gold,
    backgroundColor: '#1a0c18',
    position: 'relative',
  },
  floor: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#2a1810',
  },
  rim: {
    position: 'absolute',
    left: '4%',
    right: '4%',
    top: '8%',
    bottom: '6%',
    borderRadius: 999,
    borderWidth: 3,
    borderColor: 'rgba(251,191,36,0.35)',
  },
  innerGlow: {
    position: 'absolute',
    left: '12%',
    right: '12%',
    top: '18%',
    bottom: '14%',
    borderRadius: 999,
    backgroundColor: 'rgba(180,100,30,0.12)',
  },
  sil: {
    position: 'absolute',
  },
  heroWrap: {
    position: 'absolute',
    width: 56,
    alignItems: 'center',
    zIndex: 20,
  },
  heroRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: colors.gold,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.5)',
    shadowColor: colors.gold,
    shadowOpacity: 0.7,
    shadowRadius: 12,
  },
  heroImg: { width: 52, height: 52 },
  heroHpTrack: {
    width: 48,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 2,
    marginTop: 3,
    overflow: 'hidden',
  },
  heroHpFill: {
    height: '100%',
    backgroundColor: colors.gold,
    borderRadius: 2,
  },
  heroTag: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 10,
    marginTop: 2,
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
  hudTop: {
    position: 'absolute',
    top: 8,
    left: 10,
    right: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    zIndex: 15,
  },
  countPill: {
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(251,191,36,0.4)',
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
  },
  countBig: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 18,
  },
  countSub: {
    color: 'rgba(255,245,220,0.85)',
    fontWeight: '700',
    fontSize: 10,
  },
  barTrack: {
    flex: 1,
    height: 8,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: { height: '100%', borderRadius: 4 },
  koBurst: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 25,
  },
  koBurstText: {
    color: '#fb7185',
    fontWeight: '900',
    fontSize: 36,
    textShadowColor: '#000',
    textShadowRadius: 8,
  },
  koBurstSub: {
    color: '#fff',
    fontWeight: '900',
    fontSize: 14,
    letterSpacing: 2,
  },
  hudBot: {
    position: 'absolute',
    bottom: 6,
    left: 8,
    right: 8,
    alignItems: 'center',
  },
  hudHint: {
    color: 'rgba(255,245,220,0.8)',
    fontWeight: '700',
    fontSize: 10,
    textAlign: 'center',
    textShadowColor: '#000',
    textShadowRadius: 3,
  },
});
