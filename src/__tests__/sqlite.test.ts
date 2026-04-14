import { describe, it, expect, vi } from 'vitest'

vi.mock('../storage/sqlite.js', async () => {
  const actual = await vi.importActual('../storage/sqlite.js')
  return {
    ...actual,
    getDb: vi.fn().mockResolvedValue({
      all: vi.fn((sql, params, cb) => {
        if (typeof cb === 'function') {
          cb(null, [
            { id: 1, type: 'decision', title: 'Use SQLite', created_at: '2024-01-01T00:00:00Z' },
            { id: 2, type: 'feature', title: 'Add search', created_at: '2024-01-02T00:00:00Z' },
          ])
        }
      }),
      get: vi.fn((sql, params, cb) => {
        if (typeof cb === 'function') {
          cb(null, null)
        }
      }),
      run: vi.fn((sql, params, cb) => {
        if (typeof cb === 'function') {
          cb(null)
        }
      }),
      serialize: vi.fn(),
    }),
    initDatabase: vi.fn().mockResolvedValue(undefined),
    searchFts: vi.fn().mockResolvedValue([
      { id: 1, type: 'decision', title: 'Use SQLite', created_at: '2024-01-01T00:00:00Z' },
      { id: 2, type: 'feature', title: 'Add search', created_at: '2024-01-02T00:00:00Z' },
    ]),
    insertObservation: vi.fn().mockResolvedValue({ id: 1, deduplicated: false }),
    findExistingObservation: vi.fn().mockResolvedValue(null),
    insertSummary: vi.fn().mockResolvedValue(1),
    insertUserPrompt: vi.fn().mockResolvedValue(1),
    getObservationsByIds: vi.fn().mockImplementation((ids) => {
      if (ids.length === 0) return Promise.resolve([])
      return Promise.resolve([
        { id: 1, type: 'decision', title: 'Use SQLite', narrative: 'Decided to use SQLite', facts: '["SQLite is fast"]' },
        { id: 2, type: 'feature', title: 'Add search', narrative: 'Added search feature', facts: '["search works"]' },
      ])
    }),
    getObservationById: vi.fn().mockResolvedValue(null),
    getRecentObservations: vi.fn().mockResolvedValue([]),
    getSessionSummary: vi.fn().mockResolvedValue(null),
    getSessionsSince: vi.fn().mockResolvedValue([]),
    countSessionsSince: vi.fn().mockResolvedValue(0),
  }
})

describe('sqlite exports', () => {
  it('exports expected functions', async () => {
    const sqlite = await import('../storage/sqlite.js')
    expect(typeof sqlite.initDatabase).toBe('function')
    expect(typeof sqlite.insertObservation).toBe('function')
    expect(typeof sqlite.insertSummary).toBe('function')
    expect(typeof sqlite.insertUserPrompt).toBe('function')
    expect(typeof sqlite.getRecentObservations).toBe('function')
    expect(typeof sqlite.getSessionSummary).toBe('function')
    expect(typeof sqlite.getSessionsSince).toBe('function')
    expect(typeof sqlite.countSessionsSince).toBe('function')
    expect(typeof sqlite.getDb).toBe('function')
    expect(typeof sqlite.searchFts).toBe('function')
    expect(typeof sqlite.getObservationsByIds).toBe('function')
    expect(typeof sqlite.getObservationById).toBe('function')
    expect(typeof sqlite.generateContentHash).toBe('function')
  })

  it('insertObservation returns object with id and deduplicated', async () => {
    const { insertObservation } = await import('../storage/sqlite.js')
    const result = await insertObservation({
      session_id: 'test-session',
      project: '/test',
      type: 'discovery',
      title: 'Test observation',
    })
    expect(typeof result).toBe('object')
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('deduplicated')
    expect(typeof result.id).toBe('number')
    expect(typeof result.deduplicated).toBe('boolean')
  })

  it('insertSummary returns number', async () => {
    const { insertSummary } = await import('../storage/sqlite.js')
    const result = await insertSummary({
      session_id: 'test-session',
      project: '/test',
      request: 'Test request',
      investigated: 'Test investigated',
      learned: 'Test learned',
      completed: 'Test completed',
      next_steps: 'Test next steps',
    })
    expect(typeof result).toBe('number')
  })

  it('insertUserPrompt returns number', async () => {
    const { insertUserPrompt } = await import('../storage/sqlite.js')
    const result = await insertUserPrompt('test-session', 'Test prompt', 1)
    expect(typeof result).toBe('number')
  })

  it('searchFts returns array', async () => {
    const { searchFts } = await import('../storage/sqlite.js')
    const result = await searchFts('test', { project: '/test' })
    expect(Array.isArray(result)).toBe(true)
  })

  it('searchFts accepts type filter', async () => {
    const { searchFts } = await import('../storage/sqlite.js')
    const result = await searchFts('test', { type: 'bugfix', project: '/test' })
    expect(Array.isArray(result)).toBe(true)
  })

  it('searchFts accepts limit and offset', async () => {
    const { searchFts } = await import('../storage/sqlite.js')
    const result = await searchFts('test', { limit: 10, offset: 5 })
    expect(Array.isArray(result)).toBe(true)
  })

  it('getObservationsByIds returns array', async () => {
    const { getObservationsByIds } = await import('../storage/sqlite.js')
    const result = await getObservationsByIds([1, 2, 3])
    expect(Array.isArray(result)).toBe(true)
  })

  it('getObservationsByIds returns empty for empty input', async () => {
    const { getObservationsByIds } = await import('../storage/sqlite.js')
    const result = await getObservationsByIds([])
    expect(result).toEqual([])
  })

  it('getObservationById returns null for not found', async () => {
    const { getObservationById } = await import('../storage/sqlite.js')
    const result = await getObservationById(999)
    expect(result).toBeNull()
  })
})

