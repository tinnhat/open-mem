import { tool } from '@opencode-ai/plugin';
import { initDatabase, insertObservation, insertSummary, insertUserPrompt, getObservationsByIds } from '../storage/sqlite.js';
import { search, timeline, getObservations } from '../search/progressive.js';
import { compressObservation } from '../compressor/ai.js';
import { writeTopicFile, readMemoryIndex, writeMemoryIndex, getAllTopicFiles, readTopicFile } from '../storage/memory-md.js';
import type { ObservationType } from '../taxonomy/types.js';

let dbInitialized = false;
const injectedSessions = new Set<string>();
const sessionObservations = new Map<string, string[]>();
const sessionPromptCount = new Map<string, number>();

const HIGH_VALUE_TOOLS = [
  'Read', 'Write', 'Edit', 'Bash', 'Glob', 'Grep',
  'NotebookEdit', 'WebSearch', 'WebFetch', 'read', 'write', 'edit', 'bash', 'glob', 'grep'
];

async function ensureDb() {
  if (!dbInitialized) {
    await initDatabase();
    dbInitialized = true;
  }
}

interface PluginContext {
  directory: string;
  client: {
    session?: {
      prompt: (options: unknown) => Promise<{ data?: { info?: { structured_output?: unknown } } }>;
    };
  };
}

const SESSION_SUMMARY_PROMPT = `Analyze this coding session and create a structured summary.

Session Observations:
{observations}

Return a JSON object:
{
  "request": "What the user initially wanted",
  "investigated": "What was explored/investigated",
  "learned": "Key learnings from this session",
  "completed": "What was completed",
  "nextSteps": "What should happen next"
}`;

async function generateSessionSummary(
  sessionId: string,
  project: string,
  client: PluginContext['client']
): Promise<{
  request: string;
  investigated: string;
  learned: string;
  completed: string;
  nextSteps: string;
} | null> {
  try {
    const obsIds = sessionObservations.get(sessionId) || [];
    if (obsIds.length === 0) return null;

    const observations = await search('', { project, limit: 50 });
    const sessionObs = observations.filter(o => obsIds.includes(String(o.id)));
    
    if (sessionObs.length === 0) return null;

    const summaryText = sessionObs.map(o => `- [${o.type}] ${o.title}: ${o.createdAt}`).join('\n');
    const prompt = SESSION_SUMMARY_PROMPT.replace('{observations}', summaryText);

    const result = await client.session?.prompt({
      body: {
        parts: [{ type: 'text', text: prompt }],
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              request: { type: 'string' },
              investigated: { type: 'string' },
              learned: { type: 'string' },
              completed: { type: 'string' },
              nextSteps: { type: 'string' }
            },
            required: ['request', 'investigated', 'learned', 'completed', 'nextSteps']
          }
        }
      }
    });

    if (!result) return null;
    
    const data = (result as any)?.data?.info?.structured_output;
    return data || null;
  } catch (error) {
    console.error('[open-mem] Summary generation error:', error);
    return null;
  }
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);
}

function getTypeIcon(type: ObservationType): string {
  const icons: Record<ObservationType, string> = {
    decision: '📋',
    bugfix: '🐛',
    feature: '✨',
    refactor: '🔄',
    discovery: '💡',
    feedback: '💬',
    reference: '📚',
  };
  return icons[type] || '📝';
}

async function exportObservationToMemoryMd(
  obs: {
    id: number;
    type: ObservationType;
    title: string;
    narrative?: string;
    facts?: string[];
    created_at?: string;
  },
  project: string
): Promise<void> {
  try {
    const slug = `${obs.type}_${slugify(obs.title)}_${obs.id}`;
    const date = obs.created_at || new Date().toISOString();
    
    const content = `---
name: ${slug}
description: ${obs.title}
type: ${obs.type}
created: ${date.split('T')[0]}
project: ${project}
---

${getTypeIcon(obs.type)} **${obs.type.toUpperCase()}**

## ${obs.title}

${obs.narrative || 'No narrative available.'}

${obs.facts && obs.facts.length > 0 ? `## Key Facts

${obs.facts.map(f => `- ${f}`).join('\n')}` : ''}

---
_Last updated: ${date}_
`;

    await writeTopicFile(slug, content);
    console.log('[open-mem] Exported observation to MEMORY.md topic:', slug);
  } catch (error) {
    console.error('[open-mem] Export to MEMORY.md error:', error);
  }
}

async function updateMemoryIndex(project: string): Promise<void> {
  try {
    const topics = await getAllTopicFiles();
    const index = await readMemoryIndex();
    
    if (topics.length === 0) return;
    
    const recentSection = `## Recent Updates\n\n`;
    const existingEntries: string[] = [];
    
    for (const topic of topics.slice(0, 20)) {
      const content = await readTopicFile(topic);
      if (content) {
        const titleMatch = content.match(/^name: (.+)$/m);
        const typeMatch = content.match(/^type: (.+)$/m);
        const title = titleMatch ? titleMatch[1] : topic;
        const type = typeMatch ? typeMatch[1] : 'note';
        
        existingEntries.push(`- [${title}](${topic}.md) — ${type}`);
      }
    }
    
    if (existingEntries.length > 0 && !index.includes(existingEntries[0])) {
      const insertAt = index.indexOf(recentSection) + recentSection.length;
      const before = index.slice(0, insertAt);
      const after = index.slice(insertAt);
      await writeMemoryIndex(before + existingEntries.join('\n') + '\n' + after);
    }
  } catch (error) {
    console.error('[open-mem] Update memory index error:', error);
  }
}

