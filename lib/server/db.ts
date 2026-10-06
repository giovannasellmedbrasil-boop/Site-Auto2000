import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/server/prisma";
import type {
  AuditLogEntry,
  ChecklistItem,
  CommercialStatus,
  CompanyFiscalProfile,
  CompanyFiscalProfileInput,
  CreditAnalysis,
  CreditConsentRecord,
  CreditCustomer,
  DashboardGoals,
  Invoice,
  InvoiceInput,
  Lead,
  LeadManualInput,
  MarketingCampaign,
  MarketingCampaignInput,
  Negotiation,
  NegotiationDocument,
  NegotiationFilters,
  NegotiationHistoryEvent,
  NegotiationInput,
  FipeVehicleLink,
  FipeQuote,
  MarketPriceSample,
  Sale,
  Salesperson,
  SalespersonInput,
  SalesCustomer,
  SalesCustomerInput,
  Contract,
  ContractInput,
  Vehicle,
  VehicleFilters,
  VehicleInput,
} from "@/lib/types";
import { buildChecklistTemplates, classifyNegotiation, isDeliveryReady } from "@/lib/server/documentChecklist";
import { mercadoLivreSeedVehicles } from "@/lib/server/seed-mercadolivre";
import { onlyDigits, vehicleSlug } from "@/lib/utils";

// CRM (leads/vendas/vendedores/campanhas) e documentação (negociações/
// checklist) NÃO usam mais dados fictícios gerados automaticamente — essas
// coleções começam vazias. Leads chegam via captura pública (LeadFormModal
// no site) e vendedores via /admin/vendedores; não há mais telas de admin
// para leads e campanhas de marketing (removidas a pedido em 2026-09-12) —
// os dados de leads/campanhas seguem existindo no mock store e alimentando
// o Dashboard Executivo, só não têm mais uma tela de gestão dedicada. O
// gerador antigo (`lib/server/seed-executive-data.ts`)
// e a frota fictícia (`lib/server/seed-data.ts`) foram desativados por esse
// motivo — o arquivo de seed continua disponível como referência, mas não
// alimenta mais o banco.
//
// O ESTOQUE é diferente: os veículos abaixo não são dados fictícios, são o
// estoque real da loja, importado dos anúncios públicos e ativos no
// Mercado Livre (https://www.mercadolivre.com.br/pagina/auto2000veiculos —
// ver lib/server/seed-mercadolivre.ts). A vitrine pública (listVehiclesPublic)
// só exibe veículos com source "MERCADO_LIVRE" — nunca a frota fictícia.
const initialVehicles: Vehicle[] = [...mercadoLivreSeedVehicles];

const DEFAULT_DASHBOARD_GOALS: DashboardGoals = { salesUnitsTarget: 0, revenueTarget: 0 };

// ---------------------------------------------------------------------------
// MOCK STORE — persistido como uma linha JSON no Postgres (tabela MockStore,
// ver prisma/schema.prisma), não mais num arquivo local. Um arquivo local
// funcionava em desenvolvimento, mas na Vercel cada requisição pode cair
// numa instância serverless diferente sem disco compartilhado — uma escrita
// não ficava visível na leitura seguinte. Toda a lógica de domínio abaixo
// (as ~70 funções exportadas) continua igual; só o "readDb"/"writeDb" que
// mudou de backend.
// ---------------------------------------------------------------------------

interface DbShape {
  vehicles: Vehicle[];
  leads: Lead[];
  creditCustomers: CreditCustomer[];
  consentRecords: CreditConsentRecord[];
  creditAnalyses: CreditAnalysis[];
  auditLogs: AuditLogEntry[];
  salespeople: Salesperson[];
  marketingCampaigns: MarketingCampaign[];
  sales: Sale[];
  dashboardGoals: DashboardGoals;
  negotiations: Negotiation[];
  checklistItems: ChecklistItem[];
  negotiationDocuments: NegotiationDocument[];
  negotiationHistory: NegotiationHistoryEvent[];
  fipeLinks: FipeVehicleLink[];
  fipeQuotes: FipeQuote[];
  marketPriceSamples: MarketPriceSample[];
  companyFiscalProfile: CompanyFiscalProfile | null;
  invoices: Invoice[];
  salesCustomers: SalesCustomer[];
  contracts: Contract[];
}

const MOCK_STORE_ID = "singleton";

function emptyDb(): DbShape {
  return {
    vehicles: initialVehicles,
    leads: [],
    creditCustomers: [],
    consentRecords: [],
    creditAnalyses: [],
    auditLogs: [],
    salespeople: [],
    marketingCampaigns: [],
    sales: [],
    dashboardGoals: DEFAULT_DASHBOARD_GOALS,
    negotiations: [],
    checklistItems: [],
    negotiationDocuments: [],
    negotiationHistory: [],
    fipeLinks: [],
    fipeQuotes: [],
    marketPriceSamples: [],
    companyFiscalProfile: null,
    invoices: [],
    salesCustomers: [],
    contracts: [],
  };
}

// Tolera uma linha gravada por uma versão anterior do app (sem os campos de
// crédito/dashboard executivo) sem perder os dados já persistidos.
function normalize(parsed: Partial<DbShape>): DbShape {
  return {
    vehicles: parsed.vehicles ?? initialVehicles,
    leads: parsed.leads ?? [],
    creditCustomers: parsed.creditCustomers ?? [],
    consentRecords: parsed.consentRecords ?? [],
    creditAnalyses: parsed.creditAnalyses ?? [],
    auditLogs: parsed.auditLogs ?? [],
    salespeople: parsed.salespeople ?? [],
    marketingCampaigns: parsed.marketingCampaigns ?? [],
    sales: parsed.sales ?? [],
    dashboardGoals: parsed.dashboardGoals ?? DEFAULT_DASHBOARD_GOALS,
    negotiations: parsed.negotiations ?? [],
    checklistItems: parsed.checklistItems ?? [],
    negotiationDocuments: parsed.negotiationDocuments ?? [],
    negotiationHistory: parsed.negotiationHistory ?? [],
    fipeLinks: parsed.fipeLinks ?? [],
    fipeQuotes: parsed.fipeQuotes ?? [],
    marketPriceSamples: parsed.marketPriceSamples ?? [],
    companyFiscalProfile: parsed.companyFiscalProfile ?? null,
    invoices: parsed.invoices ?? [],
    salesCustomers: parsed.salesCustomers ?? [],
    contracts: parsed.contracts ?? [],
  };
}

async function readDb(): Promise<DbShape> {
  const row = await prisma.mockStore.findUnique({ where: { id: MOCK_STORE_ID } });
  if (!row) {
    const initial = emptyDb();
    await writeDb(initial);
    return initial;
  }
  try {
    return normalize(row.data as Partial<DbShape>);
  } catch {
    const initial = emptyDb();
    await writeDb(initial);
    return initial;
  }
}

async function writeDb(db: DbShape): Promise<void> {
  await prisma.mockStore.upsert({
    where: { id: MOCK_STORE_ID },
    create: { id: MOCK_STORE_ID, data: db as unknown as Prisma.InputJsonValue },
    update: { data: db as unknown as Prisma.InputJsonValue },
  });
}

