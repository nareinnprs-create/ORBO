/**
 * The headers every answer from this server carries, and the reasoning for each one's reach.
 *
 * Mounted in front of the routes, so a refusal — a 429 from the rate limit, a 413 from a body
 * limit, a 401 from a guard — wears them too. A response that teaches an attacker something does
 * not stop being interpretable just because it refused them: `nosniff` in particular matters most
 * on the responses nobody planned to serve.
 *
 * There is no CSP enforcement for the app's own pages here, and that is a decision rather than an
 * omission; see `documentCsp` below.
 */

/**
 * Set on everything.
 *
 * `nosniff` is the cheapest lock in HTTP: without it a browser will happily re-interpret a
 * response as whatever its content looks like, and this server answers text to requests whose
 * bodies it mostly never inspects. Nothing legitimate depends on sniffing.
 *
 * `strict-origin-when-cross-origin` is the browser's own modern default; stating it pins the
 * behaviour against an old browser or a future change, so a person's trail across other sites is
 * an origin and not a full URL with whatever a redirect once carried.
 *
 * `X-Frame-Options: DENY` on every document this serves. Nothing legitimate frames the app: the
 * desktop shell opens it as a top-level window, and the sandboxed frames the app itself renders
 * are `about:blank`/`srcdoc` documents INSIDE the page, which are governed by their own (absent)
 * headers, not by this one. An app that cannot be framed cannot be clickjacked.
 */
const COMMON_HEADERS: Record<string, string> = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "x-frame-options": "DENY",
};

/**
 * Set on `/api` only, where it is provably safe, and kept OFF the app's own pages.
 *
 * `frame-ancestors 'none'` is the modern form of the refusal above, and unlike `X-Frame-Options`
 * it is inherited by a `srcdoc` or `about:blank` frame FROM THE DOCUMENT THAT EMBEDS IT. The app
 * renders generated interfaces inside exactly such frames, so a document-level `frame-ancestors
 * 'none'` would have the inherited policy forbid the embedding the app itself just performed and
 * blank out a headline feature. The API answers contain no frames and render nothing; for them
 * the directive is free, and it is the one that matters — a JSON response the browser is ever
 * talked into framing is being framed by an attacker.
 *
 * An API answer gets both spellings, because `X-Frame-Options` is what old browsers read and
 * `frame-ancestors` is what everything else reads once a CSP is present at all.
 */
const API_HEADERS: Record<string, string> = {
  ...COMMON_HEADERS,
  "content-security-policy": "frame-ancestors 'none'",
};

/**
 * The policy the app's pages REPORT against, and why it is report-only today.
 *
 * The shape is the one the app actually needs: `script-src 'self'` for the Vite bundle,
 * `style-src 'self' 'unsafe-inline'` because Tailwind's compiled sheet is external but React
 * writes inline `style` attributes all over the DOM, `img-src` with `data:` and `blob:` for what
 * the transcript renders, `connect-src` with `ws:`/`wss:` for the streamed sockets beside `/api`.
 *
 * Two facts keep it out of enforcing mode, and both are load-bearing features rather than
 * accidents a stricter policy could prune:
 *
 * 1. The app's `index.html` carries a tiny classic inline script that sets the theme before the
 *    first paint, deliberately inline and deliberately classic, and its own comment says both
 *    halves are the point. Enforcing `script-src 'self'` without that script's hash would break
 *    it on every load.
 * 2. The sandboxed interface frames inherit this document's CSP entire. They exist to run code a
 *    Bot just wrote — inline scripts, CDN libraries — which is precisely what `script-src 'self'`
 *    exists to stop. Enforcing the policy on the app would enforce it, inherited, on every
 *    generated interface.
 *
 * So the header ships as `Content-Security-Policy-Report-Only`: the app behaves exactly as
 * before, and a browser that meets something the policy would have refused says so in its
 * console, which is the evidence list for the day both facts above are addressed and this moves
 * to enforcing. `frame-ancestors` is absent from it on purpose — browsers ignore that directive
 * in report-only mode, and the enforcing form of the same refusal is already on the API answers
 * above.
 */
const DOCUMENT_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' ws: wss:",
  "font-src 'self' data:",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

import type { MiddlewareHandler } from "hono";

export function createSecurityHeaders(): MiddlewareHandler {
  return async (context, next) => {
    await next();
    const response = context.res;
    if (!response) return;
    /*
     * Read once. Hono's `context.res` is lazily frozen on first read, so every branch below works
     * from this copy and the final assignment stays a single replacement.
     */
    const headers = new Headers(response.headers);
    const requestPath = context.req.path;

    for (const [name, value] of Object.entries(
      requestPath.startsWith("/api/") || requestPath === "/api"
        ? API_HEADERS
        : COMMON_HEADERS,
    )) {
      headers.set(name, value);
    }

    // The document policy is signal for the pages people load, so it travels with the responses
    // that are pages. A stylesheet or a JSON answer carrying a document policy says nothing a
    // browser would act on, and noise in every response header is its own cost.
    if (
      !requestPath.startsWith("/api") &&
      headers.get("content-type")?.startsWith("text/html")
    ) {
      headers.set("content-security-policy-report-only", DOCUMENT_CSP);
    }

    context.res = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  };
}
