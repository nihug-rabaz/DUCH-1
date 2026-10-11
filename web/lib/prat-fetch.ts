import { IdfProxy } from "@/lib/idf-proxy";

/**
 * Outbound fetch to one.prat — via IL SOCKS/HTTP proxy when API_PROXY_* / PROXY_URL
 * are set (same as HOGER/myidf). Required on Vercel; local without proxy stays direct.
 */
function formDataToMultipart(fd: FormData): { body: Buffer; contentType: string } {
  const boundary = `----DuchBoundary${Date.now().toString(16)}`;
  const chunks: Buffer[] = [];
  for (const [key, value] of fd.entries()) {
    if (typeof value !== "string") {
      throw new Error("Unsupported FormData file field for proxy transport");
    }
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
        "utf8",
      ),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`, "utf8"));
  return {
    body: Buffer.concat(chunks),
    contentType: `multipart/form-data; boundary=${boundary}`,
  };
}

export function pratProxyConfigured(): boolean {
  return IdfProxy.isConfigured();
}

export async function pratFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const onVercel = process.env.VERCEL === "1";
  const proxy = new IdfProxy(undefined, {
    // On Vercel, never silently fall back to direct (WAF 403).
    allowDirectFallback: !onVercel,
    requireProxy: false,
  });

  let options: RequestInit = { ...init };
  if (typeof FormData !== "undefined" && options.body instanceof FormData) {
    const { body, contentType } = formDataToMultipart(options.body);
    const headers = new Headers(options.headers);
    headers.set("content-type", contentType);
    options = { ...options, body: new Uint8Array(body), headers };
  }

  return proxy.makeRequest(url, options);
}
