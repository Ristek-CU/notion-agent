// src/ai/anthropic-client.ts
// Anthropic API client — uses z.ai proxy (Anthropic-compatible endpoint)

import Anthropic from "@anthropic-ai/sdk";
import { env } from "../config.js";
import * as fs from "fs";
import * as path from "path";

export interface AnthropicMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AnthropicResponse {
  content: { type: "text"; text: string }[];
  model: string;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
}

// ─── AI Call Logging ─────────────────────────────────────────────────────

const LOG_DIR = path.resolve(process.cwd(), "logs");
const LOG_FILE = path.join(LOG_DIR, "ai-calls.csv");

interface AICallLog {
  timestamp: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
  inference_ms: number;
  caller: string;
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
  if (!fs.existsSync(LOG_FILE)) {
    fs.writeFileSync(
      LOG_FILE,
      "timestamp,model,input_tokens,output_tokens,inference_ms,caller\n",
      "utf-8"
    );
  }
}

function logAICall(entry: AICallLog) {
  try {
    ensureLogDir();
    const line = `${entry.timestamp},${entry.model},${entry.input_tokens},${entry.output_tokens},${entry.inference_ms},${entry.caller}\n`;
    fs.appendFileSync(LOG_FILE, line, "utf-8");
  } catch (err) {
    console.warn("[AI-Log] Failed to write log:", err);
  }
}

// ─── Cumulative Stats ────────────────────────────────────────────────────

let totalCalls = 0;
let totalInputTokens = 0;
let totalOutputTokens = 0;
let totalInferenceMs = 0;

export function getAIStats() {
  return {
    totalCalls,
    totalInputTokens,
    totalOutputTokens,
    totalInferenceMs,
    avgInferenceMs: totalCalls > 0 ? Math.round(totalInferenceMs / totalCalls) : 0,
  };
}

// ─── Detect caller from stack trace ─────────────────────────────────────

function detectCaller(): string {
  const stack = new Error().stack;
  if (!stack) return "unknown";
  const lines = stack.split("\n");
  for (const line of lines) {
    if (line.includes("agent.ts")) {
      const match = line.match(/(\w+)\s*\(/);
      if (match) return match[1];
    }
  }
  return "unknown";
}

// ─── Anthropic Client ────────────────────────────────────────────────────

const client = new Anthropic({
  apiKey: env.ANTHROPIC_API_KEY,
  baseURL: env.ANTHROPIC_BASE_URL,
});

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // ms — exponential backoff

/**
 * Send a message to the Anthropic API (via z.ai proxy).
 */
export async function createMessage(
  messages: AnthropicMessage[],
  options?: { maxTokens?: number; system?: string }
): Promise<AnthropicResponse> {
  const caller = detectCaller();
  const startTime = Date.now();

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const result = await client.messages.create({
        model: env.AI_MODEL,
        max_tokens: options?.maxTokens ?? 1024,
        system: options?.system ?? "",
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content,
        })),
      });

      const inferenceMs = Date.now() - startTime;
      const inputTokens = result.usage?.input_tokens ?? 0;
      const outputTokens = result.usage?.output_tokens ?? 0;

      totalCalls++;
      totalInputTokens += inputTokens;
      totalOutputTokens += outputTokens;
      totalInferenceMs += inferenceMs;

      logAICall({
        timestamp: new Date().toISOString(),
        model: result.model,
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        inference_ms: inferenceMs,
        caller,
      });

      console.log(
        `[AI-Call] ${caller} | ${inputTokens}in ${outputTokens}out tokens | ${inferenceMs}ms`
      );

      return result as AnthropicResponse;
    } catch (error: unknown) {
      lastError = error instanceof Error ? error : new Error(String(error));

      const status = (error as { status?: number })?.status;
      const isRetryable = status === 429 || (status !== undefined && status >= 500);
      if (!isRetryable || attempt === MAX_RETRIES) {
        break;
      }

      const delay = RETRY_DELAYS[attempt] ?? 10000;
      console.warn(
        `[AI] Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms (status ${status})`
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}
