import { createHash } from "node:crypto";

export const MAX_SAFE_GRAPH_ID = 2 ** 52 - 1;

export function stableId(canonicalKey: string): number {
  const digest = createHash("sha256").update(canonicalKey).digest("hex");
  const value = Number(BigInt(`0x${digest.slice(0, 13)}`));
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_SAFE_GRAPH_ID) {
    throw new Error(`Generated graph ID is outside the safe range for ${canonicalKey}.`);
  }
  return value;
}

export class IdRegistry {
  private readonly keysById = new Map<number, string>();

  claim(canonicalKey: string, id = stableId(canonicalKey)): number {
    const existing = this.keysById.get(id);
    if (existing !== undefined && existing !== canonicalKey) {
      throw new Error(`Deterministic graph ID collision: ${existing} and ${canonicalKey} both map to ${id}.`);
    }
    this.keysById.set(id, canonicalKey);
    return id;
  }
}

