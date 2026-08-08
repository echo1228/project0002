interface Bucket {
  attempts: number[]
}

const buckets = new Map<string, Bucket>()

export function consumeRateLimit(key: string, limit = 5, windowMs = 5 * 60_000): number | null {
  const now = Date.now()
  const cutoff = now - windowMs
  const bucket = buckets.get(key) ?? { attempts: [] }
  bucket.attempts = bucket.attempts.filter(value => value > cutoff)
  if (bucket.attempts.length >= limit) {
    const retryAt = bucket.attempts[0]! + windowMs
    return Math.max(1, Math.ceil((retryAt - now) / 1000))
  }
  bucket.attempts.push(now)
  buckets.set(key, bucket)
  return null
}

export function clearRateLimit(key: string): void {
  buckets.delete(key)
}
