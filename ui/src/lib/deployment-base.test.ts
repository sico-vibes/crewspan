import { describe, expect, it } from "vitest";
import { withDeploymentBase } from "./deployment-base";

describe("withDeploymentBase", () => {
  it("leaves root deployments unchanged", () => {
    expect(withDeploymentBase("/api/health", "/")).toBe("/api/health");
    expect(withDeploymentBase("/brands/claude-color.svg", "")).toBe("/brands/claude-color.svg");
  });

  it("prefixes first-party root paths and preserves query and fragment", () => {
    expect(withDeploymentBase("/api/health?full=1#status", "/crewspan/")).toBe("/crewspan/api/health?full=1#status");
    expect(withDeploymentBase("/brands/claude-color.svg", "/crewspan/")).toBe("/crewspan/brands/claude-color.svg");
    expect(withDeploymentBase("/", "/crewspan/")).toBe("/crewspan/");
  });

  it("does not double-prefix a path already under the deployment base", () => {
    expect(withDeploymentBase("/crewspan/api/health", "/crewspan/")).toBe("/crewspan/api/health");
  });

  it("leaves external, protocol-relative, and non-HTTP URLs untouched", () => {
    expect(withDeploymentBase("https://provider.example/callback", "/crewspan/")).toBe("https://provider.example/callback");
    expect(withDeploymentBase("//cdn.example/image.svg", "/crewspan/")).toBe("//cdn.example/image.svg");
    expect(withDeploymentBase("data:image/png;base64,AA==", "/crewspan/")).toBe("data:image/png;base64,AA==");
  });
});
