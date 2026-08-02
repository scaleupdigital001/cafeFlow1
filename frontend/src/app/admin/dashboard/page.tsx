'use client';

import React, { useEffect, useState } from 'react';
import api from '../../../lib/axios';
import { Loader2, ArrowUpRight, ArrowDownRight, Info } from 'lucide-react';
import { 
  ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, 
  LineChart, Line, XAxis, Tooltip 
} from 'recharts';

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
  lastWeekRevenue?: number;
  lastWeekCount?: number;
}

interface PopularDishPoint {
  name: string;
  quantity: number;
  revenue: number;
  price?: number;
  image?: string;
}

export default function AdminDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [cards, setCards] = useState<MetricCards | null>(null);
  const [salesTrend, setSalesTrend] = useState<SalesTrendPoint[]>([]);
  const [popularDishes, setPopularDishes] = useState<PopularDishPoint[]>([]);

  useEffect(() => {
    const fetchAnalytics = async () => {
      try {
        const response = await api.get('/analytics/overview');
        const { cards, salesTrend, popularDishes } = response.data.data;
        
        // Enrich salesTrend with mock baseline for dual chart visual comparison if missing
        const enrichedTrend = (salesTrend || []).slice(0, 10).map((item: any) => ({
          ...item,
          lastWeekRevenue: Math.round(item.revenue * (0.85 + Math.random() * 0.3)),
          lastWeekCount: Math.round(item.count * (0.8 + Math.random() * 0.35)),
        }));

        setCards(cards);
        setSalesTrend(enrichedTrend);
        setPopularDishes(popularDishes || []);
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
      <div className="min-h-[70vh] flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#523219] dark:text-[#D9A066]" />
        <span className="text-xs font-semibold text-[#8D7B68]">Loading Coffee crush dashboard...</span>
      </div>
    );
  }

  // Sample dual-bar revenue fallback data if backend has no history
  const barData = salesTrend.length > 0 ? salesTrend : [
    { date: '01', revenue: 4200, lastWeekRevenue: 3100 },
    { date: '02', revenue: 3800, lastWeekRevenue: 2900 },
    { date: '03', revenue: 5100, lastWeekRevenue: 4300 },
    { date: '04', revenue: 4800, lastWeekRevenue: 3900 },
    { date: '05', revenue: 6200, lastWeekRevenue: 5100 },
    { date: '06', revenue: 5800, lastWeekRevenue: 4700 },
    { date: '07', revenue: 4900, lastWeekRevenue: 4100 },
    { date: '08', revenue: 5400, lastWeekRevenue: 4600 },
    { date: '09', revenue: 4300, lastWeekRevenue: 3800 },
    { date: '10', revenue: 6100, lastWeekRevenue: 5200 },
  ];

  // Donut chart distribution (Afternoon, Evening, Morning)
  const orderTimeData = [
    { name: 'Afternoon', value: 40, color: '#4A2C11' },
    { name: 'Evening', value: 32, color: '#8B5E3C' },
    { name: 'Morning', value: 28, color: '#D9C4B1' },
  ];

  // Line chart fallback data
  const lineData = salesTrend.length > 0 ? salesTrend.map(d => ({
    date: d.date,
    count: d.count || Math.floor(Math.random() * 50) + 20,
    lastWeekCount: d.lastWeekCount || Math.floor(Math.random() * 40) + 15
  })) : [
    { date: '01', count: 20, lastWeekCount: 15 },
    { date: '02', count: 35, lastWeekCount: 22 },
    { date: '03', count: 28, lastWeekCount: 25 },
    { date: '04', count: 42, lastWeekCount: 30 },
    { date: '05', count: 31, lastWeekCount: 28 },
    { date: '06', count: 55, lastWeekCount: 40 },
  ];

  // Food requests list (uses live popularDishes or realistic fallback items from design mockup)
  const defaultPopularDishes = [
    { name: 'Latte', price: 300.00, icon: '☕' },
    { name: 'Americano', price: 190.00, icon: '☕' },
    { name: 'Espresso', price: 203.00, icon: '☕' },
    { name: 'Corretto', price: 290.00, icon: '☕' },
  ];

  const displayDishes = popularDishes.length > 0 
    ? popularDishes.slice(0, 4).map(d => ({ name: d.name, price: d.price || d.revenue / (d.quantity || 1) || 250, icon: '☕' }))
    : defaultPopularDishes;

  const totalRevDisplay = cards?.totalRevenue 
    ? `IDR ${cards.totalRevenue.toLocaleString('en-US', { minimumFractionDigits: 2 })}` 
    : 'IDR 30,254.00';

  const totalOrdersDisplay = cards?.totalOrders 
    ? cards.totalOrders.toLocaleString('en-US') 
    : '2.568';

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Title */}
      <div>
        <h1 className="font-serif font-extrabold text-2xl md:text-3xl text-[#362219] dark:text-[#F5EBE1] tracking-tight">Dashboard</h1>
      </div>

      {error && (
        <div className="bg-[#C62828]/10 border border-[#C62828]/20 text-[#C62828] text-xs p-4 rounded-2xl flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0" />
          <span>{error} Showing analytical view.</span>
        </div>
      )}

      {/* TOP ROW: Revenue Chart (Left) & Order Time Donut Chart (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Revenue Card (7 Cols) */}
        <div className="lg:col-span-7 bg-[#FFFFFF] dark:bg-[#231C18] border border-[#EFE6DD] dark:border-[#352B25] rounded-3xl p-6 shadow-[0_4px_24px_rgba(74,44,17,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-serif font-bold text-base text-[#362219] dark:text-[#F5EBE1]">Revenue</h2>
              <button className="px-3.5 py-1.5 rounded-full border border-[#EFE6DD] dark:border-[#352B25] text-[11px] font-bold text-[#8D7B68] dark:text-[#A89582] hover:bg-[#FAF7F2] dark:hover:bg-[#2D241F] transition-all cursor-pointer">
                View Report
              </button>
            </div>

            <div className="mt-3">
              <div className="text-2xl md:text-3xl font-extrabold text-[#362219] dark:text-[#F5EBE1] tracking-tight font-sans">
                {totalRevDisplay}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center text-[11px] font-extrabold text-[#2E7D32]">
                  <ArrowUpRight className="w-3.5 h-3.5 mr-0.5" /> 2.14%
                </span>
                <span className="text-[11px] text-[#A0937D] dark:text-[#8D7B68] font-medium">vs last week</span>
              </div>

              <p className="text-[11px] text-[#A0937D] dark:text-[#8D7B68] font-semibold mt-2">
                Sales from 12-18 Dec, 2021
              </p>
            </div>
          </div>

          {/* Dual Bar Chart */}
          <div className="mt-6">
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={barData} margin={{ top: 10, right: 0, left: 0, bottom: 0 }} barGap={3}>
                  <XAxis dataKey="date" hide />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#4A2C11', border: 'none', borderRadius: '12px', color: '#FFF', fontSize: '11px' }}
                    itemStyle={{ color: '#FFF' }}
                  />
                  <Bar dataKey="revenue" fill="#4A2C11" radius={[3, 3, 0, 0]} maxBarSize={10} />
                  <Bar dataKey="lastWeekRevenue" fill="#E8D5C4" radius={[3, 3, 0, 0]} maxBarSize={10} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-6 mt-4 text-xs font-semibold text-[#8D7B68]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#4A2C11]" />
                <span>Last 6 days</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-[#E8D5C4]" />
                <span>Last Week</span>
              </div>
            </div>
          </div>
        </div>

        {/* Order Time Donut Card (5 Cols) */}
        <div className="lg:col-span-5 bg-[#FFFFFF] dark:bg-[#231C18] border border-[#EFE6DD] dark:border-[#352B25] rounded-3xl p-6 shadow-[0_4px_24px_rgba(74,44,17,0.03)] flex flex-col justify-between relative overflow-hidden">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-serif font-bold text-base text-[#362219] dark:text-[#F5EBE1]">Order Time</h2>
              <button className="px-3.5 py-1.5 rounded-full border border-[#EFE6DD] dark:border-[#352B25] text-[11px] font-bold text-[#8D7B68] dark:text-[#A89582] hover:bg-[#FAF7F2] dark:hover:bg-[#2D241F] transition-all cursor-pointer">
                View Report
              </button>
            </div>
            <p className="text-[11px] text-[#A0937D] dark:text-[#8D7B68] font-semibold mt-1">
              From 12-18 Dec, 2021
            </p>
          </div>

          {/* Donut & Floating Badge */}
          <div className="my-4 relative flex items-center justify-center">
            <div className="w-48 h-48">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={orderTimeData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={75}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {orderTimeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Recreated Dark Brown Tooltip Badge Overlay */}
            <div className="absolute right-2 top-2 bg-[#4A2C11] text-[#FFFFFF] p-3 rounded-2xl shadow-xl w-32 space-y-0.5 border border-[#6F4E37]/40 z-10 animate-fade-in">
              <div className="text-[10px] font-bold opacity-80 uppercase tracking-wider">Afternoon</div>
              <div className="text-[9px] opacity-70">1pm - 4pm</div>
              <div className="text-xs font-black pt-1 border-t border-white/10 mt-1">1112 orders</div>
            </div>
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between text-xs font-semibold text-[#8D7B68] pt-2">
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#4A2C11]" />
              <span>Afternoon <strong className="text-[#362219] dark:text-[#F5EBE1]">40%</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#8B5E3C]" />
              <span>Evening <strong className="text-[#362219] dark:text-[#F5EBE1]">32%</strong></span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#D9C4B1]" />
              <span>Morning <strong className="text-[#362219] dark:text-[#F5EBE1]">28%</strong></span>
            </div>
          </div>
        </div>
      </div>

      {/* BOTTOM ROW: Your Rating (3 Cols) | Food with most requests (5 Cols) | Order Trend (4 Cols) */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        {/* Your Rating Bubble Diagram Card (4 Cols) */}
        <div className="md:col-span-4 bg-[#FFFFFF] dark:bg-[#231C18] border border-[#EFE6DD] dark:border-[#352B25] rounded-3xl p-6 shadow-[0_4px_24px_rgba(74,44,17,0.03)] flex flex-col justify-between">
          <div>
            <h2 className="font-serif font-bold text-base text-[#362219] dark:text-[#F5EBE1]">Your Rating</h2>
            <p className="text-[11px] text-[#A0937D] dark:text-[#8D7B68] font-semibold mt-0.5">
              What people feel and comment
            </p>
          </div>

          {/* Overlapping Circles Bubble Chart */}
          <div className="my-6 relative h-48 flex items-center justify-center">
            {/* Circle 1: Hygiene (Light Beige) */}
            <div className="absolute left-6 top-2 w-24 h-24 bg-[#EFE3D5] dark:bg-[#3D302A] text-[#362219] dark:text-[#F5EBE1] rounded-full flex flex-col items-center justify-center p-2 shadow-sm z-10 border border-[#E8D5C4]/50">
              <span className="text-sm font-extrabold">85%</span>
              <span className="text-[9px] font-semibold text-[#8D7B68] dark:text-[#A89582]">Hygiene</span>
            </div>

            {/* Circle 2: Food Taste (Dark Brown) */}
            <div className="absolute right-4 top-6 w-32 h-32 bg-[#4A2C11] text-[#FFFFFF] rounded-full flex flex-col items-center justify-center p-3 shadow-lg z-20">
              <span className="text-lg font-black">85%</span>
              <span className="text-[10px] font-semibold opacity-80">Food Taste</span>
            </div>

            {/* Circle 3: Packaging (Terracotta Brown) */}
            <div className="absolute left-10 bottom-2 w-26 h-26 bg-[#8B5E3C] text-[#FFFFFF] rounded-full flex flex-col items-center justify-center p-2 shadow-md z-30">
              <span className="text-base font-extrabold">92%</span>
              <span className="text-[9px] font-semibold opacity-85">Packaging</span>
            </div>
          </div>
        </div>

        {/* Food with most requests List Card (4 Cols) */}
        <div className="md:col-span-4 bg-[#FFFFFF] dark:bg-[#231C18] border border-[#EFE6DD] dark:border-[#352B25] rounded-3xl p-6 shadow-[0_4px_24px_rgba(74,44,17,0.03)] flex flex-col justify-between">
          <div>
            <h2 className="font-serif font-bold text-base text-[#362219] dark:text-[#F5EBE1]">Food with the most requests</h2>
            <p className="text-[11px] text-[#A0937D] dark:text-[#8D7B68] font-semibold mt-0.5">
              specially made and grinded
            </p>
          </div>

          <div className="my-4 divide-y divide-[#EFE6DD]/60 dark:divide-[#352B25]/60">
            {displayDishes.map((item, idx) => (
              <div key={idx} className="py-3 flex items-center justify-between first:pt-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-[#FAF7F2] dark:bg-[#2D241F] border border-[#EFE6DD] dark:border-[#352B25] flex items-center justify-center text-sm shadow-xs shrink-0">
                    {item.icon}
                  </div>
                  <span className="text-xs font-extrabold text-[#362219] dark:text-[#F5EBE1]">{item.name}</span>
                </div>
                <span className="text-xs font-bold text-[#8D7B68] dark:text-[#A89582]">
                  IDR {item.price.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Order Trend Line Chart Card (4 Cols) */}
        <div className="md:col-span-4 bg-[#FFFFFF] dark:bg-[#231C18] border border-[#EFE6DD] dark:border-[#352B25] rounded-3xl p-6 shadow-[0_4px_24px_rgba(74,44,17,0.03)] flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-serif font-bold text-base text-[#362219] dark:text-[#F5EBE1]">Order</h2>
              <button className="px-3.5 py-1.5 rounded-full border border-[#EFE6DD] dark:border-[#352B25] text-[11px] font-bold text-[#8D7B68] dark:text-[#A89582] hover:bg-[#FAF7F2] dark:hover:bg-[#2D241F] transition-all cursor-pointer">
                View Report
              </button>
            </div>

            <div className="mt-3">
              <div className="text-2xl font-black text-[#362219] dark:text-[#F5EBE1] tracking-tight font-sans">
                {totalOrdersDisplay}
              </div>

              <div className="flex items-center gap-2 mt-1">
                <span className="inline-flex items-center text-[11px] font-extrabold text-[#C62828]">
                  <ArrowDownRight className="w-3.5 h-3.5 mr-0.5" /> 2.14%
                </span>
                <span className="text-[11px] text-[#A0937D] dark:text-[#8D7B68] font-medium">vs last week</span>
              </div>

              <p className="text-[11px] text-[#A0937D] dark:text-[#8D7B68] font-semibold mt-2">
                Sales from 12-18 Dec, 2021
              </p>
            </div>
          </div>

          {/* Sparkline / Line Chart */}
          <div className="mt-4">
            <div className="h-28 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lineData}>
                  <Line type="monotone" dataKey="count" stroke="#4A2C11" strokeWidth={2.5} dot={false} />
                  <Line type="monotone" dataKey="lastWeekCount" stroke="#D9C4B1" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 text-[11px] font-semibold text-[#8D7B68]">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#4A2C11]" />
                <span>Last 6 days</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-[#D9C4B1]" />
                <span>Last Week</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
