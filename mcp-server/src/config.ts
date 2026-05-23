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

/**
 * Client name detected from the MCP `initialize` handshake (clientInfo.name).
 * Captured by src/index.ts's oninitialized hook. Used as a fallback for
 * MULTISPHERE_CLIENT when the env var isn't set — so users only need
 * user_slug in identity.json and the per-client distinction happens
 * automatically across Cowork, Claude Code, etc.
 */
let detectedClient: string | undefined;

/**
 * Normalize an MCP clientInfo.name into the client-slug we use for
 * identity files and agent_id suffixes. Known clients get friendly names;
 * unknown clients fall back to a lowercased, hyphenated form.
 */
export function normalizeClientName(name: string): string {
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  // Cowork (and Claude Desktop) identify themselves as "claude-ai" over MCP.
  // We map both to "cowork" because (a) Cowork is the supported Desktop form
  // factor for multisphere, and (b) the user is already using "jamie-cowork"
  // style agent_ids in journals and inboxes.
  if (slug === 'claude-ai' || slug === 'claude-app' || slug === 'claude-desktop') {
    return 'cowork';
  }
  if (slug.startsWith('claude-code')) return 'claude-code';
  return slug;
}

/**
 * Detect Cowork-hosted Claude Code via filesystem-path fingerprint.
 *
 * Cowork hosts its own Claude Code agent that identifies itself over MCP
 * as `claude-code` — same as the bare CLI. The MCP `initialize` handshake
 * alone can't distinguish them. But Cowork spawns plugin MCP servers with
 * environment vars containing the path `claude-hostloop-plugins` (its
 * host-side plugin staging dir at `$TMPDIR/claude-hostloop-plugins/…`).
 * Bare-CLI Claude Code doesn't use that path.
 *
 * Empirically verified by running v0.1.5's diagnostic dump in both surfaces:
 *   Cowork: CLAUDE_PLUGIN_ROOT=/var/folders/.../claude-hostloop-plugins/...
 *   Bare CLI: CLAUDE_PLUGIN_ROOT unset or set to a non-hostloop path
 *
 * Also: cwd / CLAUDE_PROJECT_DIR in Cowork contain
 * `local-agent-mode-sessions` — kept as a secondary signal.
 */
function isCoworkHostedEnvironment(): boolean {
  const candidates = [
    process.env.CLAUDE_PLUGIN_ROOT ?? '',
    process.env.CLAUDE_PLUGIN_DATA ?? '',
    process.env.CLAUDE_PROJECT_DIR ?? '',
    process.cwd(),
  ];
  return candidates.some(
    (p) => p.includes('claude-hostloop-plugins') || p.includes('local-agent-mode-sessions'),
  );
}

export function setDetectedClient(name: string | undefined): void {
  if (!name) {
    detectedClient = undefined;
    return;
  }
  let normalized = normalizeClientName(name);
  // Promote Cowork-hosted Claude Code → "cowork" via the XPC fingerprint.
  if (normalized === 'claude-code' && isCoworkHostedEnvironment()) {
    normalized = 'cowork';
  }
  detectedClient = normalized;
}

export function getDetectedClient(): string | undefined {
  return detectedClient;
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

  // Env var wins over auto-detection (and lets users in Cowork override the
  // detected client via the connector UI). Empty string is treated as unset
  // so .mcp.json can declare an empty placeholder field without forcing it.
  const envClient = process.env.MULTISPHERE_CLIENT?.trim();
  const client = (envClient && envClient.length > 0) ? envClient : detectedClient;

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
    const envClient = process.env.MULTISPHERE_CLIENT?.trim();
    const envSet = envClient && envClient.length > 0;
    const client = envSet ? envClient : detectedClient;
    const sourceNote = envSet
      ? `MULTISPHERE_CLIENT=${envClient}`
      : detectedClient
        ? `auto-detected client="${detectedClient}" from MCP clientInfo`
        : 'no MULTISPHERE_CLIENT env var and no client detected from MCP handshake yet';
    const hint = client
      ? `Detected ${sourceNote}. Either create ~/.multisphere/identity.${client}.json with {agent_id, agent_name, agent_email}, OR create ~/.multisphere/identity.json with {user_slug, agent_name, agent_email} (the server will derive agent_id as <user_slug>-${client}).`
      : `${sourceNote}. Set MULTISPHERE_AGENT_ID/_NAME/_EMAIL env vars, or create ~/.multisphere/identity.json with explicit {agent_id, agent_name, agent_email}.`;
    throw new Error(`Agent identity not configured. ${hint}`);
  }
}

export { CONFIG_DIR, WORKSPACES_FILE, DEFAULT_IDENTITY_FILE, LEGACY_CONFIG_FILE };
