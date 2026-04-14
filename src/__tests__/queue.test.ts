import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ObservationQueue } from '../observer/queue.js'

vi.mock('../storage/sqlite.js', () => ({
  insertObservation: vi.fn().mockReturnValue({ id: 1, deduplicated: false }),
  getRecentObservations: vi.fn().mockReturnValue([]),
  getSessionSummary: vi.fn().mockReturnValue(null),
  getDb: vi.fn().mockReturnValue({
    prepare: vi.fn().mockReturnValue({
      run: vi.fn(),
      all: vi.fn().mockReturnValue([]),
      get: vi.fn().mockReturnValue(null),
    }),
    exec: vi.fn().mockReturnValue([]),
  }),
  initDatabase: vi.fn().mockReturnValue({}),
  countSessionsSince: vi.fn().mockReturnValue(0),
}))

vi.mock('../compressor/ai.js', () => ({
  compressObservation: vi.fn().mockResolvedValue({
    sessionId: 'sess-1',
    project: 'proj',
    type: 'discovery',
    title: 'Test',
    narrative: 'Test narrative',
    facts: [],
    concepts: [],
    filesRead: [],
    filesModified: [],
    promptNumber: 1,
    qualityScore: 0.5,
  }),
}))

describe('ObservationQueue', () => {
  let queue: ObservationQueue

  beforeEach(() => {
    vi.clearAllMocks()
    queue = new ObservationQueue()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('adds item to queue when enqueued', () => {
    queue.enqueue({
      tool: 'Bash',
      input: { command: 'ls' },
      output: 'file.ts',
      sessionId: 'sess-1',
      project: 'proj',
      timestamp: Date.now(),
    })
    expect(queue.getQueueLength()).toBe(1)
  })

  it('assigns a unique UUID to each enqueued item', () => {
    queue.enqueue({ tool: 'Read', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 1 })
    queue.enqueue({ tool: 'Write', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 2 })
    expect(queue.getQueueLength()).toBe(2)
  })

  it('tracks multiple enqueued items', () => {
    queue.enqueue({ tool: 'Read', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 1 })
    queue.enqueue({ tool: 'Write', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 2 })
    queue.enqueue({ tool: 'Bash', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 3 })
    expect(queue.getQueueLength()).toBe(3)
  })

  it('flushes all queued items', async () => {
    queue.enqueue({ tool: 'Read', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 1 })
    queue.enqueue({ tool: 'Write', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 2 })
    expect(queue.getQueueLength()).toBe(2)
    
    await queue.flush()
    
    expect(queue.getQueueLength()).toBe(0)
  })

  it('does not process if queue is empty on flush', async () => {
    expect(queue.getQueueLength()).toBe(0)
    await queue.flush()
    expect(queue.getQueueLength()).toBe(0)
  })

  it('drops oldest items when exceeding max queue size', () => {
    const maxSize = 100
    for (let i = 0; i < maxSize + 10; i++) {
      queue.enqueue({ tool: 'Read', input: {}, output: '', sessionId: 's', project: 'p', timestamp: i })
    }
    expect(queue.getQueueLength()).toBeLessThanOrEqual(maxSize)
  })
})
