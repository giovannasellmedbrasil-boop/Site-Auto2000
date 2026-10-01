import type {
  BodyType,
  DashboardFilters,
  Lead,
  LeadChannel,
  MarketingCampaign,
  Negotiation,
  NegotiationPaymentMethod,
  LeadLostReason,
  PeriodPreset,
  Vehicle,
} from "@/lib/types";
import { LEAD_CHANNEL_LABELS } from "@/lib/types";
import {
  listContracts,
  listLeads,
  listMarketingCampaigns,
  listNegotiations,
  listSalespeople,
  listVehiclesAdmin,
  getDashboardGoals,
} from "@/lib/server/db";
import { countUniqueVisitors } from "@/lib/server/site-visits";

// Vendas de verdade hoje são as negociações cadastradas em "Nova Venda"
// (Negotiation), não mais o antigo modelo Sale ligado ao funil de leads —
// esse funil de CRM foi descontinuado (seção de Leads/Marketing removida),
// mas o cadastro de vendas continua gerando dados reais que o dashboard
// precisa refletir. Canal/campanha não existem numa Negotiation, então
// ficam de fora aqui (nunca inventados) — quem depende deles (tabela por
// canal/campanha) sempre mostra 0, honestamente, em vez de um valor
// fabricado.
interface RealizedSale {
  id: string;
  ownerId: string;
  vehicleId: string;
  finalPrice: number;
  paymentMethod: NegotiationPaymentMethod;
  soldAt: string;
}

function negotiationsToSales(negotiations: Negotiation[]): RealizedSale[] {
  return negotiations
    .filter((n) => n.status !== "CANCELLED")
    .map((n) => ({
      id: n.id,
      ownerId: n.sellerId,
      vehicleId: n.vehicleId,
      finalPrice: n.saleValue,
      paymentMethod: n.paymentMethod,
      soldAt: n.createdAt,
    }));
}

// ---------------------------------------------------------------------------
// Camada de agregação do Dashboard Executivo. Tudo aqui é calculado em cima
// dos dados reais do mock store (leads/vendas/vendedores/campanhas/veículos)
// — nada fabricado. As "Insights da IA" no final deste arquivo são geradas
// por um motor de regras simples sobre esses números, não por um modelo de
// linguagem (mesma disciplina de honestidade usada em lib/matching.ts).
// ---------------------------------------------------------------------------

const DAY_MS = 86400000;

function startOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfMonth(ms: number): number {
  const d = new Date(ms);
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

function endOfMonth(ms: number): number {
  const d = new Date(ms);
  d.setMonth(d.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

function startOfYear(ms: number): number {
  const d = new Date(ms);
  d.setMonth(0, 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export interface ResolvedPeriod {
  from: number;
  to: number;
  prevFrom: number;
  prevTo: number;
  label: string;
}

const PERIOD_LABELS: Record<PeriodPreset, string> = {
  today: "Hoje",
  yesterday: "Ontem",
  last7: "Últimos 7 dias",
  last30: "Últimos 30 dias",
  thisMonth: "Este mês",
  lastMonth: "Mês anterior",
  thisYear: "Este ano",
  custom: "Período personalizado",
};

const PERIOD_PRESETS: PeriodPreset[] = ["today", "yesterday", "last7", "last30", "thisMonth", "lastMonth", "thisYear", "custom"];

export function parseDashboardFilters(searchParams: URLSearchParams): DashboardFilters {
  const periodParam = searchParams.get("period");
  const period: PeriodPreset = PERIOD_PRESETS.includes(periodParam as PeriodPreset) ? (periodParam as PeriodPreset) : "last30";
  return {
    period,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
    ownerId: searchParams.get("ownerId") ?? undefined,
    vehicleId: searchParams.get("vehicleId") ?? undefined,
    brand: searchParams.get("brand") ?? undefined,
    model: searchParams.get("model") ?? undefined,
    channel: (searchParams.get("channel") as LeadChannel | null) ?? undefined,
    campaignId: searchParams.get("campaignId") ?? undefined,
    platform: searchParams.get("platform") ?? undefined,
  };
}

export function filtersToQueryString(filters: DashboardFilters): string {
  const params = new URLSearchParams();
  params.set("period", filters.period);
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.ownerId) params.set("ownerId", filters.ownerId);
  if (filters.vehicleId) params.set("vehicleId", filters.vehicleId);
  if (filters.brand) params.set("brand", filters.brand);
  if (filters.model) params.set("model", filters.model);
  if (filters.channel) params.set("channel", filters.channel);
  if (filters.campaignId) params.set("campaignId", filters.campaignId);
  if (filters.platform) params.set("platform", filters.platform);
  return params.toString();
}

export function resolvePeriod(filters: DashboardFilters): ResolvedPeriod {
  const now = Date.now();
  let from = startOfMonth(now);
  let to = now;

  switch (filters.period) {
    case "today":
      from = startOfDay(now);
      to = now;
      break;
    case "yesterday": {
      const y = now - DAY_MS;
      from = startOfDay(y);
      to = endOfDay(y);
      break;
    }
    case "last7":
      from = now - 7 * DAY_MS;
      to = now;
      break;
    case "last30":
      from = now - 30 * DAY_MS;
      to = now;
      break;
    case "thisMonth":
      from = startOfMonth(now);
      to = now;
      break;
    case "lastMonth": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      from = startOfMonth(d.getTime());
      to = endOfMonth(d.getTime());
      break;
    }
    case "thisYear":
      from = startOfYear(now);
      to = now;
      break;
    case "custom":
      from = filters.from ? startOfDay(new Date(filters.from).getTime()) : startOfMonth(now);
      to = filters.to ? endOfDay(new Date(filters.to).getTime()) : now;
      break;
  }

  const duration = Math.max(to - from, DAY_MS);
  const prevTo = from - 1;
  const prevFrom = prevTo - duration;

  return { from, to, prevFrom, prevTo, label: PERIOD_LABELS[filters.period] };
}

function inRange(iso: string | null | undefined, from: number, to: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  return t >= from && t <= to;
}

function matchesLead(lead: Lead, filters: DashboardFilters, vehiclesById: Map<string, Vehicle>, campaignsById: Map<string, MarketingCampaign>): boolean {
  if (filters.ownerId && lead.ownerId !== filters.ownerId) return false;
  if (filters.vehicleId && lead.vehicleId !== filters.vehicleId) return false;
  if (filters.channel && lead.channel !== filters.channel) return false;
  if (filters.campaignId && lead.campaignId !== filters.campaignId) return false;
  if (filters.brand || filters.model) {
    const vehicle = lead.vehicleId ? vehiclesById.get(lead.vehicleId) : undefined;
    if (filters.brand && vehicle?.brand.toLowerCase() !== filters.brand.toLowerCase()) return false;
    if (filters.model && vehicle?.model.toLowerCase() !== filters.model.toLowerCase()) return false;
  }
  if (filters.platform) {
    const campaign = lead.campaignId ? campaignsById.get(lead.campaignId) : undefined;
    if (campaign?.platform !== filters.platform) return false;
  }
  return true;
}

function matchesSale(sale: RealizedSale, filters: DashboardFilters, vehiclesById: Map<string, Vehicle>): boolean {
  if (filters.ownerId && sale.ownerId !== filters.ownerId) return false;
  if (filters.vehicleId && sale.vehicleId !== filters.vehicleId) return false;
  if (filters.brand || filters.model) {
    const vehicle = vehiclesById.get(sale.vehicleId);
    if (filters.brand && vehicle?.brand.toLowerCase() !== filters.brand.toLowerCase()) return false;
    if (filters.model && vehicle?.model.toLowerCase() !== filters.model.toLowerCase()) return false;
  }
  return true;
}

function pct(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null;
  return Math.round((numerator / denominator) * 1000) / 10;
}

function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

export interface KpiValue {
  value: number;
  previous: number;
  deltaPct: number | null;
  direction: "up" | "down" | "flat";
}

function buildKpi(value: number, previous: number): KpiValue {
  const deltaPct = previous > 0 ? Math.round(((value - previous) / previous) * 1000) / 10 : value > 0 ? 100 : null;
  const direction: KpiValue["direction"] = deltaPct == null || deltaPct === 0 ? "flat" : deltaPct > 0 ? "up" : "down";
  return { value, previous, deltaPct, direction };
}

export interface FunnelStage {
  key: string;
  label: string;
  count: number;
  conversionFromPrev: number | null;
}

export interface ChannelRow {
  channel: LeadChannel;
  label: string;
  leads: number;
  proposals: number;
  sales: number;
  conversionPct: number | null;
  investment: number;
  cpl: number | null;
  cac: number | null;
  revenue: number;
  roiPct: number | null;
}

export interface CampaignRow {
  id: string;
  name: string;
  platform: string;
  channel: LeadChannel;
  investment: number;
  impressions: number | null;
  clicks: number | null;
  leads: number;
  cpl: number | null;
  visits: number;
  proposals: number;
  sales: number;
  cac: number | null;
  revenue: number;
  roas: number | null;
  roiPct: number | null;
}

export interface SalespersonRow {
  id: string;
  name: string;
  photoSeed: string;
  role: string;
  leadsReceived: number;
  leadsContacted: number;
  avgResponseMinutes: number | null;
  visits: number;
  testDrives: number;
  proposals: number;
  sales: number;
  revenue: number;
  avgTicket: number | null;
  conversionPct: number | null;
  goalUnits: number;
  goalPct: number | null;
}

export interface StockDemandRow {
  key: string;
  brand: string;
  model: string;
  version: string;
  leads: number;
  visits: number;
  proposals: number;
  sales: number;
  stockAvailable: number;
  tag: "hot" | "low_stock" | null;
}

export interface SeriesPoint {
  key: string;
  label: string;
  current: number;
  previous: number;
}

export interface DistributionRow {
  label: string;
  count: number;
  revenue: number;
}

export interface FilterOptions {
  salespeople: { id: string; name: string }[];
  brands: string[];
  models: string[];
  vehicles: { id: string; label: string }[];
  channels: { value: LeadChannel; label: string }[];
  campaigns: { id: string; name: string }[];
  platforms: string[];
}

export interface DashboardData {
  period: ResolvedPeriod;
  siteVisitors: number;
  kpis: {
    leads: KpiValue;
    contacted: KpiValue;
    contactedRatePct: number | null;
    visits: KpiValue;
    visitRatePct: number | null;
    testDrives: KpiValue;
    testDriveRatePct: number | null;
    proposals: KpiValue;
    proposalRatePct: number | null;
    sales: KpiValue;
    revenue: KpiValue;
    avgTicket: number | null;
  };
  funnel: FunnelStage[];
  bottleneck: { fromLabel: string; toLabel: string; conversionPct: number | null } | null;
  originBreakdown: { channel: LeadChannel; label: string; count: number; pct: number | null; sales: number; conversionPct: number | null }[];
  channelTable: ChannelRow[];
  marketing: {
    investment: number;
    revenue: number;
    cpl: number | null;
    cac: number | null;
    roas: number | null;
    roiPct: number | null;
  };
  campaignTable: CampaignRow[];
  salespeople: SalespersonRow[];
  responseTime: {
    avgMinutes: number | null;
    under5: number;
    from5to15: number;
    over15: number;
    pendingLeads: Lead[];
  };
  goals: {
    salesUnitsTarget: number;
    achievedUnits: number;
    salesPct: number | null;
    remainingUnits: number;
    revenueTarget: number;
    achievedRevenue: number;
    revenuePct: number | null;
  };
  forecast: { conservative: number; likely: number; optimistic: number };
  stockDemand: StockDemandRow[];
  salesOverTime: SeriesPoint[];
  revenueOverTime: SeriesPoint[];
  distribution: {
    brand: DistributionRow[];
    model: DistributionRow[];
    priceRange: DistributionRow[];
    bodyType: DistributionRow[];
    salesperson: DistributionRow[];
    channel: DistributionRow[];
  };
  lostReasons: { reason: LeadLostReason; label: string; count: number }[];
  insights: string[];
  filterOptions: FilterOptions;
  purchasedVehicles: { count: number; totalValue: number };
}

const LOST_REASON_LABELS_LOCAL: Record<LeadLostReason, string> = {
  PRICE: "Preço",
  FINANCING_DENIED: "Financiamento recusado",
  BOUGHT_COMPETITOR: "Comprou no concorrente",
  GAVE_UP: "Desistiu",
  NO_RESPONSE: "Sem resposta",
  VEHICLE_SOLD: "Veículo vendido",
  VEHICLE_UNAVAILABLE: "Veículo indisponível",
  TRADE_IN_REJECTED: "Troca não aprovada",
  OTHER: "Outro",
};

const PRICE_RANGES: { label: string; min: number; max: number }[] = [
  { label: "Até R$ 80 mil", min: 0, max: 80000 },
  { label: "R$ 80–120 mil", min: 80000, max: 120000 },
  { label: "R$ 120–160 mil", min: 120000, max: 160000 },
  { label: "R$ 160–220 mil", min: 160000, max: 220000 },
  { label: "Acima de R$ 220 mil", min: 220000, max: Infinity },
];

function priceRangeLabel(price: number): string {
  return PRICE_RANGES.find((r) => price >= r.min && price < r.max)?.label ?? PRICE_RANGES[PRICE_RANGES.length - 1].label;
}

function groupCount<T>(items: T[], keyFn: (item: T) => string): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    const key = keyFn(item);
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return map;
}

export async function getDashboardData(filters: DashboardFilters): Promise<DashboardData> {
  const [allLeads, allNegotiations, salespeople, campaigns, vehicles, goals, allContracts] = await Promise.all([
    listLeads(),
    listNegotiations(),
    listSalespeople(),
    listMarketingCampaigns(),
    listVehiclesAdmin(),
    getDashboardGoals(),
    listContracts(),
  ]);
  const allSales = negotiationsToSales(allNegotiations);

  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  const campaignsById = new Map(campaigns.map((c) => [c.id, c]));
  const salespeopleById = new Map(salespeople.map((s) => [s.id, s]));

  const period = resolvePeriod(filters);

  const leadsMatchingFilters = allLeads.filter((l) => matchesLead(l, filters, vehiclesById, campaignsById));
  const salesMatchingFilters = allSales.filter((s) => matchesSale(s, filters, vehiclesById));

  const cohort = leadsMatchingFilters.filter((l) => inRange(l.createdAt, period.from, period.to));
  const prevCohort = leadsMatchingFilters.filter((l) => inRange(l.createdAt, period.prevFrom, period.prevTo));
  const periodSales = salesMatchingFilters.filter((s) => inRange(s.soldAt, period.from, period.to));
  const prevPeriodSales = salesMatchingFilters.filter((s) => inRange(s.soldAt, period.prevFrom, period.prevTo));

  const countStage = (leads: Lead[], field: keyof Lead) => leads.filter((l) => Boolean(l[field])).length;

  const leadsKpi = buildKpi(cohort.length, prevCohort.length);
  const contactedKpi = buildKpi(countStage(cohort, "contactedAt"), countStage(prevCohort, "contactedAt"));
  const visitsKpi = buildKpi(countStage(cohort, "visitAt"), countStage(prevCohort, "visitAt"));
  const testDrivesKpi = buildKpi(countStage(cohort, "testDriveAt"), countStage(prevCohort, "testDriveAt"));
  const proposalsKpi = buildKpi(countStage(cohort, "proposalAt"), countStage(prevCohort, "proposalAt"));
  const salesKpi = buildKpi(periodSales.length, prevPeriodSales.length);
  const revenueKpi = buildKpi(sum(periodSales.map((s) => s.finalPrice)), sum(prevPeriodSales.map((s) => s.finalPrice)));
  const avgTicket = periodSales.length > 0 ? revenueKpi.value / periodSales.length : null;

  const funnel: FunnelStage[] = [
    { key: "leads", label: "Leads", count: leadsKpi.value, conversionFromPrev: null },
    { key: "contacted", label: "Contato realizado", count: contactedKpi.value, conversionFromPrev: pct(contactedKpi.value, leadsKpi.value) },
    { key: "visits", label: "Visita agendada", count: visitsKpi.value, conversionFromPrev: pct(visitsKpi.value, contactedKpi.value) },
    { key: "testDrives", label: "Test-drive", count: testDrivesKpi.value, conversionFromPrev: pct(testDrivesKpi.value, visitsKpi.value) },
    { key: "proposals", label: "Proposta", count: proposalsKpi.value, conversionFromPrev: pct(proposalsKpi.value, testDrivesKpi.value) },
    { key: "sold", label: "Venda", count: countStage(cohort, "soldAt"), conversionFromPrev: pct(countStage(cohort, "soldAt"), proposalsKpi.value) },
  ];

  let bottleneck: DashboardData["bottleneck"] = null;
  for (let i = 1; i < funnel.length; i++) {
    const conv = funnel[i].conversionFromPrev;
    if (conv == null) continue;
    if (bottleneck == null || conv < (bottleneck.conversionPct ?? 100)) {
      bottleneck = { fromLabel: funnel[i - 1].label, toLabel: funnel[i].label, conversionPct: conv };
    }
  }

  // --- Origem dos leads --------------------------------------------------
  const channelValues = Object.keys(LEAD_CHANNEL_LABELS) as LeadChannel[];
  const originBreakdown = channelValues
    .map((channel) => {
      const channelCohort = cohort.filter((l) => l.channel === channel);
      // Vendas não têm mais canal atribuído (Negotiation não rastreia isso)
      // — nunca inventado, fica honestamente zerado em vez de um valor falso.
      const channelSales: RealizedSale[] = [];
      return {
        channel,
        label: LEAD_CHANNEL_LABELS[channel],
        count: channelCohort.length,
        pct: pct(channelCohort.length, cohort.length),
        sales: channelSales.length,
        conversionPct: pct(channelCohort.filter((l) => l.status === "SOLD").length, channelCohort.length),
      };
    })
    .filter((row) => row.count > 0 || row.sales > 0)
    .sort((a, b) => b.count - a.count);

  // --- Performance por canal / marketing ----------------------------------
  const channelTable: ChannelRow[] = originBreakdown.map((row) => {
    const channelCampaigns = campaigns.filter(
      (c) =>
        c.channel === row.channel &&
        (!filters.campaignId || c.id === filters.campaignId) &&
        (!filters.platform || c.platform === filters.platform)
    );
    const investment = sum(channelCampaigns.map((c) => c.cost));
    const revenue = 0; // idem — vendas não têm canal para atribuir receita
    const proposalsCount = cohort.filter((l) => l.channel === row.channel && l.proposalAt).length;
    return {
      channel: row.channel,
      label: row.label,
      leads: row.count,
      proposals: proposalsCount,
      sales: row.sales,
      conversionPct: row.conversionPct,
      investment,
      cpl: row.count > 0 && investment > 0 ? Math.round(investment / row.count) : null,
      cac: row.sales > 0 && investment > 0 ? Math.round(investment / row.sales) : null,
      revenue,
      roiPct: investment > 0 ? Math.round(((revenue - investment) / investment) * 1000) / 10 : null,
    };
  });

  const paidChannelTable = channelTable.filter((c) => c.investment > 0);
  const marketingInvestment = sum(paidChannelTable.map((c) => c.investment));
  const marketingRevenue = sum(paidChannelTable.map((c) => c.revenue));
  const marketing = {
    investment: marketingInvestment,
    revenue: marketingRevenue,
    cpl: marketingInvestment > 0 ? Math.round(marketingInvestment / Math.max(sum(paidChannelTable.map((c) => c.leads)), 1)) : null,
    cac: marketingInvestment > 0 ? Math.round(marketingInvestment / Math.max(sum(paidChannelTable.map((c) => c.sales)), 1)) : null,
    roas: marketingInvestment > 0 ? Math.round((marketingRevenue / marketingInvestment) * 100) / 100 : null,
    roiPct: marketingInvestment > 0 ? Math.round(((marketingRevenue - marketingInvestment) / marketingInvestment) * 1000) / 10 : null,
  };

  // --- Campanhas -----------------------------------------------------------
  const campaignTable: CampaignRow[] = campaigns
    .filter((c) => (filters.campaignId ? c.id === filters.campaignId : true) && (filters.platform ? c.platform === filters.platform : true) && (filters.channel ? c.channel === filters.channel : true))
    .map((c) => {
      const campaignCohort = cohort.filter((l) => l.campaignId === c.id);
      // Idem: vendas não carregam mais campanha de origem.
      const campaignSales: RealizedSale[] = [];
      const revenue = 0;
      return {
        id: c.id,
        name: c.name,
        platform: c.platform,
        channel: c.channel,
        investment: c.cost,
        impressions: c.impressions ?? null,
        clicks: c.clicks ?? null,
        leads: campaignCohort.length,
        cpl: campaignCohort.length > 0 ? Math.round(c.cost / campaignCohort.length) : null,
        visits: campaignCohort.filter((l) => l.visitAt).length,
        proposals: campaignCohort.filter((l) => l.proposalAt).length,
        sales: campaignSales.length,
        cac: campaignSales.length > 0 ? Math.round(c.cost / campaignSales.length) : null,
        revenue,
        roas: c.cost > 0 ? Math.round((revenue / c.cost) * 100) / 100 : null,
        roiPct: c.cost > 0 ? Math.round(((revenue - c.cost) / c.cost) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.revenue - a.revenue);

  // --- Vendedores ------------------------------------------------------------
  const salespersonRows: SalespersonRow[] = salespeople
    .filter((s) => (filters.ownerId ? s.id === filters.ownerId : true))
    .map((s) => {
      const leadsReceived = cohort.filter((l) => l.ownerId === s.id);
      const contacted = leadsReceived.filter((l) => l.contactedAt);
      const responseTimes = contacted
        .filter((l) => l.contactedAt)
        .map((l) => (new Date(l.contactedAt!).getTime() - new Date(l.createdAt).getTime()) / 60000)
        .filter((n) => n >= 0);
      const sSales = periodSales.filter((sale) => sale.ownerId === s.id);
      const revenue = sum(sSales.map((sale) => sale.finalPrice));
      return {
        id: s.id,
        name: s.name,
        photoSeed: s.photoSeed,
        role: s.role,
        leadsReceived: leadsReceived.length,
        leadsContacted: contacted.length,
        avgResponseMinutes: responseTimes.length > 0 ? Math.round(sum(responseTimes) / responseTimes.length) : null,
        visits: leadsReceived.filter((l) => l.visitAt).length,
        testDrives: leadsReceived.filter((l) => l.testDriveAt).length,
        proposals: leadsReceived.filter((l) => l.proposalAt).length,
        sales: sSales.length,
        revenue,
        avgTicket: sSales.length > 0 ? Math.round(revenue / sSales.length) : null,
        conversionPct: pct(sSales.length, leadsReceived.length),
        goalUnits: s.goalUnits,
        goalPct: s.goalUnits > 0 ? Math.round((sSales.length / s.goalUnits) * 1000) / 10 : null,
      };
    })
    .sort((a, b) => b.sales - a.sales);

  // --- Tempo de resposta -------------------------------------------------
  const respondedCohort = cohort.filter((l) => l.contactedAt);
  const responseMinutesList = respondedCohort.map((l) => (new Date(l.contactedAt!).getTime() - new Date(l.createdAt).getTime()) / 60000);
  const pendingLeads = leadsMatchingFilters
    .filter((l) => !l.contactedAt && l.status !== "LOST" && l.status !== "SOLD")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const responseTime = {
    avgMinutes: responseMinutesList.length > 0 ? Math.round(sum(responseMinutesList) / responseMinutesList.length) : null,
    under5: responseMinutesList.filter((m) => m < 5).length,
    from5to15: responseMinutesList.filter((m) => m >= 5 && m <= 15).length,
    over15: responseMinutesList.filter((m) => m > 15).length,
    pendingLeads,
  };

  // --- Metas ------------------------------------------------------------
  const monthSales = allSales.filter((s) => inRange(s.soldAt, startOfMonth(Date.now()), Date.now()));
  const monthRevenue = sum(monthSales.map((s) => s.finalPrice));
  const goalsResult = {
    salesUnitsTarget: goals.salesUnitsTarget,
    achievedUnits: monthSales.length,
    salesPct: goals.salesUnitsTarget > 0 ? Math.round((monthSales.length / goals.salesUnitsTarget) * 1000) / 10 : null,
    remainingUnits: Math.max(goals.salesUnitsTarget - monthSales.length, 0),
    revenueTarget: goals.revenueTarget,
    achievedRevenue: monthRevenue,
    revenuePct: goals.revenueTarget > 0 ? Math.round((monthRevenue / goals.revenueTarget) * 1000) / 10 : null,
  };

  // --- Previsão de fechamento ---------------------------------------------
  const openPipeline = allLeads.filter((l) => (l.status === "PROPOSAL_SENT" || l.status === "NEGOTIATING") && l.proposalValue);
  const historicalConv = pct(allSales.length, allLeads.filter((l) => l.proposalAt).length);
  const conversionRate = (historicalConv ?? 45) / 100;
  const expectedFromPipeline = openPipeline.length * conversionRate;
  const forecast = {
    conservative: Math.round(monthSales.length + expectedFromPipeline * 0.75),
    likely: Math.round(monthSales.length + expectedFromPipeline),
    optimistic: Math.round(monthSales.length + expectedFromPipeline * 1.35),
  };

  // --- Estoque x demanda ----------------------------------------------------
  const groupKey = (brand: string, model: string, version: string) => `${brand}|${model}|${version}`;
  const stockGroups = new Map<string, StockDemandRow>();
  for (const v of vehicles) {
    const key = groupKey(v.brand, v.model, v.version);
    if (!stockGroups.has(key)) {
      stockGroups.set(key, { key, brand: v.brand, model: v.model, version: v.version, leads: 0, visits: 0, proposals: 0, sales: 0, stockAvailable: 0, tag: null });
    }
    if (v.status === "AVAILABLE") stockGroups.get(key)!.stockAvailable += 1;
  }
  for (const l of cohort) {
    const vehicle = l.vehicleId ? vehiclesById.get(l.vehicleId) : undefined;
    if (!vehicle) continue;
    const key = groupKey(vehicle.brand, vehicle.model, vehicle.version);
    const row = stockGroups.get(key);
    if (!row) continue;
    row.leads += 1;
    if (l.visitAt) row.visits += 1;
    if (l.proposalAt) row.proposals += 1;
  }
  for (const s of periodSales) {
    const vehicle = vehiclesById.get(s.vehicleId);
    if (!vehicle) continue;
    const key = groupKey(vehicle.brand, vehicle.model, vehicle.version);
    const row = stockGroups.get(key);
    if (row) row.sales += 1;
  }
  const stockDemand = Array.from(stockGroups.values())
    .filter((r) => r.leads > 0)
    .map((r) => ({
      ...r,
      tag: (r.leads >= 8 ? "hot" : r.stockAvailable <= 1 && r.leads >= 3 ? "low_stock" : null) as StockDemandRow["tag"],
    }))
    .sort((a, b) => b.leads - a.leads)
    .slice(0, 12);

  // --- Séries temporais -------------------------------------------------
  const granularityDays = period.to - period.from > 60 * DAY_MS ? 30 : period.to - period.from > 14 * DAY_MS ? 7 : 1;
  const buckets: { label: string; from: number; to: number }[] = [];
  for (let t = period.from; t < period.to; t += granularityDays * DAY_MS) {
    const bFrom = t;
    const bTo = Math.min(t + granularityDays * DAY_MS - 1, period.to);
    buckets.push({
      label: new Date(bFrom).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      from: bFrom,
      to: bTo,
    });
  }
  const prevDuration = period.to - period.from;
  const salesOverTime: SeriesPoint[] = buckets.map((b, i) => {
    const current = salesMatchingFilters.filter((s) => inRange(s.soldAt, b.from, b.to)).length;
    const prevFrom = b.from - prevDuration;
    const prevTo = b.to - prevDuration;
    const previous = salesMatchingFilters.filter((s) => inRange(s.soldAt, prevFrom, prevTo)).length;
    return { key: `p${i}`, label: b.label, current, previous };
  });
  const revenueOverTime: SeriesPoint[] = buckets.map((b, i) => {
    const current = sum(salesMatchingFilters.filter((s) => inRange(s.soldAt, b.from, b.to)).map((s) => s.finalPrice));
    const prevFrom = b.from - prevDuration;
    const prevTo = b.to - prevDuration;
    const previous = sum(salesMatchingFilters.filter((s) => inRange(s.soldAt, prevFrom, prevTo)).map((s) => s.finalPrice));
    return { key: `p${i}`, label: b.label, current, previous };
  });

  // --- Distribuição de vendas ----------------------------------------------
  function distributionBy(keyFn: (s: RealizedSale, vehicle: Vehicle | undefined) => string | null): DistributionRow[] {
    const map = new Map<string, DistributionRow>();
    for (const s of periodSales) {
      const vehicle = vehiclesById.get(s.vehicleId);
      const key = keyFn(s, vehicle);
      if (!key) continue;
      const row = map.get(key) ?? { label: key, count: 0, revenue: 0 };
      row.count += 1;
      row.revenue += s.finalPrice;
      map.set(key, row);
    }
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  }

  const distribution = {
    brand: distributionBy((_s, v) => v?.brand ?? null),
    model: distributionBy((_s, v) => (v ? `${v.brand} ${v.model}` : null)),
    priceRange: distributionBy((s) => priceRangeLabel(s.finalPrice)),
    bodyType: distributionBy((_s, v) => (v ? bodyTypeLabel(v.bodyType) : null)),
    salesperson: distributionBy((s) => salespeopleById.get(s.ownerId)?.name ?? null),
    // Vendas não carregam mais canal de origem — nunca inventado.
    channel: distributionBy(() => null),
  };

  // --- Motivos de perda -----------------------------------------------------
  const lostCohort = cohort.filter((l) => l.status === "LOST" && l.lostReason);
  const lostCounts = groupCount(lostCohort, (l) => l.lostReason as string);
  const lostReasons = Array.from(lostCounts.entries())
    .map(([reason, count]) => ({ reason: reason as LeadLostReason, label: LOST_REASON_LABELS_LOCAL[reason as LeadLostReason], count }))
    .sort((a, b) => b.count - a.count);

  // --- Opções de filtro ---------------------------------------------------
  const filterOptions: FilterOptions = {
    salespeople: salespeople.map((s) => ({ id: s.id, name: s.name })),
    brands: Array.from(new Set(vehicles.map((v) => v.brand))).sort(),
    models: Array.from(new Set(vehicles.map((v) => v.model))).sort(),
    vehicles: vehicles.map((v) => ({ id: v.id, label: `${v.brand} ${v.model} ${v.version}` })),
    channels: channelValues.map((c) => ({ value: c, label: LEAD_CHANNEL_LABELS[c] })),
    campaigns: campaigns.map((c) => ({ id: c.id, name: c.name })),
    platforms: Array.from(new Set(campaigns.map((c) => c.platform))).sort(),
  };

  const kpis = {
    leads: leadsKpi,
    contacted: contactedKpi,
    contactedRatePct: pct(contactedKpi.value, leadsKpi.value),
    visits: visitsKpi,
    visitRatePct: pct(visitsKpi.value, contactedKpi.value),
    testDrives: testDrivesKpi,
    testDriveRatePct: pct(testDrivesKpi.value, visitsKpi.value),
    proposals: proposalsKpi,
    proposalRatePct: pct(proposalsKpi.value, testDrivesKpi.value),
    sales: salesKpi,
    revenue: revenueKpi,
    avgTicket,
  };

  const siteVisitors = await countUniqueVisitors(new Date(period.from), new Date(period.to));

  // Veículos comprados no período — soma dois casos em que a loja passa a
  // ser dona de um carro que não veio de estoque próprio: contratos de
  // "Recibo de Compra" (compra direta de um particular) e os veículos
  // recebidos como parte de pagamento (troca) numa venda.
  const periodPurchaseContracts = allContracts.filter(
    (c) => c.type === "RECIBO_COMPRA" && inRange(c.createdAt, period.from, period.to)
  );
  const periodTradeIns = allNegotiations.filter(
    (n) => n.status !== "CANCELLED" && n.hasTradeIn && n.tradeIn && inRange(n.createdAt, period.from, period.to)
  );
  const purchasedVehicles = {
    count: periodPurchaseContracts.length + periodTradeIns.length,
    totalValue:
      periodPurchaseContracts.reduce((sum, c) => sum + (Number(c.fields.value) || 0), 0) +
      periodTradeIns.reduce(
        (sum, n) => sum + (n.tradeIn!.approvedValue ?? n.tradeIn!.storeAppraisalValue ?? n.tradeIn!.requestedValue ?? 0),
        0
      ),
  };

  const insights = buildInsights({
    kpis,
    originBreakdown,
    salespersonRows,
    stockDemand,
    responseTime,
    goalsResult,
    channelTable,
  });

  return {
    period,
    siteVisitors,
    kpis,
    funnel,
    bottleneck,
    originBreakdown,
    channelTable,
    marketing,
    campaignTable,
    salespeople: salespersonRows,
    responseTime,
    goals: goalsResult,
    forecast,
    stockDemand,
    salesOverTime,
    revenueOverTime,
    distribution,
    lostReasons,
    insights,
    filterOptions,
    purchasedVehicles,
  };
}

function bodyTypeLabel(bodyType: BodyType): string {
  const labels: Record<BodyType, string> = {
    HATCH: "Hatch",
    SEDAN: "Sedã",
    SUV: "SUV",
    PICKUP: "Picape",
    MINIVAN: "Minivan",
    COUPE: "Cupê",
    CONVERTIBLE: "Conversível",
  };
  return labels[bodyType];
}

// --- Drill-down (drawers de detalhamento — seção 20) -----------------------

export type DrillMetric = "leads" | "contacted" | "visits" | "testDrives" | "proposals" | "sold" | "pending";

const DRILL_FIELD: Partial<Record<DrillMetric, keyof Lead>> = {
  contacted: "contactedAt",
  visits: "visitAt",
  testDrives: "testDriveAt",
  proposals: "proposalAt",
  sold: "soldAt",
};

export async function getDrilldownLeads(filters: DashboardFilters, metric: DrillMetric): Promise<Lead[]> {
  const [allLeads, vehicles, campaigns] = await Promise.all([listLeads(), listVehiclesAdmin(), listMarketingCampaigns()]);
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  const campaignsById = new Map(campaigns.map((c) => [c.id, c]));
  const period = resolvePeriod(filters);

  let leads = allLeads.filter((l) => matchesLead(l, filters, vehiclesById, campaignsById) && inRange(l.createdAt, period.from, period.to));

  if (metric === "pending") {
    leads = leads.filter((l) => !l.contactedAt && l.status !== "LOST" && l.status !== "SOLD");
  } else {
    const field = DRILL_FIELD[metric];
    if (field) leads = leads.filter((l) => Boolean(l[field]));
  }

  return leads.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

export async function getDrilldownSales(filters: DashboardFilters): Promise<RealizedSale[]> {
  const [allNegotiations, vehicles] = await Promise.all([listNegotiations(), listVehiclesAdmin()]);
  const allSales = negotiationsToSales(allNegotiations);
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  const period = resolvePeriod(filters);

  return allSales
    .filter((s) => matchesSale(s, filters, vehiclesById) && inRange(s.soldAt, period.from, period.to))
    .sort((a, b) => new Date(b.soldAt).getTime() - new Date(a.soldAt).getTime());
}

// --- Insights automáticos ---------------------------------------------------
//
// Motor de regras determinístico sobre os números já calculados acima.
// Nenhuma chamada a modelo de linguagem — apenas comparações e formatação de
// frases a partir de dados reais do mock store.

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 }).format(amount);
}

function buildInsights(ctx: {
  kpis: DashboardData["kpis"];
  originBreakdown: DashboardData["originBreakdown"];
  salespersonRows: SalespersonRow[];
  stockDemand: StockDemandRow[];
  responseTime: DashboardData["responseTime"];
  goalsResult: DashboardData["goals"];
  channelTable: ChannelRow[];
}): string[] {
  const insights: string[] = [];

  const topByLeads = [...ctx.originBreakdown].sort((a, b) => b.count - a.count)[0];
  const topByConversion = [...ctx.originBreakdown].filter((c) => c.count >= 5).sort((a, b) => (b.conversionPct ?? 0) - (a.conversionPct ?? 0))[0];
  if (topByLeads && topByConversion && topByLeads.channel !== topByConversion.channel && topByConversion.conversionPct && topByLeads.conversionPct) {
    const ratio = Math.round((topByConversion.conversionPct / Math.max(topByLeads.conversionPct, 0.1)) * 10) / 10;
    if (ratio > 1.3) {
      insights.push(
        `${topByLeads.label} gerou ${topByLeads.pct}% dos leads deste período, mas ${topByConversion.label} apresenta uma taxa de conversão em venda ${ratio.toFixed(1)}x maior.`
      );
    }
  }

  if (ctx.responseTime.pendingLeads.length > 0) {
    insights.push(`Existem ${ctx.responseTime.pendingLeads.length} lead(s) aguardando o primeiro contato.`);
  }

  const topVehicle = ctx.stockDemand[0];
  if (topVehicle) {
    const totalLeads = ctx.stockDemand.reduce((a, r) => a + r.leads, 0);
    const share = totalLeads > 0 ? Math.round((topVehicle.leads / totalLeads) * 100) : 0;
    if (share >= 10) {
      insights.push(`${topVehicle.brand} ${topVehicle.model} representa ${share}% das consultas de veículo neste período.`);
    }
  }

  if (ctx.kpis.proposalRatePct != null && ctx.kpis.proposalRatePct < 40 && ctx.kpis.proposals.value >= 3) {
    insights.push(`A conversão de test-drive para proposta está em ${ctx.kpis.proposalRatePct}% neste período — abaixo do ideal, vale revisar o discurso de fechamento.`);
  }

  const bySales = [...ctx.salespersonRows].sort((a, b) => b.revenue - a.revenue)[0];
  const byConversion = [...ctx.salespersonRows].filter((s) => s.leadsReceived >= 5).sort((a, b) => (b.conversionPct ?? 0) - (a.conversionPct ?? 0))[0];
  if (bySales && byConversion && bySales.id !== byConversion.id) {
    insights.push(`${bySales.name} tem o maior faturamento do período, enquanto ${byConversion.name} tem a maior taxa de conversão.`);
  }

  const sortedByCac = ctx.channelTable.filter((c) => c.cac != null).sort((a, b) => (a.cac ?? 0) - (b.cac ?? 0));
  if (sortedByCac[0]) {
    insights.push(`${sortedByCac[0].label} tem o menor custo de aquisição por venda entre os canais pagos, ${formatMoney(sortedByCac[0].cac!)}.`);
  }

  if (ctx.goalsResult.salesPct != null) {
    insights.push(`No ritmo atual, a loja está em ${ctx.goalsResult.salesPct}% da meta mensal de vendas.`);
  }

  return insights.slice(0, 6);
}
