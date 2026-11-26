const MASK = "***";
const BEFORE = "(?<![A-Za-z0-9_-])";
const AFTER = "(?![A-Za-z0-9_-])";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function maskSecrets(text, secrets) {
  let result = text;
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret === "") {
      continue;
    }
    result = result.replace(new RegExp(`${BEFORE}${escapeRegExp(secret)}${AFTER}`, "g"), MASK);
  }
  return result;
}
