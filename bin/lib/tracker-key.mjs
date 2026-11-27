const PROJECT_KEY_WORD = /(?<!\\)[A-Z][A-Z0-9_]+/g;
const PROJECT_KEY_SUFFIXES = ["", "1", "12"];
const SAMPLE_NUMBERS = ["1", "12", "123", "1234", "12345", "123456", "1234567"];
const WORK_ITEM_PREFIXES = ["", "AB#", "#"];
const LOST_ESCAPE = /(?<![\\A-Za-z0-9])[dws][+*{]/;
const KIND_SEPARATOR = /[,;/+&|]|\s(?:and|or)\s/i;
const AZURE_BOARDS = /^azure[\s_-]*(boards|devops)\b/i;
const JIRA = /^jira\b/i;
const SEVERAL_TRACKERS = "one tracker only for now (enter the main one)";
const KEY_EXAMPLE = {
  jira: "must match a jira key such as ABC-123: the project key, a dash and the number, as in ^ABC-\\d+$",
  "azure-boards": "must match an azure-boards work item id such as 1234, as in ^\\d+$",
};

function sampleKeys(kind, keyPattern) {
  if (kind === "jira") {
    const projects = [...new Set(["PROJ", ...(keyPattern.match(PROJECT_KEY_WORD) ?? [])])];
    return projects.flatMap((project) =>
      PROJECT_KEY_SUFFIXES.flatMap((suffix) => SAMPLE_NUMBERS.map((number) => `${project}${suffix}-${number}`)),
    );
  }
  if (kind === "azure-boards") {
    return WORK_ITEM_PREFIXES.flatMap((prefix) => SAMPLE_NUMBERS.map((number) => `${prefix}${number}`));
  }
  return undefined;
}

export function trackerKind(value) {
  const text = value.trim();
  if (AZURE_BOARDS.test(text)) {
    return "azure-boards";
  }
  return JIRA.test(text) ? "jira" : text;
}

export function trackerKindProblem(value) {
  const text = value.trim();
  if (text === "") {
    return "must not be blank";
  }
  return KIND_SEPARATOR.test(text) ? SEVERAL_TRACKERS : undefined;
}

export function keyPatternProblem(kind, keyPattern) {
  let pattern;
  try {
    pattern = new RegExp(keyPattern);
  } catch {
    return "must be a valid regular expression";
  }
  const lostEscape = LOST_ESCAPE.exec(keyPattern)?.[0];
  if (lostEscape !== undefined) {
    return `has "${lostEscape}" with no backslash before it: write "\\${lostEscape}"`;
  }
  const keys = kind === undefined ? undefined : sampleKeys(trackerKind(kind), keyPattern);
  if (keys !== undefined && !keys.some((key) => pattern.test(key))) {
    return KEY_EXAMPLE[trackerKind(kind)];
  }
  return undefined;
}
