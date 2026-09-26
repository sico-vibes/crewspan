/** Vite deployment base without a trailing slash (empty for a root deployment). */
export const DEPLOYMENT_BASE = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");

/**
 * Prefix a first-party root-relative URL with Vite's deployment base.
 * External and non-HTTP URLs pass through unchanged. Call this at the URL's
 * construction or DOM boundary so API, asset, link, and download paths stay
 * explicit and auditable.
 */
export function withDeploymentBase(input: string | URL, basePath = DEPLOYMENT_BASE): string {
  const value = input instanceof URL ? input.href : input;
  const base = basePath.replace(/\/$/, "");
  if (!base) return value;
  if (value.startsWith("//")) return value;

  let pathname: string;
  let suffix = "";
  if (value.startsWith("/")) {
    const suffixIndex = value.search(/[?#]/);
    pathname = suffixIndex < 0 ? value : value.slice(0, suffixIndex);
    suffix = suffixIndex < 0 ? "" : value.slice(suffixIndex);
  } else {
    try {
      const url = new URL(value, window.location.origin);
      if (url.origin !== window.location.origin || !/^https?:/.test(url.protocol)) return value;
      pathname = url.pathname;
      suffix = `${url.search}${url.hash}`;
    } catch {
      return value;
    }
  }

  if (!pathname.startsWith("/")) return value;
  if (pathname === base || pathname.startsWith(`${base}/`)) return value;
  return `${base}${pathname}${suffix}`;
}

export function deploymentApiUrl(path: string): string {
  return withDeploymentBase(path.startsWith("/api/") || path === "/api" ? path : `/api${path.startsWith("/") ? path : `/${path}`}`);
}
