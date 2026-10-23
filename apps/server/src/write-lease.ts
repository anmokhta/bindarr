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

/** Acquire an exclusive write lease for a on-disk SQLite path. In-memory DBs always write. */
export function acquireWriteLease(databasePath: string): WriteLease {
  if (databasePath === ":memory:") {
    return { writeMode: true, writer: null, release: () => undefined };
  }

  const lockPath = lockPathFor(databasePath);
  const existing = existsSync(lockPath) ? readLock(lockPath) : null;
  if (existing && !isStale(existing)) {
    return {
      writeMode: false,
      writer: existing,
      release: () => undefined,
    };
  }

  const startedAt = new Date().toISOString();
  const info: WriteLeaseInfo = {
    pid: process.pid,
    hostname: hostname(),
    startedAt,
    heartbeatAt: startedAt,
    instanceId: randomUUID(),
  };
  writeLock(lockPath, info);

  // Re-read: if another writer raced and won, back off.
  const after = readLock(lockPath);
  if (after && after.instanceId !== info.instanceId && !isStale(after)) {
    return {
      writeMode: false,
      writer: after,
      release: () => undefined,
    };
  }

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
