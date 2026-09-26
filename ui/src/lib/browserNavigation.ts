import { withDeploymentBase } from "@/lib/deployment-base";

export function navigateTopLevel(target: string) {
  window.location.assign(withDeploymentBase(target));
}
