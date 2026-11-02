/** Minimal terminal. Commands go through runTerminalCommand() in api.ts. */

import { useEffect, useRef, useState, type FormEvent } from 'react';
import { runTerminalCommand } from '../api';

interface Line {
  kind: 'input' | 'output';
  text: string;
}

export default function TerminalView() {
  const [lines, setLines] = useState<Line[]>([{ kind: 'output', text: 'AFG AI terminal. Type a command.' }]);
  const [command, setCommand] = useState('');
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' });
  }, [lines]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const cmd = command.trim();
    if (!cmd || busy) return;
    setCommand('');
    setBusy(true);
    setLines((prev) => [...prev, { kind: 'input', text: cmd }]);
    try {
      // API INJECTION POINT: real command execution.
      const output = await runTerminalCommand(cmd);
      setLines((prev) => [...prev, { kind: 'output', text: output }]);
    } catch {
      setLines((prev) => [...prev, { kind: 'output', text: 'Command failed.' }]);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col p-4">
      <div
        dir="ltr"
        className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col rounded-2xl border border-slate-200 bg-slate-50 font-mono text-[13px]"
      >
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
          {lines.map((l, i) => (
            <pre key={i} className={`whitespace-pre-wrap ${l.kind === 'input' ? 'text-blue-800' : 'text-slate-700'}`}>
              {l.kind === 'input' ? `$ ${l.text}` : l.text}
            </pre>
          ))}
          <div ref={endRef} />
        </div>
        <form onSubmit={submit} className="flex items-center gap-2 border-t border-slate-200 px-4 py-3">
          <span className="text-blue-700">$</span>
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            aria-label="Terminal command"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="flex-1 bg-transparent focus:outline-none"
          />
        </form>
      </div>
    </div>
  );
}
