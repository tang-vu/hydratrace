import { calculateOrderTotal } from "../src/pricing/total";

export function totalsCannotBecomeNegative(): void {
  const result = calculateOrderTotal({
    id: "order-2",
    customerId: "customer-2",
    couponCode: "VIP20",
    lines: [{ sku: "pen", unitPrice: 5, quantity: 1 }],
  });
  if (result.total < 0) throw new Error("Total must stay non-negative.");
}

