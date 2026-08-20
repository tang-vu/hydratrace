import type { OrderDraft } from "../domain/order";
import type { AdjustmentPolicy } from "./adjustment-policy";

const CAMPAIGNS: Record<string, number> = {
  SAVE10: 0.1,
  VIP20: 0.2,
};

export class CouponAdjustment implements AdjustmentPolicy {
  adjustmentFor(order: OrderDraft): number {
    return applyCoupon(order);
  }
}

export function applyCoupon(order: OrderDraft): number {
  const rate = order.couponCode ? (CAMPAIGNS[order.couponCode] ?? 0) : 0;
  const subtotal = order.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return Math.round(subtotal * rate * 100) / 100;
}

