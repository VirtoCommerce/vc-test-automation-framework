export const VALUE_FLAGS = [
  "--backend-url",
  "--frontend-url",
  "--store-id",
  "--admin-login",
  "--customer",
  "--other-customer",
  "--tracker",
  "--key-pattern",
  "--test-id-attribute",
];

export const SWITCHES = {
  install: ["--force-ours"],
  init: ["--skip-install", "--force-ours", "--yes", "--save-passwords", "--skip-verify"],
  uninstall: [],
  doctor: [],
};

const COMMANDS = ["init", "uninstall", "doctor"];

export function parseArguments(args, usage) {
  const [first, ...rest] = args;
  const command = COMMANDS.includes(first) ? first : "install";
  const tokens = command === "install" ? args : rest;
  const positional = [];
  const switches = new Set();
  const values = {};
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (!token.startsWith("--")) {
      positional.push(token);
      continue;
    }
    const equals = token.indexOf("=");
    const name = equals === -1 ? token : token.slice(0, equals);
    if (VALUE_FLAGS.includes(name) && command === "init") {
      const value = equals === -1 ? tokens[index + 1] : token.slice(equals + 1);
      if (equals === -1) {
        index += 1;
      }
      if (value === undefined || value === "" || (equals === -1 && value.startsWith("--"))) {
        throw new Error(usage);
      }
      values[name] = value;
    } else if (equals === -1 && SWITCHES[command].includes(token)) {
      switches.add(token);
    } else {
      throw new Error(usage);
    }
  }
  if (positional.length > (command === "init" ? 1 : 0)) {
    throw new Error(usage);
  }
  return { command, positional, switches, values };
}
