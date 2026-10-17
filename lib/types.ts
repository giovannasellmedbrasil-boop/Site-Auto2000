// Tipos de domínio compartilhados entre frontend, API routes e o mock store.
// Espelham prisma/schema.prisma para que a troca do store mock por Postgres
// no futuro não exija remodelar as telas.

export type VehicleStatus = "AVAILABLE" | "RESERVED" | "SOLD" | "PREPARING";

export type Transmission = "MANUAL" | "AUTOMATIC" | "CVT" | "AUTOMATED";

export type FuelType =
  | "FLEX"
  | "GASOLINE"
  | "ETHANOL"
  | "DIESEL"
  | "HYBRID"
  | "ELECTRIC";

export type BodyType =
  | "HATCH"
  | "SEDAN"
  | "SUV"
  | "PICKUP"
  | "MINIVAN"
  | "COUPE"
  | "CONVERTIBLE";

export interface VehiclePhoto {
  id: string;
  url: string;
  position: number;
  isCover: boolean;
}

// Origem do cadastro do veículo (seção "Mercado Livre" do painel) — "SITE"
// para veículos cadastrados manualmente no admin, "MERCADO_LIVRE" para
// veículos importados/sincronizados a partir de um anúncio do Mercado Livre.
export type VehicleSource = "SITE" | "MERCADO_LIVRE";

export interface Vehicle {
  id: string;
  slug: string;
  brand: string;
  model: string;
  version: string;
  bodyType: BodyType;
  manufactureYear: number;
  modelYear: number;
  mileageKm: number;
  price: number;
  costPrice?: number | null; // interno — valor pago na compra do carro — nunca renderizado no frontend público
  variableExpenses?: number | null; // interno — gastos variáveis (preparação, funilaria, documentação etc.) — nunca renderizado no frontend público
  transmission: Transmission;
  fuel: FuelType;
  color: string;
  plateEnding?: string | null;
  plate?: string | null; // placa completa
  chassi?: string | null;
  renavam?: string | null;
  doors: number;
  engine?: string | null;
  powerHp?: number | null;
  trunkLiters?: number | null;
  fuelConsumption?: string | null;
  features: string[];
  description?: string | null;
  videoUrl?: string | null;
  status: VehicleStatus;
  enteredStockAt: string; // ISO date
  soldAt?: string | null;
  createdAt: string;
  updatedAt: string;
  photos: VehiclePhoto[];

  // --- Integração Mercado Livre — "dados sincronizados" (nunca editados à
  // mão; sobrescritos a cada sincronização) ---
  source: VehicleSource;
  mercadoLivreId?: string | null; // ex: "MLB7052979322" — chave de deduplicação
  mercadoLivrePermalink?: string | null;
  mercadoLivreStatus?: "active" | "paused" | "closed" | "not_found" | null;
  mercadoLivreSyncedAt?: string | null; // ISO — última sincronização bem-sucedida deste anúncio

  // --- "Dados internos do site" — nunca apagados/sobrescritos por uma
  // sincronização do Mercado Livre, mesmo quando o veículo veio de lá ---
  featured?: boolean; // destaque
  offerBadge?: boolean; // selo "Oferta"
  recommended?: boolean; // veículo recomendado
  specialCondition?: string | null; // condição especial / financiamento facilitado etc.
  homePosition?: number | null; // posição manual na home, menor = primeiro
}

export type VehicleInput = Omit<
  Vehicle,
  "id" | "slug" | "createdAt" | "updatedAt" | "photos" | "source"
> & {
  source?: VehicleSource;
  photos?: { url: string; isCover?: boolean }[];
};

// ---------------------------------------------------------------------------
// Integração Mercado Livre
// ---------------------------------------------------------------------------
//
// Fase atual: leitura de dados PÚBLICOS da loja (sem OAuth) — ver
// lib/server/mercadolivre/publicSource.ts para o porquê. Os tipos abaixo já
// modelam o fluxo completo (incluindo status de conexão/autenticação) para
// não exigir remodelagem quando a integração via API oficial autenticada
// (client_id/secret + OAuth) for habilitada.

export type MercadoLivreConnectionStatus =
  | "DISCONNECTED"
  | "CONNECTED"
  | "SYNCING"
  | "AUTH_ERROR";

