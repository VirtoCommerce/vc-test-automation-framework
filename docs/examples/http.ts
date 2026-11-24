import type { HttpClient } from "@virtocommerce/test-automation-framework/http";

import { expect } from "@playwright/test";
import { object, string } from "zod";

const storeSchema = object({ id: string(), name: string() });

export async function readStore(client: HttpClient, id: string) {
  const response = await client.get(`/api/stores/${encodeURIComponent(id)}`);
  return response.parse(storeSchema);
}

export async function rejectionOf(client: HttpClient, path: string, body: unknown) {
  const response = await client.post(path, { json: body });

  expect(response.ok).toBe(false);
  return response.errorJson();
}
