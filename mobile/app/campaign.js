import { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
} from 'react-native';
import { useRouter } from 'expo-router';
import { api } from '../lib/api';
import { colors } from '../lib/theme';
import { heroPortrait } from '../lib/characters';
import { alertMsg } from '../lib/dialogs';
import FunShell from '../components/FunShell';
import JuicyButton from '../components/JuicyButton';
import AdGate from '../components/AdGate';
import ResourcePills from '../components/ResourcePills';
import CampaignBattle from '../components/CampaignBattle';
import CampaignRoadMap from '../components/CampaignRoadMap';
import BackToLobby from '../components/BackToLobby';

/**
 * Campaign — map first.
 * 1) Pick a chapter
 * 2) See the path; hero on NEXT stage
 * 3) Tap next to fight free, or an older stage (ad) for smaller ATK/HP/DEF/SPD
 * 4) Fight has NO path overlay — focus the battle
 * All boosts labeled ATK / HP / DEF / SPD.
 */
export default function CampaignScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [balances, setBalances] = useState({ COIN: 0, GEM: 0 });
  const [run, setRun] = useState(null);
  const [chapters, setChapters] = useState([]);
  const [meta, setMeta] = useState({
    chapterCleared: 0,
    endlessUnlocked: false,
    accountHighWater: 0,
    roadBonus: {},
    roadBonusLabel: '',
  });
  const [gender, setGender] = useState('boy');
  const [race, setRace] = useState('human');
  const [classId, setClassId] = useState('warrior');
  const [gearOrigin, setGearOrigin] = useState(null);
  // hub | story | map | prep | bossPick | dead | cashed
  const [phase, setPhase] = useState('hub');
  const [lastResult, setLastResult] = useState(null);
  const [cashSummary, setCashSummary] = useState(null);
  const [showAd, setShowAd] = useState(false);
  const [adMode, setAdMode] = useState(null); // revive | bossPick | replay
  const [pendingReplayStage, setPendingReplayStage] = useState(null);
  const [targetId, setTargetId] = useState(null);
  const [battle, setBattle] = useState(null);
  const [logLine, setLogLine] = useState('');
  const [walkFrom, setWalkFrom] = useState(null);
  const [enterError, setEnterError] = useState('');
  /** Post-fight sheet on top of battle — avoids hard cut to map */
  const [endSheet, setEndSheet] = useState(null);

  const syncPhase = useCallback((r) => {
    if (!r) {
      setPhase('hub');
      setBattle(null);
      return;
    }
    if (r.status === 'story' && r.storyCard) setPhase('story');
    else if (r.status === 'boss_pick') setPhase('map'); // legacy — auto-skip
    else if (r.status === 'equip') {
      // Legacy — auto-skip sigil slots (removed)
      api.campaignEquip({ skip: true }).then((res) => {
        if (res.run) {
          setRun(res.run);
          syncPhase(res.run);
        } else setPhase('map');
      });
      setPhase('map');
    } else if (r.status === 'active') {
      if (r.battle?.status === 'active' || r.hasActiveBattle) {
        setBattle(r.battle);
        setPhase('prep');
      } else {
        // Map is home base while active — no auto-fight
        setBattle(null);
        setPhase('map');
      }
    } else if (r.status === 'cashed') setPhase('cashed');
    else setPhase('hub');
  }, []);

  const load = useCallback(async () => {
    try {
      const me = await api.me();
      if (!me?.user?.characterReady) {
        router.replace('/character');
        return;
      }
      setBalances(me.balances || { COIN: 0, GEM: 0 });
      setGender(me.user?.gender || 'boy');
      setRace(me.user?.race || 'human');
      setClassId(me.user?.classId || 'warrior');
      setGearOrigin(
        me.user?.gear?.setActive
          ? me.user?.gear?.set?.originId || null
          : null
      );
      const data = await api.campaign();
      setChapters(data.chapters || []);
      const rb = data.roadBonus || data.run?.roadBonus || {};
      setMeta({
        chapterCleared: data.chapterCleared || 0,
        endlessUnlocked: !!data.endlessUnlocked,
        accountHighWater: data.accountHighWater || 0,
        premise: data.premise || null,
        roadBonus: rb,
        roadBonusLabel:
          data.roadBonusLabel ||
          data.run?.roadBonusLabel ||
          formatRoadLocal(rb),
      });
      setRun(data.run);
      // Resume mid-run on map/fight — do NOT force a lore wall as "home"
      syncPhase(data.run);
    } catch (e) {
      Alert.alert('Campaign', e.message || 'Could not load campaign');
      // Escape hatch: never leave them on an endless spinner
      setPhase('hub');
    } finally {
      setLoading(false);
    }
  }, [syncPhase, router]);

  useEffect(() => {
    load();
  }, [load]);

  async function startChapter(chapterId, mode = 'story') {
    setBusy(true);
    try {
      const res = await api.campaignStart({ mode, chapter: chapterId });
      if (!res?.run) throw new Error('No run returned — try again');
      setRun(res.run);
      setBalances(res.balances || balances);
      setLastResult(null);
      setBattle(null);
      // Skip long story cards for snappier play — go straight to the map
      if (res.run.status === 'story') {
        try {
          const ack = await api.campaignStoryAck();
          if (ack?.run) {
            setRun(ack.run);
            setPhase('map');
            return;
          }
        } catch {
          /* fall through to normal story phase */
        }
      }
      syncPhase(res.run);
    } catch (e) {
      Alert.alert('Could not start', e.message || 'Try again in a moment');
    } finally {
      setBusy(false);
    }
  }

  async function ackStory() {
    setBusy(true);
    try {
      const res = await api.campaignStoryAck();
      if (res.chapterComplete || res.cashed || !res.run) {
        if (res.coins != null) {
          setCashSummary({
            coins: res.coins,
            gems: res.gems,
            highWater: res.highWater,
            chapterComplete: true,
          });
          setBalances(res.balances || balances);
          setPhase('cashed');
          setRun(null);
        } else {
          setPhase('hub');
          setRun(null);
          await load();
        }
      } else {
        setRun(res.run);
        // After story → map (pick a stage)
        setPhase('map');
      }
    } catch (e) {
      Alert.alert('Error', e.message || 'Could not continue — try again');
    } finally {
      setBusy(false);
    }
  }

  /** Always enter the fight — mockAd skips ad gate (server still validates). */
  async function enterStage(stage, mockAd = true) {
    const st = Math.max(1, Math.floor(Number(stage) || 1));
    setBusy(true);
    setEnterError('');
    setEndSheet(null);
    setLastResult(null);
    setLogLine(`Entering Lv ${st}…`);
    setShowAd(false);
    setAdMode(null);
    try {
      let res;
      try {
        res = await api.campaignEnterStage({ stage: st, mockAd: true });
      } catch (e) {
        // If NEED_AD somehow still thrown, retry with mockAd (playtest)
        if (e.code === 'NEED_AD') {
          res = await api.campaignEnterStage({ stage: st, mockAd: true });
        } else {
          throw e;
        }
      }

      let battleData = res?.battle || null;
      let runData = res?.run || null;

      if (!battleData) {
        const b = await api.campaignBattleStart();
        battleData = b.battle || null;
        runData = b.run || runData;
      }

      if (!battleData) {
        throw new Error('Server returned no battle — try again');
      }

      if (runData) setRun(runData);
      setBattle(battleData);

      const foes = battleData.foes || [];
      const alive = foes.filter((f) => f.alive !== false);
      alive.sort(
        (a, b) => (a.hp || 0) - (b.hp || 0) || (b.atk || 0) - (a.atk || 0)
      );
      setTargetId(alive[0]?.id || null);
      setLogLine('Tap an enemy to attack!');
      setPhase('prep');
    } catch (e) {
      const msg = e.message || e.code || 'Could not start level';
      setEnterError(msg);
      setLogLine('');
      alertMsg('Stage', msg);
    } finally {
      setBusy(false);
    }
  }

  /** Tap a stage on the map (or the Play bar) */
  function onSelectStage(node) {
    if (busy) {
      // Don't soft-lock forever if a prior enter hung
      setBusy(false);
    }
    if (!node) {
      // Fall back to current frontier
      enterStage(run?.stage || 1, true);
      return;
    }
    if (node.state === 'locked') {
      alertMsg('Locked', 'Clear earlier levels first.');
      return;
    }
    // Free frontier play — no ad modal (was easy to get stuck on web)
    enterStage(node.stage || run?.stage || 1, true);
  }

  function playFrontier() {
    const nodes = run?.pathNodes || [];
    const st =
      nodes.find((n) => n.state === 'here')?.stage ||
      run?.stage ||
      run?.playingStage ||
      1;
    enterStage(st, true);
  }

  /**
   * Fetch attack result only — do NOT apply HP yet.
   * CampaignBattle applies the response after hit animations land,
   * so bars/numbers stay in sync with the swing.
   */
  async function doAttack(tid) {
    if (!tid) return null;
    try {
      return await api.campaignBattleAct({
        action: 'attack',
        targetId: tid,
      });
    } catch (e) {
      Alert.alert('Attack', e.message);
      return null;
    }
  }

  async function doBuff(buff) {
    if (busy) return;
    setBusy(true);
    try {
      const res = await api.campaignBattleAct({ action: 'buff', buff });
      applyBattleResponse(res);
    } catch (e) {
      Alert.alert('Buff', e.message);
    } finally {
      setBusy(false);
    }
  }

  function applyBattleResponse(res) {
    if (res.run) setRun(res.run);
    if (res.balances) setBalances(res.balances);
    if (res.run?.roadBonus || res.result?.roadBonusAfter) {
      const rb = res.result?.roadBonusAfter || res.run?.roadBonus;
      setMeta((m) => ({
        ...m,
        roadBonus: rb || m.roadBonus,
        roadBonusLabel:
          res.result?.roadBonusLabel ||
          res.run?.roadBonusLabel ||
          formatRoadLocal(rb || m.roadBonus),
      }));
    }
    if (res.battle) {
      setBattle(res.battle);
      const last = (res.battle.log || []).slice(-1)[0];
      setLogLine(last?.text || '');
      const still = res.battle.foes?.find((f) => f.id === targetId && f.alive);
      if (!still) {
        const alive = (res.battle.foes || []).filter((f) => f.alive);
        alive.sort((a, b) => a.hp - b.hp || b.atk - a.atk);
        setTargetId(alive[0]?.id || null);
      }
    }
    if (res.result) {
      setLastResult(res.result);
      // Let hit theater finish, then soft result sheet over the fight
      // (no instant unmount → map flash)
      setTimeout(() => {
        const r = res.result;
        const lines = [];
        if (r.cleared) {
          if (r.roadReward?.label) lines.push(r.roadReward.label);
          if (r.coinsEarned) lines.push(`+🪙 ${r.coinsEarned}`);
          if (r.gemsEarned) lines.push(`+💎 ${r.gemsEarned}`);
          if (r.gearDropLabel) lines.push(r.gearDropLabel);
          if (!lines.length) lines.push('Stage cleared');
        } else {
          lines.push('Bank is safe · power up and try again');
        }
        setEndSheet({
          cleared: !!r.cleared,
          isBoss: !!r.isBoss,
          stage: r.stage,
          title: r.cleared
            ? r.isBoss
              ? 'BOSS DOWN'
              : 'STAGE CLEAR'
            : r.isBoss
              ? 'BOSS WINS'
              : 'FELL',
          lines,
          run: res.run,
        });
      }, 1400);
    }
  }

  /** Leave fight UI for map (or story) after result sheet */
  function leaveFightToRoad({ walk = false } = {}) {
    const result = lastResult;
    const sheetRun = endSheet?.run;
    setEndSheet(null);
    setBattle(null);
    setLogLine('');
    setTargetId(null);

    if (result?.cleared) {
      if (walk) {
        setWalkFrom(Math.max(0, (result.stage || 1) - 1));
      }
      const r = sheetRun || run;
      if (r?.status === 'story' && r?.storyCard) {
        setPhase('story');
      } else {
        setPhase('map');
      }
      // Keep a soft clear note on the map for a bit
      setTimeout(() => setLastResult(null), 4500);
    } else {
      // Defeat → map (no jarring full-page dead wall)
      setPhase('map');
      setLastResult(null);
    }
  }

  async function bossPick(stat) {
    setBusy(true);
    try {
      const res = await api.campaignBossPick({ stat });
      setRun(res.run);
      if (res.balances) setBalances(res.balances);
      const label =
        res.picked?.label ||
        `+${res.picked?.gain || 1} ${res.picked?.short || stat}`;
      if (res.picksLeft > 0) {
        Alert.alert('Boosted!', label);
      } else {
        Alert.alert('Boosted!', label);
        syncPhase(res.run);
      }
    } catch (e) {
      Alert.alert('Pick', e.message);
    } finally {
      setBusy(false);
    }
  }

  async function cashOut() {
    setBusy(true);
    try {
      const res = await api.campaignCashOut();
      setCashSummary(res);
      setBalances(res.balances || balances);
      setRun(null);
      setPhase('cashed');
      setMeta((m) => ({
        ...m,
        accountHighWater: Math.max(m.accountHighWater, res.highWater || 0),
      }));
    } catch (e) {
      Alert.alert('Cash out', e.message);
    } finally {
      setBusy(false);
    }
  }

  function requestRevive() {
    if (run?.revived) {
      Alert.alert('No revive', 'Already used this climb.');
      return;
    }
    setAdMode('revive');
    setShowAd(true);
  }

  function afterAd() {
    setShowAd(false);
    const mode = adMode;
    setAdMode(null);
    if (mode === 'revive') {
      (async () => {
        try {
          const res = await api.campaignRevive();
          setRun(res.run);
          setLastResult(null);
          setPhase('map');
        } catch (e) {
          Alert.alert('Revive', e.message);
        }
      })();
    } else if (mode === 'replay' || mode === 'bossAd') {
      const st = pendingReplayStage || run?.stage || 1;
      setPendingReplayStage(null);
      enterStage(st, true);
    }
  }

  if (loading) {
    return (
      <FunShell>
        <View style={styles.center}>
          <ActivityIndicator color={colors.gold} size="large" />
          <Text style={styles.loadingHint}>Loading the Road…</Text>
          <View style={{ marginTop: 20, alignItems: 'center' }}>
            <BackToLobby />
          </View>
        </View>
      </FunShell>
    );
  }

  const tint = run?.chapterInfo?.tint || colors.gold;
  const portrait = heroPortrait({
    race: race || 'human',
    classId: classId || 'warrior',
    gender: gender || 'boy',
    view: 'front',
  });
  const heroOpts = {
    race: race || 'human',
    classId: classId || 'warrior',
    gender: gender || 'boy',
  };
  const pathNodes = run?.pathNodes || [];
  const roadLabel =
    run?.roadBonusLabel || meta.roadBonusLabel || formatRoadLocal(meta.roadBonus);

  return (
    <FunShell dim>
      <AdGate
        visible={showAd}
        count={1}
        onComplete={afterAd}
        onCancel={() => {
          setShowAd(false);
          setAdMode(null);
          setPendingReplayStage(null);
        }}
      />

      <View style={styles.screen}>
        <View style={styles.header}>
          <BackToLobby
            compact
            label="Lobby"
            onPress={async () => {
              if (phase === 'prep') {
                try {
                  const res = await api.campaignLeaveBattle();
                  if (res.run) setRun(res.run);
                } catch {
                  /* ignore */
                }
                setBattle(null);
                setPhase('map');
                return;
              }
              router.replace('/');
            }}
          />
          <View style={styles.headerMid}>
            <Text style={[styles.title, { textAlign: 'center' }]}>ROAD</Text>
            <Text style={[styles.tagline, { textAlign: 'center' }]}>
              {phase === 'prep' ? 'Fight' : 'Pit Road · pick a stage'}
            </Text>
          </View>
          <ResourcePills coins={balances.COIN} gems={balances.GEM} />
        </View>

        {/* ——— CHAPTER HUB ——— */}
        {phase === 'hub' && (
          <View style={styles.flex}>
            {/* Short pitch only — no wall-of-lore "Second Crown" screen */}
            <Text style={styles.hubLead}>
              Pick a chapter · fight stages · earn permanent ATK/HP/DEF/SPD
            </Text>
            <Text style={styles.hubSub}>
              Boss every 10 · 50 stages a road · skill climb, not a ticket draw
            </Text>
            {roadLabel ? (
              <Text style={styles.hubRoad}>{roadLabel}</Text>
            ) : null}
            <Pressable
              onPress={() => router.push('/upgrade')}
              style={styles.upgradeLink}
            >
              <Text style={styles.upgradeLinkText}>
                Hero · gear & tech tree →
              </Text>
            </Pressable>
            <ScrollView
              style={styles.mapScroll}
              contentContainerStyle={styles.mapPad}
              showsVerticalScrollIndicator={false}
            >
              {chapters.map((c, i) => {
                const locked = c.locked;
                const cleared = c.cleared;
                return (
                  <View key={c.id} style={styles.beadCol}>
                    {i > 0 ? <View style={styles.beadLine} /> : null}
                    <Pressable
                      disabled={locked || busy}
                      onPress={() => startChapter(c.id, 'story')}
                      style={[
                        styles.chapterNode,
                        { borderColor: c.tint || colors.gold },
                        locked && styles.nodeLocked,
                        cleared && styles.nodeCleared,
                      ]}
                    >
                      <Text style={styles.chEmoji}>{c.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.chTitle}>
                          Ch.{c.id} {c.title}
                        </Text>
                        <Text style={styles.chSub} numberOfLines={2}>
                          {locked
                            ? 'Clear previous chapter first'
                            : cleared
                              ? `Cleared · ${c.bossName}`
                              : c.subtitle ||
                                `${c.stages || 50} stages · ${c.bossName || 'boss'}`}
                        </Text>
                        {!locked && !cleared && c.openTeaser ? (
                          <Text style={styles.chTeaser} numberOfLines={2}>
                            {c.openTeaser}
                          </Text>
                        ) : null}
                        {!locked && (c.themeLabels || c.themeTrail)?.length ? (
                          <Text style={styles.chThemes} numberOfLines={1}>
                            {(c.themeLabels || c.themeTrail || [])
                              .slice(0, 4)
                              .join(' · ')}
                          </Text>
                        ) : null}
                      </View>
                      <Text style={styles.chCta}>
                        {locked ? '🔒' : cleared ? '✓' : 'GO'}
                      </Text>
                    </Pressable>
                  </View>
                );
              })}
              {meta.endlessUnlocked ? (
                <View style={styles.beadCol}>
                  <View style={styles.beadLine} />
                  <Pressable
                    onPress={() => startChapter(0, 'endless')}
                    style={[styles.chapterNode, styles.endlessNode]}
                    disabled={busy}
                  >
                    <Text style={styles.chEmoji}>♾️</Text>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.chTitle}>Endless Road</Text>
                      <Text style={styles.chSub}>
                        Best floor #{meta.accountHighWater}
                      </Text>
                    </View>
                    <Text style={styles.chCta}>GO</Text>
                  </Pressable>
                </View>
              ) : (
                <Text style={styles.unlockHint}>
                  Clear Ch.{chapters.length || 6} to unlock Endless
                </Text>
              )}
            </ScrollView>
          </View>
        )}

        {/* ——— STORY ——— */}
        {phase === 'story' && run?.storyCard && (
          <View style={styles.flexCenter}>
            <View style={[styles.storyCard, { borderColor: tint }]}>
              <Image
                source={portrait}
                style={styles.storyArt}
                resizeMode="contain"
              />
              {run.storyCard.hook ? (
                <Text style={styles.storyHook}>{run.storyCard.hook}</Text>
              ) : null}
              <Text style={[styles.storyTitle, { color: tint }]}>
                {run.storyCard.title}
              </Text>
              <ScrollView
                style={styles.storyScroll}
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.storyText}>{run.storyCard.text}</Text>
                {run.storyCard.goal ? (
                  <Text style={styles.storyGoal}>{run.storyCard.goal}</Text>
                ) : null}
              </ScrollView>
              <JuicyButton
                label={
                  run.storyCard.kind === 'boss'
                    ? 'FACE THEM'
                    : run.storyCard.kind === 'clear'
                      ? 'ONWARD'
                      : 'WALK THE ROAD'
                }
                onPress={ackStory}
                color="gold"
                style={styles.fullBtn}
              />
            </View>
          </View>
        )}

        {/* ——— STAGE MAP (pick level) ——— */}
        {phase === 'map' && run && (
          <View style={styles.flex}>
            <Text style={styles.hubRoad}>{roadLabel}</Text>
            <View style={styles.playBar}>
              <JuicyButton
                label={
                  busy
                    ? 'Starting fight…'
                    : `▶ FIGHT Lv ${
                        pathNodes.find((n) => n.state === 'here')?.stage ||
                        run.stage ||
                        1
                      }`
                }
                onPress={playFrontier}
                color="hot"
                disabled={false}
                style={styles.playBarBtn}
              />
              {enterError ? (
                <Text style={styles.enterErr}>{enterError}</Text>
              ) : (
                <Text style={styles.mapHint}>
                  Tap the red button to fight · or tap a path stone
                </Text>
              )}
              {busy ? (
                <ActivityIndicator color={colors.gold} style={{ marginTop: 6 }} />
              ) : null}
            </View>
            <CampaignRoadMap
              pathNodes={pathNodes}
              chapterInfo={run.chapterInfo}
              gender={gender}
              race={race}
              classId={classId}
              gearOrigin={gearOrigin}
              animateFrom={walkFrom}
              onWalkDone={() => setWalkFrom(null)}
              clearNote={
                lastResult?.cleared
                  ? [
                      lastResult.isBoss ? 'Boss down' : `Lv ${lastResult.stage} clear`,
                      lastResult.roadReward?.label,
                      lastResult.coinsEarned
                        ? `+🪙${lastResult.coinsEarned}`
                        : null,
                      lastResult.gearDropLabel,
                    ]
                      .filter(Boolean)
                      .join(' · ')
                  : null
              }
              height={480}
              onSelectStage={onSelectStage}
            />
            <Pressable onPress={cashOut} style={styles.cashOutBtn}>
              <Text style={styles.linkText}>
                Cash out 🪙{run.bankCoins || 0}
              </Text>
            </Pressable>
          </View>
        )}

        {/* ——— FIGHT — full world, no map boxes ——— */}
        {phase === 'prep' && run && (
          <View style={styles.flex}>
            {battle ? (
              <CampaignBattle
                gender={gender}
                race={race}
                classId={classId}
                gearOrigin={
                  battle?.hero?.gearOrigin ||
                  battle?.hero?.gearSet?.originId ||
                  gearOrigin
                }
                battle={battle}
                onAttack={doAttack}
                onAttackResolved={applyBattleResponse}
                busy={busy || !!endSheet}
                logLine={logLine}
                worldTheme={run.worldTheme}
                storyBeat={run.battleStoryBeat || ''}
                chapterTitle={`${run.chapterInfo?.title || 'Road'} · ${
                  run.floorPreview?.isBoss
                    ? `BOSS Lv ${run.playingStage || run.stage}`
                    : `Lv ${run.playingStage || run.stage}`
                }${run.isReplay ? ' · replay' : ''}`}
              />
            ) : (
              <View style={styles.footer}>
                <ActivityIndicator color={colors.gold} />
                <Text style={styles.linkMuted}>Entering the road…</Text>
              </View>
            )}
            {!endSheet ? (
              <Pressable
                onPress={async () => {
                  try {
                    const res = await api.campaignLeaveBattle();
                    if (res.run) setRun(res.run);
                  } catch {
                    /* ignore */
                  }
                  setBattle(null);
                  setEndSheet(null);
                  setPhase('map');
                }}
                style={styles.fleeLink}
              >
                <Text style={styles.fleeText}>Flee to map</Text>
              </Pressable>
            ) : null}

            {/* Soft result sheet — sits on the fight, then Continues to map */}
            {endSheet ? (
              <View style={styles.endOverlay} pointerEvents="box-none">
                <View
                  style={[
                    styles.endCard,
                    endSheet.cleared ? styles.endCardWin : styles.endCardLose,
                  ]}
                >
                  <Text
                    style={[
                      styles.endTitle,
                      endSheet.cleared ? styles.ok : styles.bad,
                    ]}
                  >
                    {endSheet.title}
                  </Text>
                  {endSheet.stage ? (
                    <Text style={styles.endStage}>Stage {endSheet.stage}</Text>
                  ) : null}
                  {endSheet.lines.map((line, i) => (
                    <Text key={`${line}-${i}`} style={styles.endLine}>
                      {line}
                    </Text>
                  ))}
                  {endSheet.cleared ? (
                    <JuicyButton
                      label="CONTINUE ON THE ROAD"
                      onPress={() => leaveFightToRoad({ walk: true })}
                      color="gold"
                      style={styles.fullBtn}
                    />
                  ) : (
                    <>
                      <Text style={styles.endHint}>
                        Replay stages · pits for gems · gear on Hero
                      </Text>
                      <JuicyButton
                        label="BACK TO MAP"
                        onPress={() => leaveFightToRoad({ walk: false })}
                        color="gold"
                        style={styles.fullBtn}
                      />
                      <JuicyButton
                        label="HERO · GEAR & TECH"
                        onPress={() => {
                          setEndSheet(null);
                          setBattle(null);
                          setLastResult(null);
                          router.push('/upgrade');
                        }}
                        color="hot"
                        style={styles.fullBtn}
                      />
                      <View style={styles.footerRow}>
                        {!run?.revived ? (
                          <Pressable
                            onPress={() => {
                              setEndSheet(null);
                              requestRevive();
                            }}
                          >
                            <Text style={styles.linkText}>📺 Revive</Text>
                          </Pressable>
                        ) : (
                          <Text style={styles.linkMuted}>Revive used</Text>
                        )}
                        <Pressable onPress={cashOut}>
                          <Text style={styles.linkText}>
                            Cash 🪙{run?.bankCoins || 0}
                          </Text>
                        </Pressable>
                      </View>
                    </>
                  )}
                </View>
              </View>
            ) : null}
          </View>
        )}

        {/* ——— CASHED ——— */}
        {phase === 'cashed' && cashSummary && (
          <View style={styles.flexCenter}>
            <View style={styles.resultCard}>
              <Text style={styles.ok}>
                {cashSummary.abandoned ? 'LEFT' : 'BANKED'}
              </Text>
              <Text style={styles.loot}>
                +🪙{cashSummary.coins || 0}
                {(cashSummary.gems || 0) > 0 ? `  +💎${cashSummary.gems}` : ''}
              </Text>
              <JuicyButton
                label="CHAPTER MAP"
                onPress={() => {
                  setCashSummary(null);
                  setPhase('hub');
                  load();
                }}
                color="gold"
                style={styles.fullBtn}
              />
              <Pressable
                onPress={() => router.replace('/')}
                style={styles.linkBtn}
              >
                <Text style={styles.linkText}>← Lobby</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>
    </FunShell>
  );
}