export interface MercadoLivreIntegrationSettings {
  storeUrl: string | null;
  sellerId: string | null; // extraído da loja quando disponível publicamente
  status: MercadoLivreConnectionStatus;
  autoSyncEnabled: boolean;
  lastSyncAt: string | null;
  lastSyncReportId: string | null;
  lastError: string | null;
}

export interface MercadoLivreSyncError {
  mercadoLivreId: string;
  vehicleTitle: string | null;
  message: string;
}

export interface MercadoLivreSyncReport {
  id: string;
  startedAt: string;
  finishedAt: string;
  trigger: "MANUAL" | "INITIAL_IMPORT" | "AUTO";
  analyzed: number;
  imported: number;
  updated: number;
  paused: number;
  finished: number;
  unchanged: number;
  errors: MercadoLivreSyncError[];
}

export interface MercadoLivreListingPreview {
  mercadoLivreId: string;
  permalink: string;
  title: string;
  price: number | null;
  thumbnailUrl: string | null;
  alreadyImported: boolean;
}

export type LeadOrigin =
  | "SITE"
  | "WHATSAPP"
  | "IA_RECOMMENDATION"
  | "TRADE_IN"
  | "FINANCING_SIMULATOR"
  | "CREDIT_PREANALYSIS"
  | "MARKETPLACE"
  | "REFERRAL"
  | "OTHER";

export type LeadStage =
  | "NEW"
  | "CONTACTED"
  | "QUALIFIED"
  | "VISIT"
  | "PROPOSAL"
  | "FINANCING"
  | "SOLD"
  | "LOST";

// Status comercial do funil (seção 21 do briefing do Dashboard Executivo) —
// mais granular que LeadStage acima (mantido por compatibilidade com o que
// já existe). `status` é o campo "vivo" usado pelo funil/CRM do dashboard.
export type LeadStatus =
  | "NEW_LEAD"
  | "IN_PROGRESS"
  | "CONTACT_ATTEMPT"
  | "CONTACTED"
  | "VISIT_SCHEDULED"
  | "VISITED"
  | "TEST_DRIVE_DONE"
  | "PROPOSAL_SENT"
  | "NEGOTIATING"
  | "SOLD"
  | "LOST";

export const LEAD_STATUS_LABELS: Record<LeadStatus, string> = {
  NEW_LEAD: "Lead novo",
  IN_PROGRESS: "Em atendimento",
  CONTACT_ATTEMPT: "Tentativa de contato",
  CONTACTED: "Contato realizado",
  VISIT_SCHEDULED: "Visita agendada",
  VISITED: "Visitou loja",
  TEST_DRIVE_DONE: "Test-drive realizado",
  PROPOSAL_SENT: "Proposta enviada",
  NEGOTIATING: "Em negociação",
  SOLD: "Venda realizada",
  LOST: "Perdido",
};

export type LeadLostReason =
  | "PRICE"
  | "FINANCING_DENIED"
  | "BOUGHT_COMPETITOR"
  | "GAVE_UP"
  | "NO_RESPONSE"
  | "VEHICLE_SOLD"
  | "VEHICLE_UNAVAILABLE"
  | "TRADE_IN_REJECTED"
  | "OTHER";

