import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { spawn } from "node:child_process";
import { unlink } from "node:fs/promises";
import { pool } from "../../api/database.ts";
import {
  getProviderAdapter,
  getVerifiedModelDescriptors,
  isFeatureFlagEnabled,
} from "../providerGateway.ts";
import { enforceModelSubscription } from "../../api/modelAccess.ts";
import { infer } from "../agents/registry.ts";
import {
  mediaRequest,
  localTypes,
  type MediaType,
  type MediaRequest,
  type MediaOutput,
  type MediaInput,
} from "./contracts.ts";
import { ProviderAdapterError } from "../../providers/providerTypes.ts";
import { ownedInputs, saveOutput } from "./storage.ts";
const flags: Partial<Record<MediaType, string>> = {
  image_generate: "image_generation_enabled",
  image_edit: "image_generation_enabled",
  image_understand: "chat",
  ocr: "chat",
  speech_generate: "voice_enabled",
  speech_recognize: "voice_enabled",
  text: "chat",
  document_analyze: "chat",
};
export const mediaSupport: Partial<Record<MediaType, string>> = {
  text: "text",
  image_generate: "imageGen",
  image_edit: "imageEdit",
  image_understand: "vision",
  ocr: "vision",
  speech_recognize: "stt",
  speech_generate: "tts",
  document_analyze: "text",
};
export async function localAvailability() {
  const probe = process.env.AFG_FFPROBE_PATH || "/usr/bin/ffprobe";
  return {
    document_extract: true,
    video_analyze:
      probe.startsWith("/") &&
      (await access(probe, constants.X_OK).then(
        () => true,
        () => false,
      )),
  };
}
const endpoints: Partial<Record<MediaType, string>> = {
  image_generate: "/images/generations",
  image_edit: "/images/edits",
  speech_recognize: "/audio/transcriptions",
  speech_generate: "/audio/speech",
  image_understand: "/chat/completions",
  ocr: "/chat/completions",
};
/** Administrator attestation supplements sparse /models catalogues; never matches by model name. */
export function mediaConfiguration() {
  try {
    const raw = process.env.AFG_MEDIA_TASKS_JSON || "{}";
    if (raw.length > 64000) throw new Error("size");
    const value = JSON.parse(raw);
    if (
      !value ||
      typeof value !== "object" ||
      Array.isArray(value) ||
      Object.keys(value).length > 500
    )
      throw new Error("shape");
    for (const [key, tasks] of Object.entries(value)) {
      if (
        !key.includes("::") ||
        key.length > 500 ||
        !Array.isArray(tasks) ||
        tasks.length > 12 ||
        tasks.some((t) => typeof t !== "string" || !(t in endpoints))
      )
        throw new Error("entry");
    }
    return { valid: true, tasks: value as Record<string, MediaType[]> };
  } catch {
    return { valid: false, tasks: {} as Record<string, MediaType[]> };
  }
}
export function configuredMediaTasks(
  provider: string,
  model: string,
): MediaType[] {
  return mediaConfiguration().tasks[provider + "::" + model] || [];
}
if (!mediaConfiguration().valid)
  console.warn("AFG_MEDIA_CONFIG_INVALID: check AFG_MEDIA_TASKS_JSON.");
