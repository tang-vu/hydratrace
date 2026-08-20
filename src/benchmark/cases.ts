export interface BenchmarkCase {
  id: string;
  task: string;
  goldFiles: Array<{ path: string; rationale: string }>;
  maximumResults: number;
}

export const benchmarkCases: BenchmarkCase[] = [
  {
    id: "coupon-contract",
    task: "Change applyCoupon rounding behavior",
    goldFiles: [
      { path: "src/pricing/coupon.ts", rationale: "Defines the changed function." },
      { path: "src/pricing/total.ts", rationale: "Calls the function through a re-exported alias." },
      { path: "src/application/place-order.ts", rationale: "Consumes the calculated order total." },
      { path: "src/api/checkout-route.ts", rationale: "Exposes the downstream purchase flow." },
      { path: "tests/pricing.spec.ts", rationale: "Exercises total calculation without naming coupons." },
      { path: "tests/checkout.spec.ts", rationale: "Exercises the routed workflow indirectly." }
    ],
    maximumResults: 8
  },
  {
    id: "policy-interface",
    task: "Modify AdjustmentPolicy adjustmentFor contract",
    goldFiles: [
      { path: "src/pricing/adjustment-policy.ts", rationale: "Defines the interface contract." },
      { path: "src/pricing/coupon.ts", rationale: "Implements the contract." },
      { path: "tests/policy.spec.ts", rationale: "Checks the implementation through the interface type." }
    ],
    maximumResults: 5
  },
  {
    id: "total-pipeline",
    task: "Change calculateOrderTotal return value",
    goldFiles: [
      { path: "src/pricing/total.ts", rationale: "Defines the changed calculation." },
      { path: "src/application/place-order.ts", rationale: "Direct production caller." },
      { path: "src/api/checkout-route.ts", rationale: "Multi-hop downstream API caller." },
      { path: "src/audit/order-audit.ts", rationale: "Consumes the priced order through the purchase orchestration." },
      { path: "tests/pricing.spec.ts", rationale: "Direct structural test." },
      { path: "tests/checkout.spec.ts", rationale: "Indirect route-level test." }
    ],
    maximumResults: 8
  },
  {
    id: "route-boundary",
    task: "Add validation to checkoutRoute",
    goldFiles: [
      { path: "src/api/checkout-route.ts", rationale: "Defines the route boundary." },
      { path: "src/application/place-order.ts", rationale: "Immediate service dependency." },
      { path: "tests/checkout.spec.ts", rationale: "Exercises the route boundary." }
    ],
    maximumResults: 5
  },
  {
    id: "audit-side-effect",
    task: "Change recordOrderEvent payload",
    goldFiles: [
      { path: "src/audit/order-audit.ts", rationale: "Defines the audit write." },
      { path: "src/application/place-order.ts", rationale: "Calls the audit write after pricing." },
      { path: "src/api/checkout-route.ts", rationale: "Triggers the audited workflow." }
    ],
    maximumResults: 5
  },
  {
    id: "implementation-check",
    task: "Refactor CouponAdjustment implementation",
    goldFiles: [
      { path: "src/pricing/coupon.ts", rationale: "Defines the implementation." },
      { path: "src/pricing/adjustment-policy.ts", rationale: "Defines its implemented interface." },
      { path: "tests/policy.spec.ts", rationale: "Constructs and exercises the implementation." }
    ],
    maximumResults: 5
  },
  {
    id: "local-config",
    task: "Locate checkout-config maximumLines",
    goldFiles: [
      { path: "src/config/checkout-config.ts", rationale: "The configuration is entirely local and has no structural dependents in this fixture." }
    ],
    maximumResults: 3
  }
];