export const LEAD_LOST_REASON_LABELS: Record<LeadLostReason, string> = {
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

// Canal de marketing/aquisição do lead — usado no Dashboard Executivo para
// origem, ROI e performance por canal. Distinto de LeadOrigin (que descreve
// o fluxo interno do site que capturou o lead).
export type LeadChannel =
  | "META_ADS"
  | "GOOGLE_ADS"
  | "INSTAGRAM"
  | "FACEBOOK"
  | "WHATSAPP"
  | "SITE"
  | "WEBMOTORS"
  | "ICARROS"
  | "OLX"
  | "REFERRAL"
  | "ORGANIC"
  | "RETURNING_CUSTOMER"
  | "PHONE_CALL"
  | "WALK_IN"
  | "OTHER";

export const LEAD_CHANNEL_LABELS: Record<LeadChannel, string> = {
  META_ADS: "Meta Ads",
  GOOGLE_ADS: "Google Ads",
  INSTAGRAM: "Instagram",
  FACEBOOK: "Facebook",
  WHATSAPP: "WhatsApp",
  SITE: "Site",
  WEBMOTORS: "Webmotors",
  ICARROS: "iCarros",
  OLX: "OLX",
  REFERRAL: "Indicação",
  ORGANIC: "Tráfego orgânico",
  RETURNING_CUSTOMER: "Cliente recorrente",
  PHONE_CALL: "Ligação",
  WALK_IN: "Visita espontânea",
  OTHER: "Outros",
};

export interface Lead {
  id: string;
  name: string;
  email?: string | null;
  phone: string;
  vehicleId?: string | null;
  origin: LeadOrigin;
  stage: LeadStage;
  message?: string | null;
  createdAt: string;

  // --- Campos do Dashboard Executivo / funil comercial (opcionais para não
  // quebrar leads capturados antes desta extensão) ---
  status?: LeadStatus;
  ownerId?: string | null; // vendedor responsável (Salesperson.id)
  channel?: LeadChannel;
  campaignId?: string | null;
  proposalValue?: number | null;
  updatedAt?: string;
  contactedAt?: string | null;
  visitAt?: string | null;
  testDriveAt?: string | null;
  proposalAt?: string | null;
  soldAt?: string | null;
  lostAt?: string | null;
  lostReason?: LeadLostReason | null;
}

// ---------------------------------------------------------------------------
// Dashboard Executivo — vendedores, marketing e vendas (seções 1-22, 27, 29)
// ---------------------------------------------------------------------------

export interface Salesperson {
  id: string;
  name: string;
  email: string;
  phone: string;
  photoSeed: string; // usado só para gerar um avatar-placeholder (iniciais/gradiente) — nunca uma foto real
  role: string; // cargo livre, ex: "Consultor de vendas"
  goalUnits: number; // meta mensal de unidades
  active: boolean;
  createdAt: string;
}

export interface MarketingCampaign {
  id: string;
  name: string;
  channel: LeadChannel;
  platform: string; // "Meta Ads" | "Google Ads" | "Webmotors" | "iCarros" | "OLX" | ...
  cost: number; // em reais (mesma unidade de Vehicle.price/Sale.finalPrice — nunca centavos)
  impressions?: number | null;
  clicks?: number | null;
  startDate: string;
  endDate?: string | null;
  active: boolean;
}

export interface Sale {
  id: string;
  leadId?: string | null;
  vehicleId: string;
  ownerId: string; // Salesperson.id
  channel: LeadChannel;
  campaignId?: string | null;
  finalPrice: number; // em reais, igual a Vehicle.price
  paymentMethod: string;
  soldAt: string;
}

export interface DashboardGoals {
  salesUnitsTarget: number;
  revenueTarget: number; // em reais
}

export type SalespersonInput = Omit<Salesperson, "id" | "createdAt">;
export type MarketingCampaignInput = Omit<MarketingCampaign, "id">;

export type LeadManualInput = {
  name: string;
  phone: string;
  email?: string | null;
  vehicleId?: string | null;
  ownerId?: string | null;
  channel: LeadChannel;
  campaignId?: string | null;
  message?: string | null;
};

export type PeriodPreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "lastMonth"
  | "thisYear"
  | "custom";

export interface DashboardFilters {
  period: PeriodPreset;
  from?: string; // ISO date — usado só quando period === "custom"
  to?: string;
  ownerId?: string;
  vehicleId?: string;
  brand?: string;
  model?: string;
  channel?: LeadChannel;
  campaignId?: string;
  platform?: string;
}

export interface VehicleFilters {
  q?: string;
  brand?: string;
  model?: string;
  priceMin?: number;
  priceMax?: number;
  yearMin?: number;
  yearMax?: number;
  mileageMax?: number;
  transmission?: Transmission;
  fuel?: FuelType;
  bodyType?: BodyType;
  color?: string;
  sort?:
    | "recent"
    | "price_asc"
    | "price_desc"
    | "mileage_asc"
    | "year_desc";
  // Mostra também veículos com status SOLD na vitrine pública (usado só no
  // catálogo, para o carro aparecer marcado "Vendido" em vez de simplesmente
  // sumir) — nunca afeta sugestões de veículos semelhantes.
  includeSold?: boolean;
}

export const BODY_TYPE_LABELS: Record<BodyType, string> = {
  HATCH: "Hatch",
  SEDAN: "Sedã",
  SUV: "SUV",
  PICKUP: "Picape",
  MINIVAN: "Minivan",
  COUPE: "Cupê",
  CONVERTIBLE: "Conversível",
};

export const TRANSMISSION_LABELS: Record<Transmission, string> = {
  MANUAL: "Manual",
  AUTOMATIC: "Automático",
  CVT: "CVT",
  AUTOMATED: "Automatizado",
};

export const FUEL_LABELS: Record<FuelType, string> = {
  FLEX: "Flex",
  GASOLINE: "Gasolina",
  ETHANOL: "Etanol",
  DIESEL: "Diesel",
  HYBRID: "Híbrido",
  ELECTRIC: "Elétrico",
};

export const VEHICLE_STATUS_LABELS: Record<VehicleStatus, string> = {
  AVAILABLE: "Disponível",
  RESERVED: "Reservado",
  SOLD: "Vendido",
  PREPARING: "Em preparação",
};

export const LEAD_STAGE_LABELS: Record<LeadStage, string> = {
  NEW: "Novo Lead",
  CONTACTED: "Contato realizado",
  QUALIFIED: "Qualificado",
  VISIT: "Visita/Test-drive",
  PROPOSAL: "Proposta",
  FINANCING: "Financiamento",
  SOLD: "Venda",
  LOST: "Perdido",
};

export const LEAD_ORIGIN_LABELS: Record<LeadOrigin, string> = {
  SITE: "Site",
  WHATSAPP: "WhatsApp",
  IA_RECOMMENDATION: "Recomendação IA",
  TRADE_IN: "Avaliação de usado",
  FINANCING_SIMULATOR: "Simulador de financiamento",
  CREDIT_PREANALYSIS: "Pré-análise de crédito",
  MARKETPLACE: "Marketplace",
  REFERRAL: "Indicação",
  OTHER: "Outro",
};

// ---------------------------------------------------------------------------
// Análise Inteligente de Crédito (pré-análise via bureau autorizado)
// ---------------------------------------------------------------------------

export type UserRole = "SALES" | "MANAGER" | "ADMIN";

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  SALES: "Vendedor",
  MANAGER: "Gerente",
  ADMIN: "Administrador",
};

