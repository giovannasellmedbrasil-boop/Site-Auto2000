import { NextResponse } from "next/server";
import { z } from "zod";
import { createVehicle, listVehiclesAdmin, listVehiclesPublic } from "@/lib/server/db";
import { getAdminSession } from "@/lib/server/auth";

const vehicleInputSchema = z.object({
  brand: z.string().min(1),
  model: z.string().min(1),
  version: z.string().min(1),
  bodyType: z.enum(["HATCH", "SEDAN", "SUV", "PICKUP", "MINIVAN", "COUPE", "CONVERTIBLE"]),
  manufactureYear: z.coerce.number().int().min(1980),
  modelYear: z.coerce.number().int().min(1980),
  mileageKm: z.coerce.number().int().min(0),
  price: z.coerce.number().min(0),
  costPrice: z.coerce.number().min(0).optional().nullable(),
  variableExpenses: z.coerce.number().min(0).optional().nullable(),
  transmission: z.enum(["MANUAL", "AUTOMATIC", "CVT", "AUTOMATED"]),
  fuel: z.enum(["FLEX", "GASOLINE", "ETHANOL", "DIESEL", "HYBRID", "ELECTRIC"]),
  color: z.string().min(1),
  plateEnding: z.string().max(2).optional().nullable(),
  plate: z.string().optional().nullable(),
  chassi: z.string().optional().nullable(),
  renavam: z.string().optional().nullable(),
  doors: z.coerce.number().int().min(2).max(5),
  engine: z.string().optional().nullable(),
  powerHp: z.coerce.number().int().optional().nullable(),
  trunkLiters: z.coerce.number().int().optional().nullable(),
  fuelConsumption: z.string().optional().nullable(),
  features: z.array(z.string()).default([]),
  description: z.string().optional().nullable(),
  videoUrl: z.string().optional().nullable(),
  status: z.enum(["AVAILABLE", "RESERVED", "SOLD", "PREPARING"]).default("AVAILABLE"),
  enteredStockAt: z.string(),
  soldAt: z.string().optional().nullable(),
  photos: z.array(z.object({ url: z.string(), isCover: z.boolean().optional() })).optional(),
});

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ids = searchParams.get("ids");
  const admin = searchParams.get("scope") === "admin";

  if (admin) {
    const session = await getAdminSession();
    if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
    return NextResponse.json({ vehicles: await listVehiclesAdmin() });
  }

  if (ids) {
    const idList = ids.split(",").filter(Boolean);
    const vehicles = (await listVehiclesAdmin()).filter((v) => idList.includes(v.id));
    return NextResponse.json({ vehicles });
  }

  const vehicles = await listVehiclesPublic();
  return NextResponse.json({ vehicles });
}

export async function POST(request: Request) {
  const session = await getAdminSession();
  if (!session) return NextResponse.json({ error: "Não autorizado" }, { status: 401 });

  const body = await request.json().catch(() => null);
  const parsed = vehicleInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Dados inválidos", issues: parsed.error.flatten() }, { status: 400 });
  }

  const vehicle = await createVehicle(parsed.data);
  return NextResponse.json({ vehicle }, { status: 201 });
}
