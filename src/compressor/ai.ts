import type { CompressedObservation, ObservationType } from '../taxonomy/types.js';
import { stripSensitiveData } from '../privacy/strip.js';

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
  "filesModified": ["file2.ts"]
}

Rules:
- title must be max 80 characters
- facts should be specific, not generic
- Only include files that were actually read/modified
- type must match the taxonomy above
- If nothing worth remembering, return null`;

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
}

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
              filesModified: { type: 'array', items: { type: 'string' } }
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
    
    return {
      ...sanitized,
      sessionId,
      project,
      promptNumber: 0,
      createdAt: new Date().toISOString(),
      createdAtEpoch: Date.now(),
    };
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
