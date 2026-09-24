import type { AdapterModel } from "@paperclipai/adapter-utils";

let cached: { until: number; models: AdapterModel[] } | undefined;
let pending: Promise<AdapterModel[]> | undefined;

/** OpenCode Go publishes its own catalog independently of OpenRouter. */
export async function listOpenCodeGoModels(refresh = false): Promise<AdapterModel[]> {
  if (!refresh && cached && cached.until > Date.now()) return cached.models;
  if (pending) return pending;
  pending = (async () => {
    const response = await fetch("https://opencode.ai/zen/go/v1/models", {
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error("Could not load OpenCode Go models. Retry or enter a model ID manually.");
    const body = await response.json() as { data?: Array<{ id?: unknown; name?: unknown }> };
    if (!Array.isArray(body.data)) throw new Error("OpenCode Go returned an invalid model catalog.");
    const models = body.data.flatMap((model) => typeof model.id === "string"
      ? [{ id: `opencode-go/${model.id}`, label: typeof model.name === "string" && model.name ? model.name : model.id }]
      : []).sort((a, b) => a.label.localeCompare(b.label));
    cached = { until: Date.now() + 60_000, models };
    return models;
  })();
  try { return await pending; } finally { pending = undefined; }
}
