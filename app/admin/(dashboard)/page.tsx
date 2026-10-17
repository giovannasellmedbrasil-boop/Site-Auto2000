import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/lib/server/auth";
import { getDashboardMetrics } from "@/lib/server/db";
import { getDashboardData, parseDashboardFilters, filtersToQueryString } from "@/lib/server/dashboard";
import { Card } from "@/components/ui/Card";
import { Clock, AlertTriangle } from "lucide-react";
import { FilterBar } from "@/components/admin/dashboard/FilterBar";
import { StatCard } from "@/components/admin/dashboard/StatCard";
import { SalespersonRanking } from "@/components/admin/dashboard/SalespersonRanking";
import { GoalProgress } from "@/components/admin/dashboard/GoalProgress";
import { EditGoalsModal } from "@/components/admin/dashboard/EditGoalsModal";
import { TimeSeriesChart } from "@/components/admin/dashboard/TimeSeriesChart";
import { Button } from "@/components/ui/Button";
import { Money, MoneyPrivacyProvider, MoneyPrivacyToggle } from "@/components/admin/dashboard/MoneyPrivacy";

export const metadata: Metadata = { title: "Visão Executiva", robots: { index: false } };

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getAdminSession();
  if (session?.hideDashboard) redirect("/admin/documentacao/nova");

  const sp = await searchParams;
  const urlParams = new URLSearchParams(Object.entries(sp).filter(([, v]) => v != null) as [string, string][]);
  const filters = parseDashboardFilters(urlParams);
  const [data, m] = await Promise.all([getDashboardData(filters), getDashboardMetrics()]);
  const filtersQuery = filtersToQueryString(filters);

  const stockHealth = [
    { label: "0–30 dias", value: m.stock0to30, tone: "text-success-600" },
    { label: "31–60 dias", value: m.stock31to60, tone: "text-ink-700" },
    { label: "61–90 dias", value: m.stock61to90, tone: "text-warning-500" },
    { label: "+90 dias", value: m.stock90plus, tone: "text-danger-500" },
  ];

  return (
    <MoneyPrivacyProvider>
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-accent-400">Visão Executiva</h1>
          <p className="text-sm text-ink-500">
            Canais, campanhas e vendas · {data.period.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <MoneyPrivacyToggle />
          <Button variant="outline" size="sm" href={`/admin/relatorio?${filtersQuery}`}>
            Exportar relatório
          </Button>
        </div>
      </div>

      <FilterBar options={data.filterOptions} />

      {/* Cards de indicadores principais (seção 2) */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard
          label="Leads recebidos"
          value={String(data.kpis.leads.value)}
          icon="users"
          deltaPct={data.kpis.leads.deltaPct}
          direction={data.kpis.leads.direction}
          drill={{ metric: "leads", kind: "leads", title: "Leads recebidos" }}
          filtersQuery={filtersQuery}
        />
        <StatCard
          label="Visitantes do site"
          value={String(data.siteVisitors)}
          icon="globe"
          filtersQuery={filtersQuery}
        />
        <StatCard
          label="Veículos vendidos"
          value={String(data.kpis.sales.value)}
          icon="trending-up"
          deltaPct={data.kpis.sales.deltaPct}
          direction={data.kpis.sales.direction}
          drill={{ metric: "sold", kind: "sales", title: "Vendas realizadas" }}
          filtersQuery={filtersQuery}
        />
        <StatCard
          label="Faturamento"
          value={<Money value={data.kpis.revenue.value} />}
          icon="dollar-sign"
          deltaPct={data.kpis.revenue.deltaPct}
          direction={data.kpis.revenue.direction}
          drill={{ metric: "sold", kind: "sales", title: "Vendas realizadas" }}
          filtersQuery={filtersQuery}
        />
        <StatCard
          label="Ticket médio"
          value={<Money value={data.kpis.avgTicket} />}
          icon="receipt"
          filtersQuery={filtersQuery}
        />
        <StatCard
          label="Lucro"
          value={<Money value={data.kpis.profit.value} />}
          icon="wallet"
          deltaPct={data.kpis.profit.deltaPct}
          direction={data.kpis.profit.direction}
          sublabel="Faturamento menos o que foi pago pelos carros vendidos"
          filtersQuery={filtersQuery}
        />
        <StatCard
          label="Veículos comprados"
          value={String(data.purchasedVehicles.count)}
          sublabel={<>Total pago: <Money value={data.purchasedVehicles.totalValue} /></>}
          icon="car"
          filtersQuery={filtersQuery}
        />
      </div>

      {/* Performance dos vendedores (seção 8) */}
      <div>
        <h2 className="mb-4 text-base font-semibold text-accent-400">Performance dos vendedores</h2>
        <SalespersonRanking rows={data.salespeople} />
      </div>

      {/* Metas (seções 10, 11) */}
      <Card className="p-6">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-base font-semibold text-accent-400">Meta do mês</h2>
          <EditGoalsModal salesUnitsTarget={data.goals.salesUnitsTarget} revenueTarget={data.goals.revenueTarget} />
        </div>
        <GoalProgress goals={data.goals} />
      </Card>

      {/* Gráficos de vendas e faturamento (seções 16, 17) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card className="p-6">
          <h2 className="mb-5 text-base font-semibold text-accent-400">Vendas ao longo do tempo</h2>
          <TimeSeriesChart data={data.salesOverTime} kind="count" />
        </Card>
        <Card className="p-6">
          <h2 className="mb-5 text-base font-semibold text-accent-400">Faturamento ao longo do tempo</h2>
          <TimeSeriesChart data={data.revenueOverTime} kind="currency" />
        </Card>
      </div>

      {/* Saúde do estoque (aging) — já existia, mantido */}
      <div>
        <div className="mb-4 flex items-center gap-2">
          <Clock className="h-4.5 w-4.5 text-ink-600" />
          <h2 className="text-base font-semibold text-accent-400">Saúde do estoque</h2>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {stockHealth.map(({ label, value, tone }) => (
            <Card key={label} className="flex flex-col gap-1 p-5">
              <span className={`text-2xl font-semibold ${tone}`}>{value}</span>
              <span className="text-xs text-ink-500">{label}</span>
            </Card>
          ))}
        </div>
        {m.stock90plus > 0 && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-warning-500/30 bg-warning-500/10 px-4 py-3 text-sm text-warning-500">
            <AlertTriangle className="h-4.5 w-4.5 shrink-0" />
            {m.stock90plus} veículo(s) parado(s) há mais de 90 dias — considere revisão de preço ou campanha dedicada.
          </div>
        )}
      </div>

    </div>
    </MoneyPrivacyProvider>
  );
}
