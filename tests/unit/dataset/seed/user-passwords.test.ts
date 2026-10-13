import type { Credentials } from "@api/auth/credentials";
import type { SecurityResult } from "@api/rest/types/security";
import type { UserPasswordApi } from "@dataset/seed/user-passwords";

import { Writable } from "node:stream";

import { expect, test } from "@playwright/test";

import { Logger } from "@core/logger";
import { Secret } from "@core/secret";
import { applyUserPasswords } from "@dataset/seed/user-passwords";

const SILENT = new Logger("seed", new Writable({ write: (_chunk, _encoding, callback) => callback() }));
const PASSWORD = new Secret("Dataset-Password-1!");
const USERS: readonly Credentials[] = [
  { username: "signs-in@example.com", password: PASSWORD },
  { username: "stale@example.com", password: PASSWORD },
];

/** A platform where only the given users sign in, recording every reset. */
function fakePlatform(
  signingIn: readonly string[],
  result: SecurityResult = { succeeded: true },
): UserPasswordApi & { readonly resets: string[] } {
  const resets: string[] = [];
  return {
    resets,
    canSignIn: async ({ username }) => signingIn.includes(username),
    resetPassword: async (userName) => {
      resets.push(userName);
      return result;
    },
  };
}

test.describe("applyUserPasswords", () => {
  test("resets only the users who cannot sign in with the dataset password", async () => {
    const platform = fakePlatform(["signs-in@example.com"]);

    await applyUserPasswords(platform, USERS, SILENT);

    expect(platform.resets).toEqual(["stale@example.com"]);
  });

  test("fails with the platform's errors when a reset is refused", async () => {
    const platform = fakePlatform([], { succeeded: false, errors: ["Passwords must have at least one digit"] });

    await expect(applyUserPasswords(platform, USERS, SILENT)).rejects.toThrow(
      'Resetting the password of signs-in@example.com failed: ["Passwords must have at least one digit"]',
    );
  });
});
