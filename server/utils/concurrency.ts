/**
 * Executes an async mapping function over an array of items with bounded concurrency
 * to prevent socket exhaustion or connection storms on serverless/fleet operations.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return []
  const limit = Math.max(1, concurrency)
  const results = new Array<R>(items.length)
  let nextIndex = 0

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const idx = nextIndex++
      results[idx] = await fn(items[idx]!, idx)
    }
  })

  await Promise.all(workers)
  return results
}
