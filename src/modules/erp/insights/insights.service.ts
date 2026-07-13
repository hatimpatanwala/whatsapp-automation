import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TenantConnectionManager } from '../../../database/tenant-connection.manager';

type InsightKind = 'positive' | 'warning' | 'critical' | 'info' | 'tip';
interface Insight {
  id: string;
  kind: InsightKind;
  icon: string;
  title: string;
  detail: string;
  recommendation?: string;
}

const r0 = (n: any) => Math.round(Number(n) || 0);
const r2 = (n: any) => Math.round((Number(n) || 0) * 100) / 100;
const inr = (n: any) => r0(n).toLocaleString('en-IN');
const pct = (a: number, b: number) => (b > 0 ? Math.round(((a - b) / b) * 100) : a > 0 ? 100 : 0);

/**
 * Business "AI Insights" engine. It computes a rich picture of the business from
 * the tenant's own data (sales momentum, profit, product performance, receivables
 * risk, customer concentration, stock) and turns it into plain-language, actionable
 * insights + a headline narrative.
 *
 * Analysis is anchored on the LATEST data month (not today) so it stays meaningful
 * for historical/migrated datasets. If an ANTHROPIC_API_KEY is configured the
 * narrative is upgraded to an LLM-written executive summary; otherwise a strong
 * deterministic narrative is used. Results are cached briefly per tenant.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);
  private readonly cache = new Map<string, { at: number; data: any }>();
  private readonly TTL = 15 * 60 * 1000; // 15 min

  constructor(
    private readonly cm: TenantConnectionManager,
    private readonly config: ConfigService,
  ) {}

  async insights(schema: string, force = false): Promise<any> {
    const cached = this.cache.get(schema);
    if (!force && cached && Date.now() - cached.at < this.TTL) return cached.data;

    const metrics = await this.computeMetrics(schema);
    const insights = this.deriveInsights(metrics);
    const template = this.narrative(metrics, insights);

    let narrative = template;
    let aiPowered = false;
    try {
      const llm = await this.llmNarrative(metrics, insights);
      if (llm) { narrative = llm; aiPowered = true; }
    } catch (e: any) {
      this.logger.debug(`LLM narrative skipped: ${e?.message}`);
    }

    const data = {
      generatedAt: new Date().toISOString(),
      asOf: metrics.asOf,
      aiPowered,
      headline: insights[0]?.title || 'Here’s how your business is doing',
      narrative,
      kpis: metrics.kpis,
      insights,
      monthlySeries: metrics.monthlySeries,
      topProducts: metrics.topProducts,
    };
    this.cache.set(schema, { at: Date.now(), data });
    return data;
  }

  // ─── Metrics ─────────────────────────────────────────────────────────────────
  private async computeMetrics(schema: string) {
    return this.cm.executeInTenantContext(schema, async (qr) => {
      const anchorRow = (await qr.query(
        `SELECT COALESCE(MAX(issued_at), NOW())::date AS d FROM "${schema}".invoices WHERE issued_at IS NOT NULL`,
      ))[0];
      const asOf: string = anchorRow?.d ? new Date(anchorRow.d).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);

      const monthly = await qr.query(
        `WITH months AS (
           SELECT (date_trunc('month', $1::date) - (i || ' month')::interval) AS m
           FROM generate_series(0,5) i
         )
         SELECT to_char(m,'Mon ''YY') AS label, to_char(m,'YYYY-MM') AS ym,
           COALESCE((SELECT SUM(COALESCE(base_total,total)) FROM "${schema}".invoices iv WHERE date_trunc('month',iv.issued_at)=months.m),0)::float AS sales,
           COALESCE((SELECT COUNT(*) FROM "${schema}".invoices iv WHERE date_trunc('month',iv.issued_at)=months.m),0)::int AS count
         FROM months ORDER BY m`,
        [asOf],
      );
      const thisMonth = monthly[monthly.length - 1] || { sales: 0, count: 0 };
      const lastMonth = monthly[monthly.length - 2] || { sales: 0, count: 0 };

      const recv = (await qr.query(
        `SELECT COALESCE(SUM(balance_due*COALESCE(exchange_rate,1)),0)::float AS total,
                COUNT(*) FILTER (WHERE balance_due > 0)::int AS bills,
                COALESCE(SUM(balance_due*COALESCE(exchange_rate,1)) FILTER (WHERE COALESCE(due_date,issued_at) < $1::date - INTERVAL '90 days'),0)::float AS overdue90,
                COALESCE(SUM(balance_due*COALESCE(exchange_rate,1)) FILTER (WHERE COALESCE(due_date,issued_at) < $1::date),0)::float AS overdue
         FROM "${schema}".invoices WHERE balance_due > 0`,
        [asOf],
      ))[0];

      let expenses = { this_month: 0, last_month: 0 };
      try {
        expenses = (await qr.query(
          `SELECT COALESCE(SUM(total) FILTER (WHERE date_trunc('month',expense_date)=date_trunc('month',$1::date)),0)::float AS this_month,
                  COALESCE(SUM(total) FILTER (WHERE date_trunc('month',expense_date)=date_trunc('month',$1::date)-interval '1 month'),0)::float AS last_month
           FROM "${schema}".expenses WHERE removed = false`,
          [asOf],
        ))[0];
      } catch { /* expenses table may be absent on a lean tenant */ }

      // Product performance from invoice line items (JSONB) — this vs last month.
      let products: any[] = [];
      try {
        products = await qr.query(
          `WITH lines AS (
             SELECT NULLIF(trim(it->>'description'),'') AS name,
                    date_trunc('month', iv.issued_at) AS m,
                    COALESCE(NULLIF(it->>'lineTotal','')::numeric, 0) AS val,
                    COALESCE(NULLIF(it->>'quantity','')::numeric, 0) AS qty
             FROM "${schema}".invoices iv,
                  jsonb_array_elements(CASE WHEN jsonb_typeof(iv.items)='array' THEN iv.items ELSE '[]'::jsonb END) it
             WHERE iv.issued_at >= date_trunc('month',$1::date) - interval '1 month'
               AND iv.issued_at < date_trunc('month',$1::date) + interval '1 month'
           )
           SELECT name,
             COALESCE(SUM(val) FILTER (WHERE m = date_trunc('month',$1::date)),0)::float AS this_val,
             COALESCE(SUM(qty) FILTER (WHERE m = date_trunc('month',$1::date)),0)::float AS this_qty,
             COALESCE(SUM(val) FILTER (WHERE m = date_trunc('month',$1::date) - interval '1 month'),0)::float AS last_val
           FROM lines WHERE name IS NOT NULL
           GROUP BY name ORDER BY this_val DESC LIMIT 40`,
          [asOf],
        );
      } catch (e: any) { this.logger.debug(`product insight query skipped: ${e?.message}`); }

      const topProducts = products
        .filter((p) => p.this_val > 0)
        .slice(0, 6)
        .map((p) => ({ name: p.name, qty: r2(p.this_qty), value: r0(p.this_val) }));
      // A meaningful decline: was selling well last month, dropped ≥40%.
      const decliner = products
        .filter((p) => p.last_val >= 1000 && p.this_val < p.last_val * 0.6)
        .sort((a, b) => (b.last_val - b.this_val) - (a.last_val - a.this_val))[0] || null;
      const riser = products
        .filter((p) => p.this_val >= 1000 && p.last_val > 0 && p.this_val > p.last_val * 1.5)
        .sort((a, b) => (b.this_val - b.last_val) - (a.this_val - a.last_val))[0] || null;

      const concentration = (await qr.query(
        `SELECT COALESCE(c.name,'A customer') AS name, SUM(COALESCE(iv.base_total,iv.total))::float AS val
         FROM "${schema}".invoices iv LEFT JOIN "${schema}".customers c ON c.id = iv.customer_id
         WHERE date_trunc('month',iv.issued_at) = date_trunc('month',$1::date)
         GROUP BY c.name ORDER BY val DESC NULLS LAST LIMIT 1`,
        [asOf],
      ))[0] || { name: null, val: 0 };

      const bestDay = (await qr.query(
        `SELECT trim(to_char(issued_at,'Day')) AS day, SUM(COALESCE(base_total,total))::float AS val
         FROM "${schema}".invoices
         WHERE issued_at >= $1::date - interval '90 days' AND issued_at <= $1::date + interval '1 day'
         GROUP BY day ORDER BY val DESC NULLS LAST LIMIT 1`,
        [asOf],
      ))[0] || null;

      let lowStock = 0;
      try {
        lowStock = (await qr.query(
          `SELECT COUNT(*)::int AS n FROM "${schema}".inventory i
           JOIN "${schema}".products p ON p.id = i.product_id AND p.is_active = true AND p.deleted_at IS NULL
           WHERE COALESCE(i.track_inventory,true) AND (i.stock_quantity - COALESCE(i.reserved_quantity,0)) <= COALESCE(NULLIF(i.low_stock_threshold,0), 0)
             AND (i.stock_quantity - COALESCE(i.reserved_quantity,0)) <= 0`,
        ))[0]?.n || 0;
      } catch { /* inventory table optional */ }

      const newCust = (await qr.query(
        `SELECT COUNT(*) FILTER (WHERE date_trunc('month',created_at)=date_trunc('month',$1::date))::int AS this_month,
                COUNT(*) FILTER (WHERE date_trunc('month',created_at)=date_trunc('month',$1::date)-interval '1 month')::int AS last_month
         FROM "${schema}".customers WHERE deleted_at IS NULL`,
        [asOf],
      ))[0] || { this_month: 0, last_month: 0 };

      const income = Number(thisMonth.sales) || 0;
      const exp = Number(expenses.this_month) || 0;
      const netProfit = r2(income - exp);
      const marginPct = income > 0 ? Math.round((netProfit / income) * 100) : 0;
      const concShare = income > 0 ? Math.round((Number(concentration.val || 0) / income) * 100) : 0;

      return {
        asOf,
        monthlySeries: monthly.map((m: any) => ({ label: m.label, sales: r0(m.sales), count: m.count })),
        topProducts,
        decliner, riser,
        concentration: { ...concentration, share: concShare },
        bestDay,
        lowStock,
        newCust,
        expenses,
        thisMonth: { sales: r0(thisMonth.sales), count: thisMonth.count },
        lastMonth: { sales: r0(lastMonth.sales), count: lastMonth.count },
        growthPct: pct(Number(thisMonth.sales) || 0, Number(lastMonth.sales) || 0),
        receivables: recv,
        kpis: {
          salesThisMonth: r0(thisMonth.sales),
          salesLastMonth: r0(lastMonth.sales),
          growthPct: pct(Number(thisMonth.sales) || 0, Number(lastMonth.sales) || 0),
          netProfit, marginPct,
          receivables: r0(recv?.total),
          overdue90: r0(recv?.overdue90),
          topProduct: topProducts[0]?.name || null,
        },
      };
    });
  }

  // ─── Deterministic insight rules ─────────────────────────────────────────────
  private deriveInsights(m: any): Insight[] {
    const out: Insight[] = [];
    const g = m.growthPct;

    if (m.lastMonth.sales > 0 && m.thisMonth.sales > 0) {
      if (g >= 5) out.push({ id: 'sales-up', kind: 'positive', icon: 'pi-arrow-up-right',
        title: `Sales up ${g}% this month`,
        detail: `₹${inr(m.thisMonth.sales)} vs ₹${inr(m.lastMonth.sales)} last month.`,
        recommendation: 'Momentum is with you — double down on what’s working and keep fast-movers in stock.' });
      else if (g <= -5) out.push({ id: 'sales-down', kind: 'warning', icon: 'pi-arrow-down-right',
        title: `Sales down ${Math.abs(g)}% this month`,
        detail: `₹${inr(m.thisMonth.sales)} vs ₹${inr(m.lastMonth.sales)} last month.`,
        recommendation: 'Reach out to customers who bought last month but not this month, and push a scheme to revive demand.' });
      else out.push({ id: 'sales-flat', kind: 'info', icon: 'pi-minus',
        title: `Sales steady this month`,
        detail: `₹${inr(m.thisMonth.sales)} this month, about the same as last month.`,
        recommendation: 'A promotion or new product could break the plateau.' });
    } else if (m.thisMonth.sales > 0) {
      out.push({ id: 'sales-now', kind: 'info', icon: 'pi-chart-line',
        title: `₹${inr(m.thisMonth.sales)} in sales this period`,
        detail: `${m.thisMonth.count} invoice(s) in the latest month.` });
    }

    if (m.receivables?.overdue90 > 0) out.push({ id: 'overdue90', kind: 'critical', icon: 'pi-exclamation-triangle',
      title: `₹${inr(m.receivables.overdue90)} stuck in 90+ day overdue bills`,
      detail: `Total outstanding is ₹${inr(m.receivables.total)} across ${m.receivables.bills} bill(s).`,
      recommendation: 'Prioritise collection on the oldest bills — assign them to a salesman and record promise-to-pay dates.' });
    else if (m.receivables?.overdue > 0) out.push({ id: 'overdue', kind: 'warning', icon: 'pi-clock',
      title: `₹${inr(m.receivables.overdue)} in overdue receivables`,
      detail: `Outstanding across ${m.receivables.bills} open bill(s).`,
      recommendation: 'Send reminders on overdue bills before they age past 90 days.' });

    if (m.topProducts?.length) out.push({ id: 'top-product', kind: 'positive', icon: 'pi-star-fill',
      title: `Top seller: ${m.topProducts[0].name}`,
      detail: `₹${inr(m.topProducts[0].value)} from ${m.topProducts[0].qty} unit(s) this month.`,
      recommendation: 'Keep it well-stocked and bundle it with slower items to lift the basket.' });

    if (m.riser) out.push({ id: 'riser', kind: 'positive', icon: 'pi-bolt',
      title: `${m.riser.name} is trending up`,
      detail: `Sales rose to ₹${inr(m.riser.this_val)} from ₹${inr(m.riser.last_val)} last month.`,
      recommendation: 'Ride the trend — feature it and ensure supply keeps up.' });

    if (m.decliner) out.push({ id: 'decliner', kind: 'warning', icon: 'pi-chart-line',
      title: `${m.decliner.name} sales are slipping`,
      detail: `Down to ₹${inr(m.decliner.this_val)} from ₹${inr(m.decliner.last_val)} last month.`,
      recommendation: 'Check stock and price, and offer it to customers who used to buy it.' });

    if (m.expenses?.this_month > 0) {
      if (m.kpis.marginPct < 0) out.push({ id: 'loss', kind: 'critical', icon: 'pi-wallet',
        title: `Running at a loss this month`,
        detail: `Expenses ₹${inr(m.expenses.this_month)} exceed sales ₹${inr(m.thisMonth.sales)} (margin ${m.kpis.marginPct}%).`,
        recommendation: 'Review your biggest expense categories and push sales/collections to turn positive.' });
      else out.push({ id: 'profit', kind: m.kpis.marginPct >= 15 ? 'positive' : 'info', icon: 'pi-wallet',
        title: `Net profit ₹${inr(m.kpis.netProfit)} this month`,
        detail: `Margin of ${m.kpis.marginPct}% on ₹${inr(m.thisMonth.sales)} sales.`,
        recommendation: m.kpis.marginPct < 10 ? 'Thin margin — revisit pricing on low-margin lines and trim avoidable costs.' : undefined });
    } else {
      out.push({ id: 'no-expense', kind: 'tip', icon: 'pi-pencil',
        title: 'Record expenses to see true profit',
        detail: 'No expenses are logged this month, so profit can’t be calculated.',
        recommendation: 'Enter purchases and running costs to unlock profit & margin insights.' });
    }

    if (m.concentration?.share >= 30 && m.concentration?.name) out.push({ id: 'concentration', kind: 'warning', icon: 'pi-users',
      title: `${m.concentration.share}% of sales rely on one customer`,
      detail: `${m.concentration.name} drives ₹${inr(m.concentration.val)} of this month’s sales.`,
      recommendation: 'Grow your other accounts to reduce dependence on a single buyer.' });

    if (m.lowStock > 0) out.push({ id: 'low-stock', kind: 'warning', icon: 'pi-box',
      title: `${m.lowStock} item(s) out of / low on stock`,
      detail: 'Stock-outs on active products can cost you sales.',
      recommendation: 'Reorder the affected items before demand slips away.' });

    if (m.bestDay?.day && m.bestDay.val > 0) out.push({ id: 'best-day', kind: 'tip', icon: 'pi-calendar',
      title: `${m.bestDay.day} is your strongest sales day`,
      detail: 'Based on the last 90 days of sales.',
      recommendation: `Make sure stock and staff are ready for ${m.bestDay.day}s.` });

    if (m.newCust?.this_month > 0) out.push({ id: 'new-cust', kind: m.newCust.this_month >= m.newCust.last_month ? 'positive' : 'info', icon: 'pi-user-plus',
      title: `${m.newCust.this_month} new customer(s) this month`,
      detail: m.newCust.last_month > 0 ? `${m.newCust.last_month} were added last month.` : 'Fresh accounts added this month.',
      recommendation: m.newCust.this_month < m.newCust.last_month ? 'New-customer acquisition dipped — consider a referral or onboarding offer.' : undefined });

    // Order: criticals first, then warnings, then positives/info/tips.
    const rank: Record<InsightKind, number> = { critical: 0, warning: 1, positive: 2, info: 3, tip: 4 };
    return out.sort((a, b) => rank[a.kind] - rank[b.kind]);
  }

  private narrative(m: any, insights: Insight[]): string {
    const bits: string[] = [];
    if (m.thisMonth.sales > 0) {
      const dir = m.growthPct > 0 ? `up ${m.growthPct}%` : m.growthPct < 0 ? `down ${Math.abs(m.growthPct)}%` : 'steady';
      bits.push(`Sales stand at ₹${inr(m.thisMonth.sales)} for the latest month, ${dir} versus the month before.`);
    }
    if (m.expenses?.this_month > 0) bits.push(`Net profit is ₹${inr(m.kpis.netProfit)} at a ${m.kpis.marginPct}% margin.`);
    if (m.receivables?.total > 0) bits.push(`₹${inr(m.receivables.total)} is still to be collected${m.receivables.overdue90 > 0 ? `, of which ₹${inr(m.receivables.overdue90)} is 90+ days overdue` : ''}.`);
    if (m.topProducts?.length) bits.push(`${m.topProducts[0].name} is your best-selling item.`);
    const actions = insights.filter((i) => i.recommendation).slice(0, 2).map((i) => i.recommendation);
    if (actions.length) bits.push(`Suggested next steps: ${actions.join(' ')}`);
    return bits.join(' ') || 'Not enough activity yet to generate insights — start recording sales, expenses and stock.';
  }

  // ─── Optional LLM upgrade (only if ANTHROPIC_API_KEY is set) ──────────────────
  private async llmNarrative(m: any, insights: Insight[]): Promise<string | null> {
    const key = this.config.get<string>('ANTHROPIC_API_KEY');
    if (!key) return null;
    const model = this.config.get<string>('AI_INSIGHTS_MODEL', 'claude-sonnet-4-6');
    const payload = {
      asOf: m.asOf,
      salesThisMonth: m.thisMonth.sales, salesLastMonth: m.lastMonth.sales, growthPct: m.growthPct,
      netProfit: m.kpis.netProfit, marginPct: m.kpis.marginPct,
      receivables: m.kpis.receivables, overdue90: m.kpis.overdue90,
      topProducts: m.topProducts, decliner: m.decliner?.name, concentration: m.concentration,
      bestDay: m.bestDay?.day, lowStock: m.lowStock, monthlySeries: m.monthlySeries,
      findings: insights.map((i) => i.title),
    };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 12000);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        signal: controller.signal,
        body: JSON.stringify({
          model, max_tokens: 400,
          system: 'You are a sharp business analyst for an Indian SME using an ERP. From the JSON metrics, write a concise executive summary in plain English (2-3 sentences) followed by exactly 3 prioritised, specific recommendations as short bullet lines starting with "•". Use ₹ and Indian number formatting. Be direct and practical. Do not restate every number.',
          messages: [{ role: 'user', content: `Metrics:\n${JSON.stringify(payload)}` }],
        }),
      });
      if (!res.ok) return null;
      const json: any = await res.json();
      const text = (json?.content || []).map((c: any) => c?.text || '').join('').trim();
      return text || null;
    } finally {
      clearTimeout(timer);
    }
  }
}
