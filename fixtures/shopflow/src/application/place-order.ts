import type { OrderDraft, PricedOrder } from "../domain/order";
import { recordOrderEvent } from "../audit/order-audit";
import { calculateOrderTotal } from "../pricing/total";

export async function finalizePurchase(order: OrderDraft): Promise<PricedOrder> {
  const priced = calculateOrderTotal(order);
  recordOrderEvent(priced);
  return priced;
}

