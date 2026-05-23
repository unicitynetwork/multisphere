#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { workspaceInit, workspaceList, workspaceSwitch, workspaceInfo } from './workspace.js';
import {
  gitFetch,
  gitPull,
  gitStatus,
  gitDiff,
  gitLog,
  gitAdd,
  gitCommit,
  gitPush,
} from './git-ops.js';
import { fsRead, fsWrite, fsList, fsSearch } from './fs-ops.js';
import { journalAppend, inboxAdd, inboxClose, whatsNew } from './protocol.js';
import { setDetectedClient } from './config.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = join(__dirname, '..', 'package.json');
const VERSION: string = (JSON.parse(readFileSync(pkgPath, 'utf8')) as { version: string }).version;

const server = new McpServer({
  name: 'multisphere',
  version: VERSION,
});

// Capture clientInfo from the MCP handshake so identity resolution can
// auto-derive `<user_slug>-<client>` without the user setting MULTISPHERE_CLIENT.
// Fires once, after the client sends `notifications/initialized`.
server.server.oninitialized = () => {
  const info = server.server.getClientVersion();
  if (info?.name) {
    setDetectedClient(info.name);
    process.stderr.write(`multisphere-mcp: client="${info.name}" version="${info.version ?? '?'}"\n`);
  }
};

function toResult(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }],
  };
}

function toError(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: 'text' as const, text: JSON.stringify({ error: message }, null, 2) }],
  };
}

function wrap<TArgs>(fn: (args: TArgs) => Promise<unknown>) {
  return async (args: TArgs) => {
    try {
      const result = await fn(args);
      return toResult(result);
    } catch (err) {
      return toError(err);
    }
  };
}

// ---- Workspace management ----

server.tool(
  'workspace_init',
  'Clone a remote workspace (or register an existing local clone) and make it active.',
  {
    name: z.string().describe('Short local name for the workspace (e.g. "sif-pitch")'),
    remote_url: z.string().describe('Git remote URL'),
    local_path: z.string().describe('Absolute local path where the clone should live'),
  },
  wrap(async (args: { name: string; remote_url: string; local_path: string }) =>
    workspaceInit(args),
  ),
);

server.tool(
  'workspace_list',
  'List all configured workspaces and which one is active.',
  {},
  wrap(async () => workspaceList()),
);

server.tool(
  'workspace_switch',
  'Switch the active workspace by name.',
  {
    name: z.string().describe('Name of a previously configured workspace'),
  },
  wrap(async (args: { name: string }) => workspaceSwitch(args)),
);

server.tool(
  'workspace_info',
  'Return name, path, remote, current HEAD, and branch of the active workspace.',
  {},
  wrap(async () => workspaceInfo()),
);

// ---- Git operations (scoped to active workspace) ----

server.tool('fetch', 'Run `git fetch` on the active workspace.', {}, wrap(async () => gitFetch()));

server.tool(
  'pull',
  'Fast-forward pull on the active workspace. On conflict, returns {error: "conflict", ...} without merging.',
  {},
  wrap(async () => gitPull()),
);

server.tool(
  'status',
  'Return working-tree status for the active workspace.',
  {},
  wrap(async () => gitStatus()),
);

server.tool(
  'diff',
  'Return a unified diff for the active workspace.',
  {
    since: z.string().optional().describe('Base ref (default: working-tree diff)'),
    paths: z.array(z.string()).optional().describe('Restrict to these paths'),
  },
  wrap(async (args: { since?: string; paths?: string[] }) => gitDiff(args)),
);

server.tool(
  'log',
  'Return git log entries for the active workspace.',
  {
    since: z.string().optional().describe('Show commits since this ref'),
    n: z.number().int().positive().optional().describe('Limit number of commits'),
    paths: z.array(z.string()).optional(),
  },
  wrap(async (args: { since?: string; n?: number; paths?: string[] }) => gitLog(args)),
);

