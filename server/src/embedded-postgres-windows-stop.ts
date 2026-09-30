import { execFile as nodeExecFile } from "node:child_process";
import { promisify } from "node:util";
import { win32 as windowsPath } from "node:path";

type ExecFile = (file: string, args: string[], opts: { timeout: number }) => Promise<unknown>;
type RunningChild = {
  pid?: number;
  spawnfile: string;
  on(event: "exit", listener: (...args: unknown[]) => void): unknown;
  removeListener(event: "exit", listener: (...args: unknown[]) => void): unknown;
};
type EmbeddedPostgresInternals = {
  process?: RunningChild;
  options?: { persistent?: boolean };
};

const execFile = promisify(nodeExecFile) as unknown as ExecFile;

export function applyCleanWindowsStop<T extends { stop(): Promise<void> }>(
  instance: T,
  options: {
    databaseDir: string;
    platform?: NodeJS.Platform;
    execFile?: ExecFile;
    stopTimeoutSeconds?: number;
    exitWaitMs?: number;
    log?: (message: string) => void;
  },
): T {
  if ((options.platform ?? process.platform) !== "win32") return instance;

  const originalStop = instance.stop;
  const internals = instance as T & EmbeddedPostgresInternals;
  const runExecFile = options.execFile ?? execFile;
  const stopTimeoutSeconds = options.stopTimeoutSeconds ?? 30;
  const exitWaitMs = options.exitWaitMs ?? 35_000;

  // Logging must never be able to skip the fallback stop.
  const safeLog = (message: string) => {
    try {
      options.log?.(message);
    } catch {
      // ignore
    }
  };

  const runStop = async (): Promise<void> => {
    const child = internals.process;
    if (!child) return;

    // Preserve the package's documented nonpersistent cleanup. The server
    // constructs this instance with persistent: true, but other callers may not.
    if (internals.options?.persistent === false) {
      await originalStop.call(instance);
      return;
    }

    const pgCtl = windowsPath.join(windowsPath.dirname(child.spawnfile), "pg_ctl.exe");
    let exitTimer: ReturnType<typeof setTimeout> | undefined;
    let exited = false;
    let resolveExit: (() => void) | undefined;
    const exitPromise = new Promise<void>((resolve) => {
      resolveExit = resolve;
    });
    const onExit = () => {
      exited = true;
      if (exitTimer) clearTimeout(exitTimer);
      resolveExit?.();
    };

    // Register before pg_ctl: the child can exit while execFile is resolving.
    child.on("exit", onExit);
    let fallbackReason: string | undefined;
    try {
      await runExecFile(
        pgCtl,
        ["stop", "-D", options.databaseDir, "-m", "fast", "-w", "-t", String(stopTimeoutSeconds)],
        { timeout: stopTimeoutSeconds * 1000 },
      );
      if (!exited) {
        await Promise.race([
          exitPromise,
          new Promise<void>((resolve) => {
            exitTimer = setTimeout(resolve, exitWaitMs);
          }),
        ]);
      }
      if (exited) {
        // A successful clean stop mirrors the package's persistent:true path.
        // For persistent:false instances we delegated above so its data removal runs.
        internals.process = undefined;
      } else {
        fallbackReason = "pg_ctl clean shutdown did not exit in time; falling back to embedded-postgres stop";
      }
    } catch {
      fallbackReason = "pg_ctl clean shutdown failed; falling back to embedded-postgres stop";
    } finally {
      if (exitTimer) clearTimeout(exitTimer);
      child.removeListener("exit", onExit);
    }

    // Outside the try block on purpose: the original stop() runs at most once,
    // and an error from it reaches the caller instead of triggering a second call.
    if (fallbackReason) {
      safeLog(fallbackReason);
      await originalStop.call(instance);
    }
  };

  // Concurrent stop() calls share one run, so pg_ctl and the fallback never run twice.
  let inFlight: Promise<void> | undefined;
  instance.stop = function cleanWindowsStop(): Promise<void> {
    if (!inFlight) {
      inFlight = runStop().finally(() => {
        inFlight = undefined;
      });
    }
    return inFlight;
  };

  return instance;
}
