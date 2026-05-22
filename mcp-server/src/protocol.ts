import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { loadConfig, getActiveWorkspace } from './config.js';
import { safeJoin, nowStamp, nowIso } from './paths.js';
import type { JournalTodo, PointerFile } from './types.js';

const JOURNAL_PATH = 'journal.md';
const INBOX_PATH = 'inbox.md';
const POINTERS_DIR = '.pointers';

const JOURNAL_HEADER = '# Journal\n\n';
const INBOX_HEADER = '# Inbox\n\n## Open\n\n## Closed\n\n';

async function ensureFile(absPath: string, header: string): Promise<void> {
  try {
    await fs.access(absPath);
  } catch {
    await fs.mkdir(path.dirname(absPath), { recursive: true });
    await fs.writeFile(absPath, header, 'utf8');
  }
}

interface ActiveContext {
  root: string;
  agent_id: string;
  agent_name: string;
}

async function activeContext(): Promise<ActiveContext> {
  const cfg = await loadConfig();
  const { ws } = getActiveWorkspace(cfg);
  return { root: ws.local_path, agent_id: cfg.agent_id, agent_name: cfg.agent_name };
}

export async function journalAppend(args: { summary: string; details?: string; todos?: JournalTodo[] }) {
  const { root, agent_id, agent_name } = await activeContext();
  const abs = safeJoin(root, JOURNAL_PATH);
  await ensureFile(abs, JOURNAL_HEADER);

  const stamp = nowStamp();
  const lines: string[] = [];
  lines.push(`## ${stamp} — ${agent_id} (${agent_name})`);
  lines.push(args.summary.trim());
  if (args.details && args.details.trim().length > 0) {
    lines.push('');
    lines.push(args.details.trim());
  }
  if (args.todos && args.todos.length > 0) {
    lines.push('');
    for (const t of args.todos) {
      const target = t.for ? `@${t.for.replace(/^@/, '')}` : '@anyone';
      lines.push(`TODO ${target}: ${t.text.trim()}`);
    }
  }
  lines.push('');
  lines.push('');

  await fs.appendFile(abs, lines.join('\n'), 'utf8');
  return { ok: true, journal_entry_at: stamp, agent_id };
}

async function readInbox(abs: string): Promise<string> {
  await ensureFile(abs, INBOX_HEADER);
  return fs.readFile(abs, 'utf8');
}

/**
 * Normalize inbox.md so blank lines are consistent:
 *  - Collapse 2+ consecutive blank lines into 1.
 *  - Ensure exactly one blank line after each "## " header (when followed by content).
 *  - End the file with a single trailing newline.
 */
function normalizeInbox(text: string): string {
  const rawLines = text.split('\n');
  const out: string[] = [];
  for (const line of rawLines) {
    if (line.trim() === '' && out.length > 0 && out[out.length - 1] === '') {
      continue; // collapse blank runs
    }
    out.push(line);
  }
  // Strip leading blanks.
  while (out.length > 0 && out[0] === '') out.shift();
  // Strip trailing blanks.
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  // Ensure a blank line after each "## " header.
  for (let i = 0; i < out.length - 1; i++) {
    if (out[i].startsWith('## ') && out[i + 1] !== '') {
      out.splice(i + 1, 0, '');
    }
  }
  // Ensure a blank line before each "## " header that isn't the first.
  for (let i = 1; i < out.length; i++) {
    if (out[i].startsWith('## ') && out[i - 1] !== '') {
      out.splice(i, 0, '');
      i++;
    }
  }
  return out.join('\n') + '\n';
}

function nextInboxId(text: string): string {
  const ids = [...text.matchAll(/INB-(\d{3,})/g)].map((m) => parseInt(m[1], 10));
  const next = ids.length > 0 ? Math.max(...ids) + 1 : 1;
  return `INB-${String(next).padStart(3, '0')}`;
}

export async function inboxAdd(args: { title: string; body?: string; for?: string }) {
  const { root, agent_id } = await activeContext();
  const abs = safeJoin(root, INBOX_PATH);
  const text = await readInbox(abs);
  const id = nextInboxId(text);
  const target = args.for ? `@${args.for.replace(/^@/, '')}` : '@anyone';
  const stamp = nowStamp();
  const body = args.body ? `  ${args.body.trim().replace(/\n/g, '\n  ')}` : '';

  const itemLines = [
    `- [ ] ${id} ${target} — ${args.title.trim()}  `,
    `  added ${stamp} by ${agent_id}`,
    body,
  ]
    .filter((l) => l !== '')
    .join('\n');

  // Append at the end of the "## Open" section (chronological order).
  const lines = text.split('\n');
  const openIdx = lines.findIndex((l) => l.startsWith('## Open'));
  if (openIdx === -1) {
    throw new Error('inbox.md is malformed: "## Open" section not found');
  }
  let endOfOpen = lines.findIndex((l, i) => i > openIdx && l.startsWith('## '));
  if (endOfOpen === -1) endOfOpen = lines.length;

  const insertAt = endOfOpen;
  const block: string[] = [];
  // Only prepend a blank if the preceding line isn't already blank.
  if (insertAt > 0 && lines[insertAt - 1].trim() !== '') block.push('');
  block.push(...itemLines.split('\n'));
  block.push('');

  lines.splice(insertAt, 0, ...block);
  await fs.writeFile(abs, normalizeInbox(lines.join('\n')), 'utf8');

  return { id, target, added_at: stamp };
}

