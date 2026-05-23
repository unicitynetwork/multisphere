#!/usr/bin/env node
// End-to-end test for multisphere-mcp.
// Sets up a temp bare git repo + fake HOME, then drives every public module
// (workspace, git, fs, protocol) through a realistic scenario and asserts on
// the resulting filesystem state.
//
// Run via `make test` or `node scripts/test-e2e.mjs`.

import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..');
const MCP_DIST = path.join(REPO_ROOT, 'mcp-server', 'dist');

// Verify the server has been built.
try {
  await fs.access(path.join(MCP_DIST, 'index.js'));
} catch {
  console.error('✗ mcp-server/dist not found. Run `make build` first.');
  process.exit(1);
}

// Set up an isolated environment.
const tmpRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'multisphere-e2e-'));
const remoteDir = path.join(tmpRoot, 'remote.git');
const cloneDir = path.join(tmpRoot, 'clone');
const fakeHome = path.join(tmpRoot, 'home');
const configDir = path.join(fakeHome, '.multisphere');
const configPath = path.join(configDir, 'config.json');

await fs.mkdir(configDir, { recursive: true });
process.env.HOME = fakeHome;
// Make sure no env-var identity is leaking in from the parent shell.
delete process.env.MULTISPHERE_AGENT_ID;
delete process.env.MULTISPHERE_AGENT_NAME;
delete process.env.MULTISPHERE_AGENT_EMAIL;
delete process.env.MULTISPHERE_CLIENT;

// Create a bare remote and seed it with an initial commit.
execSync(`git init -b main --bare "${remoteDir}"`, { stdio: 'pipe' });
const seedDir = path.join(tmpRoot, 'seed');
await fs.mkdir(seedDir, { recursive: true });
execSync(`git init -b main "${seedDir}"`, { stdio: 'pipe' });
execSync(`git -C "${seedDir}" config user.email test@example.com`, { stdio: 'pipe' });
execSync(`git -C "${seedDir}" config user.name test`, { stdio: 'pipe' });
await fs.writeFile(path.join(seedDir, 'README.md'), '# Test workspace\n');
execSync(`git -C "${seedDir}" add README.md`, { stdio: 'pipe' });
execSync(`git -C "${seedDir}" commit -m "[init] seed"`, { stdio: 'pipe' });
execSync(`git -C "${seedDir}" remote add origin "${remoteDir}"`, { stdio: 'pipe' });
execSync(`git -C "${seedDir}" push -u origin main`, { stdio: 'pipe' });

// Seed config.
await fs.writeFile(
  configPath,
  JSON.stringify(
    {
      agent_id: 'jamie-claude-code',
      agent_name: 'Jamie',
      agent_email: 'jamie@unicity-labs.com',
      workspaces: {},
      active_workspace: null,
    },
    null,
    2,
  ),
);

// Dynamic imports so HOME override applies before module load.
const { workspaceInit, workspaceInfo } = await import(`${MCP_DIST}/workspace.js`);
const { journalAppend, inboxAdd, inboxClose, whatsNew } = await import(`${MCP_DIST}/protocol.js`);
const { fsWrite, fsRead, fsList } = await import(`${MCP_DIST}/fs-ops.js`);
const { gitAdd, gitCommit, gitStatus } = await import(`${MCP_DIST}/git-ops.js`);

