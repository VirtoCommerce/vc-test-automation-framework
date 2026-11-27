import type { Credentials } from "@virtocommerce/test-automation-framework/auth";

import { env } from "../env.ts";

/** The administrator of the platform, from `ADMIN_USERNAME` and `ADMIN_PASSWORD`. */
export const ADMINISTRATOR: Credentials = { username: env.ADMIN_USERNAME, password: env.ADMIN_PASSWORD };
