# opencode-mem

Persistent memory system for Opencode that automatically captures coding activities, compresses them with AI, and injects relevant context into future sessions.

## Features

- 🧠 **Persistent Memory** - Context survives across sessions
- 📊 **Progressive Disclosure** - 3-layer memory retrieval (search → timeline → cite)
- 🔍 **Full-Text Search** - FTS5-powered search with SQLite
- 🔗 **Citations** - Reference past observations with IDs
- 🏷️ **Deduplication** - Exact hash dedup prevents duplicate entries
- 🔒 **Privacy Control** - Strips API keys, passwords, `<private>` tags
- 📝 **MEMORY.md Export** - Human-readable memory files
- 💾 **SQLite Storage** - Local, fast, no external dependencies

## Installation

```bash
npm install -g opencode-mem
opencode-mem install
```

Or use npx:

```bash
npx opencode-mem install
```

## Usage

After installation, open-mem automatically:
1. Captures tool executions (Read, Write, Edit, Bash, etc.)
2. Compresses observations with AI
3. Stores in SQLite database
4. Injects relevant context on first message

### Memory Search Commands

```bash
# Search memories
open-mem search <query>

# List recent memories
open-mem list

# Get memory details
open-mem cite <ids>

# Show help
open-mem help
```

## Architecture

```
User Action → Tool Capture → AI Compression → SQLite + FTS5 → Context Injection
                                       ↓
                              MEMORY.md Export
```

## 3-Layer Progressive Disclosure

| Layer | Command | Purpose |
|-------|---------|---------|
| 1 | `search` / `list` | Get compact index with IDs (~50-100 tokens/result) |
| 2 | `timeline` | Get context around observation |
| 3 | `cite` | Get full details (~500-1000 tokens/observation) |

## Comparison with claude-mem

| Feature | claude-mem | open-mem |
|---------|-----------|----------|
| Storage | SQLite + Chroma | SQLite + FTS5 |
| Semantic Search | ✅ | ❌ (FTS5 keyword only) |
| Web UI | ✅ | ❌ |
| MEMORY.md Export | ❌ | ✅ |
| Privacy | ⚠️ (external API) | ✅ (100% local) |

## Development

```bash
# Build
npm run build

# Test
npm test

# Watch mode
npm run dev
```

## License

MIT

## Contributing

Contributions welcome! Please submit issues and PRs.
