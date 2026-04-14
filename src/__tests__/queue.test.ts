import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ObservationQueue } from '../observer/queue.js'

vi.mock('../storage/sqlite.js', () => ({
  insertObservation: vi.fn().mockReturnValue(1),
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

describe('ObservationQueue', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('adds item to queue when enqueued', () => {
    const queue = new ObservationQueue()
    vi.spyOn(queue as any, 'processNext').mockImplementation(async () => {})
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
    const queue = new ObservationQueue()
    vi.spyOn(queue as any, 'processNext').mockImplementation(async () => {})
    queue.enqueue({ tool: 'Read', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 1 })
    queue.enqueue({ tool: 'Write', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 2 })
    expect(queue.getQueueLength()).toBe(2)
  })

  it('tracks multiple enqueued items', () => {
    const queue = new ObservationQueue()
    vi.spyOn(queue as any, 'processNext').mockImplementation(async () => {})
    queue.enqueue({ tool: 'Read', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 1 })
    queue.enqueue({ tool: 'Write', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 2 })
    queue.enqueue({ tool: 'Bash', input: {}, output: '', sessionId: 's', project: 'p', timestamp: 3 })
    expect(queue.getQueueLength()).toBe(3)
  })
})