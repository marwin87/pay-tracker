import { apiFetch } from "./api";

export type BillFrequency = "monthly" | "quarterly" | "annual" | "one_off";

export interface BillTemplateOut {
  id: number;
  name: string;
  category: string | null;
  frequency: BillFrequency;
  amount: string;
  currency: string;
  due_day: number | null;
  notes: string | null;
  is_archived: boolean;
  is_paused: boolean;
  created_at: string;
}

export interface BillTemplateCreate {
  name: string;
  category?: string | null;
  frequency: BillFrequency;
  amount: string;
  currency?: string;
  due_day?: number | null;
  notes?: string | null;
  is_paused?: boolean;
}

export type BillTemplateUpdate = Partial<BillTemplateCreate>;

export function fetchBills(includeArchived = false): Promise<BillTemplateOut[]> {
  const qs = includeArchived ? "?include_archived=true" : "";
  return apiFetch<BillTemplateOut[]>(`/bills${qs}`);
}

export function createBill(data: BillTemplateCreate): Promise<BillTemplateOut> {
  return apiFetch<BillTemplateOut>("/bills", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function updateBill(
  id: number,
  data: BillTemplateUpdate,
): Promise<BillTemplateOut> {
  return apiFetch<BillTemplateOut>(`/bills/${id}`, {
    method: "PATCH",
    body: JSON.stringify(data),
  });
}

export function archiveBill(id: number): Promise<void> {
  return apiFetch<void>(`/bills/${id}/archive`, { method: "POST" });
}
