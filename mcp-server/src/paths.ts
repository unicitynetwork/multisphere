import path from 'node:path';

/**
 * Resolve `userPath` relative to `root`, refusing any path that escapes the root.
 * Returns the absolute resolved path.
 */
export function safeJoin(root: string, userPath: string): string {
  if (typeof userPath !== 'string') {
    throw new Error('path must be a string');
  }
  if (path.isAbsolute(userPath)) {
    throw new Error(`absolute paths are not allowed: ${userPath}`);
  }
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, userPath);
  const rel = path.relative(resolvedRoot, resolved);
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`path escapes workspace root: ${userPath}`);
  }
  return resolved;
}

export function nowStamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}
