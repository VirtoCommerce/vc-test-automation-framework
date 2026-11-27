import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";

export type StandAnswer = { status: number; text: string };

type Vars = Readonly<Record<string, string | undefined>>;

const TIMEOUT_MS = 30_000;
const MAX_BYTES = 64 * 1024 * 1024;

/** Whether the run's variables leave the TLS certificate check on: everything but `VERIFY_SSL=false`, as the suite reads it. */
export function verifiesSsl(vars: Vars): boolean {
  return vars["VERIFY_SSL"] !== "false";
}

/**
 * Sends one anonymous request to the stand's backend and returns its status and body. It sends no credential, cookie
 * or authorization header, reads no password and follows no redirect, so it reaches only what an anonymous visitor can.
 * `path` must start with one `/`, so the request cannot leave `origin`.
 *
 * @param origin the origin of the backend (`standOrigins`).
 * @param path the path and query, such as `/graphql`.
 * @param options the method, the JSON body of a POST and whether to verify the TLS certificate.
 * @throws Error when the path is not a path on the origin, the request fails or times out, or the answer is too large.
 */
export function anonymousRequest(
  origin: string,
  path: string,
  options: { method: "GET" | "POST"; body?: string; verifySsl: boolean },
): Promise<StandAnswer> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new Error("stand request: the path must start with one /");
  }
  const url = new URL(path, origin);
  if (url.origin !== origin) {
    throw new Error("stand request: the path leaves the stand's backend");
  }
  const send = url.protocol === "https:" ? httpsRequest : httpRequest;
  const body = options.body === undefined ? undefined : Buffer.from(options.body, "utf8");
  return new Promise((done, fail) => {
    const call = send(
      url,
      {
        method: options.method,
        timeout: TIMEOUT_MS,
        rejectUnauthorized: options.verifySsl,
        headers: {
          accept: "application/json",
          ...(body === undefined ? {} : { "content-type": "application/json", "content-length": body.length }),
        },
      },
      (answer) => {
        const chunks: Buffer[] = [];
        let size = 0;
        answer.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > MAX_BYTES) {
            call.destroy(new Error("the answer is larger than 64 MB"));
          } else {
            chunks.push(chunk);
          }
        });
        answer.on("end", () => {
          done({ status: answer.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") });
        });
      },
    );
    call.on("timeout", () => {
      call.destroy(new Error("no answer within 30 seconds"));
    });
    call.on("error", (error) => {
      fail(new Error(`stand request: ${error.message}`));
    });
    call.end(body);
  });
}
