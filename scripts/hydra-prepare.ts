import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const secretDirectory = path.resolve(".hydratrace", "secrets");
const tokenPath = path.join(secretDirectory, "hydradb-token");

await mkdir(secretDirectory, { recursive: true });

try {
  const existing = (await readFile(tokenPath, "utf8")).trim();
  if (existing.length < 32) throw new Error("existing token is shorter than 32 characters");
  console.log(`HydraDB token already exists at ${path.relative(process.cwd(), tokenPath)}.`);
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
    throw error;
  }
  const token = `hydratrace-local-${randomBytes(24).toString("hex")}`;
  await writeFile(tokenPath, `${token}\n`, { encoding: "utf8", mode: 0o600 });
  console.log(`Created a local HydraDB token at ${path.relative(process.cwd(), tokenPath)}.`);
}

