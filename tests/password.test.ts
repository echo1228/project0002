import { describe, expect, it } from 'vitest'
import { hashPassword, validatePassword, verifyPassword } from '../server/utils/password'

describe('password security', () => {
  it('hashes with Argon2id and verifies without storing plaintext', async () => {
    const password = 'a-long-viewer-password'
    const encoded = await hashPassword(password)
    expect(encoded).toMatch(/^argon2id-v1\$/)
    expect(encoded).not.toContain(password)
    await expect(verifyPassword(encoded, password)).resolves.toBe(true)
    await expect(verifyPassword(encoded, 'wrong-password')).resolves.toBe(false)
  })

  it('enforces separate password minimums', () => {
    expect(validatePassword('short', 'viewer')).toBeTruthy()
    expect(validatePassword('123456789012', 'viewer')).toBeNull()
    expect(validatePassword('1234567890123', 'admin')).toBeTruthy()
    expect(validatePassword('12345678901234', 'admin')).toBeNull()
  })
})
