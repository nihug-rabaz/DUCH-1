import * as http from "http";
import * as https from "https";

class ProxyLog {
  static safeTarget(url: string): string {
    try {
      const u = new URL(url);
      return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}${u.pathname}`;
    } catch {
      return "[url]";
    }
  }

  static proxyRouteLabel(proxyUrl: string): string {
    try {
      const u = new URL(proxyUrl);
      const user = u.username ? "(auth)" : "";
      return `${u.protocol}//${u.hostname}${u.port ? `:${u.port}` : ""}${user}`;
    } catch {
      return "[proxy]";
    }
  }
}

export class IdfProxy {
  private proxyUrl: string | undefined;
  private requireProxy: boolean;
  private allowDirectFallback: boolean | undefined;

  private proxyTimeoutMs(): number {
    const raw = process.env.API_PROXY_TIMEOUT_MS;
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n > 0 ? n : 90_000;
  }

  private resolveProxyKind(): "socks5" | "socks4" | "http" {
    const t = (process.env.API_PROXY_TYPE || "").toLowerCase();
    if (t === "socks5" || t === "socks") return "socks5";
    if (t === "socks4") return "socks4";
    if (t === "http" || t === "https") return "http";
    const port = process.env.API_PROXY_PORT || "";
    if (port === "1080") return "socks5";
    return "http";
  }

  static buildProxyUrlFromEnv(): string | undefined {
    if (process.env.PROXY_URL) {
      return process.env.PROXY_URL;
    }

    const host = process.env.API_PROXY_HOST;
    const port = process.env.API_PROXY_PORT;
    const user = process.env.API_PROXY_USER;
    const pass = process.env.API_PROXY_PASS;

    if (!host || !port) {
      return undefined;
    }

    const auth = user && pass ? `${encodeURIComponent(user)}:${encodeURIComponent(pass)}@` : "";
    const kind =
      (process.env.API_PROXY_TYPE || "").toLowerCase() === "socks4"
        ? "socks4"
        : (process.env.API_PROXY_TYPE || "").toLowerCase() === "socks5" ||
            (process.env.API_PROXY_TYPE || "").toLowerCase() === "socks" ||
            port === "1080"
          ? "socks5"
          : "http";

    if (kind === "socks5") {
      return `socks5h://${auth}${host}:${port}`;
    }
    if (kind === "socks4") {
      return `socks4://${auth}${host}:${port}`;
    }
    if (user && pass) {
      return `http://${auth}${host}:${port}`;
    }
    return `http://${host}:${port}`;
  }

  constructor(proxyUrl?: string, options?: { requireProxy?: boolean; allowDirectFallback?: boolean }) {
    this.proxyUrl = proxyUrl ?? IdfProxy.buildProxyUrlFromEnv();
    this.requireProxy = options?.requireProxy === true;
    this.allowDirectFallback = options?.allowDirectFallback;
  }

  static isConfigured(): boolean {
    return Boolean(IdfProxy.buildProxyUrlFromEnv());
  }

  private static isSocksProxyUrl(proxyUrl: string): boolean {
    const p = proxyUrl.toLowerCase();
    return (
      p.startsWith("socks5://") ||
      p.startsWith("socks5h://") ||
      p.startsWith("socks4://") ||
      p.startsWith("socks4a://") ||
      p.startsWith("socks://")
    );
  }

  private static headersInitToOutgoing(headers?: HeadersInit): http.OutgoingHttpHeaders {
    if (!headers) return {};
    if (headers instanceof Headers) {
      const out: http.OutgoingHttpHeaders = {};
      headers.forEach((value, key) => {
        const prev = out[key];
        if (prev === undefined) {
          out[key] = value;
        } else if (Array.isArray(prev)) {
          prev.push(value);
        } else {
          out[key] = [String(prev), value];
        }
      });
      return out;
    }
    if (Array.isArray(headers)) {
      const out: http.OutgoingHttpHeaders = {};
      for (const [k, v] of headers) {
        out[k] = v;
      }
      return out;
    }
    return { ...(headers as Record<string, string>) };
  }

  private async requestThroughSocksAgent(
    targetUrl: string,
    options: RequestInit,
    socksUrl: string,
    timeoutMs: number,
  ): Promise<Response> {
    const { SocksProxyAgent } = await import("socks-proxy-agent");
    const agent = new SocksProxyAgent(socksUrl);
    const u = new URL(targetUrl);
    const useTls = u.protocol === "https:";
    const lib = useTls ? https : http;
    const defaultPort = useTls ? 443 : 80;
    const port = u.port ? Number(u.port) : defaultPort;
    const pathWithQuery = `${u.pathname}${u.search}`;
    const method = (options.method || "GET").toUpperCase();
    const headers = IdfProxy.headersInitToOutgoing(options.headers);
    let bodyChunk: string | Buffer | undefined;
    if (options.body !== undefined && options.body !== null) {
      if (typeof options.body === "string") {
        bodyChunk = options.body;
      } else if (options.body instanceof Buffer) {
        bodyChunk = options.body;
      } else if (options.body instanceof Uint8Array) {
        bodyChunk = Buffer.from(options.body);
      } else {
        throw new Error("Unsupported request body for SOCKS transport");
      }
    }

    return new Promise((resolve, reject) => {
      const req = lib.request(
        {
          agent,
          hostname: u.hostname,
          port,
          path: pathWithQuery,
          method,
          headers,
        },
        (incoming) => {
          const chunks: Buffer[] = [];
          incoming.on("data", (c) => chunks.push(c));
          incoming.on("end", () => {
            const buf = Buffer.concat(chunks);
            const outHeaders = new Headers();
            const setCookies = incoming.headers["set-cookie"];
            if (setCookies) {
              const list = Array.isArray(setCookies) ? setCookies : [setCookies];
              for (const line of list) {
                if (line) outHeaders.append("set-cookie", line);
              }
            }
            for (const [key, value] of Object.entries(incoming.headers)) {
              if (key === "set-cookie" || value === undefined) continue;
              if (Array.isArray(value)) {
                value.forEach((v) => outHeaders.append(key, v));
              } else {
                outHeaders.set(key, value);
              }
            }
            const status = incoming.statusCode ?? 0;
            const statusText = incoming.statusMessage ?? "";
            resolve(new Response(buf, { status, statusText, headers: outHeaders }));
          });
          incoming.on("error", reject);
        },
      );

      req.setTimeout(timeoutMs, () => {
        req.destroy();
        reject(new Error(`Request timeout after ${timeoutMs}ms`));
      });

      req.on("error", reject);
      if (bodyChunk !== undefined) {
        req.write(bodyChunk);
      }
      req.end();
    });
  }

