/**
 * Returns a new array with every item after its parent; otherwise keeps the input order (deterministic).
 * An item whose parent is `undefined`, `null` or not among the items is treated as a root.
 *
 * @example
 * topologicalSort(categories, (category) => category.id, (category) => category.parentId);
 *
 * @throws Error listing the ids of the items whose parents form a cycle.
 */
export function topologicalSort<T>(
  items: readonly T[],
  idOf: (item: T) => unknown,
  parentOf: (item: T) => unknown,
): T[] {
  const ids = new Set(items.map(idOf));
  const placed = new Set<unknown>();
  const ordered: T[] = [];
  let pending = [...items];

  while (pending.length > 0) {
    const ready = pending.filter((item) => {
      const parent = parentOf(item);
      return parent === undefined || parent === null || !ids.has(parent) || placed.has(parent);
    });
    if (ready.length === 0) {
      throw new Error(`Circular references between: ${pending.map((item) => String(idOf(item))).join(", ")}`);
    }
    for (const item of ready) {
      ordered.push(item);
      placed.add(idOf(item));
    }
    pending = pending.filter((item) => !ready.includes(item));
  }
  return ordered;
}
