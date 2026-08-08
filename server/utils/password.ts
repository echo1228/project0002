import { timingSafeEqual } from 'node:crypto'
import { argon2idAsync } from '@noble/hashes/argon2.js'
import { randomBytes } from '@noble/hashes/utils.js'

const MEMORY_KIB = 19_456
const ITERATIONS = 2
const PARALLELISM = 1
const HASH_LENGTH = 32

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16)
  const digest = await argon2idAsync(password, salt, {
    m: MEMORY_KIB,
    t: ITERATIONS,
    p: PARALLELISM,
    dkLen: HASH_LENGTH,
  })
  return [
    'argon2id-v1',
    `m=${MEMORY_KIB},t=${ITERATIONS},p=${PARALLELISM}`,
    Buffer.from(salt).toString('base64url'),
    Buffer.from(digest).toString('base64url'),
  ].join('$')
}

export async function verifyPassword(encoded: string, password: string): Promise<boolean> {
  try {
    const [algorithm, parameters, saltValue, digestValue] = encoded.split('$')
    if (algorithm !== 'argon2id-v1' || !parameters || !saltValue || !digestValue) return false
    const options = Object.fromEntries(parameters.split(',').map(part => part.split('=')))
    const salt = Buffer.from(saltValue, 'base64url')
    const expected = Buffer.from(digestValue, 'base64url')
    const actual = Buffer.from(await argon2idAsync(password, salt, {
      m: Number(options.m),
      t: Number(options.t),
      p: Number(options.p),
      dkLen: expected.length,
    }))
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  }
  catch {
    return false
  }
}

export function validatePassword(password: string, kind: 'admin' | 'viewer'): string | null {
  const minimum = kind === 'admin' ? 14 : 12
  if (password.length < minimum) return `密码至少需要 ${minimum} 个字符`
  if (password.length > 256) return '密码不能超过 256 个字符'
  return null
}