function genId(prefix: string) {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}${Date.now().toString(36)}`;
}

// --- Veículos ---------------------------------------------------------------

export async function listVehiclesPublic(filters: VehicleFilters = {}): Promise<Vehicle[]> {
  const db = await readDb();
  // A vitrine pública mostra apenas veículos reais, importados da loja no
  // Mercado Livre (ver seed-mercadolivre.ts) — a frota de demonstração
  // (source "SITE") continua existindo para os outros módulos simulados do
  // admin (CRM, análise de crédito etc.), mas nunca aparece para o visitante.
  let items = db.vehicles.filter(
    (v) =>
      v.source === "MERCADO_LIVRE" &&
      (v.status === "AVAILABLE" || v.status === "RESERVED" || (filters.includeSold && v.status === "SOLD"))
  );
  items = applyFilters(items, filters);
  items = sortVehicles(items, filters.sort);
  // Vendidos sempre por último, sem embaralhar a ordenação escolhida entre
  // os demais (sort é estável).
  if (filters.includeSold) {
    items = [...items].sort((a, b) => Number(a.status === "SOLD") - Number(b.status === "SOLD"));
  }
  return items;
}

export async function listVehiclesAdmin(filters: VehicleFilters = {}): Promise<Vehicle[]> {
  const db = await readDb();
  const items = applyFilters(db.vehicles, filters);
  return sortVehicles(items, filters.sort ?? "recent");
}

function applyFilters(items: Vehicle[], filters: VehicleFilters): Vehicle[] {
  return items.filter((v) => {
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const haystack = `${v.brand} ${v.model} ${v.version}`.toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.brand && v.brand.toLowerCase() !== filters.brand.toLowerCase()) return false;
    if (filters.model && v.model.toLowerCase() !== filters.model.toLowerCase()) return false;
    if (filters.priceMin != null && v.price < filters.priceMin) return false;
    if (filters.priceMax != null && v.price > filters.priceMax) return false;
    if (filters.yearMin != null && v.modelYear < filters.yearMin) return false;
    if (filters.yearMax != null && v.modelYear > filters.yearMax) return false;
    if (filters.mileageMax != null && v.mileageKm > filters.mileageMax) return false;
    if (filters.transmission && v.transmission !== filters.transmission) return false;
    if (filters.fuel && v.fuel !== filters.fuel) return false;
    if (filters.bodyType && v.bodyType !== filters.bodyType) return false;
    if (filters.color && v.color.toLowerCase() !== filters.color.toLowerCase()) return false;
    return true;
  });
}

function sortVehicles(items: Vehicle[], sort: VehicleFilters["sort"]): Vehicle[] {
  const copy = [...items];
  switch (sort) {
    case "price_asc":
      return copy.sort((a, b) => a.price - b.price);
    case "price_desc":
      return copy.sort((a, b) => b.price - a.price);
    case "mileage_asc":
      return copy.sort((a, b) => a.mileageKm - b.mileageKm);
    case "year_desc":
      return copy.sort((a, b) => b.modelYear - a.modelYear);
    case "recent":
    default:
      return copy.sort(
        (a, b) => new Date(b.enteredStockAt).getTime() - new Date(a.enteredStockAt).getTime()
      );
  }
}

export async function getVehicleBySlug(slug: string): Promise<Vehicle | undefined> {
  const db = await readDb();
  return db.vehicles.find((v) => v.slug === slug);
}

export async function getVehicleById(id: string): Promise<Vehicle | undefined> {
  const db = await readDb();
  return db.vehicles.find((v) => v.id === id);
}

export async function listBrands(): Promise<string[]> {
  const db = await readDb();
  return Array.from(new Set(db.vehicles.map((v) => v.brand))).sort();
}

export async function createVehicle(input: VehicleInput): Promise<Vehicle> {
  const db = await readDb();
  const id = genId("veh");
  const now = new Date().toISOString();
  const vehicle: Vehicle = {
    ...input,
    id,
    slug: uniqueSlug(db.vehicles, vehicleSlug(input)),
    source: input.source ?? "SITE",
    createdAt: now,
    updatedAt: now,
    photos: (input.photos ?? []).map((p, i) => ({
      id: `${id}_photo_${i}`,
      url: p.url,
      position: i,
      isCover: p.isCover ?? i === 0,
    })),
  };
  db.vehicles.unshift(vehicle);
  await writeDb(db);
  return vehicle;
}

export async function updateVehicle(id: string, input: Partial<VehicleInput>): Promise<Vehicle | undefined> {
  const db = await readDb();
  const idx = db.vehicles.findIndex((v) => v.id === id);
  if (idx === -1) return undefined;
  const current = db.vehicles[idx];
  const merged: Vehicle = {
    ...current,
    ...input,
    photos: input.photos
      ? input.photos.map((p, i) => ({
          id: `${id}_photo_${i}`,
          url: p.url,
          position: i,
          isCover: p.isCover ?? i === 0,
        }))
      : current.photos,
    updatedAt: new Date().toISOString(),
  };
  db.vehicles[idx] = merged;
  await writeDb(db);
  return merged;
}

export type DeleteVehicleResult =
  | { ok: true }
  | { ok: false; reason: "not_found" | "linked_to_sale" };

// Nunca deixa excluir um veículo que já está vinculado a uma venda (Negotiation)
// registrada — foi exatamente assim que duas vendas reais (com contrato e
// documentos anexados) ficaram com o veículo "quebrado" numa ocasião
// anterior: alguém excluiu o carro do estoque sem saber que ele já tinha
// venda associada. Se o carro não deveria mais aparecer, o caminho correto é
// marcar o status como "Vendido", não excluir o registro.
export async function deleteVehicle(id: string): Promise<DeleteVehicleResult> {
  const db = await readDb();
  if (!db.vehicles.some((v) => v.id === id)) return { ok: false, reason: "not_found" };
  if (db.negotiations.some((n) => n.vehicleId === id)) {
    return { ok: false, reason: "linked_to_sale" };
  }
  db.vehicles = db.vehicles.filter((v) => v.id !== id);
  await writeDb(db);
  return { ok: true };
}

// Um carro que entrou no estoque por outro caminho (ex: recebido em troca,
// ver createNegotiation) pode ser o MESMO carro que acabou de aparecer num
// anúncio do Mercado Livre — casa por marca/modelo/ano quando o veículo
// ainda não tem mercadoLivreId, pra virar um merge em vez de uma linha
// duplicada no estoque.
function findUnlinkedStockMatch(vehicles: Vehicle[], incoming: Vehicle): Vehicle | undefined {
  return vehicles.find(
    (v) =>
      v.mercadoLivreId == null &&
      v.brand.trim().toLowerCase() === incoming.brand.trim().toLowerCase() &&
      v.model.trim().toLowerCase() === incoming.model.trim().toLowerCase() &&
      v.manufactureYear === incoming.manufactureYear &&
      v.modelYear === incoming.modelYear
  );
}

// Reimporta os anúncios ativos da loja no Mercado Livre (ver
// seed-mercadolivre.ts) para o estoque. Faz upsert por mercadoLivreId — um
// anúncio já importado tem seus dados atualizados (inclui reprecificação)
// em vez de duplicar; um anúncio novo cujo carro já está cadastrado no
// estoque (ex: chegou como troca e depois foi anunciado no ML) é mesclado
// na entrada existente em vez de criar uma linha duplicada — só então um
// anúncio realmente novo vira uma linha nova. O status (disponível,
// reservado, em preparação, vendido) é sempre decidido por aqui, nunca pelo
// anúncio: uma edição manual (ex: tirar do site colocando "Em preparação")
// nunca é desfeita por uma reimportação futura.
export async function importMercadoLivreVehicles(): Promise<{
  imported: number;
  updated: number;
  merged: number;
  removed: number;
}> {
  const db = await readDb();
  let imported = 0;
  let updated = 0;
  let merged = 0;

  for (const incoming of mercadoLivreSeedVehicles) {
    const idx = db.vehicles.findIndex((v) => v.mercadoLivreId === incoming.mercadoLivreId);
    if (idx === -1) {
      const existingMatch = findUnlinkedStockMatch(db.vehicles, incoming);
      if (existingMatch) {
        const mIdx = db.vehicles.findIndex((v) => v.id === existingMatch.id);
        db.vehicles[mIdx] = {
          ...incoming,
          id: existingMatch.id,
          slug: existingMatch.slug,
          status: existingMatch.status,
          soldAt: existingMatch.soldAt,
          createdAt: existingMatch.createdAt,
          updatedAt: new Date().toISOString(),
        };
        merged += 1;
        continue;
      }
      db.vehicles.push({ ...incoming, id: genId("veh_ml") });
      imported += 1;
    } else {
      const current = db.vehicles[idx];
      db.vehicles[idx] = {
        ...incoming,
        id: current.id,
        slug: current.slug,
        status: current.status,
        soldAt: current.soldAt,
        createdAt: current.createdAt,
        updatedAt: new Date().toISOString(),
      };
      updated += 1;
    }
  }

  const activeIds = new Set(mercadoLivreSeedVehicles.map((v) => v.mercadoLivreId));
  const before = db.vehicles.length;
  db.vehicles = db.vehicles.filter(
    (v) => v.source !== "MERCADO_LIVRE" || v.status === "SOLD" || activeIds.has(v.mercadoLivreId)
  );
  const removed = before - db.vehicles.length;

  await writeDb(db);
  return { imported, updated, merged, removed };
}

function uniqueSlug(existing: Vehicle[], slug: string): string {
  let candidate = slug;
  let n = 2;
  while (existing.some((v) => v.slug === candidate)) {
    candidate = `${slug}-${n}`;
    n += 1;
  }
  return candidate;
}

// --- Leads --------------------------------------------------------------

export async function createLead(
  input: Omit<Lead, "id" | "createdAt" | "stage"> & { stage?: Lead["stage"] }
): Promise<Lead> {
  const db = await readDb();
  const lead: Lead = {
    ...input,
    id: genId("lead"),
    stage: input.stage ?? "NEW",
    createdAt: new Date().toISOString(),
  };
  db.leads.unshift(lead);
  await writeDb(db);
  return lead;
}

export async function listLeads(): Promise<Lead[]> {
  const db = await readDb();
  return db.leads;
}

export async function getLeadById(id: string): Promise<Lead | undefined> {
  return (await readDb()).leads.find((l) => l.id === id);
}

export async function createLeadManual(input: LeadManualInput): Promise<Lead> {
  return createLead({
    name: input.name,
    phone: input.phone,
    email: input.email ?? null,
    vehicleId: input.vehicleId ?? null,
    origin: "SITE",
    status: "NEW_LEAD",
    ownerId: input.ownerId ?? null,
    channel: input.channel,
    campaignId: input.campaignId ?? null,
    message: input.message ?? null,
  });
}

async function touchLead(db: DbShape, id: string, patch: Partial<Lead>): Promise<Lead | undefined> {
  const idx = db.leads.findIndex((l) => l.id === id);
  if (idx === -1) return undefined;
  db.leads[idx] = { ...db.leads[idx], ...patch, updatedAt: new Date().toISOString() };
  await writeDb(db);
  return db.leads[idx];
}

export async function updateLead(id: string, patch: Partial<Lead>): Promise<Lead | undefined> {
  const db = await readDb();
  return touchLead(db, id, patch);
}

// Avança o lead para uma etapa do funil, carimbando o timestamp da etapa
// (seção 21 do briefing do Dashboard Executivo).
export async function advanceLeadStage(
  id: string,
  stage: "contacted" | "visit" | "testDrive" | "proposal",
  extra: { proposalValue?: number } = {}
): Promise<Lead | undefined> {
  const db = await readDb();
  const now = new Date().toISOString();
  const STAGE_MAP: Record<typeof stage, { status: Lead["status"]; field: keyof Lead }> = {
    contacted: { status: "CONTACTED", field: "contactedAt" },
    visit: { status: "VISITED", field: "visitAt" },
    testDrive: { status: "TEST_DRIVE_DONE", field: "testDriveAt" },
    proposal: { status: "PROPOSAL_SENT", field: "proposalAt" },
  };
  const { status, field } = STAGE_MAP[stage];
  const patch: Partial<Lead> = { status, [field]: now };
  if (stage === "proposal" && extra.proposalValue != null) patch.proposalValue = extra.proposalValue;
  return touchLead(db, id, patch);
}

export async function markLeadSold(
  id: string,
  input: { finalPrice: number; paymentMethod: string }
): Promise<{ lead: Lead; sale: Sale } | undefined> {
  const db = await readDb();
  const leadIdx = db.leads.findIndex((l) => l.id === id);
  if (leadIdx === -1) return undefined;
  const lead = db.leads[leadIdx];
  if (!lead.vehicleId || !lead.ownerId || !lead.channel) return undefined;

  const now = new Date().toISOString();
  const sale: Sale = {
    id: genId("sale"),
    leadId: lead.id,
    vehicleId: lead.vehicleId,
    ownerId: lead.ownerId,
    channel: lead.channel,
    campaignId: lead.campaignId ?? null,
    finalPrice: input.finalPrice,
    paymentMethod: input.paymentMethod,
    soldAt: now,
  };
  db.sales.unshift(sale);

  db.leads[leadIdx] = { ...lead, status: "SOLD", soldAt: now, updatedAt: now };

  const vehicleIdx = db.vehicles.findIndex((v) => v.id === lead.vehicleId);
  if (vehicleIdx !== -1) {
    db.vehicles[vehicleIdx] = { ...db.vehicles[vehicleIdx], status: "SOLD", soldAt: now, updatedAt: now };
  }

  await writeDb(db);
  return { lead: db.leads[leadIdx], sale };
}

export async function markLeadLost(id: string, reason: NonNullable<Lead["lostReason"]>): Promise<Lead | undefined> {
  const db = await readDb();
  const now = new Date().toISOString();
  return touchLead(db, id, { status: "LOST", lostAt: now, lostReason: reason });
}

// --- Dashboard Executivo: vendedores, marketing e vendas -------------------

export async function listSalespeople(): Promise<Salesperson[]> {
  return (await readDb()).salespeople;
}

export async function getSalespersonById(id: string): Promise<Salesperson | undefined> {
  return (await readDb()).salespeople.find((s) => s.id === id);
}

export async function createSalesperson(input: SalespersonInput): Promise<Salesperson> {
  const db = await readDb();
  const salesperson: Salesperson = { ...input, id: genId("sp"), createdAt: new Date().toISOString() };
  db.salespeople.push(salesperson);
  await writeDb(db);
  return salesperson;
}

export async function updateSalesperson(id: string, input: Partial<SalespersonInput>): Promise<Salesperson | undefined> {
  const db = await readDb();
  const idx = db.salespeople.findIndex((s) => s.id === id);
  if (idx === -1) return undefined;
  db.salespeople[idx] = { ...db.salespeople[idx], ...input };
  await writeDb(db);
  return db.salespeople[idx];
}

export async function deleteSalesperson(id: string): Promise<boolean> {
  const db = await readDb();
  const before = db.salespeople.length;
  db.salespeople = db.salespeople.filter((s) => s.id !== id);
  await writeDb(db);
  return db.salespeople.length < before;
}

export async function listMarketingCampaigns(): Promise<MarketingCampaign[]> {
  return (await readDb()).marketingCampaigns;
}

export async function getMarketingCampaignById(id: string): Promise<MarketingCampaign | undefined> {
  return (await readDb()).marketingCampaigns.find((c) => c.id === id);
}

export async function createMarketingCampaign(input: MarketingCampaignInput): Promise<MarketingCampaign> {
  const db = await readDb();
  const campaign: MarketingCampaign = { ...input, id: genId("camp") };
  db.marketingCampaigns.push(campaign);
  await writeDb(db);
  return campaign;
}

export async function updateMarketingCampaign(
  id: string,
  input: Partial<MarketingCampaignInput>
): Promise<MarketingCampaign | undefined> {
  const db = await readDb();
  const idx = db.marketingCampaigns.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  db.marketingCampaigns[idx] = { ...db.marketingCampaigns[idx], ...input };
  await writeDb(db);
  return db.marketingCampaigns[idx];
}

export async function deleteMarketingCampaign(id: string): Promise<boolean> {
  const db = await readDb();
  const before = db.marketingCampaigns.length;
  db.marketingCampaigns = db.marketingCampaigns.filter((c) => c.id !== id);
  await writeDb(db);
  return db.marketingCampaigns.length < before;
}

export async function listSales(): Promise<Sale[]> {
  return (await readDb()).sales;
}

export async function getDashboardGoals(): Promise<DashboardGoals> {
  return (await readDb()).dashboardGoals;
}

export async function updateDashboardGoals(input: DashboardGoals): Promise<DashboardGoals> {
  const db = await readDb();
  db.dashboardGoals = input;
  await writeDb(db);
  return db.dashboardGoals;
}

// --- Métricas para o dashboard admin (seção 16) --------------------------

export async function getDashboardMetrics() {
  const db = await readDb();
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const leadsToday = db.leads.filter((l) => new Date(l.createdAt) >= startOfDay).length;
  const leadsMonth = db.leads.filter((l) => new Date(l.createdAt) >= startOfMonth).length;
  const sales = db.vehicles.filter((v) => v.status === "SOLD").length;
  const available = db.vehicles.filter((v) => v.status === "AVAILABLE").length;

  const now = Date.now();
  const bucket = (min: number, max: number) =>
    db.vehicles.filter((v) => {
      if (v.status === "SOLD") return false;
      const days = (now - new Date(v.enteredStockAt).getTime()) / 86400000;
      return days >= min && days < max;
    }).length;

  return {
    leadsToday,
    leadsMonth,
    appointments: 0,
    proposals: 0,
    sales,
    conversionRate: leadsMonth > 0 ? Math.round((sales / leadsMonth) * 100) : 0,
    stockTotal: db.vehicles.filter((v) => v.status !== "SOLD").length,
    stockAvailable: available,
    stock0to30: bucket(0, 30),
    stock31to60: bucket(30, 60),
    stock61to90: bucket(60, 90),
    stock90plus: bucket(90, Infinity),
  };
}

// --- Análise Inteligente de Crédito (seções 1-12) ------------------------

export async function createCreditCustomer(input: Omit<CreditCustomer, "id" | "createdAt">): Promise<CreditCustomer> {
  const db = await readDb();
  const customer: CreditCustomer = { ...input, id: genId("cust"), createdAt: new Date().toISOString() };
  db.creditCustomers.unshift(customer);
  await writeDb(db);
  return customer;
}

export async function getCreditCustomerById(id: string): Promise<CreditCustomer | undefined> {
  return (await readDb()).creditCustomers.find((c) => c.id === id);
}

export async function listCreditCustomers(): Promise<CreditCustomer[]> {
  return (await readDb()).creditCustomers;
}

export async function createConsentRecord(
  input: Omit<CreditConsentRecord, "id" | "createdAt">
): Promise<CreditConsentRecord> {
  const db = await readDb();
  const record: CreditConsentRecord = { ...input, id: genId("consent"), createdAt: new Date().toISOString() };
  db.consentRecords.unshift(record);
  await writeDb(db);
  return record;
}

export async function createCreditAnalysis(input: Omit<CreditAnalysis, "id" | "createdAt">): Promise<CreditAnalysis> {
  const db = await readDb();
  const analysis: CreditAnalysis = { ...input, id: genId("credit"), createdAt: new Date().toISOString() };
  db.creditAnalyses.unshift(analysis);
  await writeDb(db);
  return analysis;
}

export async function getCreditAnalysisById(id: string): Promise<CreditAnalysis | undefined> {
  return (await readDb()).creditAnalyses.find((a) => a.id === id);
}

export async function listCreditAnalyses(filters: { sellerId?: string } = {}): Promise<CreditAnalysis[]> {
  const db = await readDb();
  let items = db.creditAnalyses;
  if (filters.sellerId) items = items.filter((a) => a.sellerId === filters.sellerId);
  return items;
}

export async function listCreditAnalysesByCustomer(customerId: string): Promise<CreditAnalysis[]> {
  return (await readDb()).creditAnalyses.filter((a) => a.customerId === customerId);
}

export async function updateCreditAnalysisCommercialStatus(
  id: string,
  status: CommercialStatus
): Promise<CreditAnalysis | undefined> {
  const db = await readDb();
  const idx = db.creditAnalyses.findIndex((a) => a.id === id);
  if (idx === -1) return undefined;
  db.creditAnalyses[idx] = { ...db.creditAnalyses[idx], commercialStatus: status };
  await writeDb(db);
  return db.creditAnalyses[idx];
}

// --- Auditoria (seção 13 — logs de acesso e de consultas) ----------------

const AUDIT_LOG_RETENTION = 500;

export async function appendAuditLog(entry: Omit<AuditLogEntry, "id" | "createdAt">): Promise<void> {
  const db = await readDb();
  db.auditLogs.unshift({ ...entry, id: genId("log"), createdAt: new Date().toISOString() });
  db.auditLogs = db.auditLogs.slice(0, AUDIT_LOG_RETENTION);
  await writeDb(db);
}

export async function listAuditLogs(limit = 50): Promise<AuditLogEntry[]> {
  return (await readDb()).auditLogs.slice(0, limit);
}

// --- Métricas do dashboard gerencial de crédito (seção 15) ---------------
//
// Calculadas exclusivamente a partir de registros reais do mock store —
// nunca um número fixo/fabricado. Campos retornam `null` quando não há
// dados suficientes para um cálculo (ex: taxa de aprovação sem nenhum caso
// decidido ainda), em vez de mostrar um 0% enganoso.

export async function getCreditDashboardMetrics() {
  const analyses = (await readDb()).creditAnalyses;

  const totalQueries = analyses.length;
  const forwarded = analyses.filter((a) => a.commercialStatus !== "NEW").length;
  const approved = analyses.filter((a) => a.commercialStatus === "APPROVED_BY_FINANCIER").length;
  const rejected = analyses.filter((a) => a.commercialStatus === "REJECTED_BY_FINANCIER").length;
  const decided = approved + rejected;
  const salesCompleted = analyses.filter((a) => a.commercialStatus === "SALE_COMPLETED");

  const financedTotal = salesCompleted.reduce(
    (sum, a) => sum + Math.max(a.vehiclePrice - a.downPayment, 0),
    0
  );

  const byScoreRange = { ate500: 0, de500a700: 0, acima700: 0 };
  for (const a of analyses) {
    const score = a.report.score;
    if (score == null) continue;
    if (score < 500) byScoreRange.ate500 += 1;
    else if (score < 700) byScoreRange.de500a700 += 1;
    else byScoreRange.acima700 += 1;
  }

  return {
    totalQueries,
    forwarded,
    approved,
    rejected,
    approvalRate: decided > 0 ? Math.round((approved / decided) * 100) : null,
    salesCompleted: salesCompleted.length,
    averageFinancedTicket: salesCompleted.length > 0 ? financedTotal / salesCompleted.length : null,
    byScoreRange,
  };
}

// ---------------------------------------------------------------------------
// Assistente de Documentação — checklist por negociação (ver
// lib/server/documentChecklist.ts para a geração de itens, cálculo de
// progresso e classificação de pendência; nada aqui é IA/OCR real).
// ---------------------------------------------------------------------------

function nextNegotiationCode(db: DbShape): string {
  let max = 1023;
  for (const n of db.negotiations) {
    const num = parseInt(n.code.replace("#", ""), 10);
    if (!Number.isNaN(num) && num > max) max = num;
  }
  return `#${max + 1}`;
}

