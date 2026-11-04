import type { HttpClient } from "../../http/http-client";
import type { Job } from "../types/jobs";

import { JOB } from "../types/jobs";

const JOBS_PATH = "/api/platform/jobs";

export class JobsClient {
  readonly #httpClient: HttpClient;

  constructor(httpClient: HttpClient) {
    this.#httpClient = httpClient;
  }

  async get(id: string): Promise<Job> {
    const response = await this.#httpClient.get(`${JOBS_PATH}/${encodeURIComponent(id)}`);
    return response.record(JOB);
  }
}