server.tool(
  'add',
  'Stage one or more paths for commit.',
  {
    paths: z.array(z.string()).describe('Paths to stage'),
  },
  wrap(async (args: { paths: string[] }) => gitAdd(args)),
);

server.tool(
  'commit',
  'Create a commit. The skill convention is to format the message as "[agent-id] <summary>".',
  {
    message: z.string().describe('Commit message'),
  },
  wrap(async (args: { message: string }) => gitCommit(args)),
);

server.tool(
  'push',
  'Push the current branch to the configured remote. On rejection (non-fast-forward), returns {error: "rejected", reason}.',
  {},
  wrap(async () => gitPush()),
);

// ---- Filesystem (scoped to workspace root) ----

server.tool(
  'read',
  'Read a UTF-8 file inside the active workspace.',
  {
    path: z.string().describe('Path relative to workspace root'),
  },
  wrap(async (args: { path: string }) => fsRead(args)),
);

server.tool(
  'write',
  'Write or append to a UTF-8 file inside the active workspace.',
  {
    path: z.string().describe('Path relative to workspace root'),
    content: z.string(),
    mode: z.enum(['overwrite', 'append']).optional().describe('Default: overwrite'),
  },
  wrap(async (args: { path: string; content: string; mode?: 'overwrite' | 'append' }) =>
    fsWrite(args),
  ),
);

server.tool(
  'list',
  'List entries in a directory inside the active workspace.',
  {
    dir: z.string().describe('Directory path relative to workspace root (use "." for root)'),
  },
  wrap(async (args: { dir: string }) => fsList(args)),
);

server.tool(
  'search',
  'Substring search across text files in the active workspace.',
  {
    query: z.string().describe('Literal substring to search for'),
    paths: z.array(z.string()).optional().describe('Restrict to these paths (default: workspace root)'),
  },
  wrap(async (args: { query: string; paths?: string[] }) => fsSearch(args)),
);

// ---- Protocol helpers ----

server.tool(
  'journal_append',
  'Append a signed, timestamped entry to journal.md.',
  {
    summary: z.string().describe('One- or two-line summary of what you did'),
    details: z.string().optional().describe('Optional longer body'),
    todos: z
      .array(
        z.object({
          for: z.string().optional().describe('Agent id (omit for @anyone)'),
          text: z.string(),
        }),
      )
      .optional()
      .describe('Open TODOs left behind'),
  },
  wrap(
    async (args: {
      summary: string;
      details?: string;
      todos?: Array<{ for?: string; text: string }>;
    }) => journalAppend(args),
  ),
);

server.tool(
  'inbox_add',
  'Add an open item to inbox.md. Returns the assigned INB-NNN id.',
  {
    title: z.string().describe('Short item title'),
    body: z.string().optional().describe('Longer description'),
    for: z.string().optional().describe('Agent id this is addressed to (omit for @anyone)'),
  },
  wrap(async (args: { title: string; body?: string; for?: string }) => inboxAdd(args)),
);

server.tool(
  'inbox_close',
  'Close an open inbox item by INB-NNN id and record the resolution.',
  {
    id: z.string().describe('Inbox item id, e.g. "INB-014"'),
    resolution: z.string().describe('How it was resolved'),
    journal_ref: z.string().optional().describe('Optional journal entry timestamp'),
  },
  wrap(async (args: { id: string; resolution: string; journal_ref?: string }) =>
    inboxClose(args),
  ),
);

server.tool(
  'whats_new',
  'Diff from this agent\'s last-read pointer to current HEAD. Returns new commits and changed files, and updates the pointer.',
  {},
  wrap(async () => whatsNew()),
);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Stderr only — stdout is reserved for MCP framing.
  process.stderr.write(`multisphere-mcp ${VERSION} listening on stdio\n`);
}

main().catch((err) => {
  process.stderr.write(`fatal: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`);
  process.exit(1);
});