  private static circuitOpenUntilMs = 0;

  private static circuitBreakerWindowMs(): number {
    const raw = process.env.API_PROXY_CIRCUIT_BREAKER_MS;
    const n = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(n) && n >= 0 ? n : 60_000;
  }

  private static markProxyBroken(): void {
    IdfProxy.circuitOpenUntilMs = Date.now() + IdfProxy.circuitBreakerWindowMs();
  }

  private static isCircuitOpen(): boolean {
    return Date.now() < IdfProxy.circuitOpenUntilMs;
  }

  private directFallbackEnabled(): boolean {
    if (this.allowDirectFallback !== undefined) {
      return this.allowDirectFallback;
    }
    const raw = (process.env.API_PROXY_FALLBACK_DIRECT ?? "true").trim().toLowerCase();
    if (raw === "" || raw === "1" || raw === "true" || raw === "yes") {
      return true;
    }
    return false;
  }

  private static isConnectionFailure(message: string): boolean {
    const m = message.toLowerCase();
    return (
      m.includes("econnreset") ||
      m.includes("econnrefused") ||
      m.includes("etimedout") ||
      m.includes("enotfound") ||
      m.includes("ehostunreach") ||
      m.includes("socket hang up") ||
      m.includes("network is unreachable") ||
      m.includes("request timeout")
    );
  }

  async makeRequest(url: string, options: RequestInit, retries: number = 2): Promise<Response> {
    if (this.proxyUrl) {
      if (this.directFallbackEnabled() && IdfProxy.isCircuitOpen()) {
        console.warn("[idf-proxy] circuit open, skipping proxy", {
          target: ProxyLog.safeTarget(url),
        });
        return fetch(url, options);
      }
      let lastError: Error | undefined;
      const timeoutMs = this.proxyTimeoutMs();
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          if (attempt > 0) {
            await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
          }

          if (IdfProxy.isSocksProxyUrl(this.proxyUrl)) {
            const socksResponse = await this.requestThroughSocksAgent(
              url,
              options,
              this.proxyUrl,
              timeoutMs,
            );
            if (socksResponse.status >= 500 && attempt < retries) {
              continue;
            }
            return socksResponse;
          }

          const { ProxyAgent } = await import("undici");
          const proxyAgent = new ProxyAgent(this.proxyUrl);
          const { fetch: undiciFetch } = await import("undici");

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

          try {
            const response = await undiciFetch(url, {
              ...options,
              dispatcher: proxyAgent,
              signal: controller.signal,
            } as Parameters<typeof undiciFetch>[1]);
            clearTimeout(timeoutId);

            if (response.status >= 500 && attempt < retries) {
              continue;
            }

            const responseHeaders = new Headers();
            const rawHeaders = response.headers as Headers & { raw?: Record<string, string[]> };
            if (rawHeaders?.raw) {
              for (const key in rawHeaders.raw) {
                const value = rawHeaders.raw[key];
                if (Array.isArray(value)) {
                  value.forEach((v) => responseHeaders.append(key, v));
                } else if (value !== null && value !== undefined) {
                  responseHeaders.append(key, String(value));
                }
              }
            } else {
              rawHeaders.forEach((value, key) => {
                if (key.toLowerCase() === "set-cookie") {
                  responseHeaders.append("set-cookie", value);
                } else {
                  responseHeaders.set(key, value);
                }
              });
            }

            const body = await response.arrayBuffer();
            return new Response(body, {
              status: response.status,
              statusText: response.statusText || "",
              headers: responseHeaders,
            });
          } catch (fetchError) {
            clearTimeout(timeoutId);
            throw fetchError;
          }
        } catch (error) {
          lastError = error instanceof Error ? error : new Error(String(error));
          if (attempt === retries) {
            break;
          }
        }
      }

      const lastMessage = lastError?.message || "";
      const forceDirect = this.allowDirectFallback === true;
      const shouldFallback =
        this.directFallbackEnabled() &&
        (forceDirect || IdfProxy.isConnectionFailure(lastMessage));
      if (shouldFallback) {
        IdfProxy.markProxyBroken();
        console.warn("[idf-proxy] proxy failed; falling back to direct fetch", {
          target: ProxyLog.safeTarget(url),
          error: lastMessage.slice(0, 180),
          circuitOpenForMs: IdfProxy.circuitBreakerWindowMs(),
        });
        return fetch(url, options);
      }
      throw new Error(
        `Proxy failed after ${retries + 1} attempts. ${lastMessage}`,
      );
    }

    if (this.requireProxy) {
      throw new Error("Proxy is required but not configured");
    }

    return fetch(url, options);
  }
}
