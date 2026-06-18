import { apiFetch } from "./api";
import type { BillFrequency } from "./bills-api";

export type { BillFrequency };
export type PaymentStatus = "upcoming" | "overdue" | "paid";

export interface PaymentInstanceOut {
  id: number;
  bill_id: number;
  period: string;
  due_date: string;
  amount: string;
  status: PaymentStatus;
  paid_at: string | null;
  paid_amount: string | null;
  notes: string | null;
  bill_name: string;
  currency: string;
  frequency: BillFrequency;
  email_sent_at: string | null;
}

export function fetchPayments(month: string): Promise<PaymentInstanceOut[]> {
  return apiFetch<PaymentInstanceOut[]>(
    `/bills/payments?month=${encodeURIComponent(month)}`,
  );
}

export function markPaid(
  instanceId: number,
  paidAmount: string,
  notes?: string,
): Promise<PaymentInstanceOut> {
  return apiFetch<PaymentInstanceOut>(`/bills/payments/${instanceId}/pay`, {
    method: "POST",
    body: JSON.stringify({ paid_amount: parseFloat(paidAmount), notes: notes ?? null }),
  });
}

export function deletePayment(instanceId: number, deleteFuture = false): Promise<void> {
  const url = `/bills/payments/${instanceId}${deleteFuture ? "?delete_future=true" : ""}`;
  return apiFetch<void>(url, { method: "DELETE" });
}

export function revertPay(instanceId: number): Promise<PaymentInstanceOut> {
  return apiFetch<PaymentInstanceOut>(`/bills/payments/${instanceId}/unpay`, {
    method: "POST",
  });
}
