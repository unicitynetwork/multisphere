import { simpleGit, type SimpleGit } from 'simple-git';
import { loadConfig, getActiveWorkspace } from './config.js';

async function gitForActive(): Promise<SimpleGit> {
  const cfg = await loadConfig();
  const { ws } = getActiveWorkspace(cfg);
  return simpleGit(ws.local_path);
}

export async function gitFetch() {
  const git = await gitForActive();
  await git.fetch();
  const status = await git.status();
  return { behind: status.behind, ahead: status.ahead };
}

export async function gitPull() {
  const git = await gitForActive();
  try {
    const result = await git.pull(undefined, undefined, { '--ff-only': null });
    const head = (await git.revparse(['HEAD'])).trim();
    return {
      updated: (result.summary.changes ?? 0) > 0 || (result.summary.insertions ?? 0) > 0 || (result.summary.deletions ?? 0) > 0,
      new_head: head,
      files: result.files ?? [],
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    // Detect merge conflict / non-ff condition
    if (/conflict|not possible to fast-forward|diverg/i.test(message)) {
      const status = await git.status();
      return {
        error: 'conflict',
        message,
        files: [...status.conflicted, ...status.modified],
      };
    }
    throw err;
  }
}

export async function gitStatus() {
  const git = await gitForActive();
  const s = await git.status();
  return {
    branch: s.current,
    tracking: s.tracking,
    ahead: s.ahead,
    behind: s.behind,
    modified: s.modified,
    not_added: s.not_added,
    deleted: s.deleted,
    renamed: s.renamed.map((r) => `${r.from} -> ${r.to}`),
    staged: s.staged,
    untracked: s.not_added,
    conflicted: s.conflicted,
    clean: s.isClean(),
  };
}

export async function gitDiff(args: { since?: string; paths?: string[] }) {
  const git = await gitForActive();
  const params: string[] = [];
  if (args.since) params.push(`${args.since}..HEAD`);
  if (args.paths && args.paths.length > 0) {
    params.push('--');
    params.push(...args.paths);
  }
  const text = await git.diff(params);
  return { diff: text };
}

export async function gitLog(args: { since?: string; n?: number; paths?: string[] }) {
  const git = await gitForActive();
  const options: Record<string, string | null> = {};
  if (args.n) options['-n'] = String(args.n);
  if (args.since) options['--since-rev'] = `${args.since}..HEAD`; // not a real option, handled below
  delete options['--since-rev'];

  const params: string[] = [];
  if (args.n) {
    params.push(`-n`);
    params.push(String(args.n));
  }
  if (args.since) {
    params.push(`${args.since}..HEAD`);
  }
  if (args.paths && args.paths.length > 0) {
    params.push('--');
    params.push(...args.paths);
  }
  const log = await git.log(params);
  return {
    total: log.total,
    commits: log.all.map((c) => ({
      sha: c.hash,
      date: c.date,
      author_name: c.author_name,
      author_email: c.author_email,
      message: c.message,
      refs: c.refs,
    })),
  };
}

export async function gitAdd(args: { paths: string[] }) {
  const git = await gitForActive();
  await git.add(args.paths);
  return { added: args.paths };
}

export async function gitCommit(args: { message: string }) {
  const git = await gitForActive();
  const result = await git.commit(args.message);
  return {
    sha: result.commit,
    branch: result.branch,
    summary: result.summary,
  };
}

export async function gitPush() {
  const git = await gitForActive();
  try {
    const result = await git.push();
    return {
      ok: true,
      update: result.update,
      pushed: result.pushed,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (/rejected|non-fast-forward|fetch first/i.test(message)) {
      return {
        error: 'rejected',
        reason: message,
      };
    }
    throw err;
  }
}
