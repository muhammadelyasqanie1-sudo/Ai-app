import React, { useEffect, useRef, useState } from "react";
import type { Language } from "../../types/afg";
import { apiFetch, getCsrfToken } from "../../lib/apiClient";
import {
  formatFileSize,
  formatLocalizedDate,
  formatLocalizedNumber,
} from "../../utils/i18n";
import { mediaCopy, type MediaCopyKey } from "./mediaCopy";
import type { MediaType } from "../../services/media/contracts";
import "./media.css";
type FileRow = {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  status: string;
};
type Model = { id: string; provider: string; name: string; tasks: string[] };
const types: MediaType[] = [
  "image_generate",
  "image_edit",
  "image_understand",
  "ocr",
  "speech_recognize",
  "speech_generate",
  "document_extract",
  "document_analyze",
  "video_analyze",
  "text",
  "video_generate",
  "audio_understand",
];
const local = (type: MediaType) =>
  ["document_extract", "video_analyze"].includes(type);
async function request(path: string, body?: unknown, method = "POST") {
  return (
    await apiFetch(
      path,
      body === undefined
        ? {}
        : {
            method,
            headers: { "X-CSRF-Token": getCsrfToken() },
            body: JSON.stringify(body),
          },
    )
  ).json();
}
function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Preview({
  file,
  t,
  onError,
}: {
  file: FileRow;
  t: ReturnType<typeof mediaCopy>;
  onError: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    let alive = true;
    let value = "";
    void apiFetch("/api/files/" + file.id + "/download")
      .then((r) => r.blob())
      .then((blob) => {
        value = URL.createObjectURL(blob);
        if (alive) setUrl(value);
        else URL.revokeObjectURL(value);
      })
      .catch(() => {
        if (alive) onError();
      });
    return () => {
      alive = false;
      if (value) URL.revokeObjectURL(value);
    };
  }, [file.id]);
  if (!url) return null;
  return file.mime.startsWith("image/") ? (
    <img src={url} alt={file.name} />
  ) : file.mime.startsWith("audio/") ? (
    <audio src={url} controls aria-label={file.name} />
  ) : (
    <video src={url} controls aria-label={file.name} />
  );
}
export default function MediaStudio({
  language,
  initialType = "image_generate",
  initialModel = "",
}: {
  language: Language;
  initialType?: MediaType;
  initialModel?: string;
}) {
  const t = mediaCopy(language);
  const [type, setType] = useState<MediaType>(initialType),
    [models, setModels] = useState<Model[]>([]),
    [localState, setLocalState] = useState<Record<string, boolean>>({});
  const [selectedModel, setModel] = useState(initialModel),
    [prompt, setPrompt] = useState(""),
    [voice, setVoice] = useState(""),
    [lang, setLang] = useState(""),
    [consent, setConsent] = useState(false);
  const [files, setFiles] = useState<FileRow[]>([]),
    [ids, setIds] = useState<string[]>([]),
    [jobs, setJobs] = useState<any[]>([]),
    [offset, setOffset] = useState(0),
    [next, setNext] = useState<number | null>(null),
    [fileOffset, setFileOffset] = useState(0),
    [search, setSearch] = useState("");
  const [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [preview, setPreview] = useState<string | null>(null),
    [dragActive, setDragActive] = useState(false),
    [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const key = useRef(crypto.randomUUID()),
    mounted = useRef(true),
    refreshSequence = useRef(0),
    historyIdentity = useRef(""),
    fileInput = useRef<HTMLInputElement>(null);
  const selected = models.find(
    (m) => m.provider + "::" + m.id === selectedModel && m.tasks.includes(type),
  );
  const availableModels = models.filter((m) => m.tasks.includes(type));
  const fail = (err?: unknown) => {
    const status = (err as any)?.status;
    setError(t.error + (status ? " (" + status + ")" : ""));
  };
  const identify = (history: any[]) =>
    JSON.stringify(history.map((j) => [j.id, j.status, j.execution_state]));
  async function refresh() {
    const sequence = ++refreshSequence.current;
    const [catalog, library, history] = await Promise.all([
      request("/api/media/capabilities"),
      request(
        "/api/files?offset=" +
          fileOffset +
          "&search=" +
          encodeURIComponent(search),
      ),
      request("/api/media/jobs?offset=" + offset),
    ]);
    if (!mounted.current || sequence !== refreshSequence.current) return;
    if (catalog.configuration?.valid === false)
      setError(t.error + " (AFG_MEDIA_TASKS_JSON)");
    setModels(catalog.models);
    setLocalState(catalog.local);
    setFiles(library.files);
    historyIdentity.current = identify(history.jobs);
    setJobs(history.jobs);
    setNext(history.nextOffset);
  }
  useEffect(() => {
    mounted.current = true;
    let timer: ReturnType<typeof setTimeout>;
    let disposed = false;
    let first = true;
    const load = async () => {
      try {
        if (first) {
          await refresh();
          first = false;
        } else {
          const history = await request("/api/media/jobs?offset=" + offset);
          if (!disposed && identify(history.jobs) !== historyIdentity.current)
            await refresh();
        }
      } catch (err) {
        if (!disposed) fail(err);
      }
      if (!disposed) timer = setTimeout(load, 3000);
    };
    void load();
    return () => {
      disposed = true;
      mounted.current = false;
      refreshSequence.current++;
      clearTimeout(timer);
    };
  }, [offset, fileOffset, search, language]);
  useEffect(() => {
    setConsent(false);
    key.current = crypto.randomUUID();
  }, [type]);
  useEffect(() => {
    setConsent(false);
    key.current = crypto.randomUUID();
  }, [selectedModel, ids]);
  async function act(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      await refresh();
    } catch (err) {
      fail(err);
    } finally {
      if (mounted.current) {
        setBusy(false);
        setUploadProgress(null);
      }
    }
  }
  async function uploadFile(file: File) {
    if (!file || file.size < 1 || file.size > 15 * 1024 * 1024) throw new Error("size");
    setUploadProgress(0);
    const base64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onprogress = (event) => {
        if (!event.lengthComputable) return;
        setUploadProgress(
          Math.max(1, Math.min(99, Math.round((event.loaded / event.total) * 100))),
        );
      };
      reader.onload = () => resolve(String(reader.result).split(",")[1]);
      reader.readAsDataURL(file);
    });
    await request("/api/files", { name: file.name, dataBase64: base64 });
    if (fileInput.current) fileInput.current.value = "";
    setUploadProgress(100);
    setNotice(t.fileSaved);
  }
  async function submit() {
    await act(async () => {
      await request("/api/media/jobs", {
        type,
        prompt,
        inputFileIds: ids,
        parameters: {
          ...(type === "speech_generate" ? { voice } : {}),
          ...(type === "speech_recognize" && lang ? { language: lang } : {}),
        },
        requestKey: key.current,
        allowExternalProcessing: consent,
        ...(!local(type) && selected
          ? { provider: selected.provider, model: selected.id }
          : {}),
      });
      key.current = crypto.randomUUID();
      setNotice(t.saved);
    });
  }
  const selectInput = (id: string) => {
    if (ids.includes(id)) setIds(ids.filter((x) => x !== id));
    else if (ids.length < 2) setIds([...ids, id]);
    else setError(t.inputLimit);
  };
  const ready = local(type) ? localState[type] : Boolean(selected);
  return (
    <section className="media-studio" aria-labelledby="media-heading">
      <header>
        <div>
          <span className="media-eyebrow">AFG AI</span>
          <h1 id="media-heading">{t.title}</h1>
          <p>{t.intro}</p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void act(async () => {})}
        >
          {t.refresh}
        </button>
      </header>
      {error && (
        <p role="alert" className="media-error">
          {error}
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      <div className="media-layout">
        <section className="media-panel" aria-label={t.operation}>
          <label>
            {t.operation}
            <select
              value={type}
              onChange={(e) => setType(e.target.value as MediaType)}
            >
              {types.map((item) => (
                <option
                  key={item}
                  value={item}
                  disabled={
                    item === "video_generate" || item === "audio_understand"
                  }
                >
                  {t[item]}
                </option>
              ))}
            </select>
          </label>
          {local(type) ? (
            <p>{t.local}</p>
          ) : (
            <label>
              {t.model}
              <select
                value={selectedModel}
                onChange={(e) => {
                  setModel(e.target.value);
                  if (e.target.value)
                    window.dispatchEvent(
                      new CustomEvent("afg-select-model", {
                        detail: e.target.value,
                      }),
                    );
                }}
              >
                <option value="">{t.model}</option>
                {availableModels.map((m) => (
                  <option
                    key={m.provider + "::" + m.id}
                    value={m.provider + "::" + m.id}
                  >
                    {m.name} · {m.provider}
                  </option>
                ))}
              </select>
            </label>
          )}
          {!local(type) && !availableModels.length && (
            <p className="media-notice">{t.noModels}</p>
          )}
          {!["document_extract", "video_analyze", "speech_recognize"].includes(
            type,
          ) && (
            <label>
              {t.prompt}
              <textarea
                value={prompt}
                maxLength={4000}
                rows={5}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  key.current = crypto.randomUUID();
                }}
              />
            </label>
          )}
          {type === "speech_generate" && (
            <label>
              {t.voice}
              <input
                value={voice}
                maxLength={100}
                onChange={(e) => {
                  setVoice(e.target.value);
                  key.current = crypto.randomUUID();
                }}
              />
            </label>
          )}
          {type === "speech_recognize" && (
            <label>
              {t.language}
              <input
                value={lang}
                maxLength={12}
                onChange={(e) => {
                  setLang(e.target.value);
                  key.current = crypto.randomUUID();
                }}
              />
            </label>
          )}
          {ids.length > 0 && !local(type) && (
            <label className="media-check">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => {
                  setConsent(e.target.checked);
                  key.current = crypto.randomUUID();
                }}
              />
              {t.consent}
            </label>
          )}
          <button
            type="button"
            className="media-primary"
            disabled={
              busy || !ready || (ids.length > 0 && !local(type) && !consent)
            }
            onClick={() => void submit()}
          >
            {busy ? t.pending : t.run}
          </button>
          <p className="media-note">{t.unsupported}</p>
        </section>
        <section className="media-panel" aria-labelledby="media-files">
          <h2 id="media-files">{t.files}</h2>
          <p className="media-note">{t.scanNotice}</p>
          <label>
            {t.search}
            <input
              type="search"
              value={search}
              maxLength={240}
              onChange={(e) => {
                setSearch(e.target.value);
                setFileOffset(0);
              }}
            />
          </label>
          <div
            className={`media-upload-zone ${dragActive ? "is-dragging" : ""}`}
            onDragEnter={(event) => {
              event.preventDefault();
              setDragActive(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              if (event.currentTarget === event.target) setDragActive(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragActive(false);
              const file = event.dataTransfer.files?.[0];
              if (file) void act(async () => uploadFile(file));
            }}
            aria-label={t.dropFile}
          >
            <strong>{t.dropFile}</strong>
            <label>
              {t.selectFile}
              <input
                ref={fileInput}
                type="file"
                accept=".pdf,.txt,.md,.json,.csv,.png,.jpg,.jpeg,.gif,.webp,.wav,.mp3,.ogg,.webm,.mp4"
              />
            </label>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                void act(async () => {
                  const file = fileInput.current?.files?.[0];
                  if (!file) throw new Error("size");
                  await uploadFile(file);
                })
              }
            >
              {busy ? t.pending : t.upload}
            </button>
            {uploadProgress !== null && (
              <div className="media-upload-progress" role="status" aria-live="polite">
                <span>
                  {uploadProgress >= 100 ? t.fileSaved : t.uploading}{" "}
                  {uploadProgress < 100
                    ? formatLocalizedNumber(uploadProgress, language) + "%"
                    : ""}
                </span>
                <progress
                  max={100}
                  value={uploadProgress}
                  aria-label={t.uploadProgress}
                />
              </div>
            )}
          </div>
          {!files.length && <p>{t.empty}</p>}
          <ul className="media-files">
            {files.map((f) => (
              <li key={f.id}>
                <div>
                  <strong>{f.name}</strong>
                  <p>
                    {formatFileSize(Number(f.sizeBytes), language)} ·{" "}
                    {t[f.status as MediaCopyKey] || f.status}
                  </p>
                </div>
                <div className="media-actions">
                  <label className="media-check">
                    <input
                      type="checkbox"
                      disabled={f.status !== "approved"}
                      aria-label={t.select + ": " + f.name}
                      checked={ids.includes(f.id)}
                      onChange={() => selectInput(f.id)}
                    />
                    {t.select}
                  </label>
                  {f.status === "quarantined" && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void act(async () => {
                          await request("/api/files/" + f.id + "/scan", {});
                          setNotice(t.scanned);
                        })
                      }
                    >
                      {t.scan}
                    </button>
                  )}
                  {f.status === "approved" && (
                    <>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() =>
                          void act(async () => {
                            const result = await apiFetch(
                              "/api/files/" + f.id + "/download",
                            );
                            downloadBlob(await result.blob(), f.name);
                          })
                        }
                      >
                        {t.download}
                      </button>
                      {/^(image|audio|video)\//.test(f.mime) && (
                        <button
                          type="button"
                          onClick={() =>
                            setPreview(preview === f.id ? null : f.id)
                          }
                        >
                          {preview === f.id ? t.close : t.preview}
                        </button>
                      )}
                    </>
                  )}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      if (window.confirm(t.deleteConfirm))
                        void act(async () => {
                          await request("/api/files/" + f.id, {}, "DELETE");
                          setIds(ids.filter((id) => id !== f.id));
                          setPreview(null);
                          setNotice(t.deleted);
                        });
                    }}
                  >
                    {t.remove}
                  </button>
                </div>
                {preview === f.id && (
                  <Preview file={f} t={t} onError={() => fail()} />
                )}
              </li>
            ))}
          </ul>
          <nav aria-label={t.files}>
            <button
              type="button"
              disabled={!fileOffset}
              onClick={() => setFileOffset(Math.max(0, fileOffset - 100))}
            >
              {t.previous}
            </button>
            <button
              type="button"
              disabled={files.length < 100}
              onClick={() => setFileOffset(fileOffset + 100)}
            >
              {t.next}
            </button>
          </nav>
        </section>
      </div>
      <section className="media-panel media-history" aria-labelledby="media-history">
        <div className="media-history-head">
          <h2 id="media-history">{t.history}</h2>
          <span className="media-live-label">
            <i aria-hidden="true" /> {t.live}
          </span>
        </div>
        {!jobs.length && <p>{t.empty}</p>}
        <ol className="media-jobs">
          {jobs.map((j) => (
            <li key={j.id} data-status={j.status}>
              <div>
                <strong>{t[j.request.type as MediaCopyKey]}</strong>
                <span className="media-status">
                  {t[j.status as MediaCopyKey] || j.status}
                </span>
              </div>
              <p>
                <bdi>
                  {j.request.provider || t.local} {j.request.model || ""}
                </bdi>{" "}
                ·{" "}
                {formatLocalizedDate(new Date(j.created_at), language, {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </p>
              <p className="media-note">
                <bdi>{j.id}</bdi>
              </p>
              {j.request.inputFileIds.map((id: string) => (
                <p className="media-note" key={id}>
                  {t.source}: <bdi>{id}</bdi>
                </p>
              ))}
              {["ready", "running"].includes(j.status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      await request(
                        "/api/agents/tasks/" + j.task_id + "/cancel",
                        {},
                      );
                    })
                  }
                >
                  {t.cancel}
                </button>
              )}
              {["completed", "cancelled", "failed"].includes(j.status) && (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    if (window.confirm(t.historyDeleteConfirm))
                      void act(async () => {
                        await request("/api/media/jobs/" + j.id, {}, "DELETE");
                      });
                  }}
                >
                  {t.remove}
                </button>
              )}
              {j.status === "failed" && (
                <p className="media-error">
                  {t.error}{" "}
                  {j.result?.error?.code && <bdi>{j.result.error.code}</bdi>}
                </p>
              )}
              {j.result?.text && (
                <>
                  <pre dir="auto">{j.result.text}</pre>
                  <button
                    type="button"
                    onClick={() =>
                      downloadBlob(
                        new Blob([j.result.text], {
                          type: "text/plain;charset=utf-8",
                        }),
                        "afg-result.txt",
                      )
                    }
                  >
                    {t.export}
                  </button>
                </>
              )}
              {j.result?.fileId && (
                <p>
                  {t.files}: <bdi>{j.result.fileId}</bdi>
                </p>
              )}
              <p className="media-note">
                {j.usage ? `${t.usage}: ${JSON.stringify(j.usage)}` : t.unknown}
                {j.duration_ms !== null
                  ? ` · ${t.duration}: ${formatLocalizedNumber(j.duration_ms, language)}`
                  : ""}
              </p>
            </li>
          ))}
        </ol>
        <nav aria-label={t.history}>
          <button
            type="button"
            disabled={!offset}
            onClick={() => setOffset(Math.max(0, offset - 20))}
          >
            {t.previous}
          </button>
          <button
            type="button"
            disabled={next === null}
            onClick={() => setOffset(next!)}
          >
            {t.next}
          </button>
        </nav>
      </section>
    </section>
  );
}
