export interface WorkspaceConfig {
  remote: string;
  local_path: string;
}

export interface MultisphereConfig {
  agent_id: string;
  agent_name: string;
  agent_email: string;
  workspaces: Record<string, WorkspaceConfig>;
  active_workspace: string | null;
}

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
