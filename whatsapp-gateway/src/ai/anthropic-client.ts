// src/ai/anthropic-client.ts
// Lightweight Anthropic API client using native fetch.
// The official SDK sends extra headers that break the z.ai proxy,
// so we use fetch directly with only the headers the proxy expects.

import { env } from "../config.js";

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

const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // ms — exponential backoff

/**
 * Send a message to the Anthropic-compatible API (z.ai proxy).
 * Uses native fetch with minimal headers to avoid proxy rejection.
 * Includes automatic retry with exponential backoff for 429/5xx errors.
 */
export async function createMessage(
  messages: AnthropicMessage[],
  options?: { maxTokens?: number; system?: string }
): Promise<AnthropicResponse> {
  const url = `${env.ANTHROPIC_BASE_URL}/v1/messages`;

  const body: Record<string, unknown> = {
    model: env.AI_MODEL,
    max_tokens: options?.maxTokens ?? 500,
    messages,
  };

  if (options?.system) {
    body.system = options.system;
  }

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      return (await response.json()) as AnthropicResponse;
    }

    const errorText = await response.text();
    lastError = new Error(
      `Anthropic API error ${response.status}: ${errorText}`
    );

    // Only retry on 429 (rate limit) or 5xx (server error)
    const isRetryable = response.status === 429 || response.status >= 500;
    if (!isRetryable || attempt === MAX_RETRIES) {
      break;
    }

    const delay = RETRY_DELAYS[attempt] ?? 10000;
    console.warn(
      `[AI] Retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms (status ${response.status})`
    );
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  throw lastError;
}
