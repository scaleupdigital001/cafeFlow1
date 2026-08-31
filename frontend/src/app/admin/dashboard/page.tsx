'use client';

import React, { useEffect, useState } from 'react';
import api from '../../../lib/axios';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';
import { Loader2, TrendingUp, DollarSign, ShoppingBag, Layers, Star, Info, Download, AlertTriangle } from 'lucide-react';
import dynamic from 'next/dynamic';

const ResponsiveContainer = dynamic(() => import('recharts').then((m) => m.ResponsiveContainer), { ssr: false });
const AreaChart = dynamic(() => import('recharts').then((m) => m.AreaChart), { ssr: false });
const Area = dynamic(() => import('recharts').then((m) => m.Area), { ssr: false });
const XAxis = dynamic(() => import('recharts').then((m) => m.XAxis), { ssr: false });
const YAxis = dynamic(() => import('recharts').then((m) => m.YAxis), { ssr: false });
const Tooltip = dynamic(() => import('recharts').then((m) => m.Tooltip), { ssr: false });
const PieChart = dynamic(() => import('recharts').then((m) => m.PieChart), { ssr: false });
const Pie = dynamic(() => import('recharts').then((m) => m.Pie), { ssr: false });
const Cell = dynamic(() => import('recharts').then((m) => m.Cell), { ssr: false });
const BarChart = dynamic(() => import('recharts').then((m) => m.BarChart), { ssr: false });
const Bar = dynamic(() => import('recharts').then((m) => m.Bar), { ssr: false });
const Legend = dynamic(() => import('recharts').then((m) => m.Legend), { ssr: false });

interface MetricCards {
  totalOrders: number;
  todayOrders: number;
  totalRevenue: number;
  todayRevenue: number;
  activeTablesCount: number;
}

interface SalesTrendPoint {
  date: string;
  revenue: number;
  count: number;
}

interface PopularDishPoint {
  name: string;
  quantity: number;
  revenue: number;
}

