"use client";

import { useState, useEffect, useCallback } from "react";
import type { Quote } from "@/types";

const POLL_INTERVAL_MS = 60_000; // 60s — respeta el free tier de Finnhub

interface UsePricesResult {
  quotes: Record<string, Quote>;
  isLoading: boolean;
  error: string | null;
  lastUpdated: Date | null;
  refresh: () => void;
}

export function usePrices(tickers: string[]): UsePricesResult {
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchPrices = useCallback(async () => {
    if (tickers.length === 0) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/prices?tickers=${tickers.join(",")}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: Record<string, Quote> = await res.json();
      setQuotes(data);
      setLastUpdated(new Date());
    } catch (err) {
      setError("No se pudieron obtener los precios. Reintentando...");
      console.error("[usePrices]", err);
    } finally {
      setIsLoading(false);
    }
  }, [tickers.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  return { quotes, isLoading, error, lastUpdated, refresh: fetchPrices };
}
