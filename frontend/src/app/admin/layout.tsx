'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import api from '../../lib/axios';
import { useAuthStore } from '../../store/authStore';
import useSocket from '../../hooks/useSocket';
import { playOrderChime, playBellAlert, initAudioUnlock } from '../../lib/soundService';
import { printQuickTicket } from '../../lib/printService';
import ThemeToggle from '../../components/ThemeToggle';
import { 
  Loader2, LayoutDashboard, UtensilsCrossed, Tablet, Users, 
  ChefHat, LogOut, Coffee, Menu, X, Settings, Ticket, Bell, Printer
} from 'lucide-react';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, clearAuth, updateRestaurant } = useAuthStore();
  
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [incomingAlert, setIncomingAlert] = useState<{
    id: string;
    tableNumber: string;
    title: string;
    subtitle: string;
    qt?: any;
    items?: Array<{ name: string; quantity: number }>;
  } | null>(null);
  const [isPrintingAlertKOT, setIsPrintingAlertKOT] = useState(false);

  const socket = useSocket('restaurant', user?.restaurantId);

  useEffect(() => {
    initAudioUnlock();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleNewOrder = (order: any) => {
      console.log('[Admin Sound Alert] New order received for table:', order?.tableNumber);
      playOrderChime();
      setIncomingAlert({
        id: Date.now().toString(),
        tableNumber: order?.tableNumber || 'N/A',
        title: `New Order: Table ${order?.tableNumber || 'N/A'}`,
        subtitle: `${order?.items?.length || 1} item(s) ordered`,
        items: order?.items,
      });
    };

    const handleOrderAppended = (data: any) => {
      console.log('[Admin Sound Alert] Extra items ordered for table:', data?.tableNumber);
      playOrderChime();
      const itemsCount = data?.newItems?.length || 1;
      const itemNames = data?.newItems?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ') || `${itemsCount} new item(s)`;
      setIncomingAlert({
        id: Date.now().toString(),
        tableNumber: data?.tableNumber || 'N/A',
        title: `QR Scan Added: Table ${data?.tableNumber || 'N/A'}`,
        subtitle: itemNames,
        qt: data?.qt,
        items: data?.newItems,
      });
    };

    const handleNewQT = (qt: any) => {
      console.log('[Admin Sound Alert] New QT ticket received:', qt?.ticketNumber);
      playOrderChime();
      const itemsList = qt?.items?.map((i: any) => `${i.quantity}x ${i.name}`).join(', ') || 'New items';
      setIncomingAlert({
        id: Date.now().toString(),
        tableNumber: qt?.tableNumber || 'N/A',
        title: `Kitchen Ticket: ${qt?.ticketNumber || 'QT'} (Table ${qt?.tableNumber || 'N/A'})`,
        subtitle: itemsList,
        qt: qt,
        items: qt?.items,
      });
    };

    const handleWaiterRequested = (data: any) => {
      playBellAlert();
      setIncomingAlert({
        id: Date.now().toString(),
        tableNumber: data?.tableNumber || 'N/A',
        title: `Staff Call: Table ${data?.tableNumber || 'N/A'}`,
        subtitle: 'Customer called waiter assistance',
      });
    };

    const handleBillRequested = (data: any) => {
      playBellAlert();
      setIncomingAlert({
        id: Date.now().toString(),
        tableNumber: data?.tableNumber || 'N/A',
        title: `Bill Requested: Table ${data?.tableNumber || 'N/A'}`,
        subtitle: 'Customer requested invoice settlement',
      });
    };

    socket.on('new_order', handleNewOrder);
    socket.on('order_items_appended', handleOrderAppended);
    socket.on('new_qt', handleNewQT);
    socket.on('waiter_requested', handleWaiterRequested);
    socket.on('bill_requested', handleBillRequested);

    return () => {
      socket.off('new_order', handleNewOrder);
      socket.off('order_items_appended', handleOrderAppended);
      socket.off('new_qt', handleNewQT);
      socket.off('waiter_requested', handleWaiterRequested);
      socket.off('bill_requested', handleBillRequested);
    };
  }, [socket]);

  // Auto-dismiss alert after 9 seconds
  useEffect(() => {
    if (!incomingAlert) return;
    const timer = setTimeout(() => {
      setIncomingAlert(null);
    }, 9000);
    return () => clearTimeout(timer);
  }, [incomingAlert]);

  const handlePrintAlertKOT = async (qt: any) => {
    if (!qt) return;
    setIsPrintingAlertKOT(true);
    try {
      await printQuickTicket(qt, useAuthStore.getState().restaurant?.name);
    } catch (err) {
      console.error('Failed to print alert KOT:', err);
    } finally {
      setIsPrintingAlertKOT(false);
    }
  };

  useEffect(() => {
    setMounted(true);
    // Secure guard: check if authenticated and holding admin privilege
    if (!token || !user || user.role !== 'restaurant_admin') {
      router.push('/login');
      return;
    }

    // Always ensure fresh restaurant settings from backend
    const syncRestaurant = async () => {
      try {
        const res = await api.get('/restaurants/my-restaurant');
        if (res.data.success) {
          updateRestaurant(res.data.data);
        }
      } catch (e) {
        console.error('Failed to sync restaurant in layout:', e);
      }
    };
    syncRestaurant();
  }, [token, user, router, updateRestaurant]);

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  if (!mounted || !token || !user || user.role !== 'restaurant_admin') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  const navLinks = [
    { label: 'Overview', href: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Menu Dishes', href: '/admin/menu', icon: UtensilsCrossed },
    { label: 'Table Management', href: '/admin/tables', icon: Tablet },
    { label: 'Kitchen Tickets (KOT)', href: '/admin/qt', icon: Ticket },
    { label: 'Staff Roster', href: '/admin/staff', icon: Users },
    { label: 'Cafe Settings', href: '/admin/settings', icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-950 text-foreground flex flex-col md:flex-row">
      {/* Sidebar Navigation (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 bg-card text-card-foreground border-r border-border/80 shrink-0">
        <div className="p-6 border-b border-border/50 flex items-center gap-3">
          <div className="w-10 h-10 bg-primary text-primary-foreground rounded-2xl flex items-center justify-center">
            <Coffee className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-serif font-black text-base tracking-tight leading-none">CafeFlow</h1>
            <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider mt-1 block">Restaurant Hub</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all duration-200 cursor-pointer ${
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-md shadow-primary/10'
                    : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5 shrink-0" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border/50 space-y-2">
          {/* Quick links to kitchen panel */}
          <Link
            href="/kitchen"
            target="_blank"
            className="flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold bg-secondary text-foreground border border-border/60 hover:bg-muted transition-all text-center justify-center"
          >
            <ChefHat className="w-4 h-4 text-primary" /> Open Kitchen Screen
          </Link>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-xs font-bold text-destructive hover:bg-destructive/10 transition-all justify-center cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Log Out
          </button>
        </div>
      </aside>

      {/* Top Navbar Header (Mobile) */}
      <header className="md:hidden bg-card text-card-foreground border-b border-border/80 px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-2">
          <Coffee className="w-5 h-5 text-primary" />
          <span className="font-serif font-black text-sm">CafeFlow Admin</span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-stone-950/60 backdrop-blur-sm" onClick={() => setMobileMenuOpen(false)}>
          <div className="bg-card w-64 h-full flex flex-col border-r border-border animate-slide-right p-5 space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-serif font-bold text-sm">Navigation</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-full bg-secondary">
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 space-y-2">
              {navLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;

                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all cursor-pointer ${
                      isActive
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-secondary'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            <div className="space-y-2 border-t border-border pt-4">
              <Link
                href="/kitchen"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 w-full py-2 bg-secondary text-foreground text-xs font-bold rounded-lg"
              >
                <ChefHat className="w-4 h-4 text-primary" /> Kitchen Screen
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2 text-destructive text-xs font-bold hover:bg-destructive/10 rounded-lg cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content Workspace panel */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="hidden md:flex bg-card h-16 border-b border-border/50 items-center justify-between px-8 shrink-0">
          <div className="text-xs text-muted-foreground font-semibold">
            Partner workspace for <span className="text-foreground font-extrabold">{useAuthStore.getState().restaurant?.name}</span>
          </div>
          <ThemeToggle />
        </header>

        <div className="flex-1 p-6 md:p-8 overflow-y-auto relative">
          {/* Real-time floating Order & KOT notification banner */}
          {incomingAlert && (
            <div className="fixed top-20 right-6 z-50 max-w-sm w-full bg-card border-2 border-primary/50 text-card-foreground p-4 rounded-2xl shadow-2xl shadow-primary/20 animate-in slide-in-from-top-4 duration-300 flex items-start gap-3.5 backdrop-blur-md">
              <div className="w-10 h-10 rounded-xl bg-primary/15 text-primary flex items-center justify-center shrink-0 animate-bounce">
                <Bell className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <h4 className="font-serif font-black text-sm text-foreground truncate">
                    {incomingAlert.title}
                  </h4>
                  <button
                    onClick={() => setIncomingAlert(null)}
                    className="text-muted-foreground hover:text-foreground p-1 rounded-full hover:bg-secondary cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 font-medium">
                  {incomingAlert.subtitle}
                </p>

                {incomingAlert.qt && (
                  <div className="mt-2.5 flex items-center gap-2">
                    <button
                      onClick={() => handlePrintAlertKOT(incomingAlert.qt)}
                      disabled={isPrintingAlertKOT}
                      className="px-3 py-1.5 bg-primary hover:bg-primary/90 text-white rounded-xl text-xs font-bold cursor-pointer transition-all flex items-center gap-1.5 shadow-md shadow-primary/20 disabled:opacity-60"
                    >
                      {isPrintingAlertKOT ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                      <span>Print KOT ({incomingAlert.qt.ticketNumber || 'Ticket'})</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {children}
        </div>
      </div>
    </div>
  );
}
