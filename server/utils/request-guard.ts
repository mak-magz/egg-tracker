// Cross-site request guard for state-changing routes (security audit L1). Pure, so tests import it directly;
// `handlers.ts` reads the headers and throws. The session cookie is `SameSite=Lax`, which alone lets a cross-site
// top-level form POST carry it, so this is the second layer (Fetch Metadata and Origin, then a JSON content type).
//
// A header that is ABSENT never blocks: curl, scripts, the provisioning CLI, Nuxt's server-side calls and the unit
// tests send neither Sec-Fetch-Site nor Origin, and a browser always sends at least one of them on a cross-site
// write. Only a header that is present and wrong is refused.

/** Methods that never change data (our GET routes read only), so they skip the checks. */
const SAFE_METHODS: ReadonlySet<string> = new Set(['GET', 'HEAD', 'OPTIONS'])

export interface RequestFacts {
  method: string
  /** `Sec-Fetch-Site` header, if the browser sent one. */
  secFetchSite?: string | null
  /** `Origin` header, if sent. The literal `null` (sandboxed frames, some redirects) counts as present. */
  origin?: string | null
  /** The host(s) this request was addressed to: the `Host` header, and `X-Forwarded-Host` behind a proxy. */
  hosts: readonly (string | null | undefined)[]
  /** `Content-Type` header, if sent. */
  contentType?: string | null
  /** True when the request carries a body (`Content-Length` above 0, or a chunked `Transfer-Encoding`). */
  hasBody: boolean
}

/**
 * `ok`: let it through. `cross_site`: a browser says the request came from another site (403).
 * `not_json`: a body that is not `application/json` (400): a form or `text/plain` post is never ours.
 */
export type RequestVerdict = 'ok' | 'cross_site' | 'not_json'

/** True for `application/json`, with or without parameters (`; charset=utf-8`), in any case. */
export function isJsonContentType(contentType: string | null | undefined): boolean {
  if (typeof contentType !== 'string') return false
  return contentType.split(';')[0]!.trim().toLowerCase() === 'application/json'
}

function present(value: string | null | undefined): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

/** `Host` and `X-Forwarded-Host` may hold a list ("a.example, b.example"); the first entry is the one the client used. */
function firstHost(value: string): string {
  return value.split(',')[0]!.trim().toLowerCase()
}

/** True when an `Origin` header names one of `hosts` (host and port; the scheme is not compared). `null` and junk do not match. */
export function originMatchesHost(origin: string, hosts: readonly (string | null | undefined)[]): boolean {
  let originHost: string
  try {
    originHost = new URL(origin).host.toLowerCase()
  }
  catch {
    return false
  }
  if (originHost === '') return false
  return hosts.some(h => present(h) && firstHost(h) === originHost)
}

/**
 * The decision, in one place:
 * 1. GET, HEAD and OPTIONS pass.
 * 2. `Sec-Fetch-Site`, when present, must be `same-origin` (our own pages) or `none` (typed address, bookmark).
 *    `same-site` (a sibling subdomain) and `cross-site` are refused, and so is any value we don't know.
 * 3. `Origin`, when present, must match the request host.
 * 4. A request with a body must be `application/json` (a hand-built form post can't set that without a CORS
 *    preflight this server never answers). A request without a body needs no content type: archive and restore.
 */
export function checkRequest(facts: RequestFacts): RequestVerdict {
  if (SAFE_METHODS.has(facts.method.toUpperCase())) return 'ok'
  if (present(facts.secFetchSite)) {
    const site = facts.secFetchSite.trim().toLowerCase()
    if (site !== 'same-origin' && site !== 'none') return 'cross_site'
  }
  if (present(facts.origin) && !originMatchesHost(facts.origin.trim(), facts.hosts)) return 'cross_site'
  if (facts.hasBody && !isJsonContentType(facts.contentType)) return 'not_json'
  return 'ok'
}

/** From the raw headers: is there a body? `Content-Length` other than 0 (a bad value counts), or any `Transfer-Encoding`. */
export function requestHasBody(contentLength: string | null | undefined, transferEncoding: string | null | undefined): boolean {
  if (present(transferEncoding)) return true
  if (!present(contentLength)) return false
  return !/^0+$/.test(contentLength.trim())
}