export type CreditAnalysisStatus =
  | "COMPLETED" // consulta concluída (integração real configurada)
  | "UNAVAILABLE_DEMO" // ambiente de demonstração, sem integração ativa
  | "FAILED";

export type CommercialStatus =
  | "NEW"
  | "CREDIT_CHECKED"
  | "SIMULATING"
  | "PROPOSAL_SENT"
  | "AWAITING_BANK"
  | "APPROVED_BY_FINANCIER"
  | "REJECTED_BY_FINANCIER"
  | "SALE_COMPLETED";

export const COMMERCIAL_STATUS_LABELS: Record<CommercialStatus, string> = {
  NEW: "Novo",
  CREDIT_CHECKED: "Crédito consultado",
  SIMULATING: "Em simulação",
  PROPOSAL_SENT: "Proposta enviada",
  AWAITING_BANK: "Aguardando banco",
  APPROVED_BY_FINANCIER: "Aprovado pela financeira",
  REJECTED_BY_FINANCIER: "Recusado pela financeira",
  SALE_COMPLETED: "Venda concluída",
};

export interface CreditCustomer {
  id: string;
  name: string;
  cpf: string; // dígitos completos — só usado no backend; UI sempre mascara (maskCpf)
  birthDate: string; // ISO date
  phone: string;
  email?: string | null;
  createdAt: string;
}

export interface CreditConsentRecord {
  id: string;
  customerId: string;
  text: string; // texto exato apresentado no momento do consentimento
  granted: boolean;
  ipAddress?: string | null;
  createdAt: string;
}

export interface CreditIndicators {
  restrictions: string | null;
  pendingDebtsAmount: number | null;
  protests: number | null;
  bouncedChecks: number | null;
  negativeDebts: number | null;
  recentInquiries: number | null;
  positiveRegistry: "ATIVO" | "INATIVO" | null;
}

export type CreditFactorImpact = "POSITIVE" | "NEGATIVE" | "NEUTRAL";

export interface CreditFactor {
  label: string;
  impact: CreditFactorImpact;
}