interface OrderStatusPoint {
  name: string;
  value: number;
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cards, setCards] = useState<MetricCards | null>(null);
  const [salesTrend, setSalesTrend] = useState<SalesTrendPoint[]>([]);
  const [popularDishes, setPopularDishes] = useState<PopularDishPoint[]>([]);
  const [orderStatuses, setOrderStatuses] = useState<OrderStatusPoint[]>([]);
  
  const [mounted, setMounted] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(todayStr);
  const [reportError, setReportError] = useState<string | null>(null);
  const [downloadingReport, setDownloadingReport] = useState(false);

  const isEndBeforeStart = Boolean(startDate && endDate && endDate < startDate);
  const isFutureDate = Boolean((startDate && startDate > todayStr) || (endDate && endDate > todayStr));
  const validationError = isEndBeforeStart
    ? 'End date cannot be earlier than start date.'
    : isFutureDate
    ? 'Report dates cannot be in the future.'
    : null;

  const handleDownloadReport = async () => {
    if (validationError) return;
    setDownloadingReport(true);
    setReportError(null);

    try {
      const res = await api.get('/analytics/daily-report', {
        params: { startDate, endDate },
        responseType: 'blob'
      });

      // Handle server error returned as Blob
      const contentType = String(res.headers['content-type'] || '');
      if (contentType.includes('application/json')) {
        const text = await res.data.text();
        const json = JSON.parse(text);
        setReportError(json.message || 'No sales data found for the selected range.');
        return;
      }

      const isSingleDay = startDate === endDate;
      const filename = isSingleDay
        ? `daily_sales_report_${startDate}.csv`
        : `sales_report_${startDate}_to_${endDate}.csv`;

      const blob = new Blob([res.data], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
    } catch (err: any) {
      console.error('Download report error:', err);
      let message = 'No sales data found for the selected date range.';
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          if (parsed.message) message = parsed.message;
        } catch (_) {}
      } else if (err.response?.data?.message) {
        message = err.response.data.message;
      }
      setReportError(message);
    } finally {
      setDownloadingReport(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    const fetchAnalytics = async () => {
      try {
        const response = await api.get('/analytics/overview');
        const { cards, salesTrend, popularDishes, orderStatuses } = response.data.data;
        
        setCards(cards);
        setSalesTrend(salesTrend);
        setPopularDishes(popularDishes);
        setOrderStatuses(orderStatuses);
      } catch (err: any) {
        console.error('Analytics load error:', err);
        setError('Failed to load dashboard analytics.');
      } finally {
        setLoading(false);
      }
    };

    fetchAnalytics();
  }, []);

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !cards) {
    return (
      <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-xl flex items-center gap-2">
        <Info className="w-5 h-5 shrink-0" />
        <span>{error || 'Failed to populate analytics.'}</span>
      </div>
    );
  }

  // Pie chart coloring values (warm tones matching amber theme)
  const STATUS_COLORS = {
    received: '#ef4444',   // Red
    accepted: '#3b82f6',   // Blue
    preparing: '#f59e0b',  // Amber
    ready: '#10b981',      // Emerald
    served: '#d97706',     // Dark Amber
  };

  const getCellColor = (name: string) => {
    return (STATUS_COLORS as any)[name] || '#78716c'; // Stone color fallback
  };

  return (
    <div className="space-y-6">
      {/* Dashboard Top bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card border border-border/40 p-5 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-xl font-serif font-black tracking-tight">Business Overview</h2>
          <p className="text-xs text-muted-foreground mt-0.5">Real-time cafe sales metrics and visual analytics dashboards.</p>
        </div>
        
        <div className="flex flex-col items-end gap-1.5 self-stretch sm:self-auto">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5 bg-secondary/40 border border-border/80 rounded-xl px-2.5 py-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">From:</span>
              <input
                type="date"
                value={startDate}
                max={todayStr}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setReportError(null);
                }}
                className="bg-transparent text-xs font-semibold focus:outline-none text-foreground cursor-pointer"
              />
            </div>

            <div className="flex items-center gap-1.5 bg-secondary/40 border border-border/80 rounded-xl px-2.5 py-1.5">
              <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">To:</span>
              <input
                type="date"
                value={endDate}
                max={todayStr}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setReportError(null);
                }}
                className="bg-transparent text-xs font-semibold focus:outline-none text-foreground cursor-pointer"
              />
            </div>

            <button
              onClick={handleDownloadReport}
              disabled={Boolean(validationError) || downloadingReport}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-primary/95 disabled:bg-muted disabled:text-muted-foreground text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md shadow-primary/10 tracking-wide disabled:cursor-not-allowed"
            >
              {downloadingReport ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )}
              Download Sales Report
            </button>
          </div>

          {(validationError || reportError) && (
            <span className="text-xs font-semibold text-destructive flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              {validationError || reportError}
            </span>
          )}
        </div>
      </div>

      {/* Overview Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Revenue', value: `Rs. ${cards.totalRevenue.toFixed(2)}`, desc: `Today: Rs. ${cards.todayRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-amber-600 bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400' },
          { label: 'Total Orders', value: cards.totalOrders.toString(), desc: `Today: ${cards.todayOrders} orders`, icon: ShoppingBag, color: 'text-blue-600 bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400' },
          { label: 'Popularity Index', value: popularDishes[0]?.name || 'N/A', desc: popularDishes[0] ? `Sold: ${popularDishes[0].quantity} units` : 'No orders completed yet', icon: Star, color: 'text-yellow-600 bg-yellow-100 dark:bg-yellow-950/30 dark:text-yellow-400' },
          { label: 'Active Tables', value: cards.activeTablesCount.toString(), desc: 'Contactless QR codes active', icon: Layers, color: 'text-emerald-600 bg-emerald-100 dark:bg-emerald-950/30 dark:text-emerald-400' },
        ].map((card, i) => {
          const Icon = card.icon;
          return (
            <Card key={i} className="border border-border/40 hover:border-primary/20 shadow-sm flex items-center p-5 gap-4">
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${card.color}`}>
                <Icon className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide block">{card.label}</span>
                <h3 className="font-sans text-xl md:text-2xl font-black text-foreground">{card.value}</h3>
                <span className="text-[10px] text-muted-foreground block">{card.desc}</span>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Charts Panels */}
      {mounted && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Daily Revenue AreaChart (2/3 width on desktop) */}
          <Card className="lg:col-span-2 border border-border/50 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-serif font-black flex items-center gap-1.5">
                <TrendingUp className="w-5 h-5 text-primary" /> Daily Revenue Trends (Last 30 Days)
              </CardTitle>
              <CardDescription className="text-xs">Visual breakdown of daily completed settlements</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {salesTrend.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  No sales trends available. Complete orders to plot.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.25}/>
                        <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="date" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" opacity={0.6} />
                    <YAxis tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" opacity={0.6} />
                    <Tooltip 
                      contentStyle={{ background: 'var(--card)', borderColor: 'var(--border)', borderRadius: '12px', fontSize: '11px' }}
                      labelClassName="font-serif font-bold text-foreground"
                    />
                    <Area type="monotone" dataKey="revenue" name="Revenue (Rs.)" stroke="var(--primary)" strokeWidth={2.5} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* PieChart Order Status breakdown (1/3 width) */}
          <Card className="border border-border/50 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-serif font-black">Order States</CardTitle>
              <CardDescription className="text-xs">Real-time status percentage ratios</CardDescription>
            </CardHeader>
            <CardContent className="h-72 flex flex-col justify-between">
              {orderStatuses.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  No orders placed yet.
                </div>
              ) : (
                <>
                  <div className="h-48 relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={orderStatuses}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {orderStatuses.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={getCellColor(entry.name)} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={{ background: 'var(--card)', borderColor: 'var(--border)', borderRadius: '8px', fontSize: '10px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  
                  {/* Legend list */}
                  <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 pb-2">
                    {orderStatuses.map((entry, idx) => (
                      <div key={idx} className="flex items-center gap-1.5 text-[10px] font-semibold">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: getCellColor(entry.name) }} />
                        <span className="capitalize text-muted-foreground">{entry.name} ({entry.value})</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Popular Dishes BarChart */}
          <Card className="lg:col-span-3 border border-border/50 shadow-md">
            <CardHeader className="pb-2">
              <CardTitle className="text-base font-serif font-black">Top Selling Menu Items</CardTitle>
              <CardDescription className="text-xs">Quantities sold of best-performing CafeFlow dishes</CardDescription>
            </CardHeader>
            <CardContent className="h-72">
              {popularDishes.length === 0 ? (
                <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                  Complete orders to aggregate best seller metrics.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={popularDishes} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis dataKey="name" tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" opacity={0.6} />
                    <YAxis tick={{ fontSize: 9 }} stroke="var(--muted-foreground)" opacity={0.6} />
                    <Tooltip contentStyle={{ background: 'var(--card)', borderColor: 'var(--border)', borderRadius: '12px', fontSize: '11px' }} />
                    <Bar dataKey="quantity" name="Quantity Sold" fill="var(--primary)" radius={[4, 4, 0, 0]} maxBarSize={45}>
                      {popularDishes.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill="var(--primary)" opacity={1 - index * 0.12} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
