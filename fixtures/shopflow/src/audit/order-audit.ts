import type { PricedOrder } from "../domain/order";

export interface AuditRecord {
  event: string;
  orderId: string;
  total: number;
}

const auditRecords: AuditRecord[] = [];

export function recordOrderEvent(order: PricedOrder): void {
  auditRecords.push({ event: "order.priced", orderId: order.id, total: order.total });
}

export function readAuditRecords(): readonly AuditRecord[] {
  return auditRecords;
}

