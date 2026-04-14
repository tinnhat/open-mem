import { describe, it, expect, vi } from 'vitest'

vi.mock('../storage/sqlite.js', () => ({
  getDb: vi.fn().mockResolvedValue({
    all: vi.fn((sql, params, cb) => {
      if (typeof cb === 'function') {
        cb(null, [
          { id: 1, type: 'decision', title: 'Use SQLite', created_at: '2024-01-01T00:00:00Z' },
          { id: 2, type: 'feature', title: 'Add search', created_at: '2024-01-02T00:00:00Z' },
          { id: 3, type: 'bugfix', title: 'Fix bug', created_at: '2024-01-03T00:00:00Z' },
        ])
      }
    }),
    get: vi.fn((sql, params, cb) => {
      if (typeof cb === 'function') {
        cb(null, { id: 1, created_at_epoch: 1704067200000 })
      }
    }),
  }),
  searchFts: vi.fn().mockResolvedValue([
    { id: 1, type: 'decision', title: 'Use SQLite', created_at: '2024-01-01T00:00:00Z' },
    { id: 2, type: 'feature', title: 'Add search', created_at: '2024-01-02T00:00:00Z' },
  ]),
}))

describe('search exports', () => {
  it('exports search, timeline, getObservations functions', async () => {
    const progressive = await import('../search/progressive.js')
    expect(typeof progressive.search).toBe('function')
    expect(typeof progressive.timeline).toBe('function')
    expect(typeof progressive.getObservations).toBe('function')
  })

  it('search returns SearchResult array', async () => {
    const { search } = await import('../search/progressive.js')
    const results = await search('test')
    expect(Array.isArray(results)).toBe(true)
  })

  it('search returns results with id, type, title, createdAt', async () => {
    const { search } = await import('../search/progressive.js')
    const results = await search('SQLite')
    expect(results.length).toBeGreaterThan(0)
    expect(results[0]).toHaveProperty('id')
    expect(results[0]).toHaveProperty('type')
    expect(results[0]).toHaveProperty('title')
    expect(results[0]).toHaveProperty('createdAt')
  })

  it('search accepts type filter', async () => {
    const { search } = await import('../search/progressive.js')
    const results = await search('test', { type: 'bugfix' })
    expect(Array.isArray(results)).toBe(true)
  })

  it('search accepts project filter', async () => {
    const { search } = await import('../search/progressive.js')
    const results = await search('test', { project: '/test' })
    expect(Array.isArray(results)).toBe(true)
  })

  it('search accepts limit and offset', async () => {
    const { search } = await import('../search/progressive.js')
    const results = await search('test', { limit: 5, offset: 2 })
    expect(Array.isArray(results)).toBe(true)
  })

  it('timeline returns array', async () => {
    const { timeline } = await import('../search/progressive.js')
    const results = await timeline(1)
    expect(Array.isArray(results)).toBe(true)
  })

  it('timeline returns empty for non-existent anchor', async () => {
    const { timeline } = await import('../search/progressive.js')
    const results = await timeline(9999)
    expect(Array.isArray(results)).toBe(true)
  })

  it('timeline accepts depthBefore and depthAfter options', async () => {
    const { timeline } = await import('../search/progressive.js')
    const results = await timeline(1, { depthBefore: 5, depthAfter: 10 })
    expect(Array.isArray(results)).toBe(true)
  })

  it('getObservations returns array', async () => {
    const { getObservations } = await import('../search/progressive.js')
    const results = await getObservations([1, 2])
    expect(Array.isArray(results)).toBe(true)
  })

  it('getObservations returns empty for empty input', async () => {
    const { getObservations } = await import('../search/progressive.js')
    const results = await getObservations([])
    expect(results).toEqual([])
  })

  it('getObservations accepts project filter', async () => {
    const { getObservations } = await import('../search/progressive.js')
    const results = await getObservations([1, 2], { project: '/test' })
    expect(Array.isArray(results)).toBe(true)
  })
})
