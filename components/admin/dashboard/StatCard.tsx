"use client";

import { useState } from "react";
import {
  Users,
  PhoneCall,
  Calendar,
  Car,
  FileText,
  TrendingUp,
  DollarSign,
  Receipt,
  Globe,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/utils";
import { RecordsDrawer, type DrillKind } from "@/components/admin/dashboard/RecordsDrawer";
import type { DrillMetric } from "@/lib/server/dashboard";

const ICONS: Record<string, LucideIcon> = {
  users: Users,
  "phone-call": PhoneCall,
  calendar: Calendar,
  car: Car,
  "file-text": FileText,
  "trending-up": TrendingUp,
  "dollar-sign": DollarSign,
  receipt: Receipt,
  globe: Globe,
  wallet: Wallet,
};

export function StatCard({
  label,
  value,
  icon,
  sublabel,
  deltaPct,
  direction,
  drill,
  filtersQuery,
}: {
  label: string;
  value: ReactNode;
  icon: keyof typeof ICONS;
  sublabel?: ReactNode;
  deltaPct?: number | null;
  direction?: "up" | "down" | "flat";
  drill?: { metric: DrillMetric; kind: DrillKind; title: string };
  filtersQuery: string;
}) {
  const [open, setOpen] = useState(false);
  const Icon = ICONS[icon];

  const content = (
    <Card className={cn("flex flex-col gap-2 p-5", drill && "cursor-pointer transition-shadow hover:shadow-[var(--shadow-card-hover)]")}>
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent-100 text-accent-700">
          <Icon className="h-4.5 w-4.5" strokeWidth={1.6} />
        </span>
        {deltaPct != null && direction && (
          <span
            className={cn(
              "text-xs font-semibold",
              direction === "up" ? "text-success-600" : direction === "down" ? "text-danger-500" : "text-ink-500"
            )}
          >
            {direction === "up" ? "↑" : direction === "down" ? "↓" : "•"} {Math.abs(deltaPct)}%
          </span>
        )}
      </div>
      <span className="text-2xl font-semibold text-ink-950">{value}</span>
      <span className="text-xs text-ink-500">{label}</span>
      {sublabel && <span className="text-[11px] text-ink-600">{sublabel}</span>}
    </Card>
  );

  if (!drill) return content;

  return (
    <>
      <div onClick={() => setOpen(true)} role="button" tabIndex={0} onKeyDown={(e) => e.key === "Enter" && setOpen(true)}>
        {content}
      </div>
      {open && (
        <RecordsDrawer
          title={drill.title}
          kind={drill.kind}
          fetchUrl={`/api/admin/${drill.kind}?${filtersQuery}${drill.kind === "leads" ? `&metric=${drill.metric}` : ""}`}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
