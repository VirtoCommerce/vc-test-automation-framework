const REDACTED = "[REDACTED]";
const SECRET_KEY = String.raw`[\w-]*(?:password|passwd|secret|token|api[_-]?key|authorization|cookie)[\w-]*`;

const SECRET_PATTERNS: readonly (readonly [RegExp, string])[] = [
  [new RegExp(String.raw`("${SECRET_KEY}"\s*:\s*)"(?:[^"\\]|\\.)*"`, "gi"), `$1"${REDACTED}"`],
  [new RegExp(String.raw`([?&]${SECRET_KEY}=)[^&#\s]*`, "gi"), `$1${REDACTED}`],
  [new RegExp(String.raw`(^|[\s-])(${SECRET_KEY}:\s*)[^\r\n]*`, "gim"), `$1$2${REDACTED}`],
  [/\b(Bearer|Basic)\s+[\w\-.~+/]+=*/g, `$1 ${REDACTED}`],
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce((redacted, [pattern, replacement]) => redacted.replace(pattern, replacement), text);
}
