import type { CompressedObservation, ObservationType } from '../taxonomy/types.js';
import { stripSensitiveData } from '../privacy/strip.js';
import { generateEmbedding, storeEmbedding, isVectorStoreAvailable } from '../storage/vectors.js';

const COMPRESSION_PROMPT = `You are compressing a tool execution into a structured memory.

Tool: {toolName}
Input: {input}
Output: {output}

Analyze this tool execution and return a JSON object with:
{
  "type": "decision|bugfix|feature|refactor|discovery|feedback|reference",
  "title": "Concise title (max 80 chars)",
  "narrative": "1-2 sentence explanation of what happened",
  "facts": ["Key fact 1", "Key fact 2"],
  "concepts": ["Concept learned"],
  "filesRead": ["file1.ts"],
  "filesModified": ["file2.ts"],
  "importance": 0.0-1.0
}

Rules:
- title must be max 80 characters
- facts should be specific, not generic
- Only include files that were actually read/modified
- type must match the taxonomy above
- If nothing worth remembering, return null
- importance: 0.0 = trivial/greeting, 0.5 = normal, 1.0 = critical insight`;

const VALID_TYPES: ObservationType[] = [
  'decision', 'bugfix', 'feature', 'refactor', 'discovery', 'feedback', 'reference'
];

interface CompressionResult {
  type: ObservationType;
  title: string;
  narrative?: string;
  facts: string[];
  concepts: string[];
  filesRead: string[];
  filesModified: string[];
  importance?: number;
}

const MIN_IMPORTANCE_THRESHOLD = 0.3;

const NOISE_PATTERNS = [
  /^hi$/i, /^hello$/i, /^hey$/i, /^yo$/i,
  /^thanks?$/i, /^thank you$/i,
  /^ok(?:ay)?$/i, /^sure$/i, /^yes$/i, /^no$/i,
  /^good$/i, /^great$/i, /^nice$/i,
  /^(?:good )?morning$/i, /^(?:good )?afternoon$/i, /^(?:good )?evening$/i,
  /^how are you$/i, /^how's it going$/i,
  /^let's go$/i, /^done$/i, /^finished$/i,
];

export { COMPRESSION_PROMPT };

export async function compressObservation(
  tool: string,
  input: unknown,
  output: unknown,
  sessionId: string,
  project: string,
  client: unknown
): Promise<CompressedObservation | null> {
  try {
    const prompt = COMPRESSION_PROMPT
      .replace('{toolName}', tool)
      .replace('{input}', truncate(JSON.stringify(input, null, 2), 2000))
      .replace('{output}', truncate(JSON.stringify(output, null, 2), 3000));

    const sdkClient = client as { session?: { prompt: (options: unknown) => Promise<{ data?: { info?: unknown; text?: string } }> } };
    
    if (!sdkClient?.session?.prompt) {
      console.error('[open-mem] client.session.prompt not available');
      return null;
    }

    const result = await sdkClient.session.prompt({
      body: {
        parts: [{ type: 'text', text: prompt }],
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              type: { type: 'string', enum: VALID_TYPES },
              title: { type: 'string', maxLength: 80 },
              narrative: { type: 'string' },
              facts: { type: 'array', items: { type: 'string' } },
              concepts: { type: 'array', items: { type: 'string' } },
              filesRead: { type: 'array', items: { type: 'string' } },
              filesModified: { type: 'array', items: { type: 'string' } },
              importance: { type: 'number', minimum: 0, maximum: 1 }
            },
            required: ['type', 'title']
          }
        }
      }
    });

    const data = (result as any)?.data?.info?.structured_output;
    
    if (!data || data.type === null) {
      return null;
    }

    const sanitized = sanitizeCompressionResult(data, input, output);

    const importance = data.importance ?? calculateImportance(sanitized);

    if (importance < MIN_IMPORTANCE_THRESHOLD) {
      console.log(`[open-mem] Noise filtered: "${sanitized.title}" (importance: ${importance.toFixed(2)})`);
      return null;
    }
    
    const compressed = {
      ...sanitized,
      sessionId,
      project,
      promptNumber: 0,
      createdAt: new Date().toISOString(),
      createdAtEpoch: Date.now(),
      qualityScore: importance,
    };

    if (isVectorStoreAvailable()) {
      const textToEmbed = [
        compressed.title,
        compressed.narrative || '',
        ...compressed.facts,
      ].join(' ');
      try {
        const embedding = await generateEmbedding(textToEmbed);
        await storeEmbedding(0, embedding);
      } catch (e) {
        console.warn('[open-mem] Failed to store embedding:', e);
      }
    }

    return compressed;
  } catch (error) {
    console.error('[open-mem] Compression error:', error);
    return null;
  }
}

