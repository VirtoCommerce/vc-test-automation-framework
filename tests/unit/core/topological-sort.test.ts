import { expect, test } from "@playwright/test";

import { topologicalSort } from "@core/topological-sort";

interface Node {
  readonly id: string;
  readonly parent?: string | null;
}

function sort(nodes: readonly Node[]): string[] {
  return topologicalSort(
    nodes,
    (node) => node.id,
    (node) => node.parent,
  ).map((node) => node.id);
}

test.describe("topologicalSort", () => {
  test("keeps the input order when no item has a parent", () => {
    expect(sort([{ id: "b" }, { id: "a" }, { id: "c" }])).toEqual(["b", "a", "c"]);
  });

  test("puts parents before their children", () => {
    expect(sort([{ id: "child", parent: "parent" }, { id: "parent" }])).toEqual(["parent", "child"]);
  });

  test("orders a chain of several generations", () => {
    expect(sort([{ id: "c", parent: "b" }, { id: "b", parent: "a" }, { id: "a" }])).toEqual(["a", "b", "c"]);
  });

  test("keeps the input order among items that are ready together", () => {
    expect(sort([{ id: "x", parent: "root" }, { id: "root" }, { id: "other" }, { id: "y", parent: "root" }])).toEqual([
      "root",
      "other",
      "x",
      "y",
    ]);
  });

  test("treats a parent outside the items as no parent", () => {
    expect(sort([{ id: "child", parent: "elsewhere" }, { id: "other" }])).toEqual(["child", "other"]);
  });

  test("treats a null parent as no parent", () => {
    expect(sort([{ id: "a", parent: null }])).toEqual(["a"]);
  });

  test("returns a new array and leaves the input as it is", () => {
    const nodes: readonly Node[] = [{ id: "child", parent: "parent" }, { id: "parent" }];

    const sorted = topologicalSort(
      nodes,
      (node) => node.id,
      (node) => node.parent,
    );

    expect(sorted).not.toBe(nodes);
    expect(nodes.map((node) => node.id)).toEqual(["child", "parent"]);
  });

  test("throws for a cycle, naming the items in it", () => {
    expect(() => sort([{ id: "free" }, { id: "a", parent: "b" }, { id: "b", parent: "a" }])).toThrow(
      "Circular references between: a, b",
    );
  });

  test("throws for an item that is its own parent", () => {
    expect(() => sort([{ id: "a", parent: "a" }])).toThrow("Circular references between: a");
  });
});
