const OVERRIDE_NAMES = ["glob", "minimatch"];

export function exactVersion(range) {
  return /^[\^~]\d+\.\d+\.\d+$/.test(range) ? range.slice(1) : range;
}

export function dependencySpecs(own, names) {
  const versions = { ...own.peerDependencies, ...own.devDependencies };
  return names.map((name) => `${name}@${JSON.stringify(exactVersion(versions[name] ?? "latest"))}`);
}

export function suiteOverrides(own) {
  const overrides = own.overrides ?? {};
  return Object.fromEntries(OVERRIDE_NAMES.filter((name) => name in overrides).map((name) => [name, overrides[name]]));
}

export function withOverrides(manifest, overrides) {
  if (Object.keys(overrides).length === 0) {
    return manifest;
  }
  return { ...manifest, overrides: { ...overrides, ...manifest.overrides } };
}
