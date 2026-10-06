const REGEXP_SPECIAL_CHARACTERS = /[.*+?^${}()|[\]\\]/g;

export function exactText(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(value)}\\s*$`);
}

export function startsWithText(value: string): RegExp {
  return new RegExp(`^\\s*${escapeRegExp(value)}(?![\\p{L}\\p{N}])`, "u");
}

function escapeRegExp(value: string): string {
  return value.replace(REGEXP_SPECIAL_CHARACTERS, "\\$&");
}
