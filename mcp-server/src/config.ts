import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { MultisphereConfig, WorkspaceConfig } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.multisphere');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

const DEFAULT_CONFIG: MultisphereConfig = {
  agent_id: '',
  agent_name: '',
  agent_email: '',
  workspaces: {},
  active_workspace: null,
};

function applyEnvOverrides(cfg: MultisphereConfig): MultisphereConfig {
  // Env vars override the JSON file. This is how MCPB user_config flows in
  // (Cowork / Claude-Desktop-style clients), and it's also useful for testing.
  const id = process.env.MULTISPHERE_AGENT_ID;
  const name = process.env.MULTISPHERE_AGENT_NAME;
  const email = process.env.MULTISPHERE_AGENT_EMAIL;
  return {
    ...cfg,
    agent_id: id && id.length > 0 ? id : cfg.agent_id,
    agent_name: name && name.length > 0 ? name : cfg.agent_name,
    agent_email: email && email.length > 0 ? email : cfg.agent_email,
  };
}

export async function loadConfig(): Promise<MultisphereConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as MultisphereConfig;
    return applyEnvOverrides({ ...DEFAULT_CONFIG, ...parsed });
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return applyEnvOverrides({ ...DEFAULT_CONFIG });
    }
    throw err;
  }
}

export async function saveConfig(cfg: MultisphereConfig): Promise<void> {
  await fs.mkdir(CONFIG_DIR, { recursive: true });
  await fs.writeFile(CONFIG_FILE, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
}

export function getActiveWorkspace(cfg: MultisphereConfig): { name: string; ws: WorkspaceConfig } {
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
    throw new Error(
      'Agent identity not configured. Either set MULTISPHERE_AGENT_ID/_NAME/_EMAIL env vars (Cowork / MCPB user_config does this for you), or populate ~/.multisphere/config.json.',
    );
  }
}

export { CONFIG_DIR, CONFIG_FILE };
