"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import type { Vehicle } from "@/lib/types";
import {
  BODY_TYPE_LABELS,
  FUEL_LABELS,
  TRANSMISSION_LABELS,
  VEHICLE_STATUS_LABELS,
} from "@/lib/types";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { FormGroup, Input, Label, Select, Textarea } from "@/components/ui/Field";
import { MoneyInput } from "@/components/ui/MoneyInput";

export function VehicleForm({ vehicle }: { vehicle?: Vehicle }) {
  const router = useRouter();
  const isEdit = Boolean(vehicle);
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("submitting");
    const form = new FormData(e.currentTarget);

    const features = String(form.get("features") ?? "")
      .split(",")
      .map((f) => f.trim())
      .filter(Boolean);

    const payload = {
      brand: form.get("brand"),
      model: form.get("model"),
      version: form.get("version"),
      bodyType: form.get("bodyType"),
      manufactureYear: form.get("manufactureYear"),
      modelYear: form.get("modelYear"),
      mileageKm: form.get("mileageKm"),
      price: form.get("price"),
      costPrice: form.get("costPrice") || undefined,
      variableExpenses: form.get("variableExpenses") || undefined,
      transmission: form.get("transmission"),
      fuel: form.get("fuel"),
      color: form.get("color"),
      plateEnding: form.get("plateEnding") || undefined,
      plate: form.get("plate") || undefined,
      chassi: form.get("chassi") || undefined,
      renavam: form.get("renavam") || undefined,
      doors: form.get("doors"),
      engine: form.get("engine") || undefined,
      powerHp: form.get("powerHp") || undefined,
      trunkLiters: form.get("trunkLiters") || undefined,
      fuelConsumption: form.get("fuelConsumption") || undefined,
      features,
      description: form.get("description") || undefined,
      status: form.get("status"),
      enteredStockAt: vehicle?.enteredStockAt ?? new Date().toISOString(),
    };

    try {
      const res = await fetch(isEdit ? `/api/vehicles/${vehicle!.id}` : "/api/vehicles", {
        method: isEdit ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setErrorMsg(data?.error ?? "Não foi possível salvar o veículo.");
        setStatus("error");
        return;
      }
      router.push("/admin/veiculos");
      router.refresh();
    } catch {
      setErrorMsg("Não foi possível salvar o veículo.");
      setStatus("error");
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-sm font-semibold text-accent-400">Identificação</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FormGroup>
            <Label>Marca</Label>
            <Input name="brand" required defaultValue={vehicle?.brand} />
          </FormGroup>
          <FormGroup>
            <Label>Modelo</Label>
            <Input name="model" required defaultValue={vehicle?.model} />
          </FormGroup>
          <FormGroup>
            <Label>Versão</Label>
            <Input name="version" required defaultValue={vehicle?.version} />
          </FormGroup>
          <FormGroup>
            <Label>Carroceria</Label>
            <Select name="bodyType" defaultValue={vehicle?.bodyType ?? "SUV"}>
              {Object.entries(BODY_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup>
            <Label>Ano fabricação</Label>
            <Input name="manufactureYear" type="number" required defaultValue={vehicle?.manufactureYear} />
          </FormGroup>
          <FormGroup>
            <Label>Ano modelo</Label>
            <Input name="modelYear" type="number" required defaultValue={vehicle?.modelYear} />
          </FormGroup>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-sm font-semibold text-accent-400">Preço e condição</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FormGroup>
            <Label>Preço de venda</Label>
            <MoneyInput name="price" required defaultValue={vehicle?.price} />
          </FormGroup>
          <FormGroup>
            <Label hint="uso interno, não exibido no site">Preço de custo (valor pago na compra)</Label>
            <MoneyInput name="costPrice" defaultValue={vehicle?.costPrice} />
          </FormGroup>
          <FormGroup>
            <Label hint="uso interno, não exibido no site">Gastos variáveis</Label>
            <MoneyInput name="variableExpenses" defaultValue={vehicle?.variableExpenses} />
          </FormGroup>
          <FormGroup>
            <Label>Quilometragem</Label>
            <Input name="mileageKm" type="number" min={0} required defaultValue={vehicle?.mileageKm} />
          </FormGroup>
          <FormGroup>
            <Label>Câmbio</Label>
            <Select name="transmission" defaultValue={vehicle?.transmission ?? "AUTOMATIC"}>
              {Object.entries(TRANSMISSION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup>
            <Label>Combustível</Label>
            <Select name="fuel" defaultValue={vehicle?.fuel ?? "FLEX"}>
              {Object.entries(FUEL_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormGroup>
          <FormGroup>
            <Label>Cor</Label>
            <Input name="color" required defaultValue={vehicle?.color} />
          </FormGroup>
          <FormGroup>
            <Label hint="opcional">Placa (final)</Label>
            <Input name="plateEnding" maxLength={2} defaultValue={vehicle?.plateEnding ?? undefined} />
          </FormGroup>
          <FormGroup>
            <Label hint="opcional">Placa</Label>
            <Input name="plate" placeholder="Ex: ABC1D23" defaultValue={vehicle?.plate ?? undefined} />
          </FormGroup>
          <FormGroup>
            <Label hint="opcional">Chassi</Label>
            <Input name="chassi" defaultValue={vehicle?.chassi ?? undefined} />
          </FormGroup>
          <FormGroup>
            <Label hint="opcional">Renavam</Label>
            <Input name="renavam" defaultValue={vehicle?.renavam ?? undefined} />
          </FormGroup>
          <FormGroup>
            <Label>Portas</Label>
            <Input name="doors" type="number" min={2} max={5} required defaultValue={vehicle?.doors ?? 4} />
          </FormGroup>
          <FormGroup>
            <Label>Status</Label>
            <Select name="status" defaultValue={vehicle?.status ?? "AVAILABLE"}>
              {Object.entries(VEHICLE_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </Select>
          </FormGroup>
        </div>
      </Card>

      <Card className="flex flex-col gap-4 p-6">
        <h2 className="text-sm font-semibold text-accent-400">Ficha técnica</h2>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          <FormGroup>
            <Label hint="opcional">Motor</Label>
            <Input name="engine" defaultValue={vehicle?.engine ?? undefined} placeholder="Ex: 1.0 Turbo" />
          </FormGroup>
          <FormGroup>
            <Label hint="opcional">Potência (cv)</Label>
            <Input name="powerHp" type="number" defaultValue={vehicle?.powerHp ?? undefined} />
          </FormGroup>
          <FormGroup>
            <Label hint="opcional">Porta-malas (L)</Label>
            <Input name="trunkLiters" type="number" defaultValue={vehicle?.trunkLiters ?? undefined} />
          </FormGroup>
          <FormGroup className="col-span-2 sm:col-span-3">
            <Label hint="opcional">Consumo</Label>
            <Input name="fuelConsumption" defaultValue={vehicle?.fuelConsumption ?? undefined} placeholder="Ex: 12,8 km/l (cidade)" />
          </FormGroup>
        </div>
        <FormGroup>
          <Label hint="separe por vírgulas">Principais equipamentos</Label>
          <Textarea
            name="features"
            defaultValue={vehicle?.features.join(", ")}
            placeholder="Central multimídia, Câmera de ré, Piloto automático..."
          />
        </FormGroup>
        <FormGroup>
          <Label hint="opcional">Descrição</Label>
          <Textarea name="description" defaultValue={vehicle?.description ?? undefined} />
        </FormGroup>
      </Card>

      {status === "error" && <p className="text-sm text-danger-500">{errorMsg}</p>}

      <div className="flex gap-3">
        <Button type="submit" disabled={status === "submitting"}>
          {status === "submitting" && <Loader2 className="h-4 w-4 animate-spin" />}
          {isEdit ? "Salvar alterações" : "Cadastrar veículo"}
        </Button>
        <Button href="/admin/veiculos" variant="outline">
          Cancelar
        </Button>
      </div>
    </form>
  );
}
