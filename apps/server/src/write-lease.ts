import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";

export interface WriteLeaseInfo {
  pid: number;
  hostname: string;
  startedAt: string;
  heartbeatAt: string;
  instanceId: string;
}

export interface WriteLease {
  writeMode: boolean;
  writer: WriteLeaseInfo | null;
  /** Our instance id when writeMode is true. */
  instanceId: string | null;
  release: () => void;
}

const STALE_MS = 30_000;
const HEARTBEAT_MS = 5_000;

function lockPathFor(databasePath: string): string {
  return `${resolve(databasePath)}.write.lock`;
}

function readLock(lockPath: string): WriteLeaseInfo | null {
  try {
    const raw = JSON.parse(readFileSync(lockPath, "utf8")) as WriteLeaseInfo;
    if (!raw?.instanceId || !raw.heartbeatAt) return null;
    return raw;
  } catch {
    return null;
  }
}

function isPidAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function isStale(info: WriteLeaseInfo): boolean {
  const age = Date.now() - new Date(info.heartbeatAt).getTime();
  if (Number.isNaN(age) || age > STALE_MS) return true;
  if (info.hostname === hostname() && !isPidAlive(info.pid)) return true;
  return false;
}

function writeLock(lockPath: string, info: WriteLeaseInfo): void {
  writeFileSync(lockPath, JSON.stringify(info), "utf8");
}

/** Current lock file contents (null if missing/invalid). */
export function readWriteLeaseInfo(databasePath: string): WriteLeaseInfo | null {
  if (databasePath === ":memory:") return null;
  const lockPath = lockPathFor(databasePath);
  if (!existsSync(lockPath)) return null;
  return readLock(lockPath);
}

function claimLock(lockPath: string): WriteLease {
  const startedAt = new Date().toISOString();
  const info: WriteLeaseInfo = {
    pid: process.pid,
    hostname: hostname(),
    startedAt,
    heartbeatAt: startedAt,
    instanceId: randomUUID(),
  };
  writeLock(lockPath, info);

  const timer = setInterval(() => {
    const current = readLock(lockPath);
    if (current && current.instanceId !== info.instanceId) return;
    info.heartbeatAt = new Date().toISOString();
    try {
      writeLock(lockPath, info);
    } catch {
      /* ignore heartbeat failures */
    }
  }, HEARTBEAT_MS);
  timer.unref?.();

  return {
    writeMode: true,
    writer: info,
    instanceId: info.instanceId,
    release: () => {
      clearInterval(timer);
      try {
        const current = readLock(lockPath);
        if (current?.instanceId === info.instanceId) unlinkSync(lockPath);
      } catch {
        /* ignore */
      }
    },
  };
}

function readonlyLease(writer: WriteLeaseInfo | null): WriteLease {
  return { writeMode: false, writer, instanceId: null, release: () => undefined };
}

function memoryLease(): WriteLease {
  return { writeMode: true, writer: null, instanceId: null, release: () => undefined };
}

/** Acquire an exclusive write lease for a on-disk SQLite path. In-memory DBs always write. */
export function acquireWriteLease(databasePath: string): WriteLease {
  if (databasePath === ":memory:") return memoryLease();

  const lockPath = lockPathFor(databasePath);
  const existing = existsSync(lockPath) ? readLock(lockPath) : null;
  if (existing && !isStale(existing)) {
    return readonlyLease(existing);
  }

  const claimed = claimLock(lockPath);

  // Re-read: if another writer raced and won, back off.
  const after = readLock(lockPath);
  if (after && after.instanceId !== claimed.instanceId && !isStale(after)) {
    claimed.release();
    return readonlyLease(after);
  }

  return claimed;
}

/** Steal the write lease regardless of who holds it (user override). */
export function forceAcquireWriteLease(databasePath: string): WriteLease {
  if (databasePath === ":memory:") return memoryLease();
  return claimLock(lockPathFor(databasePath));
}

/**
 * Promote to writer only if the lock is free or stale.
 * Returns null when another live writer still holds the lease.
 */
export function tryPromoteWriteLease(databasePath: string): WriteLease | null {
  if (databasePath === ":memory:") return memoryLease();

  const lockPath = lockPathFor(databasePath);
  const existing = existsSync(lockPath) ? readLock(lockPath) : null;
  if (existing && !isStale(existing)) return null;

  const claimed = claimLock(lockPath);
  const after = readLock(lockPath);
  if (after && after.instanceId !== claimed.instanceId && !isStale(after)) {
    claimed.release();
    return null;
  }
  return claimed;
}
