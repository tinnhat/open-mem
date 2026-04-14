import { describe, it, expect, vi, beforeEach } from 'vitest'
import { compressObservation, sanitizeObservation } from '../compressor/ai.js'

vi.mock('../privacy/strip.js', () => ({
  stripSensitiveData: vi.fn((text) => text),
}))

describe('compressObservation', () => {
  it('is a function', () => {
    expect(typeof compressObservation).toBe('function')
  })

  it('returns null when client is not available', async () => {
    const result = await compressObservation(
      'Read',
      { filePath: '/test.ts' },
      'file contents',
      'test-session',
      '/test',
      {}
    )
    expect(result).toBeNull()
  })

  it('returns null when client.session.prompt is not available', async () => {
    const result = await compressObservation(
      'Read',
      { filePath: '/test.ts' },
      'file contents',
      'test-session',
      '/test',
      { session: {} }
    )
    expect(result).toBeNull()
  })
})

describe('sanitizeObservation', () => {
  it('is a function', () => {
    expect(typeof sanitizeObservation).toBe('function')
  })

  it('sanitizes narrative', () => {
    const obs = {
      id: 1,
      sessionId: 'test-session',
      project: '/test',
      type: 'discovery' as const,
      title: 'Test',
      narrative: 'api_key="secret"',
      facts: [],
      concepts: [],
      filesRead: [],
      filesModified: [],
      promptNumber: 0,
      createdAt: '2024-01-01',
      createdAtEpoch: 1704067200000,
    }
    const result = sanitizeObservation(obs)
    expect(result.narrative).toBeDefined()
  })

  it('sanitizes facts array', () => {
    const obs = {
      id: 1,
      sessionId: 'test-session',
      project: '/test',
      type: 'discovery' as const,
      title: 'Test',
      facts: ['password="secret"', 'token="abc"'],
      concepts: [],
      filesRead: [],
      filesModified: [],
      promptNumber: 0,
      createdAt: '2024-01-01',
      createdAtEpoch: 1704067200000,
    }
    const result = sanitizeObservation(obs)
    expect(result.facts).toHaveLength(2)
  })
})