export interface CreditReport {
  provider: "SERASA_EXPERIAN" | "DEMO";
  demo: boolean; // true = dados simulados, não representam consulta real
  score: number | null;
  scoreRangeMax: number;
  scoreClassification: string | null; // faixa retornada pelo provedor contratado
  riskIndicator: string | null;
  consultedAt: string;
  indicators: CreditIndicators;
  factors: CreditFactor[];
}

export type CreditScenario = "FAVORABLE" | "INTERMEDIATE" | "RISK";

export const CREDIT_SCENARIO_LABELS: Record<CreditScenario, string> = {
  FAVORABLE: "Cenário favorável",
  INTERMEDIATE: "Cenário intermediário",
  RISK: "Cenário de maior risco",
};

export interface CreditAiAnalysis {
  summary: string;
  scenario: CreditScenario;
  suggestions: string[];
}

export interface CreditAnalysis {
  id: string;
  customerId: string;
  vehicleId?: string | null;
  vehicleInterest: string;
  vehiclePrice: number;
  monthlyIncome: number;
  downPayment: number;
  consentRecordId: string;
  status: CreditAnalysisStatus;
  report: CreditReport;
  aiAnalysis: CreditAiAnalysis;
  commercialStatus: CommercialStatus;
  sellerId: string;
  sellerName: string;
  createdAt: string;
}

