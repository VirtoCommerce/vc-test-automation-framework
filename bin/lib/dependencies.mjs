const OVERRIDE_NAMES = ["glob", "minimatch"];

export function exactVersion(range) {
  return range.replace(/^[\^~]/, "");
}

export function dependencySpecs(own, names) {
  const versions = { ...own.devDependencies, ...own.peerDependencies };
  return names.map((name) => `${name}@${JSON.stringify(exactVersion(versions[name] ?? "latest"))}`);
}

export function suiteOverrides(own) {
  const overrides = own.overrides ?? {};
  return Object.fromEntries(OVERRIDE_NAMES.filter((name) => name in overrides).map((name) => [name, overrides[name]]));
}

export function withOverrides(manifest, overrides) {
  return { ...manifest, overrides: { ...overrides, ...manifest.overrides } };
}
