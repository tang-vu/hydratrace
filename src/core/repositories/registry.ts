import path from "node:path";
import { z } from "zod";
import { REPOSITORY_CATALOG, type RepositoryId } from "./catalog";

export const repositoryIdSchema = z.enum(REPOSITORY_CATALOG.map((repository) => repository.id) as [RepositoryId, ...RepositoryId[]]);

/** The web app resolves only these server-owned paths; request input never becomes a filesystem path. */
export function resolveRegisteredRepository(id: RepositoryId): string {
  const projectRoot = process.cwd();
  switch (id) {
    case "shopflow": return path.join(projectRoot, "fixtures", "shopflow");
    case "hydratrace": return projectRoot;
  }
}