// Todo carro que entra na loja como troca (numa venda ou num contrato de
// venda e troca) vira automaticamente um veículo no estoque interno —
// nunca no Mercado Livre, então nunca aparece no site público — como "Em
// preparação", já que specs como versão/carroceria/câmbio/combustível/cor
// não são coletadas na avaliação de troca e precisam ser conferidas por
// alguém antes de colocar o carro à venda. Casa por placa pra não duplicar
// se a mesma troca for reprocessada (ex: editar o mesmo contrato de novo).
function pushTradeInVehicleToStock(
  db: DbShape,
  t: { brand: string; model: string; manufactureYear: number; modelYear: number; mileageKm: number; plate: string; value: number },
  now: string
) {
  if (t.plate && db.vehicles.some((v) => v.plate && v.plate.toUpperCase() === t.plate.toUpperCase())) return;

  const vehicleId = genId("veh");
  db.vehicles.unshift({
    id: vehicleId,
    slug: uniqueSlug(db.vehicles, vehicleSlug({ brand: t.brand, model: t.model, version: "", modelYear: t.modelYear })),
    brand: t.brand,
    model: t.model,
    version: "",
    bodyType: "SEDAN",
    manufactureYear: t.manufactureYear,
    modelYear: t.modelYear,
    mileageKm: t.mileageKm,
    price: t.value,
    costPrice: t.value,
    transmission: "AUTOMATIC",
    fuel: "FLEX",
    color: "",
    plate: t.plate,
    doors: 4,
    features: [],
    status: "PREPARING",
    enteredStockAt: now,
    createdAt: now,
    updatedAt: now,
    photos: [],
    source: "SITE",
  });
}

