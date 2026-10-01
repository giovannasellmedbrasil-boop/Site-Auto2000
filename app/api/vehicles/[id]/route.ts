import { NextResponse } from "next/server";
import { z } from "zod";
import { deleteVehicle, getVehicleById, updateVehicle } from "@/lib/server/db";
import { getAdminSession } from "@/lib/server/auth";

const vehicleUpdateSchema = z.object({
  brand: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  version: z.string().min(1).optional(),
  bodyType: z.enum(["HATCH", "SEDAN", "SUV", "PICKUP", "MINIVAN", "COUPE", "CONVERTIBLE"]).optional(),
  manufactureYear: z.coerce.number().int().optional(),
  modelYear: z.coerce.number().int().optional(),
  mileageKm: z.coerce.number().int().optional(),
  price: z.coerce.number().optional(),
  costPrice: z.coerce.number().optional().nullable(),
  transmission: z.enum(["MANUAL", "AUTOMATIC", "CVT", "AUTOMATED"]).optional(),
  fuel: z.enum(["FLEX", "GASOLINE", "ETHANOL", "DIESEL", "HYBRID", "ELECTRIC"]).optional(),
  color: z.string().optional(),
  plateEnding: z.string().max(2).optional().nullable(),
  plate: z.string().optional().nullable(),
  chassi: z.string().optional().nullable(),
  renavam: z.string().optional().nullable(),
  doors: z.coerce.number().int().optional(),
  engine: z.string().optional().nullable(),
  powerHp: z.coerce.number().int().optional().nullable(),
  trunkLiters: z.coerce.number().int().optional().nullable(),
  fuelConsumption: z.string().optional().nullable(),
  features: z.array(z.string()).optional(),
  description: z.string().optional().nullable(),
  videoUrl: z.string().optional().nullable(),
  status: z.enum(["AVAILABLE", "RESERVED", "SOLD", "PREPARING"]).optional(),
  enteredStockAt: z.string().optional(),
  soldAt: z.string().optional().nullable(),
  photos: z.array(z.object({ url: z.string(), isCover: z.boolean().optional() })).optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const vehicle = await getVehicleById(id);
  if (!vehicle) return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  return NextResponse.json({ vehicle });
}

export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const body = await request.json().catch(() => null);
  const parsed = vehicleUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }

  const vehicle = await updateVehicle(id, parsed.data);
  if (!vehicle) return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  return NextResponse.json({ vehicle });
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const { id } = await params;
  const result = await deleteVehicle(id);
  if (!result.ok) {
    if (result.reason === "linked_to_sale") {
      return NextResponse.json(
        { error: "Este veículo já está vinculado a uma venda registrada e não pode ser excluído. Marque o status como \"Vendido\" em vez de excluir." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: "Veículo não encontrado" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}
