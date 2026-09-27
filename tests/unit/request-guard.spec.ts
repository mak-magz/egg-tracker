// The cross-site request decision (security audit L1): server/utils/request-guard.ts.
import { describe, expect, it } from 'vitest'
import { checkRequest, isJsonContentType, originMatchesHost, requestHasBody } from '../../server/utils/request-guard'
import type { RequestFacts } from '../../server/utils/request-guard'

const HOST = 'app.example.com'

function facts(over: Partial<RequestFacts> = {}): RequestFacts {
  return { method: 'POST', hosts: [HOST], hasBody: false, ...over }
}

describe('checkRequest: callers that send no browser headers', () => {
  it('lets curl, scripts, the CLI and server-side calls through (no Sec-Fetch-Site, no Origin)', () => {
    expect(checkRequest(facts())).toBe('ok')
    expect(checkRequest(facts({ hasBody: true, contentType: 'application/json' }))).toBe('ok')
    expect(checkRequest(facts({ secFetchSite: undefined, origin: undefined }))).toBe('ok')
    expect(checkRequest(facts({ secFetchSite: null, origin: null }))).toBe('ok')
    expect(checkRequest(facts({ secFetchSite: '', origin: '  ' }))).toBe('ok')
  })

  it('never blocks a safe method, whatever the headers say', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS', 'get']) {
      expect(checkRequest(facts({ method, secFetchSite: 'cross-site', origin: 'https://evil.example' })), method).toBe('ok')
    }
  })
})

describe('checkRequest: Sec-Fetch-Site', () => {
  it('accepts same-origin and none (our own pages, a typed address)', () => {
    expect(checkRequest(facts({ secFetchSite: 'same-origin' }))).toBe('ok')
    expect(checkRequest(facts({ secFetchSite: 'none' }))).toBe('ok')
    expect(checkRequest(facts({ secFetchSite: ' Same-Origin ' }))).toBe('ok')
  })

  it('refuses same-site, cross-site and values it does not know', () => {
    for (const site of ['same-site', 'cross-site', 'CROSS-SITE', 'weird', 'null']) {
      expect(checkRequest(facts({ secFetchSite: site })), site).toBe('cross_site')
    }
  })

  it('refuses every writing method the same way', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(checkRequest(facts({ method, secFetchSite: 'cross-site' })), method).toBe('cross_site')
    }
  })
})

describe('checkRequest: Origin', () => {
  it('accepts an Origin that names the request host (scheme not compared, case ignored)', () => {
    expect(checkRequest(facts({ origin: `https://${HOST}` }))).toBe('ok')
    expect(checkRequest(facts({ origin: `http://${HOST}` }))).toBe('ok')
    expect(checkRequest(facts({ origin: 'https://APP.example.com' }))).toBe('ok')
    expect(checkRequest(facts({ origin: 'http://localhost:3000', hosts: ['localhost:3000'] }))).toBe('ok')
  })

  it('refuses another host, another port, a look-alike, null and junk', () => {
    for (const origin of [
      'https://evil.example',
      'https://app.example.com.evil.example',
      'https://evil.example/app.example.com',
      'https://app.example.com:8443',
      'http://localhost:3001',
      'null',
      'not a url',
    ]) {
      expect(checkRequest(facts({ origin, hosts: [HOST, 'localhost:3000'] })), origin).toBe('cross_site')
    }
  })

  it('accepts the forwarded host behind a proxy, and the first entry of a list', () => {
    expect(checkRequest(facts({ origin: 'https://farm.example.org', hosts: ['internal:3000', 'farm.example.org'] }))).toBe('ok')
    expect(checkRequest(facts({ origin: 'https://farm.example.org', hosts: ['internal:3000', 'farm.example.org, proxy.internal'] }))).toBe('ok')
    expect(checkRequest(facts({ origin: 'https://farm.example.org', hosts: [undefined, null] }))).toBe('cross_site')
  })

  it('needs both headers to pass when both are sent', () => {
    expect(checkRequest(facts({ secFetchSite: 'same-origin', origin: 'https://evil.example' }))).toBe('cross_site')
    expect(checkRequest(facts({ secFetchSite: 'cross-site', origin: `https://${HOST}` }))).toBe('cross_site')
    expect(checkRequest(facts({ secFetchSite: 'same-origin', origin: `https://${HOST}` }))).toBe('ok')
  })
})

describe('checkRequest: content type', () => {
  it('requires application/json when there is a body', () => {
    expect(checkRequest(facts({ hasBody: true, contentType: 'application/json' }))).toBe('ok')
    expect(checkRequest(facts({ hasBody: true, contentType: 'application/json; charset=utf-8' }))).toBe('ok')
    expect(checkRequest(facts({ hasBody: true, contentType: 'Application/JSON' }))).toBe('ok')
    for (const contentType of [
      'application/x-www-form-urlencoded',
      'text/plain',
      'multipart/form-data; boundary=x',
      'application/jsonp',
      'application/json-patch+json',
      'text/json',
      '',
      null,
      undefined,
    ]) {
      expect(checkRequest(facts({ hasBody: true, contentType })), String(contentType)).toBe('not_json')
    }
  })

  it('does not ask for a content type when there is no body (archive and restore)', () => {
    expect(checkRequest(facts({ hasBody: false }))).toBe('ok')
    expect(checkRequest(facts({ hasBody: false, contentType: 'text/plain' }))).toBe('ok')
  })

  it('reports cross_site before not_json', () => {
    expect(checkRequest(facts({ hasBody: true, contentType: 'text/plain', secFetchSite: 'cross-site' }))).toBe('cross_site')
  })
})

describe('helpers', () => {
  it('isJsonContentType', () => {
    expect(isJsonContentType('application/json')).toBe(true)
    expect(isJsonContentType(' application/json ;charset=utf-8')).toBe(true)
    expect(isJsonContentType('application/x-www-form-urlencoded')).toBe(false)
    expect(isJsonContentType(undefined)).toBe(false)
  })

  it('originMatchesHost', () => {
    expect(originMatchesHost('https://a.example', ['a.example'])).toBe(true)
    expect(originMatchesHost('https://a.example', ['b.example'])).toBe(false)
    expect(originMatchesHost('https://a.example', [])).toBe(false)
    expect(originMatchesHost('null', ['null'])).toBe(false)
    expect(originMatchesHost('', ['a.example'])).toBe(false)
  })

  it('requestHasBody reads Content-Length and Transfer-Encoding', () => {
    expect(requestHasBody(undefined, undefined)).toBe(false)
    expect(requestHasBody('0', undefined)).toBe(false)
    expect(requestHasBody('00', undefined)).toBe(false)
    expect(requestHasBody('12', undefined)).toBe(true)
    expect(requestHasBody('junk', undefined)).toBe(true)
    expect(requestHasBody(undefined, 'chunked')).toBe(true)
    expect(requestHasBody('0', 'chunked')).toBe(true)
  })
})
