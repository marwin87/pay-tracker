"use client";

import { createContext, useContext, useState, ReactNode } from "react";
import type { PaymentInstanceOut } from "@/lib/payments-api";

interface PaymentActionContextValue {
  dialogTarget: PaymentInstanceOut | null;
  setDialogTarget: (instance: PaymentInstanceOut | null) => void;
  deleteTarget: PaymentInstanceOut | null;
  setDeleteTarget: (instance: PaymentInstanceOut | null) => void;
}

const PaymentActionContext = createContext<PaymentActionContextValue | null>(null);

export function PaymentActionProvider({ children }: { children: ReactNode }) {
  const [dialogTarget, setDialogTarget] = useState<PaymentInstanceOut | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PaymentInstanceOut | null>(null);

  return (
    <PaymentActionContext.Provider
      value={{ dialogTarget, setDialogTarget, deleteTarget, setDeleteTarget }}
    >
      {children}
    </PaymentActionContext.Provider>
  );
}

export function usePaymentActions(): PaymentActionContextValue {
  const ctx = useContext(PaymentActionContext);
  if (!ctx) throw new Error("usePaymentActions must be used within PaymentActionProvider");
  return ctx;
}
