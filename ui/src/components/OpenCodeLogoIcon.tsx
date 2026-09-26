import { cn } from "../lib/utils";
import { withDeploymentBase } from "@/lib/deployment-base";

interface OpenCodeLogoIconProps {
  className?: string;
}

export function OpenCodeLogoIcon({ className }: OpenCodeLogoIconProps) {
  return (
    <>
      <img
        src={withDeploymentBase("/brands/opencode-logo-light-square.svg")}
        alt="OpenCode"
        className={cn("dark:hidden", className)}
      />
      <img
        src={withDeploymentBase("/brands/opencode-logo-dark-square.svg")}
        alt="OpenCode"
        className={cn("hidden dark:block", className)}
      />
    </>
  );
}
