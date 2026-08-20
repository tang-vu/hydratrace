import { readFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";

const schema = z.object({
  httpUrl: z.string().url(),
  adminUrl: z.string().url(),
  namespace: z.string().min(1).regex(/^[a-zA-Z0-9._-]+$/),
  graphId: z.string().min(1).regex(/^[a-zA-Z0-9._-]+$/),
  cellId: z.string().min(1).regex(/^[a-zA-Z0-9._-]+$/),
  token: z.string().min(32),
  timeoutMs: z.number().int().positive().max(120_000),
});

export type HydraConfig = z.infer<typeof schema>;

export function loadHydraConfig(environment: NodeJS.ProcessEnv = process.env): HydraConfig {
  const tokenFile = path.resolve(/* turbopackIgnore: true */
    environment.HYDRADB_TOKEN_FILE ?? path.join(".hydratrace", "secrets", "hydradb-token"),
  );
  let token: string;
  try {
    token = readFileSync(/* turbopackIgnore: true */ tokenFile, "utf8").trim();
  } catch (error) {
    throw new Error(
      `HydraDB token file is unavailable at ${tokenFile}. Run \"pnpm hydra:prepare\" first.`,
      { cause: error },
    );
  }

  return schema.parse({
    httpUrl: environment.HYDRADB_HTTP_URL ?? "http://127.0.0.1:8443",
    adminUrl: environment.HYDRADB_ADMIN_URL ?? "http://127.0.0.1:9090",
    namespace: environment.HYDRADB_NAMESPACE ?? "hydratrace",
    graphId: environment.HYDRADB_GRAPH_ID ?? "hydratrace",
    cellId: environment.HYDRADB_CELL_ID ?? "cell-0",
    token,
    timeoutMs: Number(environment.HYDRADB_TIMEOUT_MS ?? 15_000),
  });
}

export function publicHydraConfig(config: HydraConfig) {
  return {
    httpUrl: config.httpUrl,
    adminUrl: config.adminUrl,
    namespace: config.namespace,
    graphId: config.graphId,
    cellId: config.cellId,
    timeoutMs: config.timeoutMs,
  };
}
