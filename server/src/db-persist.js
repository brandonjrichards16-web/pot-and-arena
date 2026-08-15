/**
 * Free-tier progress persistence for ephemeral hosts (Render free).
 * Backs up SQLite (gzipped) to a private GitHub repo; restores on boot after cold start.
 *
 * Env:
 *   DB_BACKUP_GITHUB_REPO   owner/name  (e.g. you/pot-and-arena-saves)
 *   DB_BACKUP_GITHUB_TOKEN  PAT or gh OAuth token with repo contents write
 *   DB_BACKUP_PATH          file path in repo (default: game.db.gz)
 *   DB_BACKUP_INTERVAL_MS   backup interval (default: 45000)
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const REPO = process.env.DB_BACKUP_GITHUB_REPO || '';
const TOKEN = process.env.DB_BACKUP_GITHUB_TOKEN || process.env.GITHUB_TOKEN || '';
const REMOTE_PATH = process.env.DB_BACKUP_PATH || 'game.db.gz';
const INTERVAL_MS = Number(process.env.DB_BACKUP_INTERVAL_MS || 45_000);

let dirty = false;
let backingUp = false;
let lastSha = null;
let timer = null;

export function markDbDirty() {
  dirty = true;
}

export function isDbBackupEnabled() {
  return Boolean(REPO && TOKEN);
}

async function ghJson(method, urlPath, body) {
  const res = await fetch(`https://api.github.com${urlPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }
  if (!res.ok) {
    const msg = data?.message || text || res.statusText;
    const err = new Error(`GitHub ${method} ${urlPath}: ${res.status} ${msg}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

function contentApiPath() {
  const [owner, repo] = REPO.split('/');
  if (!owner || !repo) throw new Error(`Bad DB_BACKUP_GITHUB_REPO: ${REPO}`);
  return `/repos/${owner}/${repo}/contents/${REMOTE_PATH.split('/').map(encodeURIComponent).join('/')}`;
}

async function fetchRemoteMeta() {
  return ghJson('GET', contentApiPath());
}

/** Download file bytes (handles >1MB via raw accept). */
async function downloadRemoteBytes() {
  const urlPath = contentApiPath();
  // Prefer raw body (works for larger blobs)
  const rawRes = await fetch(`https://api.github.com${urlPath}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github.raw',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (rawRes.status === 404) {
    const err = new Error('not found');
    err.status = 404;
    throw err;
  }
  if (rawRes.ok) {
    // still need sha for later PUTs
    try {
      const meta = await fetchRemoteMeta();
      lastSha = meta.sha || lastSha;
    } catch {
      /* ignore */
    }
    return Buffer.from(await rawRes.arrayBuffer());
  }
  // Fallback: JSON base64 (small files)
  const meta = await fetchRemoteMeta();
  lastSha = meta.sha || null;
  if (!meta?.content) throw new Error('empty remote content');
  return Buffer.from(String(meta.content).replace(/\n/g, ''), 'base64');
}

/** Download latest backup into dbPath if it exists. Call BEFORE opening SQLite. */
export async function restoreDatabaseFile(dbPath) {
  if (!isDbBackupEnabled()) {
    console.log('[db-persist] disabled (set DB_BACKUP_GITHUB_REPO + DB_BACKUP_GITHUB_TOKEN to keep progress)');
    return false;
  }
  try {
    let packed = await downloadRemoteBytes();
    // Support gzip backups (default) and legacy raw sqlite
    let buf = packed;
    if (REMOTE_PATH.endsWith('.gz') || (packed[0] === 0x1f && packed[1] === 0x8b)) {
      buf = zlib.gunzipSync(packed);
    }
    if (buf.length < 100) {
      console.warn('[db-persist] remote backup too small, ignoring');
      return false;
    }
    // SQLite magic header
    if (buf.subarray(0, 15).toString() !== 'SQLite format 3') {
      console.warn('[db-persist] remote file is not SQLite, ignoring');
      return false;
    }
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    for (const side of [`${dbPath}-wal`, `${dbPath}-shm`]) {
      try {
        fs.unlinkSync(side);
      } catch {
        /* ignore */
      }
    }
    fs.writeFileSync(dbPath, buf);
    console.log(`[db-persist] restored ${buf.length} bytes from github:${REPO}/${REMOTE_PATH}`);
    dirty = false;
    return true;
  } catch (e) {
    if (e.status === 404) {
      console.log('[db-persist] no remote backup yet — starting fresh');
      return false;
    }
    console.error('[db-persist] restore failed:', e.message);
    return false;
  }
}

async function putRemote(contentBase64, message) {
  if (!lastSha) {
    try {
      const meta = await fetchRemoteMeta();
      lastSha = meta.sha || null;
    } catch (e) {
      if (e.status !== 404) throw e;
      lastSha = null;
    }
  }
  const body = {
    message,
    content: contentBase64,
    ...(lastSha ? { sha: lastSha } : {}),
  };
  const result = await ghJson('PUT', contentApiPath(), body);
  lastSha = result?.content?.sha || lastSha;
  return result;
}

async function uploadBackup(dbPath) {
  if (!isDbBackupEnabled() || backingUp) return false;
  if (!fs.existsSync(dbPath)) return false;
  backingUp = true;
  try {
    const raw = fs.readFileSync(dbPath);
    if (raw.length < 100) return false;
    const packed = zlib.gzipSync(raw);
    const content = packed.toString('base64');
    await putRemote(content, `game.db backup ${new Date().toISOString()}`);
    dirty = false;
    console.log(
      `[db-persist] backed up ${raw.length} bytes (gzip ${packed.length}) → github:${REPO}/${REMOTE_PATH}`
    );
    return true;
  } catch (e) {
    if (e.status === 409 || e.status === 422) {
      try {
        const meta = await fetchRemoteMeta();
        lastSha = meta.sha || null;
        const raw = fs.readFileSync(dbPath);
        const packed = zlib.gzipSync(raw);
        await putRemote(packed.toString('base64'), `game.db backup ${new Date().toISOString()} (retry)`);
        dirty = false;
        console.log(`[db-persist] backed up (retry) ${raw.length} bytes`);
        return true;
      } catch (e2) {
        console.error('[db-persist] backup retry failed:', e2.message);
        return false;
      }
    }
    console.error('[db-persist] backup failed:', e.message);
    return false;
  } finally {
    backingUp = false;
  }
}

function checkpoint(db) {
  try {
    db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
  } catch (e) {
    console.warn('[db-persist] checkpoint:', e.message);
  }
}

export async function backupDatabaseNow(db, dbPath) {
  if (!isDbBackupEnabled()) return false;
  checkpoint(db);
  return uploadBackup(dbPath);
}

/** Periodic + shutdown backups. Safe to call once after migrate. */
export function startDbPersistence(db, dbPath) {
  if (!isDbBackupEnabled()) return;

  const tick = async () => {
    if (!dirty) return;
    await backupDatabaseNow(db, dbPath);
  };

  timer = setInterval(() => {
    tick().catch((e) => console.error('[db-persist] interval', e.message));
  }, INTERVAL_MS);
  if (typeof timer.unref === 'function') timer.unref();

  const shutdown = () => {
    checkpoint(db);
    if (dirty) {
      // Render free gives a short grace period on stop — fire backup and hope
      uploadBackup(dbPath).catch(() => {});
    }
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);

  // initial backup shortly after boot so empty→first-play is saved even if host dies
  setTimeout(() => {
    dirty = true;
    tick().catch(() => {});
  }, 15_000);

  console.log(
    `[db-persist] active → ${REPO}/${REMOTE_PATH} every ${INTERVAL_MS}ms when dirty`
  );
}
