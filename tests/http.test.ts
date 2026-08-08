import { describe, expect, it } from 'vitest'
import { safeNextPath } from '../server/utils/http'

describe('viewer redirect validation', () => {
  it('accepts only local deck paths', () => {
    expect(safeNextPath('/slides/my-deck/')).toBe('/slides/my-deck/')
    expect(safeNextPath('https://example.com/slides/my-deck/')).toBe('/')
    expect(safeNextPath('/slides/my-deck/%2e%2e/admin')).toBe('/')
    expect(safeNextPath('/api/admin/decks')).toBe('/')
  })
})
