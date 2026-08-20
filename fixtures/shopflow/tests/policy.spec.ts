import { CouponAdjustment } from "../src/pricing/coupon";
import type { AdjustmentPolicy } from "../src/pricing/adjustment-policy";

export function couponImplementsPolicy(): void {
  const policy: AdjustmentPolicy = new CouponAdjustment();
  const discount = policy.adjustmentFor({ id: "order-3", customerId: "c", lines: [] });
  if (discount !== 0) throw new Error("An empty order cannot be discounted.");
}

