export type VirtualTerminalFs = { dirs: string[]; files: Record<string, string> };
export type VirtualCommandResult = {
  output: string; cwd: string; fs: VirtualTerminalFs; exitCode: number;
  clear?: boolean; isAfgCommand?: boolean; download?: { name: string; content: string };
};

const ROOT = '/home/user';
const MAX_FILES = 120;
const MAX_FILE_CHARS = 48_000;
const MAX_TOTAL_CHARS = 320_000;

export function createVirtualTerminalFs(): VirtualTerminalFs {
  return { dirs: ['/', '/home', ROOT], files: {} };
}
function parentPath(path: string): string {
  const index = path.lastIndexOf('/');
  return index <= 0 ? '/' : path.slice(0, index);
}
function basename(path: string): string { return path.slice(path.lastIndexOf('/') + 1); }

export function sanitizeVirtualTerminalFs(value: unknown): VirtualTerminalFs {
  const fallback = createVirtualTerminalFs();
  if (!value || typeof value !== 'object') return fallback;
  const source = value as { dirs?: unknown; files?: unknown };
  const dirs = Array.isArray(source.dirs)
    ? source.dirs.filter((item): item is string => typeof item === 'string' && item.length <= 240 && (item === '/' || item.startsWith(ROOT + '/')))
    : [];
  const files: Record<string, string> = {};
  let total = 0;
  if (source.files && typeof source.files === 'object' && !Array.isArray(source.files)) {
    for (const [path, raw] of Object.entries(source.files as Record<string, unknown>).slice(0, MAX_FILES)) {
      if (!path.startsWith(ROOT + '/') || path.length > 240 || typeof raw !== 'string') continue;
      const body = raw.slice(0, MAX_FILE_CHARS);
      if (total + body.length > MAX_TOTAL_CHARS) break;
      files[path] = body;
      total += body.length;
    }
  }
  const cleanDirs = [...new Set([...fallback.dirs, ...dirs, ...Object.keys(files).map(parentPath)])];
  return { dirs: cleanDirs, files };
}

function normalizePath(path: string, cwd: string): string {
  if (!path || path === '~') return ROOT;
  const source = path.startsWith('/') ? path : cwd + '/' + path;
  const stack: string[] = [];
  for (const part of source.split('/')) {
    if (!part || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  const normalized = '/' + stack.join('/');
  if (normalized !== ROOT && !normalized.startsWith(ROOT + '/')) {
    throw new Error('Access denied: the virtual workspace is limited to /home/user.');
  }
  return normalized;
}

function tokenize(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: "'" | '"' | null = null;
  let escaped = false;
  const flush = () => { if (current.length) tokens.push(current); current = ''; };
  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];
    if (escaped) { current += char; escaped = false; continue; }
    if (char === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === "'" || char === '"') { quote = char; continue; }
    if (char === ';' || char === '|' || char === '&' || char === '<' || char.charCodeAt(0) === 96 || char === '$') {
      throw new Error('Shell operators, command substitution and external process chaining are disabled.');
    }
    if (char === '>') {
      flush();
      if (command[index + 1] === '>') { tokens.push('>>'); index += 1; }
      else tokens.push('>');
      continue;
    }
    if (/\s/.test(char)) flush();
    else current += char;
  }
  if (escaped || quote) throw new Error('Unclosed quote or escape sequence.');
  flush();
  return tokens;
}

