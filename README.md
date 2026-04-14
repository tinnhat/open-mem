# session-memory-opencode

Persistent memory system for [Opencode](https://opencode.ai) that automatically captures coding activities, compresses them with AI, and injects relevant context into future sessions.

## Table of Contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Quick Start](#quick-start)
- [Configuration](#configuration)
- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [API Endpoints](#api-endpoints)
- [Commands](#commands)
- [Privacy & Security](#privacy--security)
- [Troubleshooting](#troubleshooting)
- [Development](#development)

---

## Features

| Feature | Description |
|---------|-------------|
| 🧠 **Persistent Memory** | Context survives across sessions automatically |
| 📊 **Progressive Disclosure** | 3-layer memory retrieval (search → timeline → cite) |
| 🔍 **Full-Text Search** | FTS5-powered search with SQLite |
| 🔗 **Citations** | Reference past observations with IDs |
| 🏷️ **Deduplication** | SHA256 hash dedup prevents duplicate entries |
| 🔒 **Privacy Control** | Strips API keys, passwords, `<private>` tags |
| 📝 **MEMORY.md Export** | Human-readable memory files per project |
| 💾 **SQLite Storage** | Local, fast, no external dependencies |
| ⏱️ **Time Decay** | Hot/warm/cold tier system for memory freshness |
| 🔄 **Context Caching** | 60s TTL cache reduces worker load |

---

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Opencode** | Latest | Must be installed and configured |
| **Node.js** | >= 18.0.0 | Runtime requirement |
| **Ollama** | Latest | For embedding generation |
| **Embedding Model** | `snowflake-arctic-embed` | Auto-pulled on first use |

### Ollama Setup

```bash
# Install Ollama
brew install ollama

# Start Ollama
ollama serve

# Pull embedding model (auto-done on first use)
ollama pull snowflake-arctic-embed
```

---

## Installation

### Option 1: From Source (Recommended)

```bash
# Clone the repository
git clone https://github.com/tinnhat/session-memory-opencode.git
cd session-memory-opencode

# Install dependencies
npm install

# Build
npm run build

# Install plugin to Opencode
npx session-memory-opencode install
```

### Option 2: Global Link

```bash
# Clone and build
git clone https://github.com/tinnhat/session-memory-opencode.git
cd session-memory-opencode
npm install && npm run build

# Link globally
npm link

# Install plugin
session-memory-opencode install
```

---

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install && npm run build
   ```

2. **Install plugin:**
   ```bash
   npx session-memory-opencode install
   ```

3. **Restart Opencode** - Plugin auto-loads on startup

4. **Start the memory server:**
   ```bash
   npx session-memory-opencode serve
   ```
   Server runs at `http://localhost:37778`

5. **Open Dashboard:**
   Visit `http://localhost:37778/dashboard`

---

## Configuration

Configuration file: `~/.config/opencode/opencode.jsonc`

### Manual Plugin Registration

If automatic install fails, add manually:

```jsonc
{
  "plugin": ["session-memory-opencode/plugin"]
}
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENCODE_CONFIG_DIR` | `~/.config/opencode` | Opencode config directory |
| `PORT` | `37778` | Server port |
| `HOST` | `127.0.0.1` | Server host |

### Plugin Options

```typescript
interface PluginConfig {
  // Enable/disable features
  memoryEnabled?: boolean;
  
  // Project filter (empty = all projects)
  project?: string;
  
  // Ollama endpoint
  ollamaHost?: string;
  ollamaPort?: number;
  
  // Compression settings
  compressionEnabled?: boolean;
  minImportanceThreshold?: number;
}
```

---

## How It Works

### Lifecycle Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│  1. SESSION START                                                   │
│     before_agent_start → Initialize session in worker                │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│  2. TOOL EXECUTION (Background)                                      │
│     tool.execute.after → Queue observation                           │
│                        → AI compress (MiniMax API)                   │
│                        → Generate embedding (Ollama)                  │
│                        → Store in SQLite                            │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│  3. CONTEXT INJECTION (On Request)                                   │
│     before_prompt_build → Search memory (FTS5 + Vector)            │
│                          → Inject relevant context                   │
│                          → Context cached (60s TTL)                 │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│  4. SESSION END                                                      │
│     agent_end → Summarize session                                    │
│              → Update MEMORY.md                                     │
│              → Schedule completion (5s delay)                        │
└─────────────────────────────────────────────────────────────────────┘
```

### What Gets Captured

| Tool | Captured |
|------|----------|
| `Read` | File content read |
| `Write` | File content written |
| `Edit` | Changes made |
| `Bash` | Commands executed |
| `Glob` | File patterns searched |
| `Grep` | Search queries |
| `WebFetch` | External content |

### What Gets Compressed

Each observation is compressed into:

```typescript
interface CompressedObservation {
  type: 'decision' | 'bugfix' | 'feature' | 'refactor' | 'discovery' | 'feedback' | 'reference';
  title: string;           // Brief title
  narrative?: string;        // Explanation
  facts: string[];          // Key facts
  concepts: string[];        // Concepts learned
  filesRead?: string[];     // Files involved
  filesModified?: string[]; // Files changed
}
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        OPENCODE PLUGIN                               │
├─────────────────────────────────────────────────────────────────────┤
│  src/plugin/index.ts                                                │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │   Observer   │  │   Injector  │  │  Commands   │               │
│  │  (Queue)     │  │  (Context)   │  │  (CLI)      │               │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘               │
│         │                 │                 │                       │
│         └────────┬────────┴─────────────────┘                       │
│                  ↓ HTTP                                              │
├─────────────────────────────────────────────────────────────────────┤
│                        WORKER SERVER                                 │
├─────────────────────────────────────────────────────────────────────┤
│  src/worker/server.ts (Express)                                     │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │  Compressor │  │  Storage    │  │   Search    │               │
│  │  (AI)       │  │  (SQLite)   │  │  (FTS5)    │               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │  Privacy    │  │  Consolidation│ │  Dashboard   │               │
│  │  (Strip)    │  │  (Engine)   │  │  (UI)        │               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
└─────────────────────────────────────────────────────────────────────┘
                                ↓
┌─────────────────────────────────────────────────────────────────────┐
│                        EXTERNAL SERVICES                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐               │
│  │  Ollama     │  │  MiniMax    │  │  SQLite     │               │
│  │  (Embed)   │  │  (Compress) │  │  (Store)   │               │
│  └─────────────┘  └─────────────┘  └─────────────┘               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | File | Responsibility |
|-----------|------|----------------|
| **Plugin** | `src/plugin/index.ts` | Opencode integration, event hooks |
| **Observer** | `src/observer/queue.ts` | Queue and process observations |
| **Compressor** | `src/compressor/ai.ts` | AI compression via OpenCode SDK |
| **Storage** | `src/storage/sqlite.ts` | SQLite operations, FTS5 |
| **Vectors** | `src/storage/vectors.ts` | Ollama embedding storage |
| **Privacy** | `src/privacy/strip.ts` | Secrets redaction |
| **Search** | `src/search/progressive.ts` | 3-layer progressive search |
| **Consolidation** | `src/consolidation/engine.ts` | Session summarization |
| **Worker** | `src/worker/server.ts` | HTTP API server |
| **Dashboard** | `src/worker/dashboard/` | Web UI |

---

## API Endpoints

### Health Check

```bash
curl http://localhost:37778/health
```

Response:
```json
{
  "status": "ok",
  "timestamp": 1713000000000
}
```

### Dashboard

- **URL:** `http://localhost:37778/dashboard`
- View memory observations, search, timeline

### API Routes

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/health` | Health check |
| `GET` | `/dashboard` | Web dashboard |
| `GET` | `/api/context/inject` | Get context for injection |
| `POST` | `/api/sessions/init` | Initialize new session |
| `POST` | `/api/sessions/observations` | Submit tool observation |
| `POST` | `/api/sessions/summarize` | Summarize session |
| `GET` | `/api/search/observations` | Search memories |
| `GET` | `/api/timeline/by-query` | Timeline by query |
| `GET` | `/api/observation/:id` | Get single observation |
| `GET` | `/api/sessions` | List sessions |
| `GET` | `/api/stats` | Statistics |

---

## Commands

### Plugin Commands

```bash
# Install plugin to Opencode
session-memory-opencode install

# Uninstall plugin
session-memory-opencode uninstall

# Start memory server
session-memory-opencode serve

# Show help
session-memory-opencode help
```

### CLI (Future)

```bash
# Search memories
opencode-mem search <query>

# List recent memories
opencode-mem list

# Get timeline
opencode-mem timeline <query>

# Export MEMORY.md
opencode-mem export
```

---

## Privacy & Security

### Secrets Stripping

The plugin automatically redacts:

| Pattern | Examples |
|---------|----------|
| API Keys | `AKIAIOSFODNN7EXAMPLE`, `AIzaSyD7Qm...` |
| AWS Secret Keys | `aws_secret_access_key=...` |
| SSH Keys | `-----BEGIN RSA PRIVATE KEY-----` |
| JWT Tokens | `eyJhbGciOiJIUzI1NiJ9...` |
| Generic Secrets | `secret=`, `password=`, `token=` |
| `<private>` Tags | `<private>...</private>` |

### Privacy Best Practices

1. **Use `<private>` tags** in code to exclude sensitive sections
2. **Review observations** in dashboard regularly
3. **Export and review** MEMORY.md before sharing

### Data Storage

- All data stored locally in `~/.config/opencode/memory/`
- No data sent to external servers (except MiniMax for compression)
- Ollama embeddings run completely local

---

## Troubleshooting

### Plugin Not Loading

```bash
# Check Opencode config
cat ~/.config/opencode/opencode.jsonc

# Verify plugin directory
ls -la ~/.config/opencode/plugins/session-memory-opencode/
```

### Server Won't Start

```bash
# Check port availability
lsof -i :37778

# View server logs
tail -f /tmp/session-memory-server.log
```

### No Observations Captured

1. Check if plugin is loaded: `/help` in Opencode
2. Verify worker is running: `curl http://localhost:37778/health`
3. Check logs in Opencode console

### Ollama Not Responding

```bash
# Check Ollama status
ollama list

# Restart Ollama
pkill ollama
ollama serve
```

### Memory Database Issues

```bash
# Backup database
cp ~/.config/opencode/memory/memory.db ~/.config/opencode/memory/memory.db.backup

# Reset database (warning: loses all data)
rm ~/.config/opencode/memory/memory.db
```

---

## Development

### Project Structure

```
session-memory-opencode/
├── src/
│   ├── cli/              # CLI commands
│   ├── compressor/      # AI compression
│   ├── consolidation/    # Session summarization
│   ├── observer/         # Tool observation
│   ├── plugin/           # Opencode plugin
│   ├── privacy/         # Secrets stripping
│   ├── search/          # Progressive search
│   ├── storage/          # SQLite + vectors
│   ├── taxonomy/         # Type definitions
│   ├── utils/            # Utilities
│   ├── worker/           # HTTP server
│   └── __tests__/        # Unit tests
├── dist/                 # Compiled output
├── README.md
└── package.json
```

### Build & Test

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Run tests
npm test

# Watch mode
npm run dev
```

### Adding Tests

```bash
# Tests live in src/__tests__/
npm test -- --watch
```

---

## Comparison with claude-mem

| Feature | claude-mem | session-memory-opencode |
|---------|-----------|------------------------|
| **License** | AGPL-3.0 | MIT |
| **Storage** | SQLite + Chroma | SQLite + FTS5 |
| **Embedding** | Ollama | Ollama |
| **Compression** | Claude SDK | OpenCode SDK (MiniMax) |
| **MEMORY.md Export** | ❌ | ✅ |
| **Time Decay** | ❌ | ✅ (hot/warm/cold) |
| **Secrets Patterns** | <private> tags | 20+ regex patterns |
| **FTS Sync** | ❌ | ✅ |
| **Transactions** | ❌ | ✅ |
| **Platform** | Claude Code, Gemini, Cursor | Opencode only |
| **Community** | 54k stars | Small (new project) |

---

## License

MIT License - See [LICENSE](LICENSE)

---

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make changes with tests
4. Submit a Pull Request

---

## Credits

- Built for [Opencode](https://opencode.ai)
- Inspired by [claude-mem](https://github.com/thedotmack/claude-mem)
