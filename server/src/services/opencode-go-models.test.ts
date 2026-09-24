import { afterEach, expect, it, vi } from "vitest";
import { listOpenCodeGoModels } from "./opencode-go-models.js";

afterEach(() => vi.unstubAllGlobals());

it("loads OpenCode Go models with their provider prefix", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
    data: [{ id: "gpt-6-luna", name: "GPT-6 Luna" }],
  }), { status: 200 })));
  expect(await listOpenCodeGoModels(true)).toEqual([{ id: "opencode-go/gpt-6-luna", label: "GPT-6 Luna" }]);
  expect(fetch).toHaveBeenCalledWith("https://opencode.ai/zen/go/v1/models", {
    signal: expect.any(AbortSignal),
  });
});
