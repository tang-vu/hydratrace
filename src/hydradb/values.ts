import { z } from "zod";

const rawPathPropertySchema = z.union([
  z.object({ String: z.string() }),
  z.object({ Integer: z.number() }),
  z.object({ SignedInteger: z.number() }),
  z.object({ Bool: z.boolean() }),
  z.object({ Float: z.number() }),
]);

function decodePathProperty(value: z.infer<typeof rawPathPropertySchema>): string | number | boolean {
  if ("String" in value) return value.String;
  if ("Integer" in value) return value.Integer;
  if ("SignedInteger" in value) return value.SignedInteger;
  if ("Bool" in value) return value.Bool;
  return value.Float;
}

const pathPropertiesSchema = z.record(z.string(), rawPathPropertySchema)
  .transform((properties) => Object.fromEntries(Object.entries(properties).map(([key, value]) => [key, decodePathProperty(value)])));

export const queryPathSchema = z.object({
  nodes: z.array(z.object({
    id: z.number().int().nonnegative(),
    labels: z.array(z.string()),
    properties: pathPropertiesSchema,
  })),
  relationships: z.array(z.object({
    id: z.number().int().nonnegative().nullable().optional(),
    edge_type: z.string(),
    src: z.number().int().nonnegative(),
    dst: z.number().int().nonnegative(),
    properties: pathPropertiesSchema,
  })),
});

export type QueryPath = z.infer<typeof queryPathSchema>;

export type HydraValue =
  | null
  | string
  | number
  | boolean
  | HydraValue[]
  | QueryPath;

export type TaggedHydraValue = {
  type: "null" | "vertex_id" | "integer" | "signed_integer" | "float" | "boolean" | "string" | "list" | "path";
  value?: unknown;
};

export function decodeHydraValue(tagged: TaggedHydraValue): HydraValue {
  switch (tagged.type) {
    case "null": return null;
    case "vertex_id":
    case "integer":
    case "signed_integer":
    case "float":
      return z.number().parse(tagged.value);
    case "boolean": return z.boolean().parse(tagged.value);
    case "string": return z.string().parse(tagged.value);
    case "list": return z.array(z.custom<TaggedHydraValue>()).parse(tagged.value).map(decodeHydraValue);
    case "path": return queryPathSchema.parse(tagged.value);
  }
}