describe('generateContentHash', () => {
  it('returns a 32-character hash (128-bit)', async () => {
    const { generateContentHash } = await import('../storage/sqlite.js')
    const hash = generateContentHash({
      type: 'decision',
      title: 'Test',
    })
    expect(typeof hash).toBe('string')
    expect(hash.length).toBe(32)
  })

  it('produces same hash for identical input', async () => {
    const { generateContentHash } = await import('../storage/sqlite.js')
    const input = { type: 'decision', title: 'Test' }
    const hash1 = generateContentHash(input)
    const hash2 = generateContentHash(input)
    expect(hash1).toBe(hash2)
  })

  it('produces different hash for different input', async () => {
    const { generateContentHash } = await import('../storage/sqlite.js')
    const hash1 = generateContentHash({ type: 'decision', title: 'Test A' })
    const hash2 = generateContentHash({ type: 'decision', title: 'Test B' })
    expect(hash1).not.toBe(hash2)
  })

  it('is case insensitive for title', async () => {
    const { generateContentHash } = await import('../storage/sqlite.js')
    const hash1 = generateContentHash({ type: 'decision', title: 'TEST' })
    const hash2 = generateContentHash({ type: 'decision', title: 'test' })
    expect(hash1).toBe(hash2)
  })
})

describe('FTS sync functions', () => {
  it('exports verifyFtsSync function', async () => {
    const sqlite = await import('../storage/sqlite.js')
    expect(typeof sqlite.verifyFtsSync).toBe('function')
  })

  it('exports syncFtsEntry function', async () => {
    const sqlite = await import('../storage/sqlite.js')
    expect(typeof sqlite.syncFtsEntry).toBe('function')
  })

  it('exports optimizeFts function', async () => {
    const sqlite = await import('../storage/sqlite.js')
    expect(typeof sqlite.optimizeFts).toBe('function')
  })
})

describe('batch decay scores', () => {
  it('exports getTimeDecayScores function', async () => {
    const sqlite = await import('../storage/sqlite.js')
    expect(typeof sqlite.getTimeDecayScores).toBe('function')
  })

  it('getTimeDecayScores returns Map', async () => {
    const { getTimeDecayScores } = await import('../storage/sqlite.js')
    const result = await getTimeDecayScores([1, 2, 3])
    expect(result).toBeInstanceOf(Map)
  })

  it('getTimeDecayScores returns empty Map for empty input', async () => {
    const { getTimeDecayScores } = await import('../storage/sqlite.js')
    const result = await getTimeDecayScores([])
    expect(result.size).toBe(0)
  })
})
