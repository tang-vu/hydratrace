import type { OrderDraft } from "../domain/order";

export interface AdjustmentPolicy {
  adjustmentFor(order: OrderDraft): number;
}