function ensureParent(fs: VirtualTerminalFs, path: string): void {
  const parent = parentPath(path);
  if (!fs.dirs.includes(parent)) throw new Error('No such directory: ' + parent);
}
function listDirectory(fs: VirtualTerminalFs, path: string): string[] {
  if (!fs.dirs.includes(path)) throw new Error('No such directory: ' + path);
  const children = new Set<string>();
  for (const directory of fs.dirs) {
    if (directory !== path && parentPath(directory) === path) children.add(basename(directory) + '/');
  }
  for (const file of Object.keys(fs.files)) {
    if (parentPath(file) === path) children.add(basename(file));
  }
  return [...children].sort((a, b) => a.localeCompare(b));
}
function renderTree(fs: VirtualTerminalFs, root: string): string {
  const lines = [root];
  const walk = (directory: string, prefix: string, depth: number) => {
    if (depth > 6) return;
    const children = listDirectory(fs, directory);
    children.forEach((child, index) => {
      const last = index === children.length - 1;
      lines.push(prefix + (last ? '└── ' : '├── ') + child);
      if (child.endsWith('/')) {
        const childPath = (directory === '/' ? '' : directory) + '/' + child.slice(0, -1);
        walk(childPath, prefix + (last ? '    ' : '│   '), depth + 1);
      }
    });
  };
  walk(root, '', 0);
  return lines.join('\n');
}
function writeFile(fs: VirtualTerminalFs, path: string, content: string, append: boolean): VirtualTerminalFs {
  ensureParent(fs, path);
  const next = { dirs: [...fs.dirs], files: { ...fs.files } };
  const value = append ? (next.files[path] || '') + content : content;
  if (value.length > MAX_FILE_CHARS) throw new Error('File limit is ' + MAX_FILE_CHARS.toLocaleString() + ' characters.');
  const total = Object.values(next.files).reduce((sum, item) => sum + item.length, 0) - (next.files[path]?.length || 0) + value.length;
  if (total > MAX_TOTAL_CHARS) throw new Error('Virtual workspace storage limit reached.');
  if (!(path in next.files) && Object.keys(next.files).length >= MAX_FILES) throw new Error('Workspace limit is ' + MAX_FILES + ' files.');
  next.files[path] = value;
  return next;
}
const helpText = [
  'AFG AI Virtual Terminal — local, account-scoped workspace',
  '',
  'Navigation: pwd, ls [path], cd <directory>, tree [path]',
  'Files: mkdir [-p] <dir>, touch <file>, cat <file>, write <file> <text>',
  '       echo <text> > <file>, echo <text> >> <file>, rm [-r] <path>',
  '       cp <source> <destination>, mv <source> <destination>',
  '       find [path], grep <text> <file>, wc [-l|-w|-c] <file>',
  '       head [-n N] <file>, tail [-n N] <file>, stat <file>, download <file>',
  'System: whoami, hostname, uname, date, history, clear, help, version',
  'AFG AI: afg help, afg version, afg status, afg account, afg models list, afg conv list, afg files list',
  '',
  'Files are stored in this browser under your account profile. They are not uploaded.',
  'This is a virtual workspace, not a host OS shell. Arbitrary programs and shell execution are disabled.',
].join('\n');

