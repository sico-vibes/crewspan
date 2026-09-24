import type { AdapterModel } from "./types.js";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { models as codexFallbackModels } from "@paperclipai/adapter-codex-local";
import { readConfigFile } from "../config-file.js";

const OPENAI_MODELS_ENDPOINT = "https://api.openai.com/v1/models";
const OPENAI_MODELS_TIMEOUT_MS = 5000;
const OPENAI_MODELS_CACHE_TTL_MS = 60_000;

let cached: { keyFingerprint: string; expiresAt: number; models: AdapterModel[] } | null = null;

function fingerprint(apiKey: string): string {
  return `${apiKey.length}:${apiKey.slice(-6)}`;
}

function dedupeModels(models: AdapterModel[]): AdapterModel[] {
  const seen = new Set<string>();
  const deduped: AdapterModel[] = [];
  for (const model of models) {
    const id = model.id.trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    deduped.push({ id, label: model.label.trim() || id });
  }
  return deduped;
}

function mergedWithFallback(models: AdapterModel[]): AdapterModel[] {
  return dedupeModels([
    ...models,
    ...codexFallbackModels,
  ]).sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true, sensitivity: "base" }));
}

// The Codex subscription does not provide an OPENAI_API_KEY, so /v1/models is
// unavailable in the common local setup. Codex keeps its account's current
// model catalog here; use only the public selector fields, never model prompts.
async function readCodexCliModels(): Promise<AdapterModel[]> {
  const codexHome = process.env.CODEX_HOME?.trim() || join(homedir(), ".codex");
  try {
    const raw = JSON.parse(await readFile(join(codexHome, "models_cache.json"), "utf8")) as {
      models?: unknown;
    };
    if (!Array.isArray(raw.models)) return [];
    return dedupeModels(raw.models.flatMap((entry: unknown) => {
      if (!entry || typeof entry !== "object") return [];
      const model = entry as Record<string, unknown>;
      if (model.visibility !== "list" || model.supported_in_api === false) return [];
      if (typeof model.slug !== "string" || !/^[a-z0-9][a-z0-9._-]*$/i.test(model.slug)) return [];
      return [{
        id: model.slug,
        label: typeof model.display_name === "string" && model.display_name.trim()
          ? model.display_name.trim()
          : model.slug,
      }];
    }));
  } catch {
    return [];
  }
}

function resolveOpenAiApiKey(): string | null {
  const envKey = process.env.OPENAI_API_KEY?.trim();
  if (envKey) return envKey;

  const config = readConfigFile();
  if (config?.llm?.provider !== "openai") return null;
  const configKey = config.llm.apiKey?.trim();
  return configKey && configKey.length > 0 ? configKey : null;
}

async function fetchOpenAiModels(apiKey: string): Promise<AdapterModel[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_MODELS_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_MODELS_ENDPOINT, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    });
    if (!response.ok) return [];

    const payload = (await response.json()) as { data?: unknown };
    const data = Array.isArray(payload.data) ? payload.data : [];
    const models: AdapterModel[] = [];
    for (const item of data) {
      if (typeof item !== "object" || item === null) continue;
      const id = (item as { id?: unknown }).id;
      if (typeof id !== "string" || id.trim().length === 0) continue;
      models.push({ id, label: id });
    }
    return dedupeModels(models);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function loadCodexModels(options?: { forceRefresh?: boolean }): Promise<AdapterModel[]> {
  const forceRefresh = options?.forceRefresh === true;
  const apiKey = resolveOpenAiApiKey();
  const fallback = dedupeModels(codexFallbackModels);
  const cliModels = await readCodexCliModels();
  if (!apiKey) return cliModels.length > 0 ? mergedWithFallback(cliModels) : fallback;

  const now = Date.now();
  const keyFingerprint = fingerprint(apiKey);
  if (!forceRefresh && cached && cached.keyFingerprint === keyFingerprint && cached.expiresAt > now) {
    return cached.models;
  }

  const fetched = await fetchOpenAiModels(apiKey);
  if (fetched.length > 0) {
    const merged = mergedWithFallback([...cliModels, ...fetched]);
    cached = {
      keyFingerprint,
      expiresAt: now + OPENAI_MODELS_CACHE_TTL_MS,
      models: merged,
    };
    return merged;
  }

  if (cached && cached.keyFingerprint === keyFingerprint && cached.models.length > 0) {
    return cached.models;
  }

  return cliModels.length > 0 ? mergedWithFallback(cliModels) : fallback;
}

export async function listCodexModels(): Promise<AdapterModel[]> {
  return loadCodexModels();
}

export async function refreshCodexModels(): Promise<AdapterModel[]> {
  return loadCodexModels({ forceRefresh: true });
}

export function resetCodexModelsCacheForTests() {
  cached = null;
}
