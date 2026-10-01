import { EventEmitter } from "node:events";
import { win32 as path } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { applyCleanWindowsStop } from "../embedded-postgres-windows-stop.js";

type FakeChild = EventEmitter & {
  pid: number;
  spawnfile: string;
  kill: ReturnType<typeof vi.fn>;
};

function makeChild(spawnfile = path.join("C:\\Program Files\\Postgres", "postgres.exe")): FakeChild {
  return Object.assign(new EventEmitter(), {
    pid: 1234,
    spawnfile,
    kill: vi.fn(),
  });
}

function makeInstance(child?: FakeChild, persistent = true) {
  const originalStop = vi.fn(async () => {
    if (instance.process) instance.process = undefined;
  });
  const instance = {
    process: child,
    options: { persistent },
    stop: originalStop,
  };
  return { instance, originalStop };
}

describe("applyCleanWindowsStop", () => {
  it("leaves non-Windows instances and their stop function untouched", () => {
    const { instance } = makeInstance(makeChild());
    const originalStop = instance.stop;

    const result = applyCleanWindowsStop(instance, {
      databaseDir: "C:\\db",
      platform: "linux",
    });

    expect(result).toBe(instance);
    expect(instance.stop).toBe(originalStop);
  });

  it("uses pg_ctl and waits for the child exit", async () => {
    const child = makeChild(path.win32.join("C:\\native", "bin", "postgres.exe"));
    const { instance, originalStop } = makeInstance(child);
    const exec = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      child.emit("exit", 0, null);
    });
    const log = vi.fn();
    const result = applyCleanWindowsStop(instance, {
      databaseDir: path.win32.join("C:\\Crewspan", "db"),
      platform: "win32",
      execFile: exec,
      log,
    });

    await result.stop();

    expect(exec).toHaveBeenCalledWith(
      path.win32.join("C:\\native", "bin", "pg_ctl.exe"),
      ["stop", "-D", path.win32.join("C:\\Crewspan", "db"), "-m", "fast", "-w", "-t", "30"],
      { timeout: 30_000 },
    );
    expect(originalStop).not.toHaveBeenCalled();
    expect(instance.process).toBeUndefined();
    expect(log).not.toHaveBeenCalled();
  });

  it("falls back to the original stop once when pg_ctl fails", async () => {
    const { instance, originalStop } = makeInstance(makeChild());
    const log = vi.fn();
    const result = applyCleanWindowsStop(instance, {
      databaseDir: "C:\\db",
      platform: "win32",
      execFile: vi.fn(async () => {
        throw new Error("failure details must not be logged");
      }),
      log,
    });

    await result.stop();

    expect(originalStop).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0]?.[0]).not.toContain("failure details");
  });

  it("falls back when pg_ctl succeeds but the child does not exit", async () => {
    const { instance, originalStop } = makeInstance(makeChild());
    const log = vi.fn();
    const result = applyCleanWindowsStop(instance, {
      databaseDir: "C:\\db",
      platform: "win32",
      execFile: vi.fn(async () => undefined),
      exitWaitMs: 5,
      log,
    });

    await result.stop();

    expect(originalStop).toHaveBeenCalledTimes(1);
    expect(log).toHaveBeenCalledTimes(1);
  });

  it("returns immediately when there is no running child", async () => {
    const { instance, originalStop } = makeInstance();
    const exec = vi.fn(async () => undefined);
    const result = applyCleanWindowsStop(instance, {
      databaseDir: "C:\\db",
      platform: "win32",
      execFile: exec,
    });

    await result.stop();

    expect(exec).not.toHaveBeenCalled();
    expect(originalStop).not.toHaveBeenCalled();
  });

  it("registers the exit listener before pg_ctl can synchronously emit exit", async () => {
    const child = makeChild();
    const { instance, originalStop } = makeInstance(child);
    const exec = vi.fn(async () => {
      child.emit("exit", 0, null);
    });
    const result = applyCleanWindowsStop(instance, {
      databaseDir: "C:\\db",
      platform: "win32",
      execFile: exec,
      exitWaitMs: 5,
    });

    await result.stop();

    expect(originalStop).not.toHaveBeenCalled();
    expect(instance.process).toBeUndefined();
  });

  it("delegates nonpersistent instances to the package stop for data cleanup", async () => {
    const { instance, originalStop } = makeInstance(makeChild(), false);
    const exec = vi.fn(async () => undefined);
    const result = applyCleanWindowsStop(instance, {
      databaseDir: "C:\\db",
      platform: "win32",
      execFile: exec,
    });

    await result.stop();

    expect(originalStop).toHaveBeenCalledTimes(1);
    expect(exec).not.toHaveBeenCalled();
  });

  it("calls the original stop once and surfaces its error when pg_ctl fails", async () => {
    const child = makeChild();
    const { instance, originalStop } = makeInstance(child);
    originalStop.mockRejectedValue(new Error("taskkill failed"));
    const exec = vi.fn(async () => {
      throw new Error("pg_ctl failed");
    });
    const result = applyCleanWindowsStop(instance, { databaseDir: "C:\\db", platform: "win32", execFile: exec });

    await expect(result.stop()).rejects.toThrow("taskkill failed");

    expect(originalStop).toHaveBeenCalledTimes(1);
    expect(child.listenerCount("exit")).toBe(0);
  });

  it("calls the original stop once and surfaces its error when the child does not exit in time", async () => {
    const child = makeChild();
    const { instance, originalStop } = makeInstance(child);
    originalStop.mockRejectedValue(new Error("taskkill failed"));
    const exec = vi.fn(async () => undefined);
    const result = applyCleanWindowsStop(instance, {
      databaseDir: "C:\\db",
      platform: "win32",
      execFile: exec,
      exitWaitMs: 20,
    });

    await expect(result.stop()).rejects.toThrow("taskkill failed");

    expect(originalStop).toHaveBeenCalledTimes(1);
    expect(child.listenerCount("exit")).toBe(0);
  });

  it("still falls back to the original stop when the logger throws", async () => {
    const child = makeChild();
    const { instance, originalStop } = makeInstance(child);
    const exec = vi.fn(async () => {
      throw new Error("pg_ctl failed");
    });
    const log = vi.fn(() => {
      throw new Error("logger broke");
    });
    const result = applyCleanWindowsStop(instance, { databaseDir: "C:\\db", platform: "win32", execFile: exec, log });

    await expect(result.stop()).resolves.toBeUndefined();

    expect(log).toHaveBeenCalledTimes(1);
    expect(originalStop).toHaveBeenCalledTimes(1);
  });

  it("shares one run between concurrent stop calls", async () => {
    const child = makeChild();
    const { instance, originalStop } = makeInstance(child);
    const exec = vi.fn(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      child.emit("exit", 0, null);
    });
    const result = applyCleanWindowsStop(instance, { databaseDir: "C:\\db", platform: "win32", execFile: exec });

    await Promise.all([result.stop(), result.stop(), result.stop()]);

    expect(exec).toHaveBeenCalledTimes(1);
    expect(originalStop).not.toHaveBeenCalled();
    expect(child.listenerCount("exit")).toBe(0);
    expect(instance.process).toBeUndefined();
  });
});
