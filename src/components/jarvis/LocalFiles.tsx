import { formatFileSize, formatLocalizedNumber } from "../../utils/i18n";
import type { Language } from "../../types/afg";
import { workspaceCopy } from "./workspaceCopy";
import { useRef, useState } from "react";
import { FileText, Upload, X, Search, ShieldCheck } from "lucide-react";
export function LocalFiles({ language }: { language: Language }) {
  const w = workspaceCopy(language);
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{
    name: string;
    text: string;
    bytes: number;
  } | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const read = async (selected?: File) => {
    if (!selected) return;
    setError("");
    if (selected.size > 2 * 1024 * 1024) {
      setError(w("Choose a text document smaller than 2 MB."));
      return;
    }
    if (
      !/\.(txt|md|csv|json|xml|html|css|js|jsx|ts|tsx|py|sql|yaml|yml|log)$/i.test(
        selected.name,
      )
    ) {
      setError(
        w(
          "This local viewer supports text, Markdown, CSV, JSON, XML, and source code. PDF and Office extraction require another tool.",
        ),
      );
      return;
    }
    setBusy(true);
    try {
      const text = await selected.text();
      if (text.includes("\0")) throw new Error();
      setFile({ name: selected.name, bytes: selected.size, text });
      setQuery("");
    } catch {
      setError(w("The document could not be read as text."));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };
  const lines = file?.text.split("\n") || [];
  const matches = query
    ? lines.filter((l) =>
        l.toLocaleLowerCase().includes(query.toLocaleLowerCase()),
      )
    : lines;
  return (
    <section className="j-local-page">
      <div className="j-eyebrow">{w("LOCAL WORKSPACE")}</div>
      <h1>{w("Your files. Your device.")}</h1>
      <p className="j-muted">
        {w(
          "Open and search a document locally. Nothing is uploaded or sent to an AI provider.",
        )}
      </p>
      <input
        ref={input}
        hidden
        type="file"
        accept=".txt,.md,.csv,.json,.xml,.html,.css,.js,.jsx,.ts,.tsx,.py,.sql,.yaml,.yml,.log"
        onChange={(e) => void read(e.target.files?.[0])}
      />
      <button
        className="j-primary"
        onClick={() => input.current?.click()}
        disabled={busy}
      >
        <Upload size={16} />
        {busy ? w("Reading document…") : w("Open a document")}
      </button>
      {error && (
        <p role="alert" className="j-error">
          {error}
        </p>
      )}
      {file ? (
        <div className="j-document">
          <header>
            <FileText size={18} />
            <strong>{file.name}</strong>
            <span>{formatFileSize(file.bytes, language)}</span>
            <button
              aria-label={w("Close document")}
              onClick={() => setFile(null)}
            >
              <X size={18} />
            </button>
          </header>
          <label className="j-search">
            <Search size={16} />
            <input
              aria-label={w("Find in document")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={w("Find in document")}
            />
          </label>
          <p className="j-muted">
            {formatLocalizedNumber(matches.length, language)}{" "}
            {query ? w("matching lines") : w("lines")}
          </p>
          <pre>{matches.join("\n") || w("No matching lines.")}</pre>
        </div>
      ) : (
        <div className="j-empty">
          <FileText size={38} />
          <h3>{w("A little context goes a long way.")}</h3>
          <p>{w("Open a text document to inspect its contents.")}</p>
          <span>
            <ShieldCheck size={14} /> {w("Local processing · 2 MB maximum")}
          </span>
        </div>
      )}
    </section>
  );
}
