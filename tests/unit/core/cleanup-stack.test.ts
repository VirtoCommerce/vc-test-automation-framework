import { expect, test } from "@playwright/test";

import { CleanupStack } from "@core/cleanup-stack";
import { MASK, Secret } from "@core/secret";

test.describe("CleanupStack", () => {
  test("runs the actions last registered first", async () => {
    const stack = new CleanupStack();
    const order: string[] = [];
    stack.push("delete organization", async () => order.push("organization"));
    stack.push("delete contact", async () => order.push("contact"));
    stack.push("delete user", async () => order.push("user"));

    await stack.unwind();

    expect(order).toEqual(["user", "contact", "organization"]);
  });

  test("passes each description and action to the runner", async () => {
    const stack = new CleanupStack();
    const ran: string[] = [];
    stack.push("delete cart", async () => undefined);

    await stack.unwind(async (description, action) => {
      ran.push(description);
      await action();
    });

    expect(ran).toEqual(["delete cart"]);
  });

  test("runs every action even when one fails, then reports each failure", async () => {
    const stack = new CleanupStack();
    const ran: string[] = [];
    stack.push("first", async () => ran.push("first"));
    stack.push("broken", async () => {
      throw new Error("platform answered 500");
    });
    stack.push("last", async () => ran.push("last"));

    await expect(stack.unwind()).rejects.toThrow("1 cleanup action(s) failed:\nbroken: platform answered 500");
    expect(ran).toEqual(["last", "first"]);
  });

  test("masks secrets in the failures", async () => {
    const stack = new CleanupStack();
    const password = new Secret("cleanup-password-1");
    stack.push("sign out", async () => {
      throw new Error(`refused ${password.reveal()}`);
    });

    await expect(stack.unwind()).rejects.toThrow(`sign out: refused ${MASK}`);
  });

  test("track runs the change and returns its result, then the undo on unwind", async () => {
    const stack = new CleanupStack();
    const order: string[] = [];

    const created = await stack.track(
      "delete catalog",
      async () => order.push("undo"),
      async () => {
        order.push("change");
        return "catalog-1";
      },
    );
    await stack.unwind();

    expect(created).toBe("catalog-1");
    expect(order).toEqual(["change", "undo"]);
  });

  test("track keeps the undo when the change fails", async () => {
    const stack = new CleanupStack();
    const ran: string[] = [];

    await expect(
      stack.track(
        "delete catalog",
        async () => ran.push("undo"),
        async () => {
          throw new Error("platform answered 500");
        },
      ),
    ).rejects.toThrow("platform answered 500");
    await stack.unwind();

    expect(ran).toEqual(["undo"]);
  });

  test("is empty after unwinding", async () => {
    const stack = new CleanupStack();
    let runs = 0;
    stack.push("count", async () => {
      runs += 1;
    });

    await stack.unwind();
    await stack.unwind();

    expect(runs).toBe(1);
  });
});
