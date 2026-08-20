import type { OrderDraft, PricedOrder } from "../domain/order";
import { applyPromotion } from "./index";

export function calculateOrderTotal(order: OrderDraft): PricedOrder {
  const subtotal = order.lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  const discount = applyPromotion(order);
  return { ...order, subtotal, discount, total: Math.max(0, subtotal - discount) };
}

