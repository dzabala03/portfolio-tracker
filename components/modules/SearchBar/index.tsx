"use client";

import { useState, useRef, useEffect } from "react";
import { Search, Loader2 } from "lucide-react";

interface SearchResult {
  symbol: string;
  description: string;
  type: string;
}

interface Props {
  onSelect: (ticker: string) => void;
}

export function SearchBar({ onSelect }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const value = e.target.value;
    setQuery(value);
    setActiveIndex(-1);
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const trimmed = value.trim();
    if (trimmed.length === 0) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const json = await res.json();
        setResults(json.results ?? []);
        setIsOpen(true);
      } catch (err) {
        console.error("[SearchBar]", err);
      } finally {
        setIsLoading(false);
      }
    }, 300);
  }

  function handleSelect(symbol: string) {
    onSelect(symbol);
    setQuery("");
    setResults([]);
    setIsOpen(false);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = activeIndex >= 0 ? results[activeIndex] : results[0];
      if (target) handleSelect(target.symbol);
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <Search size={14} color="var(--color-accent)" style={{ flex: "none" }} />
        <input
          type="text"
          value={query}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Buscar acción (ej. Apple, AAPL)"
          className="input"
          style={{ width: 200, height: 32, fontSize: 13 }}
          aria-label="Buscar acción"
          role="combobox"
          aria-expanded={isOpen}
          aria-autocomplete="list"
        />
        {isLoading && <Loader2 size={13} className="animate-spin" color="var(--color-accent)" style={{ flex: "none" }} />}
      </div>

      {isOpen && (
        <div
          className="card elev-md"
          style={{ position: "absolute", top: "calc(100% + 6px)", left: 20, width: 300, padding: 6, gap: 2, zIndex: 40 }}
        >
          {results.length > 0 ? (
            results.map((r, i) => (
              <button
                key={r.symbol}
                type="button"
                onClick={() => handleSelect(r.symbol)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "baseline",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  borderRadius: "var(--radius-sm)",
                  border: "none",
                  background: activeIndex === i ? "var(--color-accent-100)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  font: "inherit",
                  color: "inherit",
                }}
              >
                <span style={{ fontWeight: 600, flex: "none" }}>{r.symbol}</span>
                <span
                  className="text-muted"
                  style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                >
                  {r.description}
                </span>
              </button>
            ))
          ) : !isLoading ? (
            <span className="text-muted" style={{ fontSize: 12, padding: "8px 10px", display: "block" }}>
              Sin resultados para &quot;{query}&quot;
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}
