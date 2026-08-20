export interface OrderLine {
  sku: string;
  unitPrice: number;
  quantity: number;
}

export interface OrderDraft {
  id: string;
  customerId: string;
  couponCode?: string;
  lines: OrderLine[];
}

export interface PricedOrder extends OrderDraft {
  subtotal: number;
  discount: number;
  total: number;
}