let failures = 0;
function check(label, cond, detail) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`);
    failures++;
  }
}

console.log(`==> Working in ${tmpRoot}`);

// 1. workspace_init clones the bare repo and makes it active.
const init = await workspaceInit({
  name: 'test',
  remote_url: remoteDir,
  local_path: cloneDir,
});
check('workspace_init returns active workspace', init.active_workspace === 'test');

// 2. workspace_info reflects current HEAD.
const info = await workspaceInfo();
check('workspace_info returns agent_id', info.agent_id === 'jamie-claude-code');
check('workspace_info returns a HEAD sha', typeof info.head === 'string' && info.head.length >= 7);

// 3. journal_append writes a formatted entry.
await journalAppend({
  summary: 'Set up the workspace and added initial research notes.',
  todos: [
    { for: 'mike-claude-desktop', text: 'Review research note A' },
    { text: 'Find more comp data' },
  ],
});
const journal = (await fsRead({ path: 'journal.md' })).content;
check('journal contains agent id', journal.includes('jamie-claude-code (Jamie)'));
check('journal contains TODO @anyone', journal.includes('TODO @anyone: Find more comp data'));
check('journal contains targeted TODO', journal.includes('TODO @mike-claude-desktop'));

// 4. inbox_add returns ids in order INB-001, INB-002.
const inb1 = await inboxAdd({
  title: '2024 comp data missing',
  body: 'Need raise data for Series A AI infra deals 2024.',
});
const inb2 = await inboxAdd({
  title: 'Series A vs seed-stage comps',
  body: 'Pick one for slide 6.',
  for: 'mike-claude-desktop',
});
check('inbox_add ids are monotonic', inb1.id === 'INB-001' && inb2.id === 'INB-002');

// 5. Write a research file.
await fsWrite({
  path: 'research/comp-deals-q1.md',
  content: '# Comp deals — Q1\n\n- Foo raised X\n- Bar raised Y\n',
});
const research = await fsList({ dir: 'research' });
check('research file landed', research.entries.some((e) => e.name === 'comp-deals-q1.md'));

// 6. inbox_close moves to Closed section with strikethrough.
await inboxClose({ id: 'INB-001', resolution: 'Found in 2024 SaaS report' });
const inbox = (await fsRead({ path: 'inbox.md' })).content;
const [openSection, closedSection = ''] = inbox.split('## Closed');
check('closed item moved out of Open', !openSection.includes('INB-001'));
check('closed item present in Closed with strikethrough', closedSection.includes('~~INB-001'));
check('INB-002 still open', openSection.includes('INB-002'));

// 7. add + commit + push works end-to-end.
await gitAdd({ paths: ['research/comp-deals-q1.md', 'journal.md', 'inbox.md'] });
const commit = await gitCommit({
  message: '[jamie-claude-code] add research, open inbox INB-001/002, close INB-001',
});
check('commit returns a sha', typeof commit.sha === 'string' && commit.sha.length >= 7);

const status = await gitStatus();
check('working tree clean after commit', status.clean === true);

// 8. whats_new creates .pointers and reports first_visit.
const wn = await whatsNew();
check('whats_new reports first visit', wn.first_visit === true);
check('whats_new returns current sha', wn.current_sha === commit.sha);

const pointers = await fsList({ dir: '.pointers' });
check('pointer file created', pointers.entries.some((e) => e.name === 'jamie-claude-code.json'));

// 9. Identity refactor invariants.
const workspacesFileExists = await fs
  .stat(path.join(configDir, 'workspaces.json'))
  .then(() => true)
  .catch(() => false);
check('workspaces.json was written by saveConfig', workspacesFileExists);

const legacyConfig = JSON.parse(await fs.readFile(configPath, 'utf8'));
check(
  'legacy config.json identity preserved (not overwritten)',
  legacyConfig.agent_id === 'jamie-claude-code',
);

// 10. Identity resolution: env var wins over file.
const { resolveIdentity } = await import(`${MCP_DIST}/config.js`);
process.env.MULTISPHERE_AGENT_ID = 'jamie-cowork';
process.env.MULTISPHERE_AGENT_NAME = 'Jamie (Cowork)';
process.env.MULTISPHERE_AGENT_EMAIL = 'jamie@unicity-labs.com';
const envIdentity = await resolveIdentity();
check('env vars override file identity', envIdentity.agent_id === 'jamie-cowork');

delete process.env.MULTISPHERE_AGENT_ID;
delete process.env.MULTISPHERE_AGENT_NAME;
delete process.env.MULTISPHERE_AGENT_EMAIL;

// 11. Identity resolution: per-client file beats default + legacy.
await fs.writeFile(
  path.join(configDir, 'identity.cowork.json'),
  JSON.stringify({
    agent_id: 'jamie-cowork',
    agent_name: 'Jamie via Cowork',
    agent_email: 'jamie@unicity-labs.com',
  }),
);
process.env.MULTISPHERE_CLIENT = 'cowork';
const coworkIdentity = await resolveIdentity();
check(
  'per-client identity.cowork.json beats config.json',
  coworkIdentity.agent_id === 'jamie-cowork' && coworkIdentity.agent_name === 'Jamie via Cowork',
);
delete process.env.MULTISPHERE_CLIENT;

// 12. Identity resolution: default identity.json with user_slug + client derives agent_id.
await fs.writeFile(
  path.join(configDir, 'identity.json'),
  JSON.stringify({
    user_slug: 'jamie',
    agent_name: 'Jamie',
    agent_email: 'jamie@unicity-labs.com',
  }),
);
process.env.MULTISPHERE_CLIENT = 'claude-desktop';
const derived = await resolveIdentity();
check(
  'identity.json + MULTISPHERE_CLIENT derives <user_slug>-<client>',
  derived.agent_id === 'jamie-claude-desktop',
);
delete process.env.MULTISPHERE_CLIENT;

// 13. Detected clientInfo (from MCP initialize) drives derivation when env var is unset.
const { setDetectedClient, normalizeClientName } = await import(`${MCP_DIST}/config.js`);

check('normalize: claude-ai → cowork', normalizeClientName('claude-ai') === 'cowork');
check('normalize: claude-desktop → cowork', normalizeClientName('claude-desktop') === 'cowork');
check('normalize: Claude Code 2.x → claude-code', normalizeClientName('Claude Code 2.x') === 'claude-code');
check('normalize: unknown client stays as slug', normalizeClientName('SomeOtherClient/1.0') === 'someotherclient-1-0');

setDetectedClient('claude-ai');
const cwAuto = await resolveIdentity();
check(
  'detected claude-ai + user_slug → jamie-cowork (no env var needed)',
  cwAuto.agent_id === 'jamie-cowork',
);

delete process.env.XPC_SERVICE_NAME;
setDetectedClient('claude-code');
const ccAuto = await resolveIdentity();
check(
  'detected claude-code (no XPC) + user_slug → jamie-claude-code',
  ccAuto.agent_id === 'jamie-claude-code',
);

// 13b. Cowork fingerprint via CLAUDE_PLUGIN_ROOT promotes claude-code → cowork.
process.env.CLAUDE_PLUGIN_ROOT = '/var/folders/x/T/claude-hostloop-plugins/abcd1234';
setDetectedClient('claude-code');
const ccUnderCowork = await resolveIdentity();
check(
  'CLAUDE_PLUGIN_ROOT contains claude-hostloop-plugins → jamie-cowork',
  ccUnderCowork.agent_id === 'jamie-cowork',
);
delete process.env.CLAUDE_PLUGIN_ROOT;

// 13c. local-agent-mode-sessions in CLAUDE_PROJECT_DIR is also a Cowork signal.
process.env.CLAUDE_PROJECT_DIR = '/Users/jamie/Library/Application Support/Claude/local-agent-mode-sessions/sess/profile/outputs';
setDetectedClient('claude-code');
const ccUnderCoworkViaProjectDir = await resolveIdentity();
check(
  'CLAUDE_PROJECT_DIR contains local-agent-mode-sessions → jamie-cowork',
  ccUnderCoworkViaProjectDir.agent_id === 'jamie-cowork',
);
delete process.env.CLAUDE_PROJECT_DIR;

// 13d. Cowork fingerprint does NOT affect non-claude-code clients.
process.env.CLAUDE_PLUGIN_ROOT = '/var/folders/x/T/claude-hostloop-plugins/abcd1234';
setDetectedClient('some-other-client');
const otherUnderCowork = await resolveIdentity();
check(
  'Cowork fingerprint does not promote unrelated clients',
  otherUnderCowork.agent_id === 'jamie-some-other-client',
);
delete process.env.CLAUDE_PLUGIN_ROOT;

// 14. Env var still wins over detected client.
setDetectedClient('claude-ai');
process.env.MULTISPHERE_CLIENT = 'claude-code';
const envBeatsAuto = await resolveIdentity();
check(
  'MULTISPHERE_CLIENT env beats detected client',
  envBeatsAuto.agent_id === 'jamie-claude-code',
);

// 15. Empty MULTISPHERE_CLIENT (the .mcp.json placeholder) is treated as unset
//     and falls through to the detected client — so users in Cowork get the
//     detected value automatically unless they fill in the field explicitly.
setDetectedClient('claude-ai');
process.env.MULTISPHERE_CLIENT = '';
const emptyFallsThrough = await resolveIdentity();
check(
  'empty MULTISPHERE_CLIENT falls through to detected (jamie-cowork)',
  emptyFallsThrough.agent_id === 'jamie-cowork',
);
process.env.MULTISPHERE_CLIENT = '   '; // whitespace only
const whitespaceFallsThrough = await resolveIdentity();
check(
  'whitespace-only MULTISPHERE_CLIENT also treated as unset',
  whitespaceFallsThrough.agent_id === 'jamie-cowork',
);

delete process.env.MULTISPHERE_CLIENT;
setDetectedClient(undefined);

if (failures > 0) {
  console.error(`\n✗ ${failures} check(s) failed`);
  process.exit(1);
}
console.log(`\n✅ All checks passed (workdir: ${tmpRoot})`);
