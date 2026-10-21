"use client";

import { useCallback, useEffect, useState } from "react";

import { ApiError, api } from "@/lib/api-client";
import type { FarmDTO } from "@/lib/types";

export function useFarms() {
  const [farms, setFarms] = useState<FarmDTO[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(false);

  const fetchFarms = useCallback(async () => {
    // Awaits before touching state so it is safe to call from an effect.
    try {
      const data = await api.listFarms();
      setFarms(data.farms);
      setError(null);
      setNeedsSetup(false);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === "DB_NOT_CONFIGURED") {
        setNeedsSetup(true);
      }
      setError(
        cause instanceof Error ? cause.message : "Could not load your farms.",
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await fetchFarms();
    } finally {
      setLoading(false);
    }
  }, [fetchFarms]);

  useEffect(() => {
    let active = true;
    void (async () => {
      await fetchFarms();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [fetchFarms]);

  return { farms, setFarms, loading, error, needsSetup, refresh };
}
