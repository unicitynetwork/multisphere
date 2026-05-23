import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type {
  Identity,
  IdentityFile,
  MultisphereConfig,
  WorkspaceConfig,
  WorkspacesFile,
} from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.multisphere');
const WORKSPACES_FILE = path.join(CONFIG_DIR, 'workspaces.json');
const DEFAULT_IDENTITY_FILE = path.join(CONFIG_DIR, 'identity.json');
const LEGACY_CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function clientIdentityPath(client: string): string {
  return path.join(CONFIG_DIR, `identity.${client}.json`);
}

const EMPTY_IDENTITY: Identity = { agent_id: '', agent_name: '', agent_email: '' };

const EMPTY_WORKSPACES: WorkspacesFile = { workspaces: {}, active_workspace: null };

async function readJson<T>(p: string): Promise<T | null> {
  try {
    const raw = await fs.readFile(p, 'utf8');
    return JSON.parse(raw) as T;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }
}

async function writeJson(p: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(value, null, 2) + '\n', 'utf8');
}

/**
 * Resolve the active agent identity. Precedence:
 *  1. MULTISPHERE_AGENT_ID/_NAME/_EMAIL env vars (set by MCPB user_config, tests, or shell)
 *  2. ~/.multisphere/identity.<MULTISPHERE_CLIENT>.json (per-client identity file)
 *  3. ~/.multisphere/identity.json — optionally combined with MULTISPHERE_CLIENT to
 *     derive agent_id as `<user_slug>-<client>` when no explicit agent_id is set
 *  4. ~/.multisphere/config.json (legacy single-identity file, read-only)
 *  5. Empty — assertIdentity will then throw a useful error.
 *
 * Importantly, identity sourced from env vars is never written back to disk.
 */
export async function resolveIdentity(): Promise<Identity> {
  const envId = process.env.MULTISPHERE_AGENT_ID;
  const envName = process.env.MULTISPHERE_AGENT_NAME;
  const envEmail = process.env.MULTISPHERE_AGENT_EMAIL;
  if (envId && envName && envEmail) {
    return { agent_id: envId, agent_name: envName, agent_email: envEmail };
  }

  const client = process.env.MULTISPHERE_CLIENT;

  if (client) {
    const perClient = await readJson<IdentityFile>(clientIdentityPath(client));
    if (perClient?.agent_id && perClient.agent_name && perClient.agent_email) {
      return {
        agent_id: perClient.agent_id,
        agent_name: perClient.agent_name,
        agent_email: perClient.agent_email,
      };
    }
  }

  const def = await readJson<IdentityFile>(DEFAULT_IDENTITY_FILE);
  if (def) {
    if (def.agent_id && def.agent_name && def.agent_email) {
      return {
        agent_id: def.agent_id,
        agent_name: def.agent_name,
        agent_email: def.agent_email,
      };
    }
    if (def.user_slug && client && def.agent_name && def.agent_email) {
      return {
        agent_id: `${def.user_slug}-${client}`,
        agent_name: def.agent_name,
        agent_email: def.agent_email,
      };
    }
  }

  const legacy = await readJson<Identity>(LEGACY_CONFIG_FILE);
  if (legacy?.agent_id && legacy.agent_name && legacy.agent_email) {
    return {
      agent_id: legacy.agent_id,
      agent_name: legacy.agent_name,
      agent_email: legacy.agent_email,
    };
  }

  return { ...EMPTY_IDENTITY };
}

/**
 * Load the workspace registry. Reads workspaces.json; falls back to the legacy
 * config.json's `workspaces`/`active_workspace` fields if workspaces.json is
 * absent.
 */
export async function loadWorkspaces(): Promise<WorkspacesFile> {
  const fresh = await readJson<WorkspacesFile>(WORKSPACES_FILE);
  if (fresh) {
    return {
      workspaces: fresh.workspaces ?? {},
      active_workspace: fresh.active_workspace ?? null,
    };
  }
  const legacy = await readJson<WorkspacesFile>(LEGACY_CONFIG_FILE);
  if (legacy) {
    return {
      workspaces: legacy.workspaces ?? {},
      active_workspace: legacy.active_workspace ?? null,
    };
  }
  return { ...EMPTY_WORKSPACES };
}

export async function saveWorkspaces(ws: WorkspacesFile): Promise<void> {
  await writeJson(WORKSPACES_FILE, ws);
}

/**
 * Convenience: load identity + workspaces into one bundle.
 * Code that historically used loadConfig() / saveConfig() keeps working.
 */
export async function loadConfig(): Promise<MultisphereConfig> {
  const identity = await resolveIdentity();
  const ws = await loadWorkspaces();
  return { ...identity, ...ws };
}

/**
 * Persist ONLY workspace data. Identity is never written from this path —
 * it would clobber another client's identity file. To change identity, edit
 * the relevant identity file directly.
 */
export async function saveConfig(cfg: MultisphereConfig): Promise<void> {
  await saveWorkspaces({
    workspaces: cfg.workspaces,
    active_workspace: cfg.active_workspace,
  });
}

export function getActiveWorkspace(
  cfg: MultisphereConfig,
): { name: string; ws: WorkspaceConfig } {
  if (!cfg.active_workspace) {
    throw new Error('No active workspace. Call workspace_switch or workspace_init first.');
  }
  const ws = cfg.workspaces[cfg.active_workspace];
  if (!ws) {
    throw new Error(`Active workspace "${cfg.active_workspace}" not found in config.`);
  }
  return { name: cfg.active_workspace, ws };
}

export function assertIdentity(cfg: MultisphereConfig): void {
  if (!cfg.agent_id || !cfg.agent_name || !cfg.agent_email) {
    const client = process.env.MULTISPHERE_CLIENT;
    const hint = client
      ? `Create ~/.multisphere/identity.${client}.json with {agent_id, agent_name, agent_email}, OR create ~/.multisphere/identity.json with {user_slug, agent_name, agent_email} for auto-derivation, OR set MULTISPHERE_AGENT_ID/_NAME/_EMAIL env vars.`
      : 'Set MULTISPHERE_AGENT_ID/_NAME/_EMAIL env vars (MCPB user_config does this), or create ~/.multisphere/identity.json with {agent_id, agent_name, agent_email}.';
    throw new Error(`Agent identity not configured. ${hint}`);
  }
}

export { CONFIG_DIR, WORKSPACES_FILE, DEFAULT_IDENTITY_FILE, LEGACY_CONFIG_FILE };
