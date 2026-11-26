const MASK = "***";
const DELIMITER = "[\\s\"'`=:]";

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function maskSecrets(text, secrets) {
  let result = text;
  for (const secret of secrets) {
    if (typeof secret !== "string" || secret === "") {
      continue;
    }
    const token = new RegExp(`(?<=^|${DELIMITER})${escapeRegExp(secret)}(?=$|${DELIMITER})`, "gm");
    result = result.replace(token, MASK);
  }
  return result;
}
