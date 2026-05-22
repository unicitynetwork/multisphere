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

export async function loadConfig(): Promise<MultisphereConfig> {
  try {
    const raw = await fs.readFile(CONFIG_FILE, 'utf8');
    const parsed = JSON.parse(raw) as MultisphereConfig;
    return { ...DEFAULT_CONFIG, ...parsed };
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return { ...DEFAULT_CONFIG };
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
      'Agent identity not configured. Edit ~/.multisphere/config.json to set agent_id, agent_name, and agent_email.',
    );
  }
}

export { CONFIG_DIR, CONFIG_FILE };
