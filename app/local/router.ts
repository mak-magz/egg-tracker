/* eslint-disable @typescript-eslint/no-explicit-any */
import { FetchError } from 'ofetch'
import type { ApiErrorData } from '#shared/types/api'
import { localWorker } from './client'

export function createLocalFetchError(
  errorData: any,
  url: string,
  method = 'GET',
): FetchError {
  const statusCode = errorData?.statusCode || 500
  const statusMessage = errorData?.statusMessage || errorData?.message || 'API Error'

  const err = new FetchError(`${method} ${url} failed with status ${statusCode}: ${statusMessage}`)
  err.statusCode = statusCode
  err.status = statusCode
  err.statusText = statusMessage
  err.statusMessage = statusMessage

  const apiData: ApiErrorData = {
    code: errorData?.code || 'internal',
    ...(errorData?.fields ? { fields: errorData.fields } : {}),
    ...(errorData?.reason ? { reason: errorData.reason } : {}),
    ...(errorData?.existing ? { existing: errorData.existing } : {}),
    ...(errorData?.sizes ? { sizes: errorData.sizes } : {}),
    ...(errorData?.client ? { client: errorData.client } : {}),
    ...(errorData?.sale ? { sale: errorData.sale } : {}),
    ...(errorData?.shortfall ? { shortfall: errorData.shortfall } : {}),
    ...(errorData?.order ? { order: errorData.order } : {}),
  }

  err.data = {
    statusCode,
    statusMessage,
    data: apiData,
    ...apiData,
  }

  return err
}

export class LocalApiRouter {
  async dispatch<T = any>(
    url: string | URL | Request,
    options: {
      method?: string
      query?: Record<string, any>
      params?: Record<string, any>
      body?: any
    } = {},
  ): Promise<T> {
    let path = ''
    const query: Record<string, any> = { ...(options.query || options.params || {}) }

    if (typeof url === 'string') {
      try {
        const parsed = new URL(url, 'http://localhost')
        path = parsed.pathname
        for (const [k, v] of parsed.searchParams.entries()) {
          if (query[k] === undefined) {
            query[k] = v
          }
        }
      }
      catch {
        const [pathname, queryString] = url.split('?')
        path = pathname || ''
        if (queryString) {
          const searchParams = new URLSearchParams(queryString)
          for (const [k, v] of searchParams.entries()) {
            if (query[k] === undefined) {
              query[k] = v
            }
          }
        }
      }
    }
    else if (url instanceof URL) {
      path = url.pathname
      for (const [k, v] of url.searchParams.entries()) {
        if (query[k] === undefined) {
          query[k] = v
        }
      }
    }
    else if (typeof Request !== 'undefined' && url instanceof Request) {
      try {
        const parsedUrl = new URL(url.url, 'http://localhost')
        path = parsedUrl.pathname
        for (const [k, v] of parsedUrl.searchParams.entries()) {
          if (query[k] === undefined) {
            query[k] = v
          }
        }
      }
      catch {
        path = url.url.split('?')[0] || ''
      }
    }

    // Normalize trailing slash if any
    if (path.length > 1 && path.endsWith('/')) {
      path = path.replace(/\/+$/, '')
    }

    const method = (options.method?.toUpperCase() || 'GET') as
      | 'GET'
      | 'POST'
      | 'PUT'
      | 'PATCH'
      | 'DELETE'

    try {
      return await localWorker.dispatchRoute<T>(method, path, query, options.body)
    }
    catch (err: any) {
      throw createLocalFetchError(err, path, method)
    }
  }
}

export const localRouter = new LocalApiRouter()