export async function createNegotiation(input: NegotiationInput): Promise<Negotiation> {
  const db = await readDb();
  const id = genId("neg");
  const now = new Date().toISOString();
  const negotiation: Negotiation = {
    ...input,
    id,
    code: nextNegotiationCode(db),
    transferStage: "SALE_DONE",
    status: "IN_PROGRESS",
    createdAt: now,
    updatedAt: now,
  };
  db.negotiations.unshift(negotiation);

  const templates = buildChecklistTemplates();
  const items: ChecklistItem[] = templates.map((t) => ({
    id: genId(`${id}_item`),
    negotiationId: id,
    category: t.category,
    key: t.key,
    label: t.label,
    required: t.required ?? true,
    status: "PENDING",
    responsible: null,
    dueDate: null,
    note: null,
    documentIds: [],
    updatedAt: now,
  }));
  db.checklistItems.push(...items);

  db.negotiationHistory.unshift({
    id: genId("hist"),
    negotiationId: id,
    message: "Venda cadastrada",
    actor: input.sellerName,
    createdAt: now,
  });

  // Os dados do cliente preenchidos na venda também alimentam o cadastro em
  // "Clientes" — casa por CPF/CNPJ (dígitos) para não duplicar quem já
  // comprou antes; CNH fica em branco aqui e pode ser preenchida depois na
  // própria aba Clientes.
  const customerIdx = db.salesCustomers.findIndex(
    (c) => onlyDigits(c.document) === onlyDigits(input.customerDocument)
  );
  const customerFields = {
    name: input.customerName,
    document: input.customerDocument,
    phone: input.customerPhone,
    email: input.customerEmail ?? null,
    address: input.customerAddress,
    cep: input.customerCep,
  };
  if (customerIdx === -1) {
    db.salesCustomers.unshift({
      id: genId("cust_sale"),
      ...customerFields,
      cnhNumber: "",
      createdAt: now,
      updatedAt: now,
    });
  } else {
    db.salesCustomers[customerIdx] = { ...db.salesCustomers[customerIdx], ...customerFields, updatedAt: now };
  }

  if (input.hasTradeIn && input.tradeIn) {
    const t = input.tradeIn;
    pushTradeInVehicleToStock(
      db,
      {
        brand: t.brand,
        model: t.model,
        manufactureYear: t.manufactureYear,
        modelYear: t.modelYear,
        mileageKm: t.mileageKm,
        plate: t.plate,
        value: t.approvedValue ?? t.storeAppraisalValue ?? t.requestedValue,
      },
      now
    );
  }

  await writeDb(db);
  return negotiation;
}

