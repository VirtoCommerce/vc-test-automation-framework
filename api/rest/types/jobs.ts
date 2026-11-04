import type { Shaped } from "@core/record-shape";
import type * as Rest from "../generated/rest-api";

import { shape } from "@core/record-shape";

export type JobData = Rest.VirtoCommercePlatformCoreJobsJob;

export const JOB = shape<JobData>()("Job", ["id", "state", "completed"]);
export type Job = Shaped<typeof JOB>;