export function runVirtualCommand(command: string, cwd: string, currentFs: VirtualTerminalFs): VirtualCommandResult {
  const fail = (message: string): VirtualCommandResult => ({ output: message, cwd, fs: currentFs, exitCode: 1 });
  let tokens: string[];
  try { tokens = tokenize(command.trim()); } catch (error) { return fail(error instanceof Error ? error.message : 'Invalid command syntax.'); }
  if (!tokens.length) return { output: '', cwd, fs: currentFs, exitCode: 0 };
  const name = tokens[0].toLowerCase();
  const args = tokens.slice(1);
  const fs = { dirs: [...currentFs.dirs], files: { ...currentFs.files } };
  try {
    if (name === 'afg') return { output: '', cwd, fs, exitCode: 0, isAfgCommand: true };
    if (name === 'clear' || name === 'cls') return { output: '', cwd, fs, exitCode: 0, clear: true };
    if (name === 'help' || name === 'man') return { output: helpText, cwd, fs, exitCode: 0 };
    if (name === 'version') return { output: 'AFG AI Virtual Terminal v2.0', cwd, fs, exitCode: 0 };
    if (name === 'pwd') return { output: cwd, cwd, fs, exitCode: 0 };
    if (name === 'whoami') return { output: 'AFG AI workspace user', cwd, fs, exitCode: 0 };
    if (name === 'hostname') return { output: 'afg-ai-virtual-terminal', cwd, fs, exitCode: 0 };
    if (name === 'uname') return { output: 'AFG-AI Virtual Workspace · browser-isolated · no host shell', cwd, fs, exitCode: 0 };
    if (name === 'date') return { output: new Date().toString(), cwd, fs, exitCode: 0 };
    if (name === 'cd') {
      const target = normalizePath(args[0] || ROOT, cwd);
      if (!fs.dirs.includes(target)) return fail('cd: no such directory: ' + target);
      return { output: '', cwd: target, fs, exitCode: 0 };
    }
    if (name === 'ls' || name === 'dir') {
      const targetArg = args.find((item) => !item.startsWith('-'));
      const target = normalizePath(targetArg || cwd, cwd);
      if (fs.dirs.includes(target)) {
        const children = listDirectory(fs, target);
        return { output: children.length ? children.join('  ') : '(empty directory)', cwd, fs, exitCode: 0 };
      }
      if (target in fs.files) return { output: basename(target), cwd, fs, exitCode: 0 };
      return fail('ls: cannot access ' + target + ': No such file or directory');
    }
    if (name === 'tree') {
      const target = normalizePath(args[0] || cwd, cwd);
      if (!fs.dirs.includes(target)) return fail('tree: no such directory: ' + target);
      return { output: renderTree(fs, target), cwd, fs, exitCode: 0 };
    }
    if (name === 'mkdir') {
      const recursive = args[0] === '-p';
      const requested = args.filter((item) => item !== '-p');
      if (!requested.length) return fail('mkdir: missing operand');
      const next = { dirs: [...fs.dirs], files: { ...fs.files } };
      for (const item of requested) {
        const target = normalizePath(item, cwd);
        if (target === ROOT) return fail('mkdir: workspace root already exists');
        if (!recursive) ensureParent(next, target);
        else {
          const pieces = target.split('/').filter(Boolean);
          let cursor = '';
          for (const piece of pieces) {
            cursor += '/' + piece;
            if (!next.dirs.includes(cursor)) next.dirs.push(cursor);
          }
        }
        if (!next.dirs.includes(target)) next.dirs.push(target);
      }
      return { output: '', cwd, fs: next, exitCode: 0 };
    }
    if (name === 'touch') {
      if (!args.length) return fail('touch: missing file operand');
      let next = fs;
      for (const item of args) {
        const target = normalizePath(item, cwd);
        if (next.dirs.includes(target)) return fail('touch: is a directory: ' + target);
        ensureParent(next, target);
        if (!(target in next.files)) next = writeFile(next, target, '', false);
      }
      return { output: '', cwd, fs: next, exitCode: 0 };
    }
    if (name === 'cat') {
      if (!args.length) return fail('cat: missing file operand');
      const output = args.map((item) => {
        const target = normalizePath(item, cwd);
        if (!(target in fs.files)) throw new Error('cat: ' + item + ': No such file or directory');
        return fs.files[target];
      }).join('\n');
      return { output, cwd, fs, exitCode: 0 };
    }
    if (name === 'echo' || name === 'write') {
      const redirectIndex = args.findIndex((item) => item === '>' || item === '>>');
      const textArgs = redirectIndex >= 0 ? args.slice(0, redirectIndex) : args;
      const text = textArgs.join(' ');
      if (redirectIndex >= 0) {
        const mode = args[redirectIndex];
        const pathArg = args[redirectIndex + 1];
        if (!pathArg || redirectIndex + 2 < args.length) return fail('Usage: echo <text> > <file>');
        const target = normalizePath(pathArg, cwd);
        const next = writeFile(fs, target, text + '\n', mode === '>>');
        return { output: '', cwd, fs: next, exitCode: 0 };
      }
      if (name === 'write') {
        const pathArg = args[0];
        if (!pathArg) return fail('Usage: write <file> <text>');
        const target = normalizePath(pathArg, cwd);
        const next = writeFile(fs, target, args.slice(1).join(' '), false);
        return { output: 'Saved ' + target, cwd, fs: next, exitCode: 0 };
      }
      return { output: text, cwd, fs, exitCode: 0 };
    }
    if (name === 'rm' || name === 'del') {
      const recursive = args[0] === '-r' || args[0] === '-rf';
      const items = args.filter((item) => item !== '-r' && item !== '-rf' && item !== '-f');
      if (!items.length) return fail('rm: missing operand');
      const next = { dirs: [...fs.dirs], files: { ...fs.files } };
      for (const item of items) {
        const target = normalizePath(item, cwd);
        if (target === ROOT) return fail('rm: refusing to remove the workspace root');
        if (target in next.files) { delete next.files[target]; continue; }
        if (next.dirs.includes(target)) {
          const descendants = next.dirs.filter((dir) => dir.startsWith(target + '/'));
          const childFiles = Object.keys(next.files).filter((file) => file.startsWith(target + '/'));
          if (!recursive && (descendants.length || childFiles.length)) return fail('rm: ' + target + ' is not empty (use rm -r)');
          next.dirs = next.dirs.filter((dir) => dir !== target && !dir.startsWith(target + '/'));
          for (const file of childFiles) delete next.files[file];
          if (cwd === target || cwd.startsWith(target + '/')) return fail('rm: cannot remove the current working directory');
          continue;
        }
        return fail('rm: cannot remove ' + item + ': No such file or directory');
      }
      return { output: '', cwd, fs: next, exitCode: 0 };
    }
    if (name === 'cp' || name === 'mv') {
      if (args.length !== 2) return fail(name + ': usage: ' + name + ' <source> <destination>');
      const source = normalizePath(args[0], cwd);
      const target = normalizePath(args[1], cwd);
      if (!(source in fs.files)) return fail(name + ': source file not found: ' + source);
      if (fs.dirs.includes(target)) return fail(name + ': destination is a directory');
      ensureParent(fs, target);
      const next = { dirs: [...fs.dirs], files: { ...fs.files } };
      next.files[target] = next.files[source];
      if (name === 'mv') delete next.files[source];
      return { output: '', cwd, fs: next, exitCode: 0 };
    }
    if (name === 'find') {
      const target = normalizePath(args.find((item) => !item.startsWith('-')) || cwd, cwd);
      if (!fs.dirs.includes(target)) return fail('find: no such directory: ' + target);
      const matches = [...fs.dirs.filter((dir) => dir === target || dir.startsWith(target + '/')), ...Object.keys(fs.files).filter((file) => file.startsWith(target + '/'))].sort();
      return { output: matches.join('\n') || target, cwd, fs, exitCode: 0 };
    }
    if (name === 'grep') {
      if (args.length < 2) return fail('Usage: grep <text> <file>');
      const target = normalizePath(args[args.length - 1], cwd);
      if (!(target in fs.files)) return fail('grep: ' + args[args.length - 1] + ': No such file');
      const needle = args.slice(0, -1).join(' ');
      const matches = fs.files[target].split('\n').map((line, index) => ({ line, index })).filter((item) => item.line.includes(needle));
      return { output: matches.map((item) => (item.index + 1) + ':' + item.line).join('\n') || 'No matches found.', cwd, fs, exitCode: 0 };
    }
    if (name === 'wc') {
      const target = normalizePath(args[args.length - 1] || '', cwd);
      if (!(target in fs.files)) return fail('wc: file not found');
      const value = fs.files[target];
      const lines = value.length ? value.split('\n').length : 0;
      const words = value.trim() ? value.trim().split(/\s+/).length : 0;
      const mode = args[0];
      const count = mode === '-l' ? String(lines) : mode === '-w' ? String(words) : mode === '-c' ? String(value.length) : lines + ' ' + words + ' ' + value.length;
      return { output: count + ' ' + basename(target), cwd, fs, exitCode: 0 };
    }
    if (name === 'head' || name === 'tail') {
      const countIndex = args.indexOf('-n');
      const count = countIndex >= 0 ? Math.max(1, Math.min(100, Number.parseInt(args[countIndex + 1] || '10', 10) || 10)) : 10;
      const targetArgs = args.filter((_, index) => index !== countIndex && index !== countIndex + 1);
      const targetArg = targetArgs[targetArgs.length - 1];
      if (!targetArg) return fail(name + ': missing file operand');
      const target = normalizePath(targetArg, cwd);
      if (!(target in fs.files)) return fail(name + ': ' + targetArg + ': No such file');
      const rows = fs.files[target].split('\n');
      return { output: (name === 'head' ? rows.slice(0, count) : rows.slice(-count)).join('\n'), cwd, fs, exitCode: 0 };
    }
    if (name === 'stat') {
      const target = normalizePath(args[0] || '', cwd);
      if (target in fs.files) return { output: 'File: ' + target + '\nType: regular virtual file\nSize: ' + fs.files[target].length + ' bytes', cwd, fs, exitCode: 0 };
      if (fs.dirs.includes(target)) return { output: 'Directory: ' + target + '\nType: virtual directory', cwd, fs, exitCode: 0 };
      return fail('stat: no such file or directory: ' + target);
    }
    if (name === 'download') {
      const target = normalizePath(args[0] || '', cwd);
      if (!(target in fs.files)) return fail('download: file not found: ' + target);
      return { output: 'Ready to download ' + basename(target), cwd, fs, exitCode: 0, download: { name: basename(target), content: fs.files[target] } };
    }
    if (name === 'history') return { output: 'Command history is shown in the History panel above.', cwd, fs, exitCode: 0 };
    if (['node', 'npm', 'npx', 'python', 'python3', 'pip', 'pip3', 'git', 'bash', 'sh', 'zsh', 'sudo', 'apt', 'apt-get', 'curl', 'wget', 'ssh', 'scp', 'chmod', 'chown', 'kill', 'ps', 'top'].includes(name)) {
      return fail(name + ': external program execution is not enabled. This workspace safely manages local files; no host shell or code runner is configured.');
    }
    return fail(name + ': command not found. Type help to see available commands.');
  } catch (error) {
    return fail(error instanceof Error ? error.message : 'Command failed.');
  }
}
