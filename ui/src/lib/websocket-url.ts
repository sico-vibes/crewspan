type BrowserLocationLike = Pick<Location, "host" | "hostname" | "port" | "protocol">;

function isWildcardHost(hostname: string): boolean {
  const normalized = hostname.trim().toLowerCase();
  return normalized === "0.0.0.0" || normalized === "::" || normalized === "[::]";
}

export function browserReachableHost(location: BrowserLocationLike = window.location): string {
  if (!isWildcardHost(location.hostname)) return location.host;
  return location.port ? `localhost:${location.port}` : "localhost";
}

export function buildSameOriginWebSocketUrl(
  path: string,
  location: BrowserLocationLike = window.location,
): string {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  // Prefix the deployment base so a subpath deployment reaches its own WebSocket routes
  // (nginx strips the base before forwarding to the server). Empty base is a no-op.
  const base = (import.meta.env.BASE_URL || "/").replace(/\/$/, "");
  const withBase = !base || normalizedPath.startsWith(`${base}/`) ? normalizedPath : `${base}${normalizedPath}`;
  return `${protocol}://${browserReachableHost(location)}${withBase}`;
}
