import { checkoutRoute } from "../src/api/checkout-route";

export async function checkoutAppliesCampaign(): Promise<void> {
  const response = await checkoutRoute({
    id: "order-1",
    customerId: "customer-1",
    couponCode: "SAVE10",
    lines: [{ sku: "book", unitPrice: 20, quantity: 2 }],
  });
  if (response.body.total !== 36) throw new Error("Expected routed checkout total to include the campaign adjustment.");
}