function sanitizeCompressionResult(
  data: CompressionResult,
  input: unknown,
  output: unknown
): Omit<CompressedObservation, 'sessionId' | 'project' | 'promptNumber' | 'createdAt' | 'createdAtEpoch'> {
  const type = VALID_TYPES.includes(data.type as ObservationType) 
    ? data.type as ObservationType 
    : 'discovery';

  const title = stripSensitiveData(data.title || 'Untitled').slice(0, 80);
  const narrative = data.narrative ? stripSensitiveData(data.narrative) : undefined;
  const facts = (data.facts || []).map(f => stripSensitiveData(f)).filter(Boolean);
  const concepts = (data.concepts || []).map(f => stripSensitiveData(f)).filter(Boolean);
  
  let filesRead = data.filesRead || [];
  let filesModified = data.filesModified || [];
  
  if (filesRead.length === 0 && output && typeof output === 'object') {
    const extracted = extractFilesFromOutput(output);
    filesRead = extracted.filesRead;
    filesModified = extracted.filesModified;
  }

  return {
    type,
    title,
    narrative,
    facts,
    concepts,
    filesRead,
    filesModified,
  };
}

function calculateImportance(obs: { title: string; narrative?: string; facts?: string[]; filesRead?: string[]; filesModified?: string[]; type: ObservationType }): number {
  let score = 0.3;

  if (obs.narrative && obs.narrative.length > 50) score += 0.15;
  if (obs.narrative && obs.narrative.length > 150) score += 0.1;

  if (obs.facts && obs.facts.length >= 2) score += 0.15;
  if (obs.facts && obs.facts.length >= 4) score += 0.1;

  if (obs.type === 'decision') score += 0.15;
  if (obs.type === 'bugfix') score += 0.1;
  if (obs.type === 'discovery') score += 0.1;

  if (obs.filesModified && obs.filesModified.length > 0) score += 0.1;
  if (obs.filesRead && obs.filesRead.length > 3) score += 0.05;

  const titleLower = obs.title?.toLowerCase() || '';
  for (const pattern of NOISE_PATTERNS) {
    if (pattern.test(titleLower)) {
      score = Math.max(0.1, score - 0.3);
      break;
    }
  }

  return Math.min(1, Math.max(0, score));
}

function extractFilesFromOutput(output: unknown): { filesRead: string[]; filesModified: string[] } {
  const filesRead: string[] = [];
  const filesModified: string[] = [];
  
  if (typeof output !== 'object' || output === null) {
    return { filesRead, filesModified };
  }

  const str = JSON.stringify(output);
  const filePattern = /\b[\w\-./\\]+\.(ts|tsx|js|jsx|json|md|html|css|py|go|rs|java|cpp|h)\b/gi;
  
  let match;
  while ((match = filePattern.exec(str)) !== null) {
    const file = match[0];
    if (file.includes('node_modules') || file.includes('.git')) continue;
    if (!filesRead.includes(file)) filesRead.push(file);
  }
  
  return { filesRead, filesModified };
}

function truncate(str: string, maxLen: number): string {
  return str.length > maxLen ? str.slice(0, maxLen) + '...' : str;
}

export function sanitizeObservation(obs: CompressedObservation): CompressedObservation {
  return {
    ...obs,
    narrative: obs.narrative ? stripSensitiveData(obs.narrative) : undefined,
    facts: obs.facts.map(f => stripSensitiveData(f)),
  };
}
