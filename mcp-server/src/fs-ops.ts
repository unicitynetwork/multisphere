import { promises as fs } from 'node:fs';
import path from 'node:path';
import { loadConfig, getActiveWorkspace } from './config.js';
import { safeJoin } from './paths.js';

async function activeRoot(): Promise<string> {
  const cfg = await loadConfig();
  const { ws } = getActiveWorkspace(cfg);
  return ws.local_path;
}

export async function fsRead(args: { path: string }) {
  const root = await activeRoot();
  const abs = safeJoin(root, args.path);
  const content = await fs.readFile(abs, 'utf8');
  return { path: args.path, content };
}

export async function fsWrite(args: { path: string; content: string; mode?: 'overwrite' | 'append' }) {
  const root = await activeRoot();
  const abs = safeJoin(root, args.path);
  await fs.mkdir(path.dirname(abs), { recursive: true });
  if (args.mode === 'append') {
    await fs.appendFile(abs, args.content, 'utf8');
  } else {
    await fs.writeFile(abs, args.content, 'utf8');
  }
  return { path: args.path, mode: args.mode ?? 'overwrite', bytes: Buffer.byteLength(args.content, 'utf8') };
}

export async function fsList(args: { dir: string }) {
  const root = await activeRoot();
  const abs = safeJoin(root, args.dir || '.');
  const dirents = await fs.readdir(abs, { withFileTypes: true });
  const entries = await Promise.all(
    dirents.map(async (d) => {
      const full = path.join(abs, d.name);
      let size = 0;
      let type: 'file' | 'dir' | 'other' = 'other';
      if (d.isFile()) {
        type = 'file';
        const s = await fs.stat(full);
        size = s.size;
      } else if (d.isDirectory()) {
        type = 'dir';
      }
      return { name: d.name, type, size };
    }),
  );
  return { dir: args.dir || '.', entries };
}

export async function fsSearch(args: { query: string; paths?: string[] }) {
  const root = await activeRoot();
  const searchPaths = args.paths && args.paths.length > 0 ? args.paths : ['.'];
  const matches: Array<{ path: string; line: number; text: string }> = [];

  async function walk(rel: string): Promise<void> {
    const abs = safeJoin(root, rel);
    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      return;
    }
    if (stat.isFile()) {
      // Skip likely-binary files by extension.
      if (/\.(png|jpg|jpeg|gif|pdf|zip|tar|gz|exe|bin|so|dylib|woff2?)$/i.test(abs)) return;
      try {
        const content = await fs.readFile(abs, 'utf8');
        const lines = content.split('\n');
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes(args.query)) {
            matches.push({ path: rel, line: i + 1, text: lines[i] });
            if (matches.length >= 500) return;
          }
        }
      } catch {
        // skip unreadable
      }
      return;
    }
    if (stat.isDirectory()) {
      // Skip .git and node_modules.
      const base = path.basename(abs);
      if (base === '.git' || base === 'node_modules' || base === 'dist') return;
      const entries = await fs.readdir(abs);
      for (const e of entries) {
        if (matches.length >= 500) return;
        await walk(path.join(rel, e));
      }
    }
  }

  for (const p of searchPaths) {
    await walk(p);
    if (matches.length >= 500) break;
  }
  return { query: args.query, matches, truncated: matches.length >= 500 };
}