export interface AuditLogEntry {
  id: string;
  type: "LOGIN" | "LOGIN_FAILED" | "CREDIT_QUERY" | "REPORT_GENERATED" | "DOCUMENT_ACCESS";
  userEmail?: string | null;
  detail: string; // nunca contém CPF completo, tokens ou credenciais
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Assistente de Documentação — checklist por negociação
//
// Geração de checklist, cálculo de progresso, classificação de pendência e
// liberação de entrega são 100% lógica determinística sobre os dados reais
// da negociação (ver lib/server/documentChecklist.ts) — não há chamada a
// nenhum modelo de IA/LLM nem serviço de OCR. Mesma disciplina de
// lib/matching.ts: qualquer heurística é rotulada como tal, nunca
// apresentada como IA real. Leitura de conteúdo de documentos (extração de
// nome/CPF/RENAVAM etc. do arquivo) é Fase 2 — depende de um provedor de
// OCR/visão computacional ainda não integrado.
// ---------------------------------------------------------------------------

export type CustomerKind = "INDIVIDUAL" | "COMPANY";

export const CUSTOMER_KIND_LABELS: Record<CustomerKind, string> = {
  INDIVIDUAL: "Pessoa física",
  COMPANY: "Pessoa jurídica",
};

export type NegotiationPaymentMethod =
  | "CASH"
  | "FINANCING"
  | "CASH_FINANCING_TRADE_IN"
  | "CASH_TRADE_IN"
  | "CASH_FINANCING"
  | "FINANCING_TRADE_IN";

export const NEGOTIATION_PAYMENT_METHOD_LABELS: Record<NegotiationPaymentMethod, string> = {
  CASH: "À vista",
  FINANCING: "Financiamento",
  CASH_FINANCING_TRADE_IN: "À vista/Financiamento/Troca",
  CASH_TRADE_IN: "À vista/Troca",
  CASH_FINANCING: "À vista/Financiamento",
  FINANCING_TRADE_IN: "Financiamento/Troca",
};

export type VehicleCondition = "NEW" | "USED";

export const VEHICLE_CONDITION_LABELS: Record<VehicleCondition, string> = {
  NEW: "Novo",
  USED: "Usado",
};

export type NegotiationStatus = "IN_PROGRESS" | "READY_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";

export const NEGOTIATION_STATUS_LABELS: Record<NegotiationStatus, string> = {
  IN_PROGRESS: "Em andamento",
  READY_FOR_DELIVERY: "Liberado para entrega",
  DELIVERED: "Entregue",
  CANCELLED: "Cancelada",
};

// Classificação de prioridade (seção 1 do briefing) — calculada a partir do
// checklist real; cada negociação cai em exatamente um balde, por ordem de
// prioridade (crítica > aguardando banco > aguardando despachante > aguardando
// cliente > pendente genérico > pronta).
export type NegotiationBucket =
  | "CRITICAL"
  | "AWAITING_BANK"
  | "AWAITING_COURIER"
  | "AWAITING_CLIENT"
  | "PENDING"
  | "READY";

export const NEGOTIATION_BUCKET_LABELS: Record<NegotiationBucket, string> = {
  CRITICAL: "Pendência crítica",
  AWAITING_BANK: "Aguardando banco/financeira",
  AWAITING_COURIER: "Aguardando despachante",
  AWAITING_CLIENT: "Aguardando cliente",
  PENDING: "Documentação pendente",
  READY: "Documentação completa",
};

export type FinancingStatus =
  | "PREPARING_DOCS"
  | "SUBMITTED"
  | "CREDIT_ANALYSIS"
  | "APPROVED"
  | "REJECTED"
  | "CONTRACT_PENDING_SIGNATURE"
  | "CONTRACT_SIGNED"
  | "FUNDS_RELEASED";

export const FINANCING_STATUS_LABELS: Record<FinancingStatus, string> = {
  PREPARING_DOCS: "Documentação sendo preparada",
  SUBMITTED: "Enviada para análise",
  CREDIT_ANALYSIS: "Análise de crédito",
  APPROVED: "Aprovada",
  REJECTED: "Recusada",
  CONTRACT_PENDING_SIGNATURE: "Contrato aguardando assinatura",
  CONTRACT_SIGNED: "Contrato assinado",
  FUNDS_RELEASED: "Pagamento liberado",
};

export type TransferStageKey = "SALE_DONE" | "DOCS_REVIEWED" | "ATPV" | "COURIER" | "DETRAN" | "COMPLETED";

export const TRANSFER_STAGE_LABELS: Record<TransferStageKey, string> = {
  SALE_DONE: "Venda realizada",
  DOCS_REVIEWED: "Documentação conferida",
  ATPV: "ATPV-e",
  COURIER: "Despachante",
  DETRAN: "DETRAN",
  COMPLETED: "Transferência concluída",
};

export const TRANSFER_STAGE_ORDER: TransferStageKey[] = [
  "SALE_DONE",
  "DOCS_REVIEWED",
  "ATPV",
  "COURIER",
  "DETRAN",
  "COMPLETED",
];

export type ChecklistItemStatus =
  | "PENDING" // 🟡 nada recebido ainda
  | "RECEIVED" // 🟡 recebido, aguardando conferência da loja
  | "APPROVED" // 🟢 conferido e completo
  | "REJECTED" // 🔴 recusado — pendência crítica
  | "AWAITING_THIRD_PARTY" // 🔵 aguardando banco/despachante/DETRAN
  | "NOT_APPLICABLE"; // ⚪

export const CHECKLIST_ITEM_STATUS_LABELS: Record<ChecklistItemStatus, string> = {
  PENDING: "Pendente",
  RECEIVED: "Recebido — em conferência",
  APPROVED: "Completo",
  REJECTED: "Recusado",
  AWAITING_THIRD_PARTY: "Aguardando terceiro",
  NOT_APPLICABLE: "Não aplicável",
};

export type ChecklistCategory =
  | "CLIENTE"
  | "VEICULO_ENTRADA"
  | "VEICULO_VENDIDO"
  | "FINANCIAMENTO"
  | "TRANSFERENCIA"
  | "ENTREGA";

export const CHECKLIST_CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  CLIENTE: "Cliente",
  VEICULO_ENTRADA: "Veículo de entrada",
  VEICULO_VENDIDO: "Veículo vendido",
  FINANCIAMENTO: "Financiamento",
  TRANSFERENCIA: "Transferência",
  ENTREGA: "Entrega",
};

export interface ChecklistItem {
  id: string;
  negotiationId: string;
  category: ChecklistCategory;
  key: string;
  label: string;
  required: boolean;
  status: ChecklistItemStatus;
  responsible?: string | null;
  dueDate?: string | null;
  note?: string | null;
  documentIds: string[];
  updatedAt: string;
}

