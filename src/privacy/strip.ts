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
  /AKIA[0-9A-Z]{16}/gi,
  /aws[_-]?secret[_-]?access[_-]?key["\s:=]+["']?[^\s"']+/gi,
  /AIza[0-9A-Za-z_-]{20,}/gi,
  /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH|PGP)?\s*PRIVATE\s+KEY(?:-)?-----[\s\S]+?-----END\s+(?:RSA|DSA|EC|OPENSSH|PGP)?\s+PRIVATE\s+KEY(?:-)?-----/gi,
  /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/gi,
  /(?:^|[\s?&])secret["\s:=]+["']?[^\s"']+/gi,
  /(?:^|[\s?&])access[_-]?token["\s:=]+["']?[^\s"']+/gi,
  /(?:^|[\s?&])auth[_-]?token["\s:=]+["']?[^\s"']+/gi,
  /github[_-]?token["\s:=]+["']?[\w-]+/gi,
  /sk_live_[0-9a-zA-Z]{24,}/gi,
  /sk_test_[0-9a-zA-Z]{24,}/gi,
  /pk_live_[0-9a-zA-Z]{24,}/gi,
  /pk_test_[0-9a-zA-Z]{24,}/gi,
  /sq0[a-z]{3}-[0-9A-Za-z_-]{22,}/gi,
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
