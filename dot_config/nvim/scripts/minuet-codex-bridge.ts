import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { accessSync, constants, readFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { delimiter, join } from "node:path";
import { pathToFileURL } from "node:url";

import type { Api, AssistantMessage, Context, Model } from "@earendil-works/pi-ai";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

const HOST = "127.0.0.1";
const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
const MAX_REQUEST_BYTES = 1024 * 1024;
const DEFAULT_MAX_TOKENS = 56;
const MAX_COMPLETION_TOKENS = 256;
const CODEX_SESSION_ID = `minuet-${randomUUID()}`;

type ChatMessage = {
  readonly role: "system" | "user" | "assistant";
  readonly content: string;
};

type ChatCompletionRequest = {
  readonly model: string;
  readonly messages: readonly ChatMessage[];
  readonly stream: boolean;
  readonly maxTokens: number;
};

type CompletionModel = Model<"openai-codex-responses">;
type CompletionModelIdentity = Pick<CompletionModel, "api" | "provider" | "id">;

class ChatCompletionRequestError extends Error {
  readonly _tag = "ChatCompletionRequestError" as const;
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(`Minuet Codex bridge request invalid: ${message}`);
    this.statusCode = statusCode;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCodexCompletionModel(model: Model<Api> | undefined): model is CompletionModel {
  return model?.api === "openai-codex-responses";
}

function parseChatCompletionRequest(value: unknown): ChatCompletionRequest {
  if (!isRecord(value) || typeof value.model !== "string" || !Array.isArray(value.messages)) {
    throw new ChatCompletionRequestError(
      'body must contain string "model" and array "messages"',
      400,
    );
  }

  const messages: ChatMessage[] = value.messages.map((message) => {
    if (
      !isRecord(message) ||
      (message.role !== "system" && message.role !== "user" && message.role !== "assistant") ||
      typeof message.content !== "string"
    ) {
      throw new ChatCompletionRequestError(
        "messages must contain a supported role and string content",
        400,
      );
    }
    return { role: message.role, content: message.content };
  });
  if (
    messages.filter((message) => message.role === "system").length > 1 ||
    messages.slice(1).some((message) => message.role === "system")
  ) {
    throw new ChatCompletionRequestError("at most one leading system message is supported", 400);
  }

  const rawMaxTokens = value.max_completion_tokens ?? value.max_tokens ?? DEFAULT_MAX_TOKENS;
  if (typeof rawMaxTokens !== "number" || !Number.isInteger(rawMaxTokens) || rawMaxTokens < 1) {
    throw new ChatCompletionRequestError("max_tokens must be a positive integer", 400);
  }

  if (value.stream !== undefined && typeof value.stream !== "boolean") {
    throw new ChatCompletionRequestError("stream must be a boolean", 400);
  }

  return {
    model: value.model,
    messages,
    stream: value.stream ?? false,
    maxTokens: Math.min(rawMaxTokens, MAX_COMPLETION_TOKENS),
  };
}

function emptyUsage(): AssistantMessage["usage"] {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  };
}

function makeCodexContext(request: ChatCompletionRequest, model: CompletionModelIdentity): Context {
  const systemPrompt = request.messages
    .filter((message) => message.role === "system")
    .map((message) => message.content)
    .join("\n\n");
  const timestamp = Date.now();
  const messages: Context["messages"] = [];
  for (const message of request.messages) {
    if (message.role === "user") {
      messages.push({ role: "user", content: message.content, timestamp });
    } else if (message.role === "assistant") {
      messages.push({
        role: "assistant",
        content: [{ type: "text", text: message.content }],
        api: model.api,
        provider: model.provider,
        model: model.id,
        usage: emptyUsage(),
        stopReason: "stop",
        timestamp,
      });
    }
  }

  return { systemPrompt: systemPrompt || undefined, messages };
}

function findExecutable(name: string): string | undefined {
  const names = process.platform === "win32" ? [`${name}.cmd`, `${name}.exe`, name] : [name];
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    for (const candidateName of names) {
      const candidate = join(directory, candidateName);
      try {
        accessSync(candidate, constants.X_OK);
        return candidate;
      } catch {
        // Keep searching PATH.
      }
    }
  }
  return undefined;
}

function resolvePiCodingAgentEntry(): string {
  if (process.env.PI_PACKAGE_DIR) {
    return pathToFileURL(join(process.env.PI_PACKAGE_DIR, "dist", "index.js")).href;
  }

  try {
    return import.meta.resolve("@earendil-works/pi-coding-agent");
  } catch {
    const piExecutable = findExecutable("pi");
    if (!piExecutable) throw new Error("Minuet Codex bridge startup failed: pi is not on PATH");

    const shim = readFileSync(piExecutable, "utf8");
    const cliPath = /cmd-shim-target=(.+?)(?:\r?\n|$)/u.exec(shim)?.[1]?.trim();
    const marker = "dist/bundle/cli.js";
    if (!cliPath?.replaceAll("\\", "/").endsWith(marker)) {
      throw new Error("Minuet Codex bridge startup failed: cannot locate Pi's installed package");
    }
    return pathToFileURL(join(cliPath.slice(0, -marker.length), "dist", "index.js")).href;
  }
}