export async function inboxClose(args: { id: string; resolution: string; journal_ref?: string }) {
  const { root, agent_id } = await activeContext();
  const abs = safeJoin(root, INBOX_PATH);
  const text = await readInbox(abs);
  const stamp = nowStamp();

  // Find the item line in the Open section.
  const lines = text.split('\n');
  let itemStart = -1;
  let itemEnd = -1;
  let inOpen = false;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('## Open')) {
      inOpen = true;
      continue;
    }
    if (l.startsWith('## ') && inOpen) break;
    if (inOpen && l.startsWith(`- [ ] ${args.id}`)) {
      itemStart = i;
      // item continues until next blank line or next "- [" or next "##".
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('- [') && !lines[j].startsWith('## ') && lines[j].trim() !== '') {
        j++;
      }
      itemEnd = j;
      break;
    }
  }

  if (itemStart === -1) {
    throw new Error(`inbox item ${args.id} not found in Open section`);
  }

  const item = lines.slice(itemStart, itemEnd);
  // Replace the leading "- [ ] INB-XXX <rest>" with "- [x] ~~INB-XXX <rest>~~"
  const first = item[0].replace(`- [ ] ${args.id}`, `- [x] ~~${args.id}`);
  const reConvertedFirst = first.replace(/  $/, '~~  ');
  item[0] = reConvertedFirst.endsWith('~~  ') ? reConvertedFirst : reConvertedFirst + '~~';
  const resolutionLine = `  closed ${stamp} by ${agent_id} → ${args.resolution.trim()}${args.journal_ref ? `, see journal ${args.journal_ref}` : ''}`;
  item.push(resolutionLine);

  // Remove from Open block, including a trailing blank line if any.
  let removeUntil = itemEnd;
  if (removeUntil < lines.length && lines[removeUntil].trim() === '') removeUntil++;
  lines.splice(itemStart, removeUntil - itemStart);

  // Collapse any double-blank that may now exist where the item used to be.
  while (
    itemStart > 0 &&
    itemStart < lines.length &&
    lines[itemStart - 1].trim() === '' &&
    lines[itemStart].trim() === ''
  ) {
    lines.splice(itemStart, 1);
  }

  // Insert into Closed section, at the end.
  const closedIdx = lines.findIndex((l) => l.startsWith('## Closed'));
  if (closedIdx === -1) {
    throw new Error('inbox.md is malformed: "## Closed" section not found');
  }
  let closedEnd = lines.findIndex((l, i) => i > closedIdx && l.startsWith('## '));
  if (closedEnd === -1) closedEnd = lines.length;

  const insertAt = closedEnd;
  const block: string[] = [];
  if (insertAt > 0 && lines[insertAt - 1].trim() !== '') block.push('');
  block.push(...item);
  block.push('');

  lines.splice(insertAt, 0, ...block);
  await fs.writeFile(abs, normalizeInbox(lines.join('\n')), 'utf8');
  return { id: args.id, closed_at: stamp, by: agent_id };
}

export async function whatsNew() {
  const cfg = await loadConfig();
  const { ws } = getActiveWorkspace(cfg);
  const root = ws.local_path;
  const git = simpleGit(root);

  const head = (await git.revparse(['HEAD'])).trim();

  const pointerPath = safeJoin(root, path.join(POINTERS_DIR, `${cfg.agent_id}.json`));
  await fs.mkdir(path.dirname(pointerPath), { recursive: true });

  let pointer: PointerFile | null = null;
  try {
    pointer = JSON.parse(await fs.readFile(pointerPath, 'utf8')) as PointerFile;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  let commits: Array<{ sha: string; date: string; author: string; message: string }> = [];
  let changedFiles: string[] = [];
  let firstVisit = false;

  if (pointer?.last_seen_sha && pointer.last_seen_sha !== head) {
    const log = await git.log([`${pointer.last_seen_sha}..HEAD`]);
    commits = log.all.map((c) => ({
      sha: c.hash.slice(0, 12),
      date: c.date,
      author: c.author_name,
      message: c.message,
    }));
    const diffSummary = await git.diffSummary([`${pointer.last_seen_sha}..HEAD`]);
    changedFiles = diffSummary.files.map((f) => f.file);
  } else if (!pointer) {
    firstVisit = true;
  }

  const newPointer: PointerFile = {
    last_seen_sha: head,
    last_read_at: nowIso(),
  };
  await fs.writeFile(pointerPath, JSON.stringify(newPointer, null, 2) + '\n', 'utf8');

  return {
    first_visit: firstVisit,
    previous_sha: pointer?.last_seen_sha ?? null,
    current_sha: head,
    new_commits: commits,
    changed_files: changedFiles,
  };
}
