import { HydraDbClient } from "../src/hydradb/client";
import { loadHydraConfig } from "../src/hydradb/config";

const client = new HydraDbClient(loadHydraConfig());
const deadline = Date.now() + 90_000;

while (Date.now() < deadline) {
  if (await client.readiness()) {
    console.log("HydraDB admin readiness check passed. Run pnpm hydra:smoke to prove query execution.");
    process.exit(0);
  }
  await new Promise((resolve) => setTimeout(resolve, 1_000));
}

console.error("HydraDB did not become ready within 90 seconds. Inspect: docker compose logs hydradb");
process.exit(1);

