"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Select, Input } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import type { FilterOptions } from "@/lib/server/dashboard";
import type { PeriodPreset } from "@/lib/types";

const PERIOD_OPTIONS: { value: PeriodPreset; label: string }[] = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last7", label: "Últimos 7 dias" },
  { value: "last30", label: "Últimos 30 dias" },
  { value: "thisMonth", label: "Este mês" },
  { value: "lastMonth", label: "Mês anterior" },
  { value: "thisYear", label: "Este ano" },
];

export function FilterBar({ options }: { options: FilterOptions }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const currentPeriod = (searchParams.get("period") as PeriodPreset) || "last30";
  const get = (key: string) => searchParams.get(key) ?? "";

  function update(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    if (key === "period" && value !== "custom") {
      params.delete("from");
      params.delete("to");
    }
    router.push(`${pathname}?${params.toString()}`);
  }

  const hasFilters = Array.from(searchParams.keys()).some((k) => k !== "period");

  return (
    <div className="flex flex-col gap-3 rounded-card border border-white/10 bg-ink-100 p-4">
      <div className="flex flex-wrap items-center gap-1.5">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => update("period", opt.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              currentPeriod === opt.value ? "bg-accent-500 text-black" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            {opt.label}
          </button>
        ))}
        <button
          onClick={() => update("period", "custom")}
          className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
            currentPeriod === "custom" ? "bg-accent-500 text-black" : "bg-white/5 text-white/60 hover:bg-white/10 hover:text-white"
          }`}
        >
          Personalizado
        </button>
        {currentPeriod === "custom" && (
          <div className="flex items-center gap-1.5">
            <Input type="date" defaultValue={get("from")} onChange={(e) => update("from", e.target.value)} className="h-9 w-auto py-1.5 text-xs" />
            <span className="text-xs text-white/40">até</span>
            <Input type="date" defaultValue={get("to")} onChange={(e) => update("to", e.target.value)} className="h-9 w-auto py-1.5 text-xs" />
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select className="h-9 w-auto min-w-40 py-1.5 text-xs" value={get("ownerId")} onChange={(e) => update("ownerId", e.target.value)}>
          <option value="">Todos os vendedores</option>
          {options.salespeople.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={() => router.push(`${pathname}?period=${currentPeriod}`)}>
            Limpar filtros
          </Button>
        )}
      </div>
    </div>
  );
}
