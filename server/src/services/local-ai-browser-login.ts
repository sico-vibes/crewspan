import { type ChildProcessWithoutNullStreams } from "node:child_process";
import { open } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { runSetupTokenLogin } from "@paperclipai/adapter-claude-local/server";
import { runDeviceLogin } from "@paperclipai/adapter-codex-local/server";
import { ensureCommandResolvable, resolveCommandForLogs } from "@paperclipai/adapter-utils/server-utils";
import { resolveCodexCommand } from "../vendor/paperclip-runner/index.js";
import { LoginTerminalError, spawnLoginTerminal, terminalExitError } from "./windows-login-terminal.js";

export type LocalBrowserLoginState = {
  authorizationUrl?: string;
  code?: string;
  outcome?: "success" | "failure";
  error?: string;
  submitCode?: (code: string) => void;
  abort: () => void;
};

/** Run the same browser-code login used by sandbox connections on the local host. */
export function startLocalBrowserLogin(provider: "anthropic" | "openai", home: string): LocalBrowserLoginState {
  const controller = new AbortController();
  const state: LocalBrowserLoginState = { abort: () => controller.abort() };
  const args = provider === "anthropic" ? ["setup-token"] : ["login", "--device-auth"];
  let child: ChildProcessWithoutNullStreams | null = null;
  const driver = {
    async start(_command: string, onData: (chunk: string) => void): Promise<{ exitCode: number | null }> {
      let executable = "claude";
      if (provider === "openai") {
        // Linux ARM64 retains its supported legacy CLI path; it is not a
        // qualified native runner target. Other hosts prefer the installed
        // dependency, then an existing CLI when the dependency is absent.
        const legacyPlatform = process.platform === "linux" && process.arch === "arm64";
        try {
          if (legacyPlatform) {
            await ensureCommandResolvable("codex", home, process.env);
            executable = path.resolve(home, await resolveCommandForLogs("codex", home, process.env));
          } else {
            executable = resolveCodexCommand();
          }
        } catch {
          state.error = legacyPlatform
            ? "Codex browser sign-in requires the Codex CLI on this platform. Install Codex on this execution host and ensure codex is on Paperclip's PATH, then start sign-in again."
            : "Codex browser sign-in requires an installed Codex CLI. Install Codex on this execution host or restore Paperclip's runtime dependencies, then start sign-in again.";
          throw new Error("Browser login runtime unavailable");
        }
      }
      if (controller.signal.aborted) throw new Error("Local sign-in cancelled before launch");
      const env = { ...process.env,
        ANTHROPIC_API_KEY: "", ANTHROPIC_AUTH_TOKEN: "", CLAUDE_CODE_OAUTH_TOKEN: "",
        OPENAI_API_KEY: "", CODEX_API_KEY: "",
        CLAUDE_CONFIG_DIR: provider === "anthropic" ? home : process.env.CLAUDE_CONFIG_DIR,
        CODEX_HOME: provider === "openai" ? home : process.env.CODEX_HOME,
        BROWSER: "true",
      };
      return new Promise((resolve, reject) => {
        try {
          child = spawnLoginTerminal(executable, args, env);
        } catch (error) {
          state.error = error instanceof LoginTerminalError
            ? error.message
            : "Browser sign-in requires Python 3 and a working local terminal. Install Python 3 on this execution host, then start sign-in again.";
          reject(new Error("Browser login terminal unavailable"));
          return;
        }
        child.stdout.on("data", (bytes: Buffer) => onData(bytes.toString("utf8")));
        // Provider output may contain secrets. Never log or retain stderr.
        child.stderr.resume();
        child.once("error", () => {
          state.error = process.platform === "win32"
            ? "Browser sign-in could not open a Windows terminal. Start sign-in again."
            : "Browser sign-in requires Python 3 and a working local terminal. Install Python 3 on this execution host, then start sign-in again.";
          reject(new Error("Browser login terminal unavailable"));
        });
        child.once("close", (exitCode) => {
          const terminalError = terminalExitError(exitCode);
          if (terminalError) state.error = terminalError;
          resolve({ exitCode });
        });
      });
    },
    write(input: string) { child?.stdin.write(input); },
    stop() { child?.kill("SIGTERM"); },
    async dispose() { child?.kill("SIGTERM"); },
    async readFile(file: string) { const { readLocalAiCredentialFile } = await import("./local-ai-credential-file.js"); return Buffer.from(await readLocalAiCredentialFile(file)); },
  };
  if (provider === "anthropic") {
    let deliverCode: ((code: string) => void) | undefined;
    const codeReady = new Promise<string>((resolve) => { deliverCode = resolve; });
    state.submitCode = (code) => { deliverCode?.(code); deliverCode = undefined; };
    void runSetupTokenLogin(driver, {
      timeoutMs: 300_000, signal: controller.signal,
      onPrompt: (prompt) => { state.authorizationUrl = prompt.url; },
      provideCode: (signal) => new Promise<string>((resolve, reject) => {
        const abort = () => reject(new Error("Local sign-in cancelled"));
        if (signal.aborted) { abort(); return; }
        signal.addEventListener("abort", abort, { once: true });
        codeReady.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
      }),
      onCredential: async (bytes) => {
        const file = await open(path.join(home, ".credentials.json"),
          constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | constants.O_NOFOLLOW, 0o600);
        try {
          await file.writeFile(JSON.stringify({ claudeAiOauth: { accessToken: bytes.toString("utf8") } }));
        } finally {
          await file.close();
        }
      },
    }).then((result) => { state.outcome = result.outcome === "success" ? "success" : "failure"; })
      .catch(() => { state.outcome = "failure"; });
  } else {
    void runDeviceLogin(driver, {
      timeoutMs: 300_000, signal: controller.signal,
      onPrompt: (prompt) => { state.authorizationUrl = prompt.url; state.code = prompt.code; },
    }).then((result) => { state.outcome = result.outcome === "success" ? "success" : "failure"; })
      .catch(() => { state.outcome = "failure"; });
  }
  return state;
}