async function createModelRuntime(): Promise<ModelRuntime> {
  const module: unknown = await import(resolvePiCodingAgentEntry());
  if (!isRecord(module) || typeof module.ModelRuntime !== "function") {
    throw new Error("Minuet Codex bridge startup failed: Pi does not export ModelRuntime");
  }
  // SAFETY: The runtime check above proves this is Pi's ModelRuntime constructor; the dynamic import is needed for global Pi installs.
  const ModelRuntimeConstructor = module.ModelRuntime as typeof ModelRuntime;
  return ModelRuntimeConstructor.create({ refreshOnCreate: false });
}

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_REQUEST_BYTES) {
      throw new ChatCompletionRequestError("body exceeds 1 MiB", 413);
    }
    chunks.push(buffer);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new ChatCompletionRequestError("body is not valid JSON", 400);
  }
}

function writeJson(response: ServerResponse, statusCode: number, value: unknown): void {
  response.writeHead(statusCode, { "Content-Type": "application/json" });
  response.end(JSON.stringify(value));
}

function writeChatCompletionChunk(
  response: ServerResponse,
  id: string,
  model: string,
  delta: string,
): void {
  response.write(
    `data: ${JSON.stringify({ id, object: "chat.completion.chunk", model, choices: [{ index: 0, delta: { content: delta }, finish_reason: null }] })}\n\n`,
  );
}

async function completeChatRequest(
  runtime: ModelRuntime,
  request: ChatCompletionRequest,
  response: ServerResponse,
): Promise<void> {
  const model = runtime.getModel("openai-codex", request.model);
  if (!isCodexCompletionModel(model))
    throw new ChatCompletionRequestError(`unknown OpenAI Codex model "${request.model}"`, 400);

  const controller = new AbortController();
  let completed = false;
  response.once("close", () => {
    if (!completed) controller.abort();
  });

  const id = `chatcmpl-${randomUUID()}`;
  const chunks: string[] = [];
  let finishReason: "stop" | "length" = "stop";
  if (request.stream) {
    response.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
  }

  const stream = runtime.stream(model, makeCodexContext(request, model), {
    signal: controller.signal,
    maxTokens: request.maxTokens,
    reasoningEffort: "none",
    sessionId: CODEX_SESSION_ID,
    toolChoice: "none",
    transport: "websocket",
  });

  for await (const event of stream) {
    if (event.type === "text_delta") {
      chunks.push(event.delta);
      if (request.stream) writeChatCompletionChunk(response, id, model.id, event.delta);
    } else if (event.type === "error") {
      throw new Error(
        `Minuet Codex bridge completion failed: ${event.error.errorMessage ?? event.reason}`,
      );
    } else if (event.type === "done" && event.reason === "length") {
      finishReason = "length";
    }
  }

  completed = true;
  if (request.stream) {
    response.write(
      `data: ${JSON.stringify({ id, object: "chat.completion.chunk", model: model.id, choices: [{ index: 0, delta: {}, finish_reason: finishReason }] })}\n\n`,
    );
    response.end("data: [DONE]\n\n");
  } else {
    writeJson(response, 200, {
      id,
      object: "chat.completion",
      model: model.id,
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: chunks.join("") },
          finish_reason: finishReason,
        },
      ],
    });
  }
}

async function handleRequest(
  runtimePromise: Promise<ModelRuntime>,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  if (request.url !== CHAT_COMPLETIONS_PATH) {
    writeJson(response, 404, { error: { message: "Minuet Codex bridge route not found" } });
    return;
  }
  if (request.method !== "POST") {
    writeJson(response, 405, { error: { message: "Minuet Codex bridge requires POST" } });
    return;
  }

  try {
    await completeChatRequest(
      await runtimePromise,
      parseChatCompletionRequest(await readJsonBody(request)),
      response,
    );
  } catch (error) {
    const statusCode = error instanceof ChatCompletionRequestError ? error.statusCode : 502;
    const message =
      error instanceof Error ? error.message : "Minuet Codex bridge completion failed";
    if (!response.headersSent) writeJson(response, statusCode, { error: { message } });
    else if (!response.writableEnded)
      response.end(`data: ${JSON.stringify({ error: { message } })}\n\n`);
  }
}

function runSelfCheck(): void {
  const request = parseChatCompletionRequest({
    model: "gpt-5.6-luna",
    stream: true,
    max_tokens: 56,
    messages: [
      { role: "system", content: "Complete code." },
      { role: "user", content: "const answer = " },
    ],
  });
  assert.equal(request.maxTokens, 56);
  assert.equal(
    makeCodexContext(request, {
      api: "openai-codex-responses",
      provider: "openai-codex",
      id: request.model,
    }).systemPrompt,
    "Complete code.",
  );
  assert.throws(() =>
    parseChatCompletionRequest({
      model: request.model,
      messages: [{ role: "tool", content: "x" }],
    }),
  );
}

async function main(): Promise<void> {
  if (process.argv[2] === "--self-check") {
    runSelfCheck();
    return;
  }

  const port = Number(process.argv[2]);
  if (!Number.isInteger(port) || port < 0 || port > 65_535) {
    throw new Error("Minuet Codex bridge startup failed: expected a valid port argument");
  }

  const runtime = createModelRuntime();
  const server = createServer(
    (request, response) => void handleRequest(runtime, request, response),
  );
  process.stdin.resume();
  process.stdin.once("end", () => {
    server.closeAllConnections();
    server.close(() => process.exit());
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, HOST, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Minuet Codex bridge startup failed: cannot read listening port"));
        return;
      }
      process.stdout.write(`${address.port}\n`);
      resolve();
    });
  });
  await runtime;
}

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Minuet Codex bridge startup failed");
  process.exitCode = 1;
});
