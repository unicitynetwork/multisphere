export interface WorkspaceConfig {
  remote: string;
  local_path: string;
}

export interface Identity {
  agent_id: string;
  agent_name: string;
  agent_email: string;
}

export interface IdentityFile extends Identity {
  // Optional fields used for client-suffix derivation:
  user_slug?: string;
}

export interface WorkspacesFile {
  workspaces: Record<string, WorkspaceConfig>;
  active_workspace: string | null;
}

/**
 * The composite config object the rest of the server works with.
 * Identity is resolved separately from the workspace store; this type
 * exists only as a convenient bundle returned from loadConfig().
 */
export interface MultisphereConfig extends Identity, WorkspacesFile {}

export interface PointerFile {
  last_seen_sha: string;
  last_read_at: string;
}

export interface JournalTodo {
  for?: string;
  text: string;
}

export interface InboxItem {
  id: string;
  for: string;
  title: string;
  body?: string;
  added_at: string;
  added_by: string;
}
