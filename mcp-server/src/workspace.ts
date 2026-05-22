import { promises as fs } from 'node:fs';
import path from 'node:path';
import { simpleGit } from 'simple-git';
import { loadConfig, saveConfig, assertIdentity, getActiveWorkspace } from './config.js';

export async function workspaceInit(args: { name: string; remote_url: string; local_path: string }) {
  const cfg = await loadConfig();
  assertIdentity(cfg);

  const localPath = path.resolve(args.local_path.replace(/^~/, process.env.HOME ?? ''));
  await fs.mkdir(path.dirname(localPath), { recursive: true });

  let alreadyExisted = false;
  try {
    const stat = await fs.stat(localPath);
    if (stat.isDirectory()) {
      const entries = await fs.readdir(localPath);
      if (entries.length > 0) {
        // Treat as existing clone — verify it's a git repo.
        const git = simpleGit(localPath);
        const isRepo = await git.checkIsRepo();
        if (!isRepo) {
          throw new Error(`local_path "${localPath}" exists and is non-empty but not a git repo`);
        }
        alreadyExisted = true;
      }
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
  }

  if (!alreadyExisted) {
    await fs.mkdir(localPath, { recursive: true });
    const git = simpleGit();
    await git.clone(args.remote_url, localPath);
  }

  // Configure local git identity for this clone.
  const git = simpleGit(localPath);
  await git.addConfig('user.name', cfg.agent_name, false, 'local');
  await git.addConfig('user.email', cfg.agent_email, false, 'local');

  cfg.workspaces[args.name] = {
    remote: args.remote_url,
    local_path: localPath,
  };
  if (!cfg.active_workspace) cfg.active_workspace = args.name;
  await saveConfig(cfg);

  return {
    name: args.name,
    local_path: localPath,
    remote: args.remote_url,
    already_existed: alreadyExisted,
    active_workspace: cfg.active_workspace,
  };
}

export async function workspaceList() {
  const cfg = await loadConfig();
  return {
    active_workspace: cfg.active_workspace,
    workspaces: Object.entries(cfg.workspaces).map(([name, ws]) => ({
      name,
      remote: ws.remote,
      local_path: ws.local_path,
      active: name === cfg.active_workspace,
    })),
  };
}

export async function workspaceSwitch(args: { name: string }) {
  const cfg = await loadConfig();
  if (!cfg.workspaces[args.name]) {
    throw new Error(`workspace "${args.name}" is not registered. Call workspace_init first.`);
  }
  cfg.active_workspace = args.name;
  await saveConfig(cfg);
  return { active_workspace: args.name };
}

export async function workspaceInfo() {
  const cfg = await loadConfig();
  const { name, ws } = getActiveWorkspace(cfg);
  const git = simpleGit(ws.local_path);
  let head = '';
  let branch = '';
  try {
    head = (await git.revparse(['HEAD'])).trim();
    branch = (await git.revparse(['--abbrev-ref', 'HEAD'])).trim();
  } catch {
    // empty repo or detached state
  }
  return {
    name,
    local_path: ws.local_path,
    remote: ws.remote,
    head,
    branch,
    agent_id: cfg.agent_id,
  };
}
