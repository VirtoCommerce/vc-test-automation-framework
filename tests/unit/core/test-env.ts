import type { Env } from "@/core";

import { envSchema } from "@/core";

export function testEnv(overrides: Readonly<Record<string, string>> = {}): Env {
  return envSchema.parse({
    BACKEND_BASE_URL: "https://platform.example.com",
    ADMIN_USERNAME: "admin",
    ADMIN_PASSWORD: "config-admin-password-12345",
    ...overrides,
  });
}
