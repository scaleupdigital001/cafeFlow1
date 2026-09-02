'use client';

import React, { useEffect, useState, useMemo } from 'react';
import api from '../../../lib/axios';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';
import { 
  Loader2, TrendingUp, DollarSign, ShoppingBag, Layers, Star, Info, 
  Download, AlertTriangle, Printer, Calendar, ChevronLeft, ChevronRight, 
  FileText, CheckCircle2, X, Search, Sparkles, Receipt, Edit3, Check, History, RotateCcw
} from 'lucide-react';
import { printDailySalesReport, DailySalesReportData } from '../../../lib/printService';
import { useAuthStore } from '../../../store/authStore';
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
  const { user } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cards, setCards] = useState<MetricCards | null>(null);
  const [salesTrend, setSalesTrend] = useState<SalesTrendPoint[]>([]);
  const [popularDishes, setPopularDishes] = useState<PopularDishPoint[]>([]);
  const [orderStatuses, setOrderStatuses] = useState<OrderStatusPoint[]>([]);
  
  const [mounted, setMounted] = useState(false);
  const todayStr = new Date().toISOString().split('T')[0];

  // Daily Sales Report states
  const [selectedReportDate, setSelectedReportDate] = useState(todayStr);
  const [dailyReportData, setDailyReportData] = useState<DailySalesReportData | null>(null);
  const [dailyReportLoading, setDailyReportLoading] = useState(true);
  const [dailyReportError, setDailyReportError] = useState<string | null>(null);
  const [isFullReportModalOpen, setIsFullReportModalOpen] = useState(false);
  const [isPrintingReport, setIsPrintingReport] = useState(false);
  const [itemSearchQuery, setItemSearchQuery] = useState('');

  // Audit Adjustment states
  const [editingItemName, setEditingItemName] = useState<string | null>(null);
  const [editingItemQty, setEditingItemQty] = useState<number | ''>('');
  const [editingItemReason, setEditingItemReason] = useState<string>('');
  const [isSavingAdjustment, setIsSavingAdjustment] = useState<boolean>(false);
  const [isAuditModalOpen, setIsAuditModalOpen] = useState<boolean>(false);
  const [isLoadingAuditTrail, setIsLoadingAuditTrail] = useState<boolean>(false);
  const [auditTrailList, setAuditTrailList] = useState<any[]>([]);
  const [adjustmentToastError, setAdjustmentToastError] = useState<string | null>(null);

  const handleStartEdit = (item: any) => {
    setEditingItemName(item.name);
    setEditingItemQty(item.quantity);
    setEditingItemReason(item.reason || '');
  };

  const handleCancelEdit = () => {
    setEditingItemName(null);
    setEditingItemQty('');
    setEditingItemReason('');
  };

  const handleSaveItemAdjustment = async (itemName: string) => {
    if (editingItemQty === '' || isNaN(Number(editingItemQty)) || Number(editingItemQty) < 0) {
      setAdjustmentToastError('Please enter a valid non-negative quantity.');
      setTimeout(() => setAdjustmentToastError(null), 4000);
      return;
    }

    if (isSavingAdjustment || !dailyReportData) return;
    const newQty = Number(editingItemQty);
    const targetItem = dailyReportData.items.find((i) => i.name === itemName);

    if (!targetItem || targetItem.quantity === newQty) {
      handleCancelEdit();
      return;
    }

    setIsSavingAdjustment(true);
    setAdjustmentToastError(null);

    // Save snapshot of previous report state and cards for instant rollback if API fails
    const previousReportData = { ...dailyReportData };
    const previousCards = cards ? { ...cards } : null;

    // 1. Compute OPTIMISTIC client-side state update immediately (0ms delay)
    const unitPrice = targetItem.quantity > 0 ? targetItem.amount / targetItem.quantity : 0;
    const newAmount = Number((newQty * unitPrice).toFixed(2));
    const origQty = targetItem.isAdjusted ? targetItem.originalQty : targetItem.quantity;

    const updatedItems = dailyReportData.items.map((i) => {
      if (i.name === itemName) {
        return {
          ...i,
          quantity: newQty,
          amount: newAmount,
          isAdjusted: true,
          originalQty: origQty,
          adjustedByName: user?.name || user?.email || 'Admin User',
          adjustedAt: new Date().toISOString(),
          reason: editingItemReason,
        };
      }
      return i;
    });

    const newGrossSales = Number(updatedItems.reduce((sum, i) => sum + i.amount, 0).toFixed(2));
    const newNetSales = Number((newGrossSales + dailyReportData.summary.taxes).toFixed(2));
    const newTotalItems = updatedItems.reduce((sum, i) => sum + i.quantity, 0);
    const newAov = dailyReportData.summary.totalOrders > 0
      ? Number((newNetSales / dailyReportData.summary.totalOrders).toFixed(2))
      : 0;

    // Apply OPTIMISTIC update instantly in React UI
    setDailyReportData({
      ...dailyReportData,
      summary: {
        ...dailyReportData.summary,
        grossSales: newGrossSales,
        netSales: newNetSales,
        totalItems: newTotalItems,
        averageOrderValue: newAov,
      },
      items: updatedItems,
    });

    // Also update Today's Revenue and Total Revenue overview cards instantly if today's date is adjusted
    if (selectedReportDate === todayStr) {
      const revenueDelta = Number((newNetSales - dailyReportData.summary.netSales).toFixed(2));
      setCards((prev) => prev ? {
        ...prev,
        todayRevenue: newNetSales,
        totalRevenue: Number((prev.totalRevenue + revenueDelta).toFixed(2)),
      } : prev);
    }

    handleCancelEdit();

    // 2. Perform background save API call
    try {
      await api.post('/analytics/daily-sales/adjust', {
        date: selectedReportDate,
        itemName,
        adjustedQty: newQty,
        reason: editingItemReason,
      });
    } catch (err: any) {
      console.error('Failed to save audit adjustment, rolling back optimistic update:', err);
      // ROLLBACK to previous state on failure
      setDailyReportData(previousReportData);
      if (previousCards) setCards(previousCards);
      setAdjustmentToastError(err.response?.data?.message || 'Network error: Failed to save adjustment.');
      setTimeout(() => setAdjustmentToastError(null), 5000);
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  const handleResetItemAdjustment = async (itemName: string) => {
    if (!dailyReportData || isSavingAdjustment) return;
    const targetItem = dailyReportData.items.find((i) => i.name === itemName);
    if (!targetItem || !targetItem.isAdjusted) return;
    const originalQty = targetItem.originalQty !== undefined ? targetItem.originalQty : targetItem.quantity;

    const previousReportData = { ...dailyReportData };
    const previousCards = cards ? { ...cards } : null;
    setIsSavingAdjustment(true);
    setAdjustmentToastError(null);

    const unitPrice = targetItem.quantity > 0 ? targetItem.amount / targetItem.quantity : 0;
    const newAmount = Number((originalQty * unitPrice).toFixed(2));

    const updatedItems = dailyReportData.items.map((i) => {
      if (i.name === itemName) {
        return {
          ...i,
          quantity: originalQty,
          amount: newAmount,
          isAdjusted: false,
          originalQty: undefined,
          adjustedByName: undefined,
          adjustedAt: undefined,
          reason: undefined,
        };
      }
      return i;
    });

    const newGrossSales = Number(updatedItems.reduce((sum, i) => sum + i.amount, 0).toFixed(2));
    const newNetSales = Number((newGrossSales + dailyReportData.summary.taxes).toFixed(2));
    const newTotalItems = updatedItems.reduce((sum, i) => sum + i.quantity, 0);
    const newAov = dailyReportData.summary.totalOrders > 0
      ? Number((newNetSales / dailyReportData.summary.totalOrders).toFixed(2))
      : 0;

    setDailyReportData({
      ...dailyReportData,
      summary: {
        ...dailyReportData.summary,
        grossSales: newGrossSales,
        netSales: newNetSales,
        totalItems: newTotalItems,
        averageOrderValue: newAov,
      },
      items: updatedItems,
    });

    // Also update Today's Revenue and Total Revenue overview cards instantly on reset
    if (selectedReportDate === todayStr) {
      const revenueDelta = Number((newNetSales - dailyReportData.summary.netSales).toFixed(2));
      setCards((prev) => prev ? {
        ...prev,
        todayRevenue: newNetSales,
        totalRevenue: Number((prev.totalRevenue + revenueDelta).toFixed(2)),
      } : prev);
    }

    try {
      await api.post('/analytics/daily-sales/adjust', {
        date: selectedReportDate,
        itemName,
        adjustedQty: originalQty,
        reason: 'Reset to original count',
      });
    } catch (err: any) {
      console.error('Failed to reset item adjustment:', err);
      setDailyReportData(previousReportData);
      if (previousCards) setCards(previousCards);
      setAdjustmentToastError(err.response?.data?.message || 'Failed to reset adjustment.');
      setTimeout(() => setAdjustmentToastError(null), 5000);
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  const handleOpenAuditTrail = async () => {
    setIsAuditModalOpen(true);
    setIsLoadingAuditTrail(true);
    try {
      const res = await api.get('/analytics/daily-sales/audit-trail', {
        params: { date: selectedReportDate },
      });
      if (res.data.success) {
        setAuditTrailList(res.data.data || []);
      }
    } catch (err: any) {
      console.error('Failed to fetch audit trail:', err);
    } finally {
      setIsLoadingAuditTrail(false);
    }
  };

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

  const fetchDailySalesReport = async (dateStr: string) => {
    setDailyReportLoading(true);
    setDailyReportError(null);
    try {
      const res = await api.get('/analytics/daily-sales', { params: { date: dateStr } });
      if (res.data.success) {
        setDailyReportData(res.data.data);
      }
    } catch (err: any) {
      console.error('Fetch daily report error:', err);
      setDailyReportError(err.response?.data?.message || 'Failed to load daily report.');
    } finally {
      setDailyReportLoading(false);
    }
  };

  useEffect(() => {
    if (mounted) {
      fetchDailySalesReport(selectedReportDate);
    }
  }, [selectedReportDate, mounted]);

  // Keep Today's Revenue and Total Revenue cards synchronized with Today's Sales Report adjustments
  useEffect(() => {
    if (cards && dailyReportData && dailyReportData.date === todayStr) {
      const reportNetSales = dailyReportData.summary.netSales;
      if (cards.todayRevenue !== reportNetSales) {
        const delta = Number((reportNetSales - cards.todayRevenue).toFixed(2));
        setCards((prev) => prev ? {
          ...prev,
          todayRevenue: reportNetSales,
          totalRevenue: Number((prev.totalRevenue + delta).toFixed(2)),
        } : prev);
      }
    }
  }, [dailyReportData, todayStr]);

  const handlePrevDay = () => {
    const d = new Date(selectedReportDate);
    d.setDate(d.getDate() - 1);
    setSelectedReportDate(d.toISOString().split('T')[0]);
  };

  const handleNextDay = () => {
    if (selectedReportDate >= todayStr) return;
    const d = new Date(selectedReportDate);
    d.setDate(d.getDate() + 1);
    const nextStr = d.toISOString().split('T')[0];
    setSelectedReportDate(nextStr > todayStr ? todayStr : nextStr);
  };

  const handleSetToday = () => {
    setSelectedReportDate(todayStr);
  };

  const handlePrintDailyReport = async () => {
    if (!dailyReportData) return;
    setIsPrintingReport(true);
    try {
      await printDailySalesReport(dailyReportData);
    } catch (err) {
      console.error('Daily sales print failed:', err);
    } finally {
      setIsPrintingReport(false);
    }
  };

  const filteredReportItems = useMemo(() => {
    if (!dailyReportData?.items) return [];
    if (!itemSearchQuery.trim()) return dailyReportData.items;
    return dailyReportData.items.filter((item) =>
      item.name.toLowerCase().includes(itemSearchQuery.toLowerCase())
    );
  }, [dailyReportData, itemSearchQuery]);

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
          { label: "Today's Revenue", value: `Rs. ${cards.todayRevenue.toFixed(2)}`, desc: `Total: Rs. ${cards.totalRevenue.toFixed(2)}`, icon: DollarSign, color: 'text-amber-600 bg-amber-100 dark:bg-amber-950/30 dark:text-amber-400' },
          { label: "Today's Orders", value: cards.todayOrders.toString(), desc: `Total: ${cards.totalOrders} orders`, icon: ShoppingBag, color: 'text-blue-600 bg-blue-100 dark:bg-blue-950/30 dark:text-blue-400' },
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

      {/* Daily Sales / Day-End Report Section */}
      <Card className="border border-border/60 shadow-md overflow-hidden bg-card">
        <div className="p-5 border-b border-border/50 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-secondary/15">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
              <Receipt className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-serif font-black text-lg text-foreground">Daily Sales Report</h3>
                <span className="text-[10px] font-bold uppercase tracking-wider bg-primary/10 text-primary border border-primary/20 px-2 py-0.5 rounded-md">
                  {dailyReportData?.formattedDate || selectedReportDate}
                </span>
              </div>
              <p className="text-xs text-muted-foreground">Day-end sales summary, item breakdown, and direct thermal POS receipt printing</p>
            </div>
          </div>

          {/* Date controls */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-background border border-border rounded-xl p-1 shadow-xs">
              <button
                onClick={handlePrevDay}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                title="Previous Day"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              
              <div className="flex items-center gap-1 px-2">
                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="date"
                  value={selectedReportDate}
                  max={todayStr}
                  onChange={(e) => setSelectedReportDate(e.target.value)}
                  className="bg-transparent text-xs font-semibold focus:outline-none text-foreground cursor-pointer"
                />
              </div>

              <button
                onClick={handleNextDay}
                disabled={selectedReportDate >= todayStr}
                className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                title="Next Day"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={handleSetToday}
              className={`px-3 py-1.5 text-xs font-bold rounded-xl border transition-all cursor-pointer ${
                selectedReportDate === todayStr
                  ? 'bg-primary text-white border-primary shadow-xs'
                  : 'bg-background hover:bg-secondary text-muted-foreground border-border'
              }`}
            >
              Today
            </button>
          </div>
        </div>

        <CardContent className="p-5">
          {dailyReportLoading ? (
            <div className="py-10 flex justify-center items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin text-primary" /> Loading daily report metrics...
            </div>
          ) : dailyReportError ? (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{dailyReportError}</span>
            </div>
          ) : dailyReportData ? (
            <div className="space-y-5">
              {/* 5 KPIs Row */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                {/* Total Sales */}
                <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border/50 space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Total Sales</span>
                  <div className="text-xl font-black font-sans text-foreground">
                    Rs. {dailyReportData.summary.netSales.toFixed(2)}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Gross: Rs. {dailyReportData.summary.grossSales.toFixed(2)} {dailyReportData.summary.taxes > 0 ? `| Tax: Rs. ${dailyReportData.summary.taxes.toFixed(2)}` : ''}
                  </span>
                </div>

                {/* Total Orders */}
                <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border/50 space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Total Orders</span>
                  <div className="text-xl font-black font-sans text-foreground">
                    {dailyReportData.summary.totalOrders}
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Completed: {dailyReportData.summary.completedOrders} {dailyReportData.summary.cancelledOrders > 0 ? `| Cancelled: ${dailyReportData.summary.cancelledOrders}` : ''}
                  </span>
                </div>

                {/* Items Sold */}
                <div className="p-3.5 rounded-2xl bg-secondary/30 border border-border/50 space-y-1">
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Items Sold</span>
                  <div className="text-xl font-black font-sans text-foreground">
                    {dailyReportData.summary.totalItems} <span className="text-xs font-normal text-muted-foreground">units</span>
                  </div>
                  <span className="text-[10px] text-muted-foreground block">
                    Avg: Rs. {dailyReportData.summary.averageOrderValue.toFixed(2)} / order
                  </span>
                </div>

                {/* Cash Sales */}
                <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 space-y-1">
                  <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-wider block">Cash Sales</span>
                  <div className="text-xl font-black font-sans text-emerald-700 dark:text-emerald-300">
                    Rs. {(dailyReportData.payments.find(p => p.method === 'cash')?.amount || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 block">
                    {dailyReportData.payments.find(p => p.method === 'cash')?.count || 0} cash orders
                  </span>
                </div>

                {/* Online / UPI Sales */}
                <div className="p-3.5 rounded-2xl bg-blue-500/10 border border-blue-500/20 space-y-1 col-span-2 sm:col-span-1">
                  <span className="text-[10px] font-bold text-blue-700 dark:text-blue-400 uppercase tracking-wider block">Online / UPI</span>
                  <div className="text-xl font-black font-sans text-blue-700 dark:text-blue-300">
                    Rs. {(dailyReportData.payments.find(p => p.method === 'upi_link')?.amount || 0).toFixed(2)}
                  </div>
                  <span className="text-[10px] text-blue-600 dark:text-blue-400 block">
                    {dailyReportData.payments.find(p => p.method === 'upi_link')?.count || 0} UPI orders
                  </span>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-border/40">
                <div className="text-xs text-muted-foreground">
                  {dailyReportData.items.length > 0
                    ? `${dailyReportData.items.length} distinct menu items sold on ${dailyReportData.formattedDate}.`
                    : `No completed sales recorded on ${dailyReportData.formattedDate}.`}
                </div>

                <div className="flex items-center gap-2.5 w-full sm:w-auto">
                  <button
                    onClick={() => setIsFullReportModalOpen(true)}
                    className="flex-1 sm:flex-none px-4 py-2.5 bg-secondary hover:bg-muted text-foreground border border-border rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center justify-center gap-1.5"
                  >
                    <FileText className="w-4 h-4 text-primary" /> View Full Report
                  </button>

                  <button
                    onClick={handlePrintDailyReport}
                    disabled={isPrintingReport}
                    className="flex-1 sm:flex-none px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold cursor-pointer transition-all shadow-md shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-60"
                  >
                    {isPrintingReport ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Preparing Print...
                      </>
                    ) : (
                      <>
                        <Printer className="w-4 h-4" /> Print Daily Report
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

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

      {/* Full Daily Sales Report Modal Dialog */}
      {isFullReportModalOpen && dailyReportData && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground w-full max-w-3xl rounded-3xl border border-border shadow-2xl overflow-hidden animate-fade-in max-h-[92vh] flex flex-col">
            {/* Modal Header */}
            <div className="p-5 border-b border-border flex items-center justify-between bg-secondary/20">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-primary/10 border border-primary/20 text-primary flex items-center justify-center shrink-0">
                  <Receipt className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-black text-lg">{dailyReportData.restaurant.name}</h3>
                  <p className="text-xs text-muted-foreground">
                    Daily Sales Report • <span className="font-bold text-foreground">{dailyReportData.formattedDate}</span> (Generated: {dailyReportData.generatedAt})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={handleOpenAuditTrail}
                  className="px-3.5 py-2 bg-secondary hover:bg-muted text-foreground rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 border border-border"
                  title="View Audit Trail Log"
                >
                  <History className="w-4 h-4 text-muted-foreground" />
                  <span>Audit Log</span>
                </button>

                <button
                  onClick={handlePrintDailyReport}
                  disabled={isPrintingReport}
                  className="px-3.5 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-sm disabled:opacity-60"
                  title="Print POS Report"
                >
                  {isPrintingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  <span>Print POS Report</span>
                </button>

                <button
                  onClick={() => setIsFullReportModalOpen(false)}
                  className="p-2 rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 text-sm">
              {/* Summary KPIs Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-secondary/20 p-4 rounded-2xl border border-border/50">
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Total Net Sales</span>
                  <div className="text-xl font-black text-foreground">Rs. {dailyReportData.summary.netSales.toFixed(2)}</div>
                  <span className="text-[10px] text-muted-foreground">Gross: Rs. {dailyReportData.summary.grossSales.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Paid Orders</span>
                  <div className="text-xl font-black text-foreground">{dailyReportData.summary.totalOrders}</div>
                  <span className="text-[10px] text-muted-foreground">Avg: Rs. {dailyReportData.summary.averageOrderValue.toFixed(2)}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Items Sold</span>
                  <div className="text-xl font-black text-foreground">{dailyReportData.summary.totalItems}</div>
                  <span className="text-[10px] text-muted-foreground">{dailyReportData.items.length} distinct dishes</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Cash / UPI</span>
                  <div className="text-xs font-bold text-foreground space-y-0.5 pt-1">
                    <div>Cash: Rs. {(dailyReportData.payments.find(p => p.method === 'cash')?.amount || 0).toFixed(2)}</div>
                    <div>UPI: Rs. {(dailyReportData.payments.find(p => p.method === 'upi_link')?.amount || 0).toFixed(2)}</div>
                  </div>
                </div>
              </div>

              {/* Item-wise Particulars Section */}
              <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-serif font-bold text-base text-foreground">Particulars / Item-wise Breakdown</h4>
                    <p className="text-xs text-muted-foreground">Audit item counts and remove test/unwanted orders before day-end print</p>
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      value={itemSearchQuery}
                      onChange={(e) => setItemSearchQuery(e.target.value)}
                      placeholder="Search particulars..."
                      className="w-full text-xs bg-secondary/40 border border-border rounded-xl pl-8 pr-3 py-2 outline-none focus:ring-1 focus:ring-primary text-foreground"
                    />
                  </div>
                </div>

                {/* Audit Helper Banner */}
                <div className="p-3 bg-amber-500/10 border border-amber-500/25 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2.5 text-amber-900 dark:text-amber-200">
                    <Edit3 className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                    <span>
                      <strong>End-of-Day Audit Adjustment:</strong> Click the <strong>"Edit Qty"</strong> button on any dish row below to adjust sold count. All daily totals, AOV, and thermal printouts recalculate immediately.
                    </span>
                  </div>
                  <button
                    onClick={handleOpenAuditTrail}
                    className="px-3 py-1 bg-amber-500/20 hover:bg-amber-500/30 text-amber-800 dark:text-amber-200 border border-amber-500/30 rounded-lg text-[11px] font-bold cursor-pointer transition-all shrink-0 flex items-center gap-1 self-start sm:self-auto"
                  >
                    <History className="w-3 h-3" /> Audit Log
                  </button>
                </div>

                {adjustmentToastError && (
                  <div className="p-3 bg-red-500/10 border border-red-500/30 text-red-600 dark:text-red-400 rounded-xl text-xs font-bold flex items-center justify-between animate-fade-in">
                    <span>⚠️ {adjustmentToastError}</span>
                    <button onClick={() => setAdjustmentToastError(null)} className="text-muted-foreground hover:text-foreground">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}

                <div className="border border-border rounded-2xl overflow-hidden shadow-xs">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-secondary/40 border-b border-border text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
                      <tr>
                        <th className="py-3 px-4 w-12">#</th>
                        <th className="py-3 px-4">Particulars (Menu Item)</th>
                        <th className="py-3 px-4 text-center w-36">Quantity Sold</th>
                        <th className="py-3 px-4 text-right w-36">Total Amount (Rs.)</th>
                        <th className="py-3 px-4 text-center w-40">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {filteredReportItems.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-xs text-muted-foreground">
                            {itemSearchQuery ? 'No menu items matching your search.' : 'No completed sales recorded for this date.'}
                          </td>
                        </tr>
                      ) : (
                        filteredReportItems.map((item, idx) => {
                          const isEditing = editingItemName === item.name;
                          return (
                            <tr key={idx} className="hover:bg-secondary/20 transition-colors">
                              <td className="py-3 px-4 font-mono text-muted-foreground text-[11px]">{idx + 1}</td>
                              <td className="py-3 px-4 font-bold text-foreground">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm">{item.name}</span>
                                  {item.isAdjusted && (
                                    <span
                                      className="inline-flex items-center gap-1 text-[10px] font-extrabold bg-amber-500/15 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-md border border-amber-500/30"
                                      title={`Audit adjusted from ${item.originalQty} by ${item.adjustedByName || 'Admin'}`}
                                    >
                                      <Edit3 className="w-3 h-3" />
                                      <span>Adjusted (was {item.originalQty})</span>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="py-3 px-4 text-center">
                                {isEditing ? (
                                  <div className="flex flex-col items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                    <div className="flex items-center gap-1 justify-center">
                                      <input
                                        type="number"
                                        min="0"
                                        value={editingItemQty}
                                        onChange={(e) => setEditingItemQty(e.target.value === '' ? '' : Number(e.target.value))}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') {
                                            e.preventDefault();
                                            handleSaveItemAdjustment(item.name);
                                          } else if (e.key === 'Escape') {
                                            handleCancelEdit();
                                          }
                                        }}
                                        className="w-16 text-center text-xs bg-background border-2 border-primary rounded-lg py-1 outline-none font-black text-foreground focus:ring-1 focus:ring-primary shadow-xs"
                                        autoFocus
                                      />
                                      <button
                                        onClick={() => handleSaveItemAdjustment(item.name)}
                                        disabled={isSavingAdjustment}
                                        className="p-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg cursor-pointer transition-all disabled:opacity-50 shadow-xs"
                                        title="Save Adjustment"
                                      >
                                        {isSavingAdjustment ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                                      </button>
                                      <button
                                        onClick={handleCancelEdit}
                                        className="p-1.5 bg-secondary hover:bg-muted text-muted-foreground hover:text-foreground rounded-lg cursor-pointer transition-all"
                                        title="Cancel"
                                      >
                                        <X className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                    <input
                                      type="text"
                                      placeholder="Reason (optional)"
                                      value={editingItemReason}
                                      onChange={(e) => setEditingItemReason(e.target.value)}
                                      onKeyDown={(e) => {
                                        if (e.key === 'Enter') {
                                          e.preventDefault();
                                          handleSaveItemAdjustment(item.name);
                                        }
                                      }}
                                      className="w-40 text-[10px] bg-background border border-border rounded-md px-2 py-0.5 text-foreground outline-none shadow-xs"
                                    />
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleStartEdit(item)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 bg-secondary/70 hover:bg-primary/10 hover:text-primary hover:border-primary/40 rounded-xl font-black text-foreground border border-border/70 transition-all cursor-pointer shadow-xs text-xs"
                                    title="Click to edit quantity"
                                  >
                                    <span>{item.quantity}</span>
                                    <Edit3 className="w-3 h-3 text-muted-foreground" />
                                  </button>
                                )}
                              </td>
                              <td className="py-3 px-4 text-right font-black font-sans text-foreground text-sm">
                                Rs. {item.amount.toFixed(2)}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {isEditing ? (
                                  <span className="text-[11px] font-bold text-primary animate-pulse">Editing...</span>
                                ) : (
                                  <div className="flex items-center justify-center gap-1.5">
                                    <button
                                      onClick={() => handleStartEdit(item)}
                                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 rounded-xl text-xs font-bold cursor-pointer transition-all shadow-xs"
                                    >
                                      <Edit3 className="w-3.5 h-3.5" />
                                      <span>Edit Qty</span>
                                    </button>

                                    {item.isAdjusted && (
                                      <button
                                        onClick={() => handleResetItemAdjustment(item.name)}
                                        disabled={isSavingAdjustment}
                                        title={`Reset to original (${item.originalQty})`}
                                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-secondary hover:bg-muted text-muted-foreground hover:text-foreground border border-border rounded-xl text-xs font-bold cursor-pointer transition-all"
                                      >
                                        <RotateCcw className="w-3 h-3" />
                                        <span>Reset</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                    <tfoot className="bg-secondary/30 border-t-2 border-border font-bold text-xs">
                      <tr>
                        <td colSpan={2} className="py-3 px-4 uppercase tracking-wider font-extrabold">Total Items & Sales</td>
                        <td className="py-3 px-4 text-center font-black">{dailyReportData.summary.totalItems}</td>
                        <td className="py-3 px-4 text-right font-black text-primary text-sm font-sans">
                          Rs. {dailyReportData.summary.netSales.toFixed(2)}
                        </td>
                        <td className="py-3 px-4"></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Payment Summary Section */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-border bg-secondary/15 space-y-3">
                  <h4 className="font-serif font-bold text-sm text-foreground">Payment Summary</h4>
                  <div className="space-y-2">
                    {dailyReportData.payments.map((p, idx) => (
                      <div key={idx} className="flex justify-between items-center text-xs py-1 border-b border-border/40 last:border-0">
                        <span className="text-muted-foreground">{p.label} ({p.count} bills)</span>
                        <span className="font-bold text-foreground">Rs. {p.amount.toFixed(2)}</span>
                      </div>
                    ))}
                    <div className="flex justify-between items-center text-xs pt-2 font-black border-t border-border">
                      <span>Total Reconciled</span>
                      <span className="text-primary font-sans text-sm">Rs. {dailyReportData.summary.netSales.toFixed(2)}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-2xl border border-border bg-secondary/15 space-y-3">
                  <h4 className="font-serif font-bold text-sm text-foreground">Orders & Lifecycle</h4>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Completed Paid Orders</span>
                      <span className="font-bold text-emerald-600 dark:text-emerald-400">{dailyReportData.summary.completedOrders}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Cancelled Orders</span>
                      <span className="font-bold text-destructive">{dailyReportData.summary.cancelledOrders}</span>
                    </div>
                    <div className="flex justify-between py-1 border-b border-border/40">
                      <span className="text-muted-foreground">Average Order Value</span>
                      <span className="font-bold text-foreground">Rs. {dailyReportData.summary.averageOrderValue.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between pt-2 font-black border-t border-border">
                      <span>Total Orders Logged</span>
                      <span className="font-sans">{dailyReportData.summary.allOrders}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-border flex items-center justify-between gap-3 bg-secondary/20">
              <span className="text-[11px] text-muted-foreground">
                CafeFlow SaaS POS Daily Reconciliation
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsFullReportModalOpen(false)}
                  className="px-4 py-2 bg-secondary hover:bg-muted text-foreground border border-border rounded-xl text-xs font-bold cursor-pointer transition-all"
                >
                  Close
                </button>

                <button
                  type="button"
                  onClick={handlePrintDailyReport}
                  disabled={isPrintingReport}
                  className="px-5 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-md shadow-primary/20 disabled:opacity-60"
                >
                  {isPrintingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  <span>Print POS Report</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Audit Trail Modal */}
      {isAuditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                <h3 className="font-serif font-bold text-lg text-foreground">Sales Report Audit Trail Log</h3>
              </div>
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="p-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto space-y-3">
              <p className="text-xs text-muted-foreground">
                History of manual quantity adjustments made for <span className="font-bold text-foreground">{selectedReportDate}</span>. Raw order database records remain untouched.
              </p>

              {isLoadingAuditTrail ? (
                <div className="flex justify-center items-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                </div>
              ) : auditTrailList.length === 0 ? (
                <div className="text-center py-8 text-xs text-muted-foreground border border-dashed border-border rounded-2xl">
                  No audit adjustments recorded for this date.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {auditTrailList.map((log: any, idx: number) => (
                    <div key={idx} className="p-3.5 bg-secondary/30 border border-border/80 rounded-2xl text-xs space-y-1.5">
                      <div className="flex justify-between items-center">
                        <span className="font-bold text-foreground text-sm">{log.itemName}</span>
                        <span className="text-[10px] font-semibold text-muted-foreground">
                          {new Date(log.adjustedAt || log.updatedAt).toLocaleString('en-IN')}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-muted-foreground">Quantity Changed:</span>
                        <span className="font-mono bg-destructive/10 text-destructive px-1.5 py-0.5 rounded font-bold">{log.originalQty}</span>
                        <span className="text-muted-foreground">→</span>
                        <span className="font-mono bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5 rounded font-bold">{log.adjustedQty}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                        <span>Adjusted by: <strong className="text-foreground">{log.adjustedByName || 'Admin'}</strong></span>
                        {log.reason && <span className="italic truncate max-w-[180px]">"{log.reason}"</span>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t border-border flex justify-end">
              <button
                onClick={() => setIsAuditModalOpen(false)}
                className="px-4 py-2 bg-primary text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