function formatRoadLocal(b = {}) {
  return `ATK +${b.power || 0}  HP +${b.vitality || 0}  DEF +${b.guard || 0}  SPD +${b.speed || 0}`;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  loadingHint: {
    color: colors.muted,
    fontWeight: '700',
    marginTop: 14,
    fontSize: 14,
  },
  screen: { flex: 1, paddingTop: 50, paddingHorizontal: 14, paddingBottom: 14 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  back: { color: colors.muted, fontWeight: '900', fontSize: 24, width: 36 },
  headerMid: { flex: 1, alignItems: 'center' },
  title: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 17,
    letterSpacing: 2,
  },
  tagline: { color: colors.muted, fontWeight: '700', fontSize: 12, marginTop: 2 },
  flex: { flex: 1, minHeight: 0 },
  flexCenter: { flex: 1, justifyContent: 'center', paddingHorizontal: 8 },
  hubLead: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 4,
    paddingHorizontal: 12,
    lineHeight: 22,
  },
  hubSub: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 10,
    paddingHorizontal: 16,
    lineHeight: 17,
  },
  mapScroll: { flex: 1 },
  mapPad: { paddingBottom: 28, paddingTop: 8, gap: 4 },
  beadCol: { alignItems: 'center', width: '100%' },
  beadLine: {
    width: 3,
    height: 18,
    backgroundColor: 'rgba(251,191,36,0.35)',
    borderRadius: 2,
  },
  chapterNode: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 420,
    backgroundColor: 'rgba(18,8,36,0.95)',
    borderRadius: 18,
    borderWidth: 2,
    paddingVertical: 16,
    paddingHorizontal: 14,
    gap: 12,
    marginBottom: 6,
  },
  nodeLocked: { opacity: 0.45 },
  nodeCleared: { borderColor: colors.win },
  endlessNode: { borderColor: colors.gem },
  chEmoji: { fontSize: 32 },
  chTitle: { color: colors.text, fontWeight: '900', fontSize: 16 },
  chSub: { color: colors.muted, fontWeight: '600', fontSize: 13, marginTop: 4 },
  chThemes: {
    color: colors.gem,
    fontWeight: '700',
    fontSize: 11,
    marginTop: 5,
    textTransform: 'capitalize',
  },
  chCta: { color: colors.gold, fontWeight: '900', fontSize: 14 },
  unlockHint: {
    color: colors.muted,
    textAlign: 'center',
    marginTop: 16,
    fontWeight: '600',
    fontSize: 13,
  },
  hubRoad: {
    color: colors.gem,
    fontWeight: '800',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
  },
  mapHint: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 11,
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
  },
  playBar: {
    zIndex: 50,
    elevation: 20,
    marginHorizontal: 12,
    marginBottom: 8,
    padding: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(20,8,30,0.92)',
    borderWidth: 2,
    borderColor: colors.gold,
  },
  playBarBtn: { alignSelf: 'stretch' },
  enterErr: {
    color: '#f87171',
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
  },
  chTeaser: {
    color: 'rgba(245,239,227,0.55)',
    fontWeight: '600',
    fontSize: 11,
    marginTop: 4,
    lineHeight: 15,
  },
  storyHook: {
    color: colors.gem,
    fontWeight: '800',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 4,
  },
  storyScroll: {
    maxHeight: 220,
    width: '100%',
    marginBottom: 8,
  },
  storyGoal: {
    color: colors.gold,
    fontWeight: '700',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 17,
  },
  upgradeLink: {
    alignSelf: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.gold,
    backgroundColor: 'rgba(40,28,8,0.7)',
  },
  upgradeLinkText: {
    color: colors.gold,
    fontWeight: '800',
    fontSize: 13,
  },
  roadGain: {
    color: colors.gem,
    fontWeight: '900',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 8,
  },
  deadHint: {
    color: colors.cream,
    fontWeight: '600',
    fontSize: 13,
    lineHeight: 20,
    textAlign: 'left',
    alignSelf: 'stretch',
    marginTop: 4,
    marginBottom: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 10,
    padding: 12,
  },
  endOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(6, 4, 14, 0.62)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18,
    zIndex: 40,
  },
  endCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 2,
    padding: 18,
    backgroundColor: 'rgba(18, 12, 28, 0.96)',
  },
  endCardWin: {
    borderColor: 'rgba(251, 191, 36, 0.85)',
  },
  endCardLose: {
    borderColor: 'rgba(248, 113, 113, 0.75)',
  },
  endTitle: {
    fontWeight: '900',
    fontSize: 26,
    textAlign: 'center',
    letterSpacing: 1,
  },
  endStage: {
    color: colors.muted,
    fontWeight: '700',
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 10,
  },
  endLine: {
    color: colors.cream,
    fontWeight: '800',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 4,
  },
  endHint: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 6,
    lineHeight: 17,
  },
  cashOutBtn: {
    marginTop: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  bossPickRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 16,
    justifyContent: 'center',
  },
  bossPick: {
    width: '46%',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    padding: 14,
    alignItems: 'center',
    minHeight: 100,
  },
  bossPickEmoji: { fontSize: 28 },
  bossPickLabel: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 18,
    marginTop: 6,
  },
  bossPickBlurb: {
    color: colors.muted,
    fontWeight: '600',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  storyCard: {
    backgroundColor: 'rgba(16,6,32,0.96)',
    borderRadius: 20,
    borderWidth: 2,
    padding: 18,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
    maxHeight: '88%',
  },
  storyArt: { width: 100, height: 118, marginBottom: 6 },
  storyTitle: { fontWeight: '900', fontSize: 20, marginBottom: 8 },
  storyText: {
    color: colors.cream,
    fontWeight: '600',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
    marginBottom: 8,
  },
  footer: { alignItems: 'center', gap: 6, paddingTop: 4 },
  fleeLink: { paddingVertical: 6, alignItems: 'center' },
  fleeText: {
    color: 'rgba(180,160,140,0.55)',
    fontWeight: '700',
    fontSize: 11,
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 20,
    marginTop: 6,
  },
  fullBtn: { alignSelf: 'stretch', width: '100%' },
  linkBtn: { marginTop: 8, padding: 8, alignItems: 'center' },
  linkText: {
    color: colors.gem,
    fontWeight: '800',
    fontSize: 14,
    textAlign: 'center',
  },
  linkMuted: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  resultCard: {
    backgroundColor: 'rgba(16,6,32,0.96)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.gold,
    padding: 20,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  equipCard: {
    backgroundColor: 'rgba(16,6,32,0.96)',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: colors.gem,
    padding: 16,
    alignItems: 'center',
    width: '100%',
    maxWidth: 400,
    alignSelf: 'center',
  },
  panelTitle: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 16,
    marginBottom: 6,
  },
  panelBody: {
    color: colors.cream,
    fontWeight: '600',
    fontSize: 13,
    textAlign: 'center',
    marginBottom: 8,
    lineHeight: 18,
  },
  sigilBig: {
    color: colors.text,
    fontWeight: '900',
    fontSize: 20,
    marginVertical: 6,
  },
  section: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 11,
    letterSpacing: 1,
    marginBottom: 6,
    marginTop: 8,
  },
  slotRow: { flexDirection: 'row', gap: 8, width: '100%' },
  slotBtn: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.cardBorder,
    padding: 10,
    alignItems: 'center',
  },
  slotPref: { borderColor: colors.gold },
  slotName: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  slotCur: { fontSize: 20, marginVertical: 4 },
  slotGo: { color: colors.gem, fontWeight: '800', fontSize: 11 },
  ok: {
    color: colors.win,
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 1,
    marginBottom: 6,
  },
  bad: {
    color: colors.danger,
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 1,
    marginBottom: 6,
  },
  loot: {
    color: colors.gold,
    fontWeight: '900',
    fontSize: 18,
    marginBottom: 8,
  },
});
