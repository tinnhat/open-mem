import type { CompressedObservation } from '../taxonomy/types.ts';

const SENSITIVE_PATTERNS: RegExp[] = [
  /<private>[\s\S]*?<\/private>/gi,
  /api[_-]?key["\s:=]+["']?[\w-]+/gi,
  /apikey["\s:=]+["']?[\w-]+/gi,
  /password["\s:=]+["']?[^\s"']+/gi,
  /passwd["\s:=]+["']?[^\s"']+/gi,
  /token["\s:=]+["']?[\w-]+/gi,
  /bearer["\s:=]+["']?[\w-]+/gi,
  /sk-[\w]{20,}/gi,
  /ghp_[\w]{36,}/gi,
  /xox[baprs]-[a-zA-Z0-9]{10,}/gi,
  /ENV\w*\["[^"]+"\]\s*=\s*["'][^"']+["']/gi,
];

const REDACTED = '[REDACTED]';

export function stripSensitiveData(input: string): string {
  let result = input;
  for (const pattern of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, REDACTED);
  }
  return result;
}

export function sanitizeObservation(obs: CompressedObservation): CompressedObservation {
  return {
    ...obs,
    narrative: obs.narrative ? stripSensitiveData(obs.narrative) : undefined,
    facts: obs.facts.map(f => stripSensitiveData(f)),
  };
}
