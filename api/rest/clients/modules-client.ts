import type { InstalledModules } from "@core/modules";
import type { HttpClient } from "../../http/http-client";
import type { ModuleDescriptorData } from "../types/modules";

import { requireFields } from "@core/required-fields";

import { MODULE_DESCRIPTOR } from "../types/modules";

const MODULES_PATH = "/api/platform/modules";

export class ModulesClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  /** Lists the installed modules with their versions. */
  async getInstalled(): Promise<InstalledModules> {
    const modules = (await this.#httpClient.get(MODULES_PATH)).json<ModuleDescriptorData[]>();
    return new Map(
      modules
        .filter((module) => module.isInstalled)
        .map((module) => requireFields(module, MODULE_DESCRIPTOR.fields, "Installed module"))
        .map(({ id, version }) => [id, version]),
    );
  }

  async reload(): Promise<void> {
    (await this.#httpClient.post(`${MODULES_PATH}/reload`)).expectOk();
  }

  async restart(): Promise<void> {
    (await this.#httpClient.post(`${MODULES_PATH}/restart`)).expectOk();
  }
}
