export const REPOSITORY_CATALOG = [
  {
    id: "shopflow",
    name: "ShopFlow demo",
    kind: "Synthetic fixture",
    description: "Deterministic checkout scenario with benchmark gold labels.",
    defaultTask: "Change applyCoupon rounding behavior",
  },
  {
    id: "hydratrace",
    name: "HydraTrace dogfood",
    kind: "Product source",
    description: "HydraTrace indexes and traces its own production code.",
    defaultTask: "Change HydraDbClient query retry and bookmark behavior",
  },
] as const;

export type RepositoryId = (typeof REPOSITORY_CATALOG)[number]["id"];

export function repositoryMetadata(id: RepositoryId) {
  return REPOSITORY_CATALOG.find((repository) => repository.id === id)!;
}
