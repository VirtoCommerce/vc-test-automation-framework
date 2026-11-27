import { fileURLToPath } from "node:url";

import { generateApi } from "swagger-typescript-api";

import { env } from "../env.ts";

await generateApi({
  url: new URL("/docs/PlatformUI/swagger.json", env.BACKEND_BASE_URL).href,
  output: fileURLToPath(new URL("../rest/generated", import.meta.url)),
  fileName: "platform.ts",
  generateClient: false,
  enumStyle: "union",
  addReadonly: true,
  sortTypes: true,
  silent: true,
});
