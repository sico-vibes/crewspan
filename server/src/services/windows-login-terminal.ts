import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export class LoginTerminalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LoginTerminalError";
  }
}

const WINDOWS_TERMINAL_ERROR = "Browser sign-in could not open a Windows terminal. Start sign-in again.";
const WINDOWS_START_ERROR = "Browser sign-in could not start the provider CLI. Install it and start sign-in again.";

let registryPath: string | null | undefined;
let bridgePath: string | undefined;

function expandRegistryPath(value: string) {
  return value.replace(/%([^%]+)%/gi, (_, name: string) => process.env[name] ?? `%${name}%`);
}

function readRegistryValue(key: string) {
  const query = spawnSync("reg.exe", ["query", key, "/v", "Path"], { encoding: "utf8", windowsHide: true });
  if (query.status !== 0) return "";
  const line = query.stdout.split(/\r?\n/).find((entry) => /\bPath\b\s+REG_/i.test(entry));
  const value = line?.split(/REG_(?:EXPAND_)?SZ\s+/i)[1]?.trim();
  return value ? expandRegistryPath(value) : "";
}

function mergedWindowsPath(current: string | undefined) {
  if (registryPath === undefined) {
    registryPath = [readRegistryValue("HKCU\\Environment"), readRegistryValue("HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment")]
      .filter(Boolean).join(";");
  }
  const entries = `${current ?? ""};${registryPath ?? ""}`.split(";").map((entry) => entry.trim()).filter(Boolean);
  return [...new Set(entries)].join(";");
}

function resolveOnWindowsPath(name: string, env: NodeJS.ProcessEnv) {
  if (name.includes("\\") || name.includes("/") || path.win32.isAbsolute(name)) return existsSync(name) ? name : null;
  const extensions = ["", ...(env.PATHEXT ?? ".COM;.EXE;.BAT;.CMD").split(";")].map((extension) => {
    if (!extension || extension.startsWith(".")) return extension;
    return `.${extension}`;
  });
  for (const directory of (env.PATH ?? env.Path ?? "").split(";")) {
    if (!directory) continue;
    for (const extension of extensions) {
      const candidate = path.win32.join(directory, `${name}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return null;
}

function resolveWindowsExecutable(executable: string, env: NodeJS.ProcessEnv) {
  return resolveOnWindowsPath(executable, env)
    ?? (executable === "claude" ? resolveOnWindowsPath(path.join(os.homedir(), ".local", "bin", "claude.exe"), env) : null);
}

function compileWindowsPtyBridge() {
  if (bridgePath && existsSync(bridgePath)) return bridgePath;
  const sourcePath = fileURLToPath(new URL("./scripts/windows-pty-bridge.cs", import.meta.url));
  const source = readFileSync(sourcePath);
  const hash = createHash("sha256").update(source).digest("hex").slice(0, 16);
  const directory = path.join(os.tmpdir(), "paperclip-windows-pty", hash);
  const output = path.join(directory, "pty-bridge.exe");
  if (!existsSync(output)) {
    mkdirSync(directory, { recursive: true });
    const compiler = [
      path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework64", "v4.0.30319", "csc.exe"),
      path.join(process.env.WINDIR ?? "C:\\Windows", "Microsoft.NET", "Framework", "v4.0.30319", "csc.exe"),
    ].find((candidate) => existsSync(candidate));
    if (!compiler) throw new LoginTerminalError(WINDOWS_TERMINAL_ERROR);
    const compiled = spawnSync(compiler, ["/nologo", "/optimize+", `/out:${output}`, sourcePath], { windowsHide: true });
    if (compiled.status !== 0 || !existsSync(output)) throw new LoginTerminalError(WINDOWS_TERMINAL_ERROR);
  }
  bridgePath = output;
  return output;
}

function windowsLaunch(executable: string, args: string[]) {
  const extension = path.win32.extname(executable).toLowerCase();
  if (extension === ".js" || extension === ".mjs" || extension === ".cjs") return ["node", process.execPath, executable, ...args];
  if (extension === ".cmd" || extension === ".bat") return ["cmd", executable, ...args];
  if (extension === ".ps1") return ["ps1", executable, ...args];
  if (path.win32.basename(executable).toLowerCase() === "claude.exe") return ["screen", executable, ...args];
  return ["exe", executable, ...args];
}

export function terminalExitError(exitCode: number | null) {
  if (exitCode === 122) return WINDOWS_TERMINAL_ERROR;
  if (exitCode === 123) return WINDOWS_START_ERROR;
  return undefined;
}

/** Starts the provider CLI on a terminal. Unix uses Python pty; Windows uses ConPTY. */
export function spawnLoginTerminal(executable: string, args: string[], env: NodeJS.ProcessEnv): ChildProcessWithoutNullStreams {
  if (process.platform !== "win32") {
    const bridge = String.raw`
import errno, os, pty, select, signal, sys
pid, master = pty.fork()
if pid == 0:
    os.execvpe(sys.argv[1], sys.argv[1:], os.environ)
def stop(_signal, _frame):
    try: os.killpg(pid, signal.SIGKILL)
    except ProcessLookupError: pass
    sys.exit(1)
signal.signal(signal.SIGTERM, stop)
while True:
    readable, _, _ = select.select([master, 0], [], [])
    if 0 in readable:
        data = os.read(0, 4096)
        if data: os.write(master, data)
        else: stop(None, None)
    if master in readable:
        try: data = os.read(master, 4096)
        except OSError as error:
            if error.errno == errno.EIO: break
            raise
        if not data: break
        os.write(1, data)
_, status = os.waitpid(pid, 0)
sys.exit(os.waitstatus_to_exitcode(status))
`;
    return spawn("python3", ["-u", "-c", bridge, executable, ...args], { env, stdio: ["pipe", "pipe", "pipe"] });
  }
  const pathValue = mergedWindowsPath(env.PATH ?? env.Path);
  const childEnv: NodeJS.ProcessEnv = { ...env, PATH: pathValue, Path: pathValue };
  const resolved = resolveWindowsExecutable(executable, childEnv);
  if (resolved && path.win32.basename(resolved).toLowerCase() === "claude.exe") delete childEnv.BROWSER;
  if (!resolved) {
    throw new LoginTerminalError(executable === "claude"
      ? "Claude browser sign-in requires the Claude CLI. Install Claude on this computer and start sign-in again."
      : WINDOWS_START_ERROR);
  }
  return spawn(compileWindowsPtyBridge(), windowsLaunch(resolved, args), { env: childEnv, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
}