export async function listNegotiations(filters: NegotiationFilters = {}): Promise<Negotiation[]> {
  const db = await readDb();
  return db.negotiations.filter((n) => {
    if (filters.q) {
      const q = filters.q.toLowerCase();
      const vehicle = db.vehicles.find((v) => v.id === n.vehicleId);
      const haystack = [
        n.code,
        n.customerName,
        n.customerDocument,
        n.customerPhone,
        n.sellerName,
        n.tradeIn?.plate,
        vehicle ? `${vehicle.brand} ${vehicle.model} ${vehicle.version}` : "",
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!haystack.includes(q)) return false;
    }
    if (filters.sellerId && n.sellerId !== filters.sellerId) return false;
    if (filters.vehicleId && n.vehicleId !== filters.vehicleId) return false;
    if (filters.status && n.status !== filters.status) return false;
    if (filters.paymentMethod && n.paymentMethod !== filters.paymentMethod) return false;
    if (
      filters.financierName &&
      n.financing?.financierName.toLowerCase() !== filters.financierName.toLowerCase()
    )
      return false;
    if (
      filters.documentationResponsible &&
      n.documentationResponsible?.toLowerCase() !== filters.documentationResponsible.toLowerCase()
    )
      return false;
    if (filters.dateFrom && n.createdAt < filters.dateFrom) return false;
    if (filters.dateTo && n.createdAt > filters.dateTo) return false;
    if (filters.bucket) {
      const items = db.checklistItems.filter((i) => i.negotiationId === n.id);
      if (classifyNegotiation(items) !== filters.bucket) return false;
    }
    return true;
  });
}

export async function getNegotiationById(id: string): Promise<Negotiation | undefined> {
  return (await readDb()).negotiations.find((n) => n.id === id);
}

export async function getChecklistItems(negotiationId: string): Promise<ChecklistItem[]> {
  return (await readDb()).checklistItems.filter((i) => i.negotiationId === negotiationId);
}

export async function getNegotiationDocuments(negotiationId: string): Promise<NegotiationDocument[]> {
  return (await readDb()).negotiationDocuments.filter((d) => d.negotiationId === negotiationId);
}

export async function getNegotiationDocumentById(id: string): Promise<NegotiationDocument | undefined> {
  return (await readDb()).negotiationDocuments.find((d) => d.id === id);
}

