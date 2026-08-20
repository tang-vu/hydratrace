import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { IndexedRepository } from "../graph/model";

const cacheDirectory = path.resolve(".hydratrace", "cache");

export async function saveIndexCache(index: IndexedRepository): Promise<string> {
  await mkdir(cacheDirectory, { recursive: true });
  const destination = path.join(cacheDirectory, `${index.rootHash}.json`);
  await writeFile(destination, `${JSON.stringify(index, null, 2)}\n`, "utf8");
  return destination;
}

export async function loadIndexCache(rootHash: string): Promise<IndexedRepository> {
  const source = path.join(cacheDirectory, `${rootHash}.json`);
  return JSON.parse(await readFile(source, "utf8")) as IndexedRepository;
}