export interface NegotiationDocument {
  id: string;
  negotiationId: string;
  category: ChecklistCategory;
  itemKey?: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string; // caminho relativo em disco — nunca uma URL pública
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface NegotiationHistoryEvent {
  id: string;
  negotiationId: string;
  message: string;
  actor: string;
  createdAt: string;
}

export interface TradeInVehicle {
  plate: string;
  brand: string;
  model: string;
  manufactureYear: number;
  modelYear: number;
  mileageKm: number;
  requestedValue: number;
  marketValue?: number | null;
  storeAppraisalValue?: number | null;
  approvedValue?: number | null;
}

export interface FinancingDetails {
  financierName: string;
  financedAmount: number;
  downPayment: number;
  installments: number; // quantidade de parcelas
  installmentValue: number; // valor de cada parcela
  status: FinancingStatus;
}

export interface Negotiation {
  id: string;
  code: string;
  customerKind: CustomerKind;
  customerName: string;
  customerDocument: string; // CPF ou CNPJ (dígitos)
  customerPhone: string;
  customerEmail: string;
  customerAddress: string;
  customerCep: string;
  customerMarried: boolean;
  hasRepresentativeProcuration: boolean;
  vehicleId: string;
  sellerId: string;
  sellerName: string;
  saleValue: number;
  paymentMethod: NegotiationPaymentMethod;
  financing?: FinancingDetails | null;
  hasTradeIn: boolean;
  tradeIn?: TradeInVehicle | null;
  vehicleCondition: VehicleCondition;
  needsTransfer: boolean;
  interstate: boolean;
  needsCourier: boolean;
  transferStage: TransferStageKey;
  status: NegotiationStatus;
  documentationResponsible?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type NegotiationInput = Omit<
  Negotiation,
  "id" | "code" | "transferStage" | "status" | "createdAt" | "updatedAt"
>;

export interface NegotiationFilters {
  q?: string;
  sellerId?: string;
  vehicleId?: string;
  status?: NegotiationStatus;
  bucket?: NegotiationBucket;
  paymentMethod?: NegotiationPaymentMethod;
  financierName?: string;
  documentationResponsible?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface NegotiationWithChecklist {
  negotiation: Negotiation;
  vehicle: Pick<Vehicle, "id" | "brand" | "model" | "version" | "modelYear" | "slug"> | null;
  items: ChecklistItem[];
  documents: NegotiationDocument[];
  history: NegotiationHistoryEvent[];
  progressPercent: number;
  bucket: NegotiationBucket;
  deliveryReady: boolean;
  missingItems: ChecklistItem[];
}

// ---------------------------------------------------------------------------
// Cadastro de clientes (aba "Clientes") — registro de dados do cliente e da
// CNH, independente de uma venda/negociação específica. Diferente do
// CreditCustomer (usado só pelo módulo de análise de crédito).
// ---------------------------------------------------------------------------

export interface SalesCustomer {
  id: string;
  name: string;
  document: string; // CPF ou CNPJ (dígitos)
  phone: string;
  email?: string | null;
  address: string;
  cep: string;
  cnhNumber: string;
  createdAt: string;
  updatedAt: string;
}

export type SalesCustomerInput = Omit<SalesCustomer, "id" | "createdAt" | "updatedAt">;

// ---------------------------------------------------------------------------
// Contratos (aba "Contratos") — gera o documento completo a partir dos 3
// modelos reais da loja (ver lib/contracts/config.ts para os campos de cada
// tipo e components/contratos/templates para o texto fixo de cada um).
// ---------------------------------------------------------------------------

export interface Contract {
  id: string;
  type: "CONSIGNACAO" | "VENDA_TROCA" | "RECIBO_COMPRA";
  fields: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

export type ContractInput = Pick<Contract, "type" | "fields">;

// ---------------------------------------------------------------------------
// Precificação — Tabela FIPE (integração real, ver lib/server/fipe.ts) e
// preço praticado no mercado.
//
// A FIPE é consultada de verdade em uma API pública (sem scraping, sem
// chave obrigatória). Já "preço praticado" NÃO é obtido por scraping de
// portais (OLX/Webmotors/iCarros proíbem em seus termos de uso e a técnica
// é frágil) — o sistema gera links de busca prontos nesses portais e deixa
// a loja registrar manualmente os preços de anúncios comparáveis que
// encontrar; a média/estatísticas são calculadas de verdade sobre esses
// registros reais, nunca fabricadas.
// ---------------------------------------------------------------------------

// Vínculo (uma vez por veículo) entre o cadastro interno e o modelo/ano
// correspondente na tabela FIPE — necessário porque marca/modelo em texto
// livre não mapeia automaticamente para o código FIPE.
export interface FipeVehicleLink {
  vehicleId: string;
  fipeBrandCode: string;
  fipeBrandName: string;
  fipeModelCode: string;
  fipeModelName: string;
  fipeYearCode: string; // ex: "2023-5" (ano + código de combustível da FIPE)
  fipeYearLabel: string; // ex: "2023 Flex"
  updatedAt: string;
}

// Uma consulta real ao valor FIPE, arquivada para manter histórico.
export interface FipeQuote {
  id: string;
  vehicleId: string;
  fipeCode: string; // "CodigoFipe" retornado pela API, ex: "002111-3"
  value: number; // valor em reais, já convertido de "R$ 125.829,00"
  referenceMonth: string; // "MesReferencia" retornado pela API
  fuel: string;
  queriedAt: string;
}

// Preço de um anúncio comparável encontrado manualmente pela loja (nunca
// coletado automaticamente).
export interface MarketPriceSample {
  id: string;
  vehicleId: string;
  source: string; // ex: "OLX", "Webmotors", "Concorrente X"
  price: number;
  url?: string | null;
  note?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface VehiclePricingSnapshot {
  vehicle: Pick<Vehicle, "id" | "brand" | "model" | "version" | "modelYear" | "price" | "slug" | "enteredStockAt">;
  fipeLink: FipeVehicleLink | null;
  latestFipeQuote: FipeQuote | null;
  fipeHistory: FipeQuote[];
  marketSamples: MarketPriceSample[];
}

// ---------------------------------------------------------------------------
// Notas Fiscais (NF-e) — seção "emissor de NF"
// ---------------------------------------------------------------------------
//
// Emitir uma NF-e de verdade exige assinatura com certificado digital (A1/A3)
// e comunicação com o webservice da SEFAZ do estado da loja — não é algo que
// se simula. Enquanto essa integração não existe, o sistema só registra a
// intenção de emissão (status PENDING_INTEGRATION) com os dados reais que já
// temos (veículo, comprador, valor) — nunca fabrica chave de acesso, número,
// protocolo ou XML/DANFE como se a nota tivesse sido emitida de verdade.

export type TaxRegime = "SIMPLES_NACIONAL" | "LUCRO_PRESUMIDO" | "LUCRO_REAL";

export const TAX_REGIME_LABELS: Record<TaxRegime, string> = {
  SIMPLES_NACIONAL: "Simples Nacional",
  LUCRO_PRESUMIDO: "Lucro Presumido",
  LUCRO_REAL: "Lucro Real",
};

export interface CompanyFiscalProfile {
  cnpj: string; // apenas dígitos
  razaoSocial: string;
  nomeFantasia?: string | null;
  inscricaoEstadual: string;
  regimeTributario: TaxRegime;
  cep: string;
  logradouro: string;
  numero: string;
  bairro: string;
  municipio: string;
  ibgeMunicipioCode?: string | null; // código IBGE — exigido pelo layout da NF-e, preenchido quando disponível
  uf: string;
  updatedAt: string;
}

export type CompanyFiscalProfileInput = Omit<CompanyFiscalProfile, "updatedAt">;

export type InvoiceStatus =
  | "PENDING_INTEGRATION" // nenhuma integração com a SEFAZ configurada ainda
  | "CANCELLED";

export const INVOICE_STATUS_LABELS: Record<InvoiceStatus, string> = {
  PENDING_INTEGRATION: "Pendente de integração",
  CANCELLED: "Cancelada",
};

export interface Invoice {
  id: string;
  saleId?: string | null;
  vehicleId: string;
  buyerName: string;
  buyerDocument: string; // CPF ou CNPJ — apenas dígitos; UI sempre mascara (maskCpf/maskCnpj)
  value: number; // em reais
  status: InvoiceStatus;
  notes?: string | null;
  requestedBy: string; // nome de quem solicitou a emissão
  createdAt: string;
  cancelledAt?: string | null;

  // Preenchidos apenas quando uma integração real de emissão existir —
  // hoje sempre null.
  accessKey?: string | null;
  series?: string | null;
  number?: string | null;
  protocol?: string | null;
  xmlUrl?: string | null;
  danfeUrl?: string | null;
  issuedAt?: string | null;
}

export type InvoiceInput = {
  saleId?: string | null;
  vehicleId: string;
  buyerName: string;
  buyerDocument: string;
  value: number;
  notes?: string | null;
};
