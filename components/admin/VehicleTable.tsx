"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Pencil, Trash2, ExternalLink, Handshake } from "lucide-react";
import type { Vehicle } from "@/lib/types";
import { VEHICLE_STATUS_LABELS } from "@/lib/types";
import { daysInStock, formatCurrency, formatKm } from "@/lib/utils";
import { Badge } from "@/components/ui/Badge";

const STATUS_TONE: Record<Vehicle["status"], "success" | "warning" | "neutral" | "accent"> = {
  AVAILABLE: "success",
  RESERVED: "warning",
  SOLD: "neutral",
  PREPARING: "accent",
};

export function VehicleTable({ vehicles }: { vehicles: Vehicle[] }) {
  const router = useRouter();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function handleDelete(id: string, label: string) {
    if (!confirm(`Remover "${label}" do estoque? Esta ação não pode ser desfeita.`)) return;
    setDeletingId(id);
    const res = await fetch(`/api/vehicles/${id}`, { method: "DELETE" });
    setDeletingId(null);
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error ?? "Não foi possível excluir este veículo.");
      return;
    }
    router.refresh();
  }

  return (
    <div className="overflow-x-auto rounded-card border border-white/10 bg-ink-100">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="border-b border-ink-100 text-left text-xs uppercase tracking-wide text-ink-600">
            <th className="px-4 py-3 font-medium">Veículo</th>
            <th className="px-4 py-3 font-medium">Preço de compra</th>
            <th className="px-4 py-3 font-medium">Preço de venda</th>
            <th className="px-4 py-3 font-medium">Km</th>
            <th className="px-4 py-3 font-medium">Status</th>
            <th className="px-4 py-3 font-medium">Dias em estoque</th>
            <th className="px-4 py-3 font-medium text-right">Ações</th>
          </tr>
        </thead>
        <tbody>
          {vehicles.map((v) => (
            <tr key={v.id} className="border-b border-ink-50 last:border-0 hover:bg-ink-50/50">
              <td className="px-4 py-3">
                <div className="font-medium text-ink-900">{v.brand} {v.model}</div>
                <div className="text-xs text-ink-600">{v.version} · {v.modelYear}</div>
              </td>
              <td className="px-4 py-3 text-ink-700">{v.costPrice != null ? formatCurrency(v.costPrice) : "—"}</td>
              <td className="px-4 py-3 text-ink-700">{formatCurrency(v.price)}</td>
              <td className="px-4 py-3 text-ink-700">{formatKm(v.mileageKm)}</td>
              <td className="px-4 py-3">
                <Badge tone={STATUS_TONE[v.status]}>{VEHICLE_STATUS_LABELS[v.status]}</Badge>
              </td>
              <td className="px-4 py-3 text-ink-700">{daysInStock(v.enteredStockAt)}</td>
              <td className="px-4 py-3">
                <div className="flex items-center justify-end gap-1">
                  <Link
                    href={`/admin/documentacao/nova?veiculo=${v.id}`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 hover:text-ink-700"
                    aria-label="Nova venda"
                  >
                    <Handshake className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/veiculos/${v.slug}`}
                    target="_blank"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 hover:text-ink-700"
                    aria-label="Ver no site"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  <Link
                    href={`/admin/veiculos/${v.id}/editar`}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-600 hover:bg-ink-100 hover:text-ink-700"
                    aria-label="Editar"
                  >
                    <Pencil className="h-4 w-4" />
                  </Link>
                  <button
                    onClick={() => handleDelete(v.id, `${v.brand} ${v.model}`)}
                    disabled={deletingId === v.id}
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-ink-600 hover:bg-danger-500/10 hover:text-danger-500"
                    aria-label="Excluir"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