export async function getNegotiationHistory(negotiationId: string): Promise<NegotiationHistoryEvent[]> {
  return (await readDb()).negotiationHistory
    .filter((h) => h.negotiationId === negotiationId)
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

function appendHistory(db: DbShape, negotiationId: string, message: string, actor: string) {
  db.negotiationHistory.unshift({
    id: genId("hist"),
    negotiationId,
    message,
    actor,
    createdAt: new Date().toISOString(),
  });
}

export async function updateNegotiation(
  id: string,
  patch: Partial<
    Pick<
      Negotiation,
      | "customerKind"
      | "customerName"
      | "customerDocument"
      | "customerPhone"
      | "customerEmail"
      | "customerAddress"
      | "customerCep"
      | "hasRepresentativeProcuration"
      | "vehicleId"
      | "sellerId"
      | "sellerName"
      | "saleValue"
      | "paymentMethod"
      | "financing"
      | "hasTradeIn"
      | "tradeIn"
      | "vehicleCondition"
      | "needsTransfer"
      | "interstate"
      | "needsCourier"
      | "transferStage"
      | "documentationResponsible"
    >
  >,
  opts: { actor: string; historyMessage?: string }
): Promise<Negotiation | undefined> {
  const db = await readDb();
  const idx = db.negotiations.findIndex((n) => n.id === id);
  if (idx === -1) return undefined;
  db.negotiations[idx] = { ...db.negotiations[idx], ...patch, updatedAt: new Date().toISOString() };
  if (opts.historyMessage) appendHistory(db, id, opts.historyMessage, opts.actor);
  await writeDb(db);
  return db.negotiations[idx];
}

export async function updateChecklistItem(
  negotiationId: string,
  itemId: string,
  patch: { status?: ChecklistItem["status"]; responsible?: string | null; dueDate?: string | null; note?: string | null },
  actor: string
): Promise<ChecklistItem | undefined> {
  const db = await readDb();
  const itemIdx = db.checklistItems.findIndex((i) => i.id === itemId && i.negotiationId === negotiationId);
  if (itemIdx === -1) return undefined;

  const current = db.checklistItems[itemIdx];
  const updated: ChecklistItem = { ...current, ...patch, updatedAt: new Date().toISOString() };
  db.checklistItems[itemIdx] = updated;

  if (patch.status && patch.status !== current.status) {
    appendHistory(
      db,
      negotiationId,
      `${current.label}: ${current.status} → ${patch.status}${patch.note ? ` (${patch.note})` : ""}`,
      actor
    );
  }

  const negIdx = db.negotiations.findIndex((n) => n.id === negotiationId);
  if (negIdx !== -1) {
    const negotiation = db.negotiations[negIdx];
    if (negotiation.status === "IN_PROGRESS" || negotiation.status === "READY_FOR_DELIVERY") {
      const items = db.checklistItems.filter((i) => i.negotiationId === negotiationId);
      const ready = isDeliveryReady(items);
      const nextStatus = ready ? "READY_FOR_DELIVERY" : "IN_PROGRESS";
      if (nextStatus !== negotiation.status) {
        db.negotiations[negIdx] = { ...negotiation, status: nextStatus, updatedAt: new Date().toISOString() };
        appendHistory(
          db,
          negotiationId,
          ready ? "Documentação completa — veículo liberado para entrega" : "Documentação deixou de estar completa",
          actor
        );
      }
    }
  }

  await writeDb(db);
  return updated;
}

export async function markNegotiationDelivered(
  id: string,
  actor: string
): Promise<{ ok: boolean; reason?: string; negotiation?: Negotiation }> {
  const db = await readDb();
  const idx = db.negotiations.findIndex((n) => n.id === id);
  if (idx === -1) return { ok: false, reason: "Venda não encontrada." };
  const negotiation = db.negotiations[idx];
  if (negotiation.status === "DELIVERED") return { ok: false, reason: "Veículo já entregue." };
  const items = db.checklistItems.filter((i) => i.negotiationId === id);
  if (!isDeliveryReady(items)) {
    return { ok: false, reason: "Ainda há pendências obrigatórias no checklist." };
  }
  const now = new Date().toISOString();

  // O carro sai do estoque disponível assim que a venda é entregue — sem
  // isso, o veículo ficava "Disponível" para sempre mesmo já vendido (uma
  // venda real ficou assim por dias até quase ser apagada por uma
  // resincronização do Mercado Livre, já que anúncios encerrados só são
  // protegidos de remoção quando o veículo está marcado como SOLD).
  const vehicleIdx = db.vehicles.findIndex((v) => v.id === negotiation.vehicleId);
  if (vehicleIdx !== -1 && db.vehicles[vehicleIdx].status !== "SOLD") {
    db.vehicles[vehicleIdx] = { ...db.vehicles[vehicleIdx], status: "SOLD", soldAt: now, updatedAt: now };
  }

  db.negotiations[idx] = {
    ...negotiation,
    status: "DELIVERED",
    transferStage: negotiation.needsTransfer ? negotiation.transferStage : "COMPLETED",
    updatedAt: now,
  };
  appendHistory(db, id, "Veículo entregue ao cliente", actor);
  await writeDb(db);
  return { ok: true, negotiation: db.negotiations[idx] };
}

const ACCEPTED_DOCUMENT_MIME_TYPES = ["application/pdf", "image/jpeg", "image/png"];
const MAX_DOCUMENT_SIZE_BYTES = 15 * 1024 * 1024;

export function isAcceptedDocumentFile(mimeType: string, sizeBytes: number): { ok: boolean; reason?: string } {
  if (!ACCEPTED_DOCUMENT_MIME_TYPES.includes(mimeType)) {
    return { ok: false, reason: "Formato não aceito. Envie PDF, JPG ou PNG." };
  }
  if (sizeBytes > MAX_DOCUMENT_SIZE_BYTES) {
    return { ok: false, reason: "Arquivo maior que 15 MB." };
  }
  return { ok: true };
}

export async function addNegotiationDocument(
  input: Omit<NegotiationDocument, "id" | "uploadedAt">
): Promise<{ document: NegotiationDocument; duplicate: boolean }> {
  const db = await readDb();
  const duplicate = db.negotiationDocuments.some(
    (d) => d.negotiationId === input.negotiationId && d.sha256 === input.sha256
  );
  const document: NegotiationDocument = { ...input, id: genId("doc"), uploadedAt: new Date().toISOString() };
  db.negotiationDocuments.unshift(document);

  if (input.itemKey) {
    const itemIdx = db.checklistItems.findIndex(
      (i) => i.negotiationId === input.negotiationId && i.key === input.itemKey
    );
    if (itemIdx !== -1) {
      const item = db.checklistItems[itemIdx];
      db.checklistItems[itemIdx] = {
        ...item,
        documentIds: [...item.documentIds, document.id],
        status: item.status === "PENDING" ? "RECEIVED" : item.status,
        updatedAt: new Date().toISOString(),
      };
    }
  }

  appendHistory(
    db,
    input.negotiationId,
    `${input.fileName} anexado${duplicate ? " (arquivo já enviado antes — possível duplicidade)" : ""}`,
    input.uploadedBy
  );

  await writeDb(db);
  return { document, duplicate };
}

export async function deleteNegotiationDocument(id: string, actor: string): Promise<NegotiationDocument | undefined> {
  const db = await readDb();
  const idx = db.negotiationDocuments.findIndex((d) => d.id === id);
  if (idx === -1) return undefined;
  const [removed] = db.negotiationDocuments.splice(idx, 1);

  const itemIdx = db.checklistItems.findIndex(
    (i) => i.negotiationId === removed.negotiationId && i.documentIds.includes(id)
  );
  if (itemIdx !== -1) {
    const item = db.checklistItems[itemIdx];
    db.checklistItems[itemIdx] = {
      ...item,
      documentIds: item.documentIds.filter((docId) => docId !== id),
      updatedAt: new Date().toISOString(),
    };
  }

  appendHistory(db, removed.negotiationId, `${removed.fileName} excluído`, actor);
  await writeDb(db);
  return removed;
}

// --- Dashboard do Assistente de Documentação (seções 1, 21) ----------------
//
// Toda contagem vem de negociações e itens de checklist reais do mock
// store — nenhum número fixo. Cada negociação ativa cai em exatamente um
// balde de prioridade (classifyNegotiation), como no exemplo do briefing.

export async function getNegotiationDashboardMetrics() {
  const db = await readDb();
  const active = db.negotiations.filter((n) => n.status === "IN_PROGRESS" || n.status === "READY_FOR_DELIVERY");

  const buckets = { CRITICAL: 0, AWAITING_BANK: 0, AWAITING_COURIER: 0, AWAITING_CLIENT: 0, PENDING: 0, READY: 0 };
  for (const n of active) {
    const items = db.checklistItems.filter((i) => i.negotiationId === n.id);
    buckets[classifyNegotiation(items)] += 1;
  }

  return {
    inProgress: active.length,
    complete: buckets.READY,
    pending: buckets.PENDING,
    awaitingClient: buckets.AWAITING_CLIENT,
    awaitingBank: buckets.AWAITING_BANK,
    awaitingCourier: buckets.AWAITING_COURIER,
    readyForDelivery: db.negotiations.filter((n) => n.status === "READY_FOR_DELIVERY").length,
    critical: buckets.CRITICAL,
  };
}

// Indicadores administrativos (seção 21) — retornam `null` quando não há
// dados suficientes (ex: nenhuma venda entregue ainda), em vez de um número
// enganoso, mesma disciplina de getCreditDashboardMetrics.
export async function getNegotiationIndicators() {
  const db = await readDb();
  const delivered = db.negotiations.filter((n) => n.status === "DELIVERED");
  const avgDaysToComplete =
    delivered.length > 0
      ? delivered.reduce((sum, n) => {
          const days = (new Date(n.updatedAt).getTime() - new Date(n.createdAt).getTime()) / 86400000;
          return sum + days;
        }, 0) / delivered.length
      : null;

  const now = Date.now();
  const stuckCount = db.negotiations.filter(
    (n) => n.status === "IN_PROGRESS" && (now - new Date(n.createdAt).getTime()) / 86400000 > 14
  ).length;

  const missingByLabel = new Map<string, number>();
  const missingBySeller = new Map<string, number>();
  const active = db.negotiations.filter((n) => n.status === "IN_PROGRESS" || n.status === "READY_FOR_DELIVERY");
  for (const n of active) {
    const items = db.checklistItems.filter((i) => i.negotiationId === n.id);
    const missing = items.filter((i) => i.required && i.status !== "APPROVED" && i.status !== "NOT_APPLICABLE");
    if (missing.length > 0) {
      missingBySeller.set(n.sellerName, (missingBySeller.get(n.sellerName) ?? 0) + missing.length);
    }
    for (const item of missing) {
      missingByLabel.set(item.label, (missingByLabel.get(item.label) ?? 0) + 1);
    }
  }

  const topMissingDocuments = Array.from(missingByLabel.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([label, count]) => ({ label, count }));

  const pendingBySeller = Array.from(missingBySeller.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([sellerName, count]) => ({ sellerName, count }));

  const pendingByFinancier = new Map<string, number>();
  for (const n of active) {
    if (!n.financing) continue;
    const items = db.checklistItems.filter((i) => i.negotiationId === n.id && i.category === "FINANCIAMENTO");
    const missing = items.filter((i) => i.required && i.status !== "APPROVED" && i.status !== "NOT_APPLICABLE").length;
    if (missing > 0) {
      pendingByFinancier.set(n.financing.financierName, (pendingByFinancier.get(n.financing.financierName) ?? 0) + missing);
    }
  }

  const transfersInProgress = db.negotiations.filter(
    (n) => n.needsTransfer && n.transferStage !== "COMPLETED" && n.status !== "DELIVERED" && n.status !== "CANCELLED"
  ).length;

  const expiredDocuments = 0; // requer data de emissão do documento — não coletada nesta fase

  const vehiclesAwaitingRelease = db.negotiations.filter((n) => n.status === "READY_FOR_DELIVERY").length;

  return {
    avgDaysToComplete,
    stuckCount,
    topMissingDocuments,
    pendingBySeller,
    pendingByFinancier: Array.from(pendingByFinancier.entries()).map(([financierName, count]) => ({ financierName, count })),
    transfersInProgress,
    expiredDocuments,
    vehiclesAwaitingRelease,
  };
}

// ---------------------------------------------------------------------------
// Precificação — vínculo FIPE, histórico de consultas e amostras de preço
// de mercado registradas manualmente (ver lib/server/fipe.ts para a
// integração real com a tabela FIPE; nada aqui é obtido por scraping).
// ---------------------------------------------------------------------------

export async function getFipeLink(vehicleId: string): Promise<FipeVehicleLink | undefined> {
  return (await readDb()).fipeLinks.find((l) => l.vehicleId === vehicleId);
}

export async function setFipeLink(link: Omit<FipeVehicleLink, "updatedAt">): Promise<FipeVehicleLink> {
  const db = await readDb();
  const record: FipeVehicleLink = { ...link, updatedAt: new Date().toISOString() };
  const idx = db.fipeLinks.findIndex((l) => l.vehicleId === link.vehicleId);
  if (idx === -1) db.fipeLinks.push(record);
  else db.fipeLinks[idx] = record;
  await writeDb(db);
  return record;
}

export async function addFipeQuote(input: Omit<FipeQuote, "id" | "queriedAt">): Promise<FipeQuote> {
  const db = await readDb();
  const quote: FipeQuote = { ...input, id: genId("fipe"), queriedAt: new Date().toISOString() };
  db.fipeQuotes.unshift(quote);
  await writeDb(db);
  return quote;
}

export async function getLatestFipeQuote(vehicleId: string): Promise<FipeQuote | undefined> {
  return (await readDb()).fipeQuotes
    .filter((q) => q.vehicleId === vehicleId)
    .sort((a, b) => (a.queriedAt < b.queriedAt ? 1 : -1))[0];
}

export async function listFipeQuoteHistory(vehicleId: string): Promise<FipeQuote[]> {
  return (await readDb()).fipeQuotes
    .filter((q) => q.vehicleId === vehicleId)
    .sort((a, b) => (a.queriedAt < b.queriedAt ? 1 : -1));
}

export async function addMarketPriceSample(input: Omit<MarketPriceSample, "id" | "createdAt">): Promise<MarketPriceSample> {
  const db = await readDb();
  const sample: MarketPriceSample = { ...input, id: genId("mkt"), createdAt: new Date().toISOString() };
  db.marketPriceSamples.unshift(sample);
  await writeDb(db);
  return sample;
}

export async function listMarketPriceSamples(vehicleId: string): Promise<MarketPriceSample[]> {
  return (await readDb()).marketPriceSamples.filter((s) => s.vehicleId === vehicleId);
}

export async function deleteMarketPriceSample(id: string): Promise<boolean> {
  const db = await readDb();
  const before = db.marketPriceSamples.length;
  db.marketPriceSamples = db.marketPriceSamples.filter((s) => s.id !== id);
  await writeDb(db);
  return db.marketPriceSamples.length < before;
}

// --- Notas Fiscais (NF-e) — emissão real pendente de integração com a SEFAZ

export async function getCompanyFiscalProfile(): Promise<CompanyFiscalProfile | null> {
  return (await readDb()).companyFiscalProfile;
}

export async function updateCompanyFiscalProfile(input: CompanyFiscalProfileInput): Promise<CompanyFiscalProfile> {
  const db = await readDb();
  const profile: CompanyFiscalProfile = { ...input, updatedAt: new Date().toISOString() };
  db.companyFiscalProfile = profile;
  await writeDb(db);
  return profile;
}

export async function createInvoice(input: InvoiceInput & { requestedBy: string }): Promise<Invoice> {
  const db = await readDb();
  const invoice: Invoice = {
    id: genId("nfe"),
    saleId: input.saleId ?? null,
    vehicleId: input.vehicleId,
    buyerName: input.buyerName,
    buyerDocument: input.buyerDocument,
    value: input.value,
    notes: input.notes ?? null,
    requestedBy: input.requestedBy,
    status: "PENDING_INTEGRATION",
    createdAt: new Date().toISOString(),
    cancelledAt: null,
    accessKey: null,
    series: null,
    number: null,
    protocol: null,
    xmlUrl: null,
    danfeUrl: null,
    issuedAt: null,
  };
  db.invoices.unshift(invoice);
  await writeDb(db);
  return invoice;
}

export async function listInvoices(): Promise<Invoice[]> {
  return (await readDb()).invoices;
}

export async function getInvoiceById(id: string): Promise<Invoice | undefined> {
  return (await readDb()).invoices.find((i) => i.id === id);
}

export async function cancelInvoice(id: string): Promise<Invoice | undefined> {
  const db = await readDb();
  const idx = db.invoices.findIndex((i) => i.id === id);
  if (idx === -1) return undefined;
  db.invoices[idx] = { ...db.invoices[idx], status: "CANCELLED", cancelledAt: new Date().toISOString() };
  await writeDb(db);
  return db.invoices[idx];
}

// --- Cadastro de clientes (aba "Clientes") ---------------------------------

export async function listSalesCustomers(): Promise<SalesCustomer[]> {
  return (await readDb()).salesCustomers;
}

export async function getSalesCustomerById(id: string): Promise<SalesCustomer | undefined> {
  return (await readDb()).salesCustomers.find((c) => c.id === id);
}

export async function createSalesCustomer(input: SalesCustomerInput): Promise<SalesCustomer> {
  const db = await readDb();
  const now = new Date().toISOString();
  const customer: SalesCustomer = { ...input, id: genId("cust_sale"), createdAt: now, updatedAt: now };
  db.salesCustomers.unshift(customer);
  await writeDb(db);
  return customer;
}

export async function updateSalesCustomer(
  id: string,
  input: SalesCustomerInput
): Promise<SalesCustomer | undefined> {
  const db = await readDb();
  const idx = db.salesCustomers.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  db.salesCustomers[idx] = { ...db.salesCustomers[idx], ...input, updatedAt: new Date().toISOString() };
  await writeDb(db);
  return db.salesCustomers[idx];
}

export async function deleteSalesCustomer(id: string): Promise<boolean> {
  const db = await readDb();
  const before = db.salesCustomers.length;
  db.salesCustomers = db.salesCustomers.filter((c) => c.id !== id);
  await writeDb(db);
  return db.salesCustomers.length < before;
}

// --- Contratos --------------------------------------------------------------

export async function listContracts(): Promise<Contract[]> {
  return (await readDb()).contracts;
}

export async function getContractById(id: string): Promise<Contract | undefined> {
  return (await readDb()).contracts.find((c) => c.id === id);
}

// A pessoa que vende um carro para a loja (consignação ou recibo de compra)
// ou compra um carro da loja (venda e troca) também alimenta o cadastro em
// "Clientes" — mesmo casamento por CPF/CNPJ (dígitos) usado em
// createNegotiation, pra não duplicar quem já é cliente.
function syncContractCustomer(db: DbShape, input: ContractInput, now: string) {
  const f = input.fields;
  let fields: { name: string; document: string; phone: string; address: string; cep: string } | null = null;
  if (input.type === "CONSIGNACAO" && f.consignanteName && f.consignanteCpf) {
    fields = {
      name: f.consignanteName,
      document: f.consignanteCpf,
      phone: f.consignantePhone ?? "",
      address: f.consignanteAddress ?? "",
      cep: "",
    };
  } else if (input.type === "VENDA_TROCA" && f.buyerName && f.buyerCpf) {
    fields = {
      name: f.buyerName,
      document: f.buyerCpf,
      phone: f.buyerPhone ?? "",
      address: f.buyerAddress ?? "",
      cep: f.buyerCep ?? "",
    };
  } else if (input.type === "RECIBO_COMPRA" && f.sellerName && f.sellerCpf) {
    fields = {
      name: f.sellerName,
      document: f.sellerCpf,
      phone: f.sellerPhone ?? "",
      address: f.sellerAddress ?? "",
      cep: f.sellerCep ?? "",
    };
  }
  if (!fields) return;

  const customerIdx = db.salesCustomers.findIndex((c) => onlyDigits(c.document) === onlyDigits(fields!.document));
  if (customerIdx === -1) {
    db.salesCustomers.unshift({
      id: genId("cust_sale"),
      ...fields,
      email: input.type === "VENDA_TROCA" ? f.buyerEmail ?? null : null,
      cnhNumber: "",
      createdAt: now,
      updatedAt: now,
    });
  } else {
    db.salesCustomers[customerIdx] = { ...db.salesCustomers[customerIdx], ...fields, updatedAt: now };
  }
}

// Contrato de Venda e Troca com a caixinha de troca marcada e o veículo
// recebido preenchido também entra automaticamente no estoque — mesma
// automação usada em Nova Venda (pushTradeInVehicleToStock cuida de não
// duplicar por placa).
function syncContractTradeIn(db: DbShape, input: ContractInput, now: string) {
  const f = input.fields;
  if (input.type !== "VENDA_TROCA" || f.hasTradeIn !== "true") return;
  if (!f.tradeInBrand || !f.tradeInModel) return;

  pushTradeInVehicleToStock(
    db,
    {
      brand: f.tradeInBrand,
      model: f.tradeInModel,
      manufactureYear: Number(f.tradeInManufactureYear) || new Date().getFullYear(),
      modelYear: Number(f.tradeInModelYear) || new Date().getFullYear(),
      mileageKm: Number(f.tradeInMileage) || 0,
      plate: f.tradeInPlate ?? "",
      value: Number(f.tradeInValue) || 0,
    },
    now
  );
}

export async function createContract(input: ContractInput): Promise<Contract> {
  const db = await readDb();
  const now = new Date().toISOString();
  const contract: Contract = { ...input, id: genId("contract"), createdAt: now, updatedAt: now };
  db.contracts.unshift(contract);
  syncContractCustomer(db, input, now);
  syncContractTradeIn(db, input, now);
  await writeDb(db);
  return contract;
}

export async function updateContract(id: string, input: ContractInput): Promise<Contract | undefined> {
  const db = await readDb();
  const idx = db.contracts.findIndex((c) => c.id === id);
  if (idx === -1) return undefined;
  const now = new Date().toISOString();
  db.contracts[idx] = { ...db.contracts[idx], ...input, updatedAt: now };
  syncContractCustomer(db, input, now);
  syncContractTradeIn(db, input, now);
  await writeDb(db);
  return db.contracts[idx];
}

export async function deleteContract(id: string): Promise<boolean> {
  const db = await readDb();
  const before = db.contracts.length;
  db.contracts = db.contracts.filter((c) => c.id !== id);
  await writeDb(db);
  return db.contracts.length < before;
}

export async function deleteNegotiation(id: string): Promise<boolean> {
  const db = await readDb();
  const before = db.negotiations.length;
  db.negotiations = db.negotiations.filter((n) => n.id !== id);
  db.checklistItems = db.checklistItems.filter((i) => i.negotiationId !== id);
  db.negotiationDocuments = db.negotiationDocuments.filter((d) => d.negotiationId !== id);
  db.negotiationHistory = db.negotiationHistory.filter((h) => h.negotiationId !== id);
  await writeDb(db);
  return db.negotiations.length < before;
}
