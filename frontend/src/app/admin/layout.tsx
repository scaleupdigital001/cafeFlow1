'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '../../store/authStore';
import ThemeToggle from '../../components/ThemeToggle';
import { 
  Loader2, LayoutDashboard, UtensilsCrossed, Tablet, Users, 
  ChefHat, LogOut, Coffee, Menu, X, Settings
} from 'lucide-react';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, clearAuth } = useAuthStore();
  
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Secure guard: check if authenticated and holding admin privilege
    if (!token || !user || user.role !== 'restaurant_admin') {
      router.push('/login');
    }
  }, [token, user, router]);

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
    { label: 'Tables & QRs', href: '/admin/tables', icon: Tablet },
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

        <div className="flex-1 p-6 md:p-8 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>
  );
}
