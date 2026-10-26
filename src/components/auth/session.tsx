"use client";

import { createContext, useContext } from "react";
import type { ReactNode } from "react";

import type { FarmerDTO } from "@/lib/types";

const SessionContext = createContext<FarmerDTO | null>(null);

export function SessionProvider({
  farmer,
  children,
}: {
  farmer: FarmerDTO;
  children: ReactNode;
}) {
  return <SessionContext value={farmer}>{children}</SessionContext>;
}

export function useSessionFarmer(): FarmerDTO | null {
  return useContext(SessionContext);
}
