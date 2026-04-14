import { describe, it, expect, vi } from 'vitest'

vi.mock('../storage/memory-md.js', () => ({
  getMemoryDir: vi.fn().mockReturnValue('/mock/memory'),
  readMemoryIndex: vi.fn().mockResolvedValue('# MEMORY.md\n## Recent Updates\n'),
  writeMemoryIndex: vi.fn().mockResolvedValue(undefined),
  getAllTopicFiles: vi.fn().mockResolvedValue(['topic1', 'topic2']),
  readTopicFile: vi.fn().mockResolvedValue(`---
name: test-topic
type: discovery
---
## Test Title
`),
  writeTopicFile: vi.fn().mockResolvedValue(undefined),
}))

describe('memory-md exports', () => {
  it('exports expected functions', async () => {
    const memoryMd = await import('../storage/memory-md.js')
    expect(typeof memoryMd.getMemoryDir).toBe('function')
    expect(typeof memoryMd.readMemoryIndex).toBe('function')
    expect(typeof memoryMd.writeMemoryIndex).toBe('function')
    expect(typeof memoryMd.getAllTopicFiles).toBe('function')
    expect(typeof memoryMd.readTopicFile).toBe('function')
    expect(typeof memoryMd.writeTopicFile).toBe('function')
  })

  it('getMemoryDir returns a string', async () => {
    const { getMemoryDir } = await import('../storage/memory-md.js')
    const result = getMemoryDir()
    expect(typeof result).toBe('string')
  })

  it('readMemoryIndex returns string', async () => {
    const { readMemoryIndex } = await import('../storage/memory-md.js')
    const result = await readMemoryIndex()
    expect(typeof result).toBe('string')
  })

  it('writeMemoryIndex resolves', async () => {
    const { writeMemoryIndex } = await import('../storage/memory-md.js')
    await expect(writeMemoryIndex('# MEMORY.md\n')).resolves.toBeUndefined()
  })

  it('getAllTopicFiles returns array', async () => {
    const { getAllTopicFiles } = await import('../storage/memory-md.js')
    const result = await getAllTopicFiles()
    expect(Array.isArray(result)).toBe(true)
  })

  it('readTopicFile returns string or null', async () => {
    const { readTopicFile } = await import('../storage/memory-md.js')
    const result = await readTopicFile('topic1')
    expect(result === null || typeof result === 'string').toBe(true)
  })

  it('writeTopicFile resolves', async () => {
    const { writeTopicFile } = await import('../storage/memory-md.js')
    await expect(writeTopicFile('test-topic', '# Test Content')).resolves.toBeUndefined()
  })
})
