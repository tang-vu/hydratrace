import type { OrderDraft } from "../domain/order";
import { finalizePurchase } from "../application/place-order";

export async function checkoutRoute(body: unknown) {
  const order = body as OrderDraft;
  const result = await finalizePurchase(order);
  return { status: 200, body: result };
}