export async function mediaModels(userId: string) {
  const enabled = await Promise.all(
    Object.entries(mediaSupport).map(
      async ([type, cap]) =>
        [
          type,
          await isFeatureFlagEnabled(
            flags[type as MediaType]!,
            ["text", "document_analyze", "image_understand", "ocr"].includes(
              type,
            ),
          ),
        ] as const,
    ),
  );
  const models = [];
  for (const model of await getVerifiedModelDescriptors()) {
    if (
      !model.enabled ||
      !model.verifiedAt ||
      !Number.isFinite(Date.parse(model.verifiedAt)) ||
      Date.now() - Date.parse(model.verifiedAt) > 300000
    )
      continue;
    const adapter = await getProviderAdapter(model.providerId);
    if (!adapter) continue;
    const declared = configuredMediaTasks(model.providerId, model.id);
    const tasks = enabled
      .filter(([type, on]) => {
        const task = type as MediaType;
        if (!on) return false;
        if (type === "text" || type === "document_analyze")
          return model.capabilities.text && model.capabilities.streaming;
        const endpoint = endpoints[task];
        const advertised = model.mediaEndpoints?.some(
          (e) =>
            "/" + e.replace(/^\/?v1\//, "").replace(/^\//, "") === endpoint,
        );
        return (
          Boolean(adapter.executeMedia) &&
          (declared.includes(task) ||
            Boolean(
              advertised && (model.capabilities as any)[mediaSupport[task]!],
            ))
        );
      })
      .map(([type]) => type);
    if (!tasks.length) continue;
    try {
      await enforceModelSubscription(userId, model.providerId, model.id);
    } catch {
      continue;
    }
    models.push({
      provider: model.providerId,
      id: model.id,
      name: model.displayName,
      tasks,
    });
  }
  return models;
}
class MediaValidationError extends ProviderAdapterError {
  constructor(message: string) {
    super(message, 400, "invalid_media_request");
  }
}
export async function validateMedia(userId: string, request: MediaRequest) {
  const inputs = await ownedInputs(userId, request.inputFileIds);
  if (localTypes.includes(request.type)) {
    if (request.provider || request.model)
      throw new MediaValidationError(
        "Local extraction does not accept a provider or model.",
      );
    if (
      !(await localAvailability())[
        request.type as "document_extract" | "video_analyze"
      ]
    )
      throw new MediaValidationError("Local extractor is not installed.");
  } else {
    if (
      !request.provider ||
      !request.model ||
      !(await mediaModels(userId)).some(
        (m) =>
          m.provider === request.provider &&
          m.id === request.model &&
          m.tasks.includes(request.type),
      )
    )
      throw new MediaValidationError(
        "No enabled, verified provider supports this operation. Configure the provider and enable its model and feature flag in Admin.",
      );
    if (inputs.length && !request.allowExternalProcessing)
      throw new MediaValidationError(
        "Explicit permission is required to send file content to the selected provider.",
      );
  }
  if (
    [
      "image_generate",
      "image_edit",
      "image_understand",
      "speech_generate",
      "text",
      "document_analyze",
    ].includes(request.type) &&
    !request.prompt
  )
    throw new MediaValidationError("A prompt is required.");
  if (
    ["image_edit", "image_understand", "ocr"].includes(request.type) &&
    (!inputs.length ||
      inputs.some(
        (i) =>
          !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(
            i.mime,
          ),
      ))
  )
    throw new MediaValidationError("Select an approved supported image.");
  if (request.type === "image_edit" && inputs.length !== 1)
    throw new MediaValidationError("Image editing requires one image.");
  if (
    ["document_extract", "document_analyze"].includes(request.type) &&
    (!inputs.length ||
      inputs.some(
        (i) =>
          ![
            "text/plain",
            "text/markdown",
            "text/csv",
            "application/json",
          ].includes(i.mime),
      ))
  )
    throw new MediaValidationError(
      "Select an approved TXT, Markdown, CSV or JSON document. PDF and Office extraction are not implemented.",
    );
  if (
    request.type === "speech_recognize" &&
    (inputs.length !== 1 ||
      ![
        "audio/wav",
        "audio/mpeg",
        "audio/ogg",
        "audio/webm",
        "video/mp4",
      ].includes(inputs[0].mime))
  )
    throw new MediaValidationError("Select one approved audio file.");
  if (
    request.type === "video_analyze" &&
    (inputs.length !== 1 ||
      !["video/mp4", "audio/webm"].includes(inputs[0].mime))
  )
    throw new MediaValidationError("Select one approved MP4 or WebM video.");
  if (
    ["image_generate", "speech_generate", "text"].includes(request.type) &&
    inputs.length
  )
    throw new MediaValidationError(
      "This operation does not accept input files.",
    );
  if (request.type === "speech_generate" && !request.parameters.voice)
    throw new MediaValidationError(
      "Enter a voice ID supported by the selected provider.",
    );
  if (request.type !== "speech_generate" && request.parameters.voice)
    throw new MediaValidationError(
      "Voice is only supported by speech generation.",
    );
  if (request.type !== "speech_recognize" && request.parameters.language)
    throw new MediaValidationError(
      "Language is only supported by transcription.",
    );
  if (
    request.type === "document_analyze" &&
    inputs.reduce((n, i) => n + i.bytes.length, 0) > 40000
  )
    throw new MediaValidationError(
      "Document analysis is limited to 40 KB of text; select a smaller document.",
    );
  return inputs;
}
function documentText(inputs: MediaInput[]) {
  return inputs
    .map(
      (i) =>
        `Source: ${i.name}\n${new TextDecoder("utf-8", { fatal: true }).decode(i.bytes)}`,
    )
    .join("\n\n");
}
async function probeVideo(
  input: MediaInput,
  signal: AbortSignal,
): Promise<MediaOutput> {
  // ffprobe reads a bounded stdin stream. Restrict protocols so media cannot open remote/local references.
  const result = await new Promise<string>((resolve, reject) => {
    const child = spawn(
      process.env.AFG_FFPROBE_PATH || "/usr/bin/ffprobe",
      [
        "-v",
        "error",
        "-max_alloc",
        "16777216",
        "-analyzeduration",
        "1000000",
        "-probesize",
        "1000000",
        "-protocol_whitelist",
        "pipe",
        "-show_entries",
        "format=duration,format_name,size:stream=index,codec_type,codec_name,width,height,sample_rate",
        "-of",
        "json",
        "pipe:0",
      ],
      {
        stdio: ["pipe", "pipe", "ignore"],
        signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
      if (output.length > 100000) {
        child.kill("SIGKILL");
        reject(new Error("Video metadata exceeds limit."));
      }
    });
    child.stdin.on("error", () => {});
    child.on("error", () =>
      reject(new Error("Video metadata extractor failed.")),
    );
    child.on("close", (code) =>
      code === 0
        ? resolve(output)
        : reject(new Error("Video metadata extraction failed.")),
    );
    child.stdin.end(input.bytes);
  });
  return {
    text: JSON.stringify(JSON.parse(result), null, 2),
    metadata: { analysis: "container metadata only", source: input.name },
  };
}
/** Invoked only by the existing agent queue. A committed result prevents duplicate billed requests on resume. */
export async function executeMediaJob(
  userId: string,
  jobId: string,
  taskId: string,
  signal: AbortSignal,
) {
  const claimed = await pool!.query(
    `UPDATE media_jobs SET execution_state='executing' WHERE id=$1 AND user_id=$2 AND task_id=$3 AND execution_state='pending' RETURNING *`,
    [jobId, userId, taskId],
  );
  if (!claimed.rowCount) {
    const old = await pool!.query(
      "SELECT execution_state,result FROM media_jobs WHERE id=$1 AND user_id=$2 AND task_id=$3",
      [jobId, userId, taskId],
    );
    if (old.rows[0]?.execution_state === "completed") return old.rows[0].result;
    throw new Error(
      "Media execution is uncertain or failed. Automatic replay is disabled; inspect history before creating a new request.",
    );
  }
  const start = Date.now();
  let saved: { id: string; path: string } | undefined;
  try {
    const request = mediaRequest.parse(claimed.rows[0].request);
    const inputs = await validateMedia(userId, request);
    signal.throwIfAborted();
    let result: MediaOutput;
    if (request.type === "document_extract") {
      if (inputs.reduce((n, i) => n + i.bytes.length, 0) > 90000)
        throw new Error("Text extraction output is limited to 90 KB.");
      result = {
        text: documentText(inputs),
        metadata: { sources: request.inputFileIds, interpretation: false },
      };
    } else if (request.type === "video_analyze")
      result = await probeVideo(inputs[0], signal);
    else if (request.type === "text" || request.type === "document_analyze") {
      const output = await infer(
        userId,
        request.provider + "::" + request.model,
        request.prompt +
          (inputs.length
            ? "\nUntrusted document references:\n" + documentText(inputs)
            : ""),
        signal,
      );
      result = { text: output.text };
    } else {
      const adapter = await getProviderAdapter(request.provider!);
      if (!adapter?.executeMedia)
        throw new Error("Provider media adapter is unavailable.");
      result = await adapter.executeMedia(request, inputs, signal);
    }
    signal.throwIfAborted();
    const db = await pool!.connect();
    try {
      await db.query("BEGIN");
      const state = await db.query(
        "SELECT status FROM agent_tasks WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [taskId, userId],
      );
      if (state.rows[0]?.status !== "running")
        throw new Error("Media task stopped.");
      if (result.bytes)
        saved = await saveOutput(
          db,
          userId,
          jobId,
          Buffer.from(result.bytes),
          result.mime!,
        );
      const output = {
        ...(result.text ? { text: result.text } : {}),
        ...(saved ? { fileId: saved.id, scanRequired: true } : {}),
        ...(result.metadata ? { metadata: result.metadata } : {}),
        provider: request.provider ?? null,
        model: request.model ?? null,
        sources: request.inputFileIds,
      };
      if (Buffer.byteLength(JSON.stringify(output)) > 100000)
        throw new Error("Media output exceeded storage limit.");
      await db.query(
        "UPDATE media_jobs SET execution_state='completed',result=$2,usage=$3,duration_ms=$4,completed_at=now() WHERE id=$1",
        [
          jobId,
          JSON.stringify(output),
          result.usage ? JSON.stringify(result.usage) : null,
          Date.now() - start,
        ],
      );
      await db.query("COMMIT");
      return output;
    } catch (e) {
      await db.query("ROLLBACK");
      if (saved) await unlink(saved.path).catch(() => {});
      throw e;
    } finally {
      db.release();
    }
  } catch (e) {
    await pool!.query(
      "UPDATE media_jobs SET execution_state='failed',duration_ms=$2,result=$3,completed_at=now() WHERE id=$1 AND execution_state='executing'",
      [
        jobId,
        Date.now() - start,
        JSON.stringify({
          error: {
            code:
              e instanceof ProviderAdapterError
                ? e.code
                : signal.aborted
                  ? "execution_interrupted"
                  : e instanceof Error && e.name === "TimeoutError"
                    ? "provider_timeout"
                    : "media_execution_failed",
          },
        }),
      ],
    );
    throw e;
  }
}
