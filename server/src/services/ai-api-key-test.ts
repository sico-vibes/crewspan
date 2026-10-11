import type { AiProvider } from "@paperclipai/shared";
import { unprocessable } from "../errors.js";

/** Fixed provider endpoints; credentials are never sent to a caller-supplied URL or through a redirect. */
export async function validateAiApiKey(
  provider: AiProvider,
  key: string,
  request: typeof fetch = fetch,
) {
  const endpoints = {
    anthropic: "https://api.anthropic.com/v1/models?limit=1",
    openai: "https://api.openai.com/v1/models",
    openrouter: "https://openrouter.ai/api/v1/key",
    "opencode-go": "https://opencode.ai/zen/go/v1/chat/completions",
    xai: "https://api.x.ai/v1/models",
    google: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1",
  };
  let response: Response;
  try {
    response = await request(endpoints[provider], {
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      ...(provider === "opencode-go"
        ? {
            method: "POST",
            // Go checks auth before request validation. Empty messages and zero
            // output deliberately fail validation without starting a model run.
            body: JSON.stringify({ model: "glm-5.3-flash", messages: [], max_tokens: 0 }),
          }
        : {}),
      headers:
        provider === "google" ? { "x-goog-api-key": key } : provider === "anthropic"
          ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
          : provider === "opencode-go"
            ? { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }
            : { Authorization: `Bearer ${key}` },
    });
  } catch {
    throw unprocessable("Could not verify the account. Try again.", { code: "ai_connection_verification_failed" });
  }
  await response.body?.cancel();
  if (!response.ok && !(provider === "opencode-go" && (response.status === 400 || response.status === 422)))
    throw unprocessable(
      response.status === 401 || response.status === 403
        ? "The provider rejected this API key."
        : "The provider could not verify this account. Try again.",
      { code: response.status === 401 || response.status === 403 ? "ai_connection_api_key_rejected" : "ai_connection_verification_failed" },
    );
}
