import { getLinkedGitHubToken } from './connections.ts';
import { pool } from './database.ts';

type Json = Record<string, any>;
const API = 'https://api.github.com';
const API_VERSION = '2022-11-28';

const definitions = [
  {
    type: 'function',
    function: {
      name: 'github_list_repositories',
      description: 'Capability category: coding. List repositories accessible to the signed-in user, including private repositories granted by their GitHub connection.',
      parameters: { type: 'object', properties: {
        visibility: { type: 'string', enum: ['all', 'public', 'private'], description: 'Repository visibility filter.' },
        sort: { type: 'string', enum: ['updated', 'pushed', 'created', 'full_name'], description: 'Sort order.' },
        page: { type: 'integer', minimum: 1, maximum: 100 },
        per_page: { type: 'integer', minimum: 1, maximum: 50 },
      }, additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_repository',
      description: 'Capability category: coding. Read metadata and default branch for one repository the user can access.',
      parameters: { type: 'object', properties: {
        owner: { type: 'string' }, repo: { type: 'string' },
      }, required: ['owner', 'repo'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_list_branches',
      description: 'Capability category: coding. List branches in an accessible repository.',
      parameters: { type: 'object', properties: {
        owner: { type: 'string' }, repo: { type: 'string' },
        per_page: { type: 'integer', minimum: 1, maximum: 50 },
      }, required: ['owner', 'repo'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_file',
      description: 'Capability category: coding. Read a text file or list a directory in an accessible GitHub repository. Do not request secrets, environment files, private keys, or credential files.',
      parameters: { type: 'object', properties: {
        owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' },
        ref: { type: 'string', description: 'Optional branch, tag, or commit.' },
      }, required: ['owner', 'repo', 'path'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_search_code',
      description: 'Capability category: coding. Search code within a specific accessible repository. Returns matching file paths and links; fetch a file separately to inspect its contents.',
      parameters: { type: 'object', properties: {
        owner: { type: 'string' }, repo: { type: 'string' }, query: { type: 'string' },
        per_page: { type: 'integer', minimum: 1, maximum: 30 },
      }, required: ['owner', 'repo', 'query'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_get_repository_tree',
      description: 'Capability category: coding. Inspect the tracked file and directory structure of an accessible repository before making architectural or code changes. Returns bounded paths and file sizes; it does not read file contents. Use github_get_file for selected files.',
      parameters: { type: 'object', properties: {
        owner: { type: 'string' }, repo: { type: 'string' },
        ref: { type: 'string', description: 'Optional branch, tag, or commit. Defaults to the repository default branch.' },
        path_prefix: { type: 'string', description: 'Optional directory or file path prefix to inspect a specific part of a large repository.' },
        limit: { type: 'integer', minimum: 20, maximum: 120 },
      }, required: ['owner', 'repo'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_compare_branches',
      description: 'Capability category: coding. Compare two branches, tags, or commit references in an accessible repository for code review. Returns commit summaries, ahead/behind counts, changed file statistics, and bounded patch excerpts. Read full files with github_get_file when needed.',
      parameters: { type: 'object', properties: {
        owner: { type: 'string' }, repo: { type: 'string' },
        base: { type: 'string' }, head: { type: 'string' },
      }, required: ['owner', 'repo', 'base', 'head'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_branch',
      description: 'Capability category: coding. Create a new branch from the repository default branch or a supplied base branch. Use this before changing files; never create the working branch directly on the default branch.',
      parameters: { type: 'object', properties: {
        owner: { type: 'string' }, repo: { type: 'string' }, branch: { type: 'string' },
        base: { type: 'string', description: 'Optional base branch; defaults to the repository default branch.' },
      }, required: ['owner', 'repo', 'branch'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_update_file',
      description: 'Capability category: coding. Create or update one text file with a Git commit on an existing non-default branch. This changes the repository; only call when the user explicitly asked to edit or create the file. The branch must first be created with github_create_branch. Never edit secrets or environment files.',
      parameters: { type: 'object', properties: {
        owner: { type: 'string' }, repo: { type: 'string' }, path: { type: 'string' },
        branch: { type: 'string' }, content: { type: 'string' }, message: { type: 'string' },
      }, required: ['owner', 'repo', 'path', 'branch', 'content', 'message'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_commit_files',
      description: 'Capability category: coding. Atomically commit a related set of text-file additions or updates to an existing non-default working branch using the GitHub Git Data API. Supports up to 12 files and a bounded total payload. Never use on the default branch; this changes the repository and must be explicitly requested by the user.',
      parameters: { type: 'object', properties: {
        owner: { type: 'string' }, repo: { type: 'string' },
        branch: { type: 'string' }, message: { type: 'string' },
        files: { type: 'array', minItems: 1, maxItems: 12, items: {
          type: 'object', properties: {
            path: { type: 'string' },
            content: { type: 'string' },
          }, required: ['path', 'content'], additionalProperties: false,
        } },
      }, required: ['owner', 'repo', 'branch', 'message', 'files'], additionalProperties: false },
    },
  },
  {
    type: 'function',
    function: {
      name: 'github_create_pull_request',
      description: 'Capability category: coding. Open a pull request from a completed working branch into a base branch. This is an external state change; only call when the user explicitly asked to submit the changes for review.',
      parameters: { type: 'object', properties: {
        owner: { type: 'string' }, repo: { type: 'string' }, title: { type: 'string' },
        head: { type: 'string' }, base: { type: 'string' }, body: { type: 'string' },
        draft: { type: 'boolean' },
      }, required: ['owner', 'repo', 'title', 'head', 'base'], additionalProperties: false },
    },
  },
] as const;

function objectArgs(value: unknown): Json {
  if (!value || typeof value !== 'object' || Array.isArray(value) || JSON.stringify(value).length > 140_000) {
    throw new Error('GitHub tool arguments are invalid or too large.');
  }
  return value as Json;
}
function requiredText(args: Json, key: string, max = 200): string {
  const value = typeof args[key] === 'string' ? args[key].trim() : '';
  if (!value || value.length > max) throw new Error('A valid ' + key + ' value is required.');
  return value;
}
function requiredContent(args: Json, key: string, max: number): string {
  const value = args[key];
  if (typeof value !== 'string' || value.length > max) throw new Error('A valid ' + key + ' value is required.');
  return value;
}
function optionalText(args: Json, key: string, max = 200): string | undefined {
  if (args[key] === undefined || args[key] === null || args[key] === '') return undefined;
  return requiredText(args, key, max);
}
function safeRepoPart(value: string, label: string): string {
  if (!/^[A-Za-z0-9_.-]{1,100}$/.test(value) || value === '.' || value === '..') {
    throw new Error('Invalid GitHub ' + label + '.');
  }
  return value;
}
function repoPath(owner: string, repo: string): string {
  return '/repos/' + encodeURIComponent(safeRepoPart(owner, 'owner')) + '/' + encodeURIComponent(safeRepoPart(repo, 'repository'));
}
function safeFilePath(value: string): string {
  const path = value.trim();
  if (!path || path.length > 500 || path.startsWith('/') || path.includes('\\') ||
      path.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Invalid repository file path.');
  }
  const lower = path.toLowerCase();
  const allowedExample = lower === '.env.example';
  if (!allowedExample && (/(^|\/)\.env($|\.)/.test(lower) || /(^|\/)(secrets?|credentials?)(\/|$)/.test(lower) ||
      /\.(pem|key|p12|pfx|keystore)$/i.test(lower) || /(id_rsa|id_ed25519|service[-_]?account)/i.test(lower))) {
    throw new Error('Reading or changing secret and credential files is blocked.');
  }
  return path;
}
function safeBranch(value: string): string {
  if (!value || value.length > 120 || value.startsWith('/') || value.endsWith('/') ||
      value.includes('..') || value.includes('//') || value.includes('@{') ||
      !/^[A-Za-z0-9._/-]+$/.test(value)) throw new Error('Invalid Git branch name.');
  return value;
}
function boundedNumber(value: unknown, fallback: number, min: number, max: number): number {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
}
async function request(token: string, path: string, init: RequestInit = {}): Promise<{ status: number; data: any; headers: Headers }> {
  const response = await fetch(API + path, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: 'Bearer ' + token,
      'X-GitHub-Api-Version': API_VERSION,
      'Content-Type': 'application/json',
      ...(init.headers || {}),
    },
    signal: init.signal || AbortSignal.timeout(12_000),
    redirect: 'error',
  });
  const text = await response.text();
  let data: any = null;
  if (text) {
    try { data = JSON.parse(text); }
    catch { throw new Error('GitHub returned an unsupported response format.'); }
  }
  if (!response.ok) {
    if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
      throw new Error('GitHub API rate limit reached. Wait for the reset window and retry.');
    }
    const message = response.status === 401 ? 'GitHub authorization expired or was revoked; reconnect GitHub.' :
      response.status === 403 ? 'GitHub denied this operation. Check repository permissions and OAuth scopes.' :
      response.status === 404 ? 'GitHub repository, branch, or file was not found or is not accessible.' :
      response.status === 409 ? 'GitHub rejected the operation because the repository state conflicts.' :
      'GitHub API request failed (HTTP ' + response.status + ').';
    throw new Error(message);
  }
  return { status: response.status, data, headers: response.headers };
}
async function audit(userId: string, action: string, owner: string, repo: string, metadata: Json = {}) {
  if (!pool) return;
  await pool.query(
    'INSERT INTO audit_logs(actor_user_id,action,target_type,target_id,metadata) VALUES($1,$2,$3,$4,$5::jsonb)',
    [userId, 'github.' + action, 'github_repository', owner + '/' + repo, JSON.stringify(metadata)],
  ).catch(() => {});
}
function redactSourceSecrets(value: string): string {
  return value
    .replace(/\bgh[pousr]_[A-Za-z0-9]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bgithub_pat_[A-Za-z0-9_]{20,}\b/g, '[REDACTED_GITHUB_TOKEN]')
    .replace(/\bsk-[A-Za-z0-9_-]{24,}\b/g, '[REDACTED_API_KEY]')
    .replace(/(Bearer\s+)[A-Za-z0-9._~+/-]{16,}/gi, '$1[REDACTED]')
    .replace(/((?:api[_-]?key|access[_-]?token|client[_-]?secret|password)\s*[:=]\s*["']?)[^"'\s,;]+/gi, '$1[REDACTED]');
}
function containsPotentialSecrets(value: string): boolean {
  return redactSourceSecrets(value) !== value ||
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i.test(value) ||
    /\\bAKIA[0-9A-Z]{16}\\b/.test(value) ||
    /\\bxox[baprs]-[A-Za-z0-9-]{10,}\\b/.test(value);
}
function repoSummary(row: any) {
  return {
    full_name: row.full_name,
    description: row.description || null,
    private: Boolean(row.private),
    default_branch: row.default_branch,
    html_url: row.html_url,
    updated_at: row.updated_at || null,
    permissions: row.permissions ? {
      pull: Boolean(row.permissions.pull),
      push: Boolean(row.permissions.push),
      admin: Boolean(row.permissions.admin),
    } : undefined,
  };
}

export async function getEnabledGitHubToolDefinitions(userId: string) {
  if (!userId) return [];
  const token = await getLinkedGitHubToken(userId);
  return token ? [...definitions] : [];
}

export async function executeGitHubTool(userId: string, toolName: string, rawArgs: unknown) {
  if (!userId) throw new Error('Sign in and connect GitHub to use repository tools.');
  const token = await getLinkedGitHubToken(userId);
  if (!token) throw new Error('GitHub is not linked to this account. Open Settings → Integrations and connect GitHub.');
  const args = objectArgs(rawArgs);

  if (toolName === 'github_list_repositories') {
    const visibility = optionalText(args, 'visibility', 10) || 'all';
    const sort = optionalText(args, 'sort', 20) || 'updated';
    if (!['all', 'public', 'private'].includes(visibility) || !['updated', 'pushed', 'created', 'full_name'].includes(sort)) {
      throw new Error('Unsupported repository filter.');
    }
    const page = boundedNumber(args.page, 1, 1, 100);
    const perPage = boundedNumber(args.per_page, 30, 1, 50);
    const result = await request(token, '/user/repos?visibility=' + visibility + '&sort=' + sort + '&direction=desc&page=' + page + '&per_page=' + perPage);
    await audit(userId, 'repositories.list', 'user', 'repositories', { visibility, page, perPage });
    return { repositories: (Array.isArray(result.data) ? result.data : []).map(repoSummary), page, perPage };
  }

  if (toolName === 'github_get_repository') {
    const owner = requiredText(args, 'owner', 100), repo = requiredText(args, 'repo', 100);
    const result = await request(token, repoPath(owner, repo));
    await audit(userId, 'repository.read', owner, repo);
    return repoSummary(result.data);
  }

  if (toolName === 'github_list_branches') {
    const owner = requiredText(args, 'owner', 100), repo = requiredText(args, 'repo', 100);
    const perPage = boundedNumber(args.per_page, 30, 1, 50);
    const result = await request(token, repoPath(owner, repo) + '/branches?per_page=' + perPage);
    await audit(userId, 'branches.list', owner, repo);
    return { branches: (Array.isArray(result.data) ? result.data : []).map((branch: any) => ({
      name: branch.name, protected: Boolean(branch.protected), commit: branch.commit?.sha,
    })) };
  }

  if (toolName === 'github_get_file') {
    const owner = requiredText(args, 'owner', 100), repo = requiredText(args, 'repo', 100);
    const path = safeFilePath(requiredText(args, 'path', 500));
    const ref = optionalText(args, 'ref', 200);
    const endpoint = repoPath(owner, repo) + '/contents/' + path.split('/').map(encodeURIComponent).join('/') + (ref ? '?ref=' + encodeURIComponent(ref) : '');
    const result = await request(token, endpoint);
    await audit(userId, 'file.read', owner, repo, { path, ref: ref || null });
    if (Array.isArray(result.data)) {
      return { type: 'directory', path, entries: result.data.slice(0, 60).map((item: any) => ({
        name: item.name, path: item.path, type: item.type, size: Number(item.size || 0), html_url: item.html_url,
      })) };
    }
    if (result.data?.type !== 'file' || result.data?.encoding !== 'base64' || typeof result.data?.content !== 'string') {
      throw new Error('GitHub did not return a supported text file.');
    }
    if (Number(result.data.size || 0) > 100_000) throw new Error('This file is larger than the 100 KB chat inspection limit.');
    const content = Buffer.from(result.data.content.replace(/\s/g, ''), 'base64').toString('utf8');
    if (content.includes('\u0000')) throw new Error('Binary files cannot be inserted into chat context.');
    return { type: 'file', path, size: content.length, content: redactSourceSecrets(content) };
  }

  if (toolName === 'github_search_code') {
    const owner = requiredText(args, 'owner', 100), repo = requiredText(args, 'repo', 100);
    const query = requiredText(args, 'query', 200);
    const perPage = boundedNumber(args.per_page, 20, 1, 30);
    const result = await request(token, '/search/code?q=' + encodeURIComponent(query + ' repo:' + owner + '/' + repo) + '&per_page=' + perPage);
    await audit(userId, 'code.search', owner, repo, { queryLength: query.length });
    return { total_count: Number(result.data.total_count || 0), matches: (Array.isArray(result.data.items) ? result.data.items : []).map((item: any) => ({
      path: item.path, html_url: item.html_url, sha: item.sha, repository: item.repository?.full_name,
    })) };
  }

  if (toolName === 'github_get_repository_tree') {
    const owner = requiredText(args, 'owner', 100), repo = requiredText(args, 'repo', 100);
    const requestedRef = optionalText(args, 'ref', 200);
    const requestedPrefix = optionalText(args, 'path_prefix', 500);
    const pathPrefix = requestedPrefix ? safeFilePath(requestedPrefix) : '';
    const limit = boundedNumber(args.limit, 80, 20, 120);
    const repository = await request(token, repoPath(owner, repo));
    const defaultBranch = String(repository.data.default_branch || 'main');
    const ref = requestedRef || defaultBranch;
    const commit = await request(token, repoPath(owner, repo) + '/commits/' + encodeURIComponent(ref));
    const treeSha = String(commit.data?.commit?.tree?.sha || '');
    if (!/^[a-f0-9]{40}$/i.test(treeSha)) throw new Error('GitHub did not return a valid repository tree reference.');
    const tree = await request(token, repoPath(owner, repo) + '/git/trees/' + treeSha + '?recursive=1');
    const allEntries = Array.isArray(tree.data?.tree) ? tree.data.tree : [];
    const entries = pathPrefix
      ? allEntries.filter((item: any) => item.path === pathPrefix || String(item.path || '').startsWith(pathPrefix + '/'))
      : allEntries;
    const visible = entries.slice(0, limit).map((item: any) => ({
      path: String(item.path || '').slice(0, 500),
      type: item.type === 'tree' ? 'directory' : item.type === 'blob' ? 'file' : 'other',
      ...(item.type === 'blob' ? { size: Number(item.size || 0) } : {}),
    }));
    await audit(userId, 'repository.tree.read', owner, repo, { ref, pathPrefix: pathPrefix || null, returned: visible.length, total: entries.length, truncated: Boolean(tree.data?.truncated || entries.length > limit) });
    return {
      repository: owner + '/' + repo,
      ref,
      default_branch: defaultBranch,
      path_prefix: pathPrefix || null,
      total_entries: entries.length,
      repository_tree_truncated: Boolean(tree.data?.truncated),
      truncated: Boolean(tree.data?.truncated || entries.length > limit),
      entries: visible,
    };
  }

  if (toolName === 'github_compare_branches') {
    const owner = requiredText(args, 'owner', 100), repo = requiredText(args, 'repo', 100);
    const base = safeBranch(requiredText(args, 'base', 200));
    const head = safeBranch(requiredText(args, 'head', 200));
    if (base === head) throw new Error('Choose two different references to compare.');
    const comparison = await request(token, repoPath(owner, repo) + '/compare/' + encodeURIComponent(base) + '...' + encodeURIComponent(head));
    const files = Array.isArray(comparison.data?.files) ? comparison.data.files : [];
    const commits = Array.isArray(comparison.data?.commits) ? comparison.data.commits : [];
    await audit(userId, 'branches.compare', owner, repo, { base, head, files: files.length, commits: commits.length });
    return {
      repository: owner + '/' + repo,
      base,
      head,
      status: comparison.data?.status || 'unknown',
      ahead_by: Number(comparison.data?.ahead_by || 0),
      behind_by: Number(comparison.data?.behind_by || 0),
      total_commits: commits.length,
      commits: commits.slice(0, 10).map((item: any) => ({
        sha: String(item.sha || '').slice(0, 40),
        message: String(item.commit?.message || '').split(String.fromCharCode(10))[0].slice(0, 240),
      })),
      total_changed_files: files.length,
      changed_files: files.slice(0, 8).map((item: any) => ({
        filename: String(item.filename || '').slice(0, 500),
        status: String(item.status || 'modified'),
        additions: Number(item.additions || 0),
        deletions: Number(item.deletions || 0),
        changes: Number(item.changes || 0),
        ...(typeof item.patch === 'string' ? { patch: redactSourceSecrets(item.patch).slice(0, 700) } : {}),
      })),
      files_truncated: files.length > 8,
    };
  }

  if (toolName === 'github_create_branch') {
    const owner = requiredText(args, 'owner', 100), repo = requiredText(args, 'repo', 100);
    const branch = safeBranch(requiredText(args, 'branch', 120));
    const repository = await request(token, repoPath(owner, repo));
    const defaultBranch = String(repository.data.default_branch || 'main');
    if (branch === defaultBranch) throw new Error('A working branch cannot be the repository default branch.');
    const base = safeBranch(optionalText(args, 'base', 120) || defaultBranch);
    const baseRef = await request(token, repoPath(owner, repo) + '/git/ref/heads/' + encodeURIComponent(base));
    const created = await request(token, repoPath(owner, repo) + '/git/refs', {
      method: 'POST',
      body: JSON.stringify({ ref: 'refs/heads/' + branch, sha: baseRef.data.object.sha }),
    });
    await audit(userId, 'branch.create', owner, repo, { branch, base });
    return { created: true, branch, base, sha: created.data.object?.sha || baseRef.data.object.sha };
  }

  if (toolName === 'github_update_file') {
    const owner = requiredText(args, 'owner', 100), repo = requiredText(args, 'repo', 100);
    const path = safeFilePath(requiredText(args, 'path', 500));
    const branch = safeBranch(requiredText(args, 'branch', 120));
    const content = requiredContent(args, 'content', 100_000);
    if (containsPotentialSecrets(content)) {
      throw new Error('The proposed file content appears to contain a credential or private key and was not committed.');
    }
    const message = requiredText(args, 'message', 200);
    const repository = await request(token, repoPath(owner, repo));
    if (branch === String(repository.data.default_branch || 'main')) {
      throw new Error('Direct commits to the default branch are blocked. Create and use a working branch.');
    }
    await request(token, repoPath(owner, repo) + '/git/ref/heads/' + encodeURIComponent(branch));
    const fileEndpoint = repoPath(owner, repo) + '/contents/' + path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(branch);
    let existingSha: string | undefined;
    try {
      const existing = await request(token, fileEndpoint);
      if (existing.data?.type !== 'file') throw new Error('The target path is not a file.');
      existingSha = typeof existing.data.sha === 'string' ? existing.data.sha : undefined;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.startsWith('GitHub repository, branch, or file was not found')) throw error;
    }
    const body: Json = { message, content: Buffer.from(content, 'utf8').toString('base64'), branch };
    if (existingSha) body.sha = existingSha;
    const updated = await request(token, fileEndpoint.split('?')[0], { method: 'PUT', body: JSON.stringify(body) });
    await audit(userId, 'file.write', owner, repo, { path, branch, commit: updated.data.commit?.sha || null });
    return { committed: true, path, branch, commit: updated.data.commit?.sha || null, html_url: updated.data.content?.html_url || null };
  }

  if (toolName === 'github_commit_files') {
    const owner = requiredText(args, 'owner', 100), repo = requiredText(args, 'repo', 100);
    const branch = safeBranch(requiredText(args, 'branch', 120));
    const message = requiredText(args, 'message', 200);
    if (!Array.isArray(args.files) || args.files.length < 1 || args.files.length > 12) {
      throw new Error('Provide between one and twelve files for an atomic commit.');
    }
    const seen = new Set<string>();
    let totalBytes = 0;
    const files = args.files.map((raw: unknown) => {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each file must include a path and text content.');
      const item = raw as Json;
      const path = safeFilePath(requiredText(item, 'path', 500));
      const content = requiredContent(item, 'content', 50_000);
      if (seen.has(path)) throw new Error('The same file path cannot appear twice in one commit.');
      seen.add(path);
      if (containsPotentialSecrets(content)) {
        throw new Error('One proposed file appears to contain a credential or private key. No files were committed.');
      }
      totalBytes += Buffer.byteLength(content, 'utf8');
      if (totalBytes > 100_000) throw new Error('The combined text content must be 100 KB or smaller.');
      return { path, content };
    });
    const repository = await request(token, repoPath(owner, repo));
    if (branch === String(repository.data.default_branch || 'main')) {
      throw new Error('Direct commits to the default branch are blocked. Create and use a working branch.');
    }
    const refResult = await request(token, repoPath(owner, repo) + '/git/ref/heads/' + encodeURIComponent(branch));
    const parentSha = String(refResult.data?.object?.sha || '');
    if (!/^[a-f0-9]{40}$/i.test(parentSha)) throw new Error('GitHub did not return a valid working-branch commit.');
    const parent = await request(token, repoPath(owner, repo) + '/git/commits/' + parentSha);
    const baseTreeSha = String(parent.data?.tree?.sha || '');
    if (!/^[a-f0-9]{40}$/i.test(baseTreeSha)) throw new Error('GitHub did not return a valid base tree.');
    const blobs = await Promise.all(files.map(async (file: { path: string; content: string }) => {
      const result = await request(token, repoPath(owner, repo) + '/git/blobs', {
        method: 'POST',
        body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
      });
      const sha = String(result.data?.sha || '');
      if (!/^[a-f0-9]{40}$/i.test(sha)) throw new Error('GitHub did not return a valid file blob.');
      return { path: file.path, mode: '100644', type: 'blob', sha };
    }));
    const tree = await request(token, repoPath(owner, repo) + '/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: baseTreeSha, tree: blobs }),
    });
    const treeSha = String(tree.data?.sha || '');
    if (!/^[a-f0-9]{40}$/i.test(treeSha)) throw new Error('GitHub did not return a valid new tree.');
    const commit = await request(token, repoPath(owner, repo) + '/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: treeSha, parents: [parentSha] }),
    });
    const commitSha = String(commit.data?.sha || '');
    if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new Error('GitHub did not return a valid commit.');
    await request(token, repoPath(owner, repo) + '/git/refs/heads/' + encodeURIComponent(branch), {
      method: 'PATCH',
      body: JSON.stringify({ sha: commitSha, force: false }),
    });
    await audit(userId, 'files.commit', owner, repo, { branch, paths: files.map((file: { path: string }) => file.path), commit: commitSha });
    return {
      committed: true,
      atomic: true,
      repository: owner + '/' + repo,
      branch,
      commit: commitSha,
      commit_url: 'https://github.com/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/commit/' + commitSha,
      files: files.map((file: { path: string }) => file.path),
      file_count: files.length,
      total_bytes: totalBytes,
    };
  }

  if (toolName === 'github_create_pull_request') {
    const owner = requiredText(args, 'owner', 100), repo = requiredText(args, 'repo', 100);
    const title = requiredText(args, 'title', 200);
    const head = safeBranch(requiredText(args, 'head', 120));
    const base = safeBranch(requiredText(args, 'base', 120));
    const body = optionalText(args, 'body', 10_000) || '';
    const draft = args.draft === true;
    if (head === base) throw new Error('Pull request head and base branches must be different.');
    const result = await request(token, repoPath(owner, repo) + '/pulls', {
      method: 'POST',
      body: JSON.stringify({ title, head, base, body, draft }),
    });
    await audit(userId, 'pull_request.create', owner, repo, { number: result.data.number, head, base });
    return { created: true, number: result.data.number, title: result.data.title, state: result.data.state, html_url: result.data.html_url, head, base };
  }

  throw new Error('Unknown GitHub tool.');
}