async function finalizeSession(sessionId: string, project: string, client: PluginContext['client']): Promise<void> {
  const obsIds = sessionObservations.get(sessionId);
  if (!obsIds || obsIds.length === 0) {
    sessionObservations.delete(sessionId);
    return;
  }

  try {
    const summary = await generateSessionSummary(sessionId, project, client);

    if (summary) {
      await insertSummary({
        session_id: sessionId,
        project,
        request: summary.request,
        investigated: summary.investigated,
        learned: summary.learned,
        completed: summary.completed,
        next_steps: summary.nextSteps,
      });
      console.log('[open-mem] Session summary created for:', sessionId);
      await updateMemoryIndex(project);
    }
  } catch (error) {
    console.error('[open-mem] Finalize session error:', error);
  } finally {
    sessionObservations.delete(sessionId);
    sessionPromptCount.delete(sessionId);
  }
}

export const server: Function = async (ctx: PluginContext) => {
  await ensureDb();

  return {
    'session.created': async ({ session }: { session: { id: string } }) => {
      console.log('[open-mem] Session created:', session.id);
      sessionObservations.set(session.id, []);
      sessionPromptCount.set(session.id, 0);
    },

    'chat.message': async (input: { sessionID: string; text?: string }, output: { message: { id: string }; parts: unknown[] }) => {
      const isFirstMessage = !injectedSessions.has(input.sessionID);

      if (isFirstMessage) {
        injectedSessions.add(input.sessionID);

        try {
          const project = ctx.directory || process.cwd();
          const results = await search('', { project, limit: 10 });

          if (results.length > 0) {
            const contextLines = [
              '## Prior Context from open-mem',
              '',
              'Recent memories from this project:',
              ''
            ];

            for (const r of results) {
              contextLines.push(`- [${r.type}] ${r.title} (id:${r.id})`);
            }

            contextLines.push('');
            contextLines.push('To learn more: use the `/mem-search` command');

            const contextPart = {
              id: `prt_openmem-context-${Date.now()}`,
              sessionID: input.sessionID,
              messageID: output.message.id,
              type: 'text',
              text: contextLines.join('\n'),
              synthetic: true,
            };

            output.parts.unshift(contextPart);
          }
        } catch (error) {
          console.error('[open-mem] Context injection error:', error);
        }
      }

      if (input.text) {
        const promptNumber = (sessionPromptCount.get(input.sessionID) || 0) + 1;
        sessionPromptCount.set(input.sessionID, promptNumber);

        try {
          await insertUserPrompt(input.sessionID, input.text, promptNumber);
        } catch (error) {
          console.error('[open-mem] User prompt store error:', error);
        }
      }
    },

    'tool.execute.after': async ({ tool: toolName, sessionID, args, output }: { tool: string; sessionID: string; args: unknown; output?: { output?: string } }) => {
      if (!HIGH_VALUE_TOOLS.includes(toolName)) return;

      try {
        const project = ctx.directory || process.cwd();

        let toolOutput = output?.output || '';
        if (typeof toolOutput === 'object') {
          toolOutput = JSON.stringify(toolOutput);
        }

        const compressed = await compressObservation(
          toolName,
          args,
          toolOutput,
          sessionID,
          project,
          ctx.client
        );

        let result: { id: number; deduplicated: boolean };
        if (compressed) {
          result = await insertObservation({
            session_id: sessionID,
            project,
            type: compressed.type,
            title: compressed.title,
            narrative: compressed.narrative,
            facts: compressed.facts,
            concepts: compressed.concepts,
            files_read: compressed.filesRead,
            files_modified: compressed.filesModified,
          });
        } else {
          result = await insertObservation({
            session_id: sessionID,
            project,
            type: 'discovery',
            title: `${toolName} executed`,
            narrative: `Tool ${toolName} was executed`,
            facts: args ? [JSON.stringify(args).slice(0, 500)] : [],
          });
        }

        const obs = sessionObservations.get(sessionID) || [];
        obs.push(String(result.id));
        sessionObservations.set(sessionID, obs);

        if (compressed && result.id && !result.deduplicated) {
          await exportObservationToMemoryMd(
            {
              id: result.id,
              type: compressed.type,
              title: compressed.title,
              narrative: compressed.narrative,
              facts: compressed.facts,
              created_at: new Date().toISOString(),
            },
            project
          );
        }
      } catch (error) {
        console.error('[open-mem] Tool capture error:', error);
      }
    },

    'session.idle': async () => {
      for (const [sessionId] of sessionObservations) {
        try {
          const project = ctx.directory || process.cwd();
          await finalizeSession(sessionId, project, ctx.client);
        } catch (error) {
          console.error('[open-mem] Session idle error:', error);
        }
      }
    },

    'session.deleted': async ({ session }: { session: { id: string } }) => {
      const sessionId = session.id;
      console.log('[open-mem] Session deleted:', sessionId);

      try {
        const project = ctx.directory || process.cwd();
        await finalizeSession(sessionId, project, ctx.client);
      } catch (error) {
        console.error('[open-mem] Session deleted error:', error);
      }
    },

    tool: {
      'mem-search': tool({
        description: 'open-mem memory system with 3-layer progressive disclosure: (1) search/list for index, (2) timeline for context, (3) cite/get for full details.',
        args: {
          mode: tool.schema.enum(['search', 'list', 'timeline', 'cite', 'get', 'help']).optional(),
          query: tool.schema.string().optional(),
          limit: tool.schema.number().optional(),
          anchor: tool.schema.number().optional(),
          depth: tool.schema.number().optional(),
        },
        async execute(args: { mode?: string; query?: string; limit?: number; anchor?: number; depth?: number }) {
          const mode = args.mode || 'help';
          const project = ctx.directory || process.cwd();

          try {
            switch (mode) {
              case 'help':
                return JSON.stringify({
                  success: true,
                  message: 'open-mem Memory System - 3-Layer Progressive Disclosure',
                  workflow: '1. search/list → 2. timeline → 3. cite/get',
                  commands: [
                    { command: 'search', description: 'Search memories (Layer 1: index)', args: ['query', 'limit?'] },
                    { command: 'list', description: 'List recent memories (Layer 1: index)', args: ['limit?'] },
                    { command: 'timeline', description: 'Get context around observation (Layer 2: context)', args: ['anchor (id)', 'depth?'] },
                    { command: 'cite', description: 'Get full details by IDs (Layer 3: details)', args: ['ids (comma-separated)'] },
                    { command: 'get', description: 'Alias for cite - get full details', args: ['ids (comma-separated)'] },
                  ],
                });

              case 'search':
                if (!args.query) {
                  return JSON.stringify({ success: false, error: 'query required' });
                }
                const searchResults = await search(args.query, { project, limit: args.limit || 10 });
                return JSON.stringify({
                  success: true,
                  layer: 1,
                  query: args.query,
                  count: searchResults.length,
                  results: searchResults.map(r => ({
                    id: r.id,
                    type: r.type,
                    title: r.title,
                    createdAt: r.createdAt,
                  })),
                  tip: 'Use timeline(anchor=ID) for context, then cite(ids) for full details',
                });

              case 'list':
                const allResults = await search('', { project, limit: args.limit || 20 });
                return JSON.stringify({
                  success: true,
                  layer: 1,
                  count: allResults.length,
                  results: allResults,
                  tip: 'Use timeline(anchor=ID) for context, then cite(ids) for full details',
                });

              case 'timeline':
                if (!args.anchor) {
                  return JSON.stringify({ success: false, error: 'anchor (observation ID) required' });
                }
                const depth = args.depth || 3;
                const timelineResults = await timeline(args.anchor, {
                  depthBefore: depth,
                  depthAfter: depth,
                  project,
                });
                return JSON.stringify({
                  success: true,
                  layer: 2,
                  anchor: args.anchor,
                  depthBefore: depth,
                  depthAfter: depth,
                  count: timelineResults.length,
                  results: timelineResults.map((r: any) => ({
                    id: r.id,
                    type: r.type,
                    title: r.title,
                    createdAt: r.created_at,
                    isAnchor: r.id === args.anchor,
                  })),
                  tip: 'Use cite(ids) for full details of relevant observations',
                });

              case 'cite':
              case 'get':
                if (!args.query) {
                  return JSON.stringify({ success: false, error: 'ids required (comma-separated)' });
                }
                const ids = args.query.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
                if (ids.length === 0) {
                  return JSON.stringify({ success: false, error: 'invalid ids' });
                }
                const citations = await getObservations(ids, { project });
                return JSON.stringify({
                  success: true,
                  layer: 3,
                  count: citations.length,
                  citations: citations.map((c: any) => ({
                    id: c.id,
                    type: c.type,
                    title: c.title,
                    narrative: c.narrative,
                    facts: c.facts ? JSON.parse(c.facts) : [],
                    concepts: c.concepts ? JSON.parse(c.concepts) : [],
                    filesRead: c.files_read ? JSON.parse(c.files_read) : [],
                    filesModified: c.files_modified ? JSON.parse(c.files_modified) : [],
                    createdAt: c.created_at,
                  })),
                });

              default:
                return JSON.stringify({ success: false, error: `Unknown mode: ${mode}` });
            }
          } catch (error) {
            return JSON.stringify({ success: false, error: String(error) });
          }
        },
      }),
    },
  };
};
