'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '../../store/authStore';
import ThemeToggle from '../../components/ThemeToggle';
import { 
  Loader2, LayoutDashboard, UtensilsCrossed, Tablet, Users, 
  ChefHat, LogOut, Coffee, Menu, X, Settings, ShoppingBag, 
  Star, CreditCard, User, HelpCircle, Search, Bell, ChevronDown
} from 'lucide-react';
import Link from 'next/link';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, token, clearAuth, restaurant } = useAuthStore();
  
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    setMounted(true);
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
      <div className="min-h-screen flex items-center justify-center bg-[#FAF7F2] dark:bg-[#181310]">
        <Loader2 className="w-8 h-8 animate-spin text-[#523219] dark:text-[#D9A066]" />
      </div>
    );
  }

  const menuNavLinks = [
    { label: 'Dashboard', href: '/admin/dashboard', icon: LayoutDashboard },
    { label: 'Food Order', href: '/admin/tables', icon: ShoppingBag },
    { label: 'Manage Menu', href: '/admin/menu', icon: UtensilsCrossed },
    { label: 'Customer Review', href: '/admin/dashboard#reviews', icon: Star },
  ];

  const othersNavLinks = [
    { label: 'Settings', href: '/admin/settings', icon: Settings },
    { label: 'Payment', href: '/admin/dashboard#payment', icon: CreditCard },
    { label: 'Accounts', href: '/admin/staff', icon: Users },
    { label: 'Help', href: '/admin/settings#help', icon: HelpCircle },
  ];

  const cafeDisplayName = restaurant?.name || 'Fan Coffee';

  return (
    <div className="min-h-screen bg-[#FAF7F2] dark:bg-[#181310] text-[#362219] dark:text-[#F5EBE1] flex flex-col md:flex-row font-sans selection:bg-[#EFE3D5] selection:text-[#362219]">
      {/* Sidebar Navigation (Desktop) */}
      <aside className="hidden md:flex flex-col w-64 bg-[#FDF8F2] dark:bg-[#1E1713] border-r border-[#EFE6DD] dark:border-[#2D231E] shrink-0 p-5 space-y-6">
        {/* Brand Header */}
        <div className="flex items-center gap-3 px-2 py-1">
          <div className="w-9 h-9 bg-[#523219] text-[#FDF8F2] rounded-full flex items-center justify-center shadow-sm shrink-0">
            <Coffee className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <h1 className="font-serif font-black text-lg text-[#362219] dark:text-[#F5EBE1] tracking-tight leading-none">Coffee crush</h1>
            <span className="text-[10px] text-[#8D7B68] dark:text-[#A89582] font-semibold tracking-wide block mt-0.5">CafeFlow Platform</span>
          </div>
        </div>

        {/* Navigation Sections */}
        <div className="flex-1 space-y-6 overflow-y-auto pr-1">
          {/* MENU Group */}
          <div className="space-y-1">
            <span className="px-3 text-[11px] font-bold text-[#A0937D] dark:text-[#8D7B68] uppercase tracking-wider block mb-2">MENU</span>
            {menuNavLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-[#EFE3D5] dark:bg-[#3D302A] text-[#362219] dark:text-[#F5EBE1] shadow-xs'
                      : 'text-[#8D7B68] dark:text-[#A89582] hover:bg-[#F5EBE1]/60 dark:hover:bg-[#2D241F] hover:text-[#362219]'
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-[#523219] dark:text-[#D9A066]' : 'text-[#8D7B68]'}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>

          {/* OTHERS Group */}
          <div className="space-y-1">
            <span className="px-3 text-[11px] font-bold text-[#A0937D] dark:text-[#8D7B68] uppercase tracking-wider block mb-2">OTHERS</span>
            {othersNavLinks.map((link) => {
              const Icon = link.icon;
              const isActive = pathname === link.href;

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`flex items-center gap-3 px-4 py-3 rounded-2xl text-xs font-bold transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-[#EFE3D5] dark:bg-[#3D302A] text-[#362219] dark:text-[#F5EBE1] shadow-xs'
                      : 'text-[#8D7B68] dark:text-[#A89582] hover:bg-[#F5EBE1]/60 dark:hover:bg-[#2D241F] hover:text-[#362219]'
                  }`}
                >
                  <Icon className={`w-4.5 h-4.5 shrink-0 ${isActive ? 'text-[#523219] dark:text-[#D9A066]' : 'text-[#8D7B68]'}`} />
                  <span>{link.label}</span>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Sidebar Footer */}
        <div className="pt-4 border-t border-[#EFE6DD] dark:border-[#2D231E] space-y-2">
          <Link
            href="/kitchen"
            target="_blank"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold bg-[#F5EBE1] dark:bg-[#2D241F] text-[#523219] dark:text-[#E8D5C4] hover:bg-[#EFE3D5] transition-all text-center justify-center"
          >
            <ChefHat className="w-4 h-4 text-[#523219] dark:text-[#D9A066]" /> Open Kitchen Panel
          </Link>
          
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-bold text-[#C62828] hover:bg-[#C62828]/10 transition-all justify-center cursor-pointer"
          >
            <LogOut className="w-4 h-4" /> Log Out
          </button>
        </div>
      </aside>

      {/* Top Navbar Header (Mobile) */}
      <header className="md:hidden bg-[#FDF8F2] dark:bg-[#1E1713] border-b border-[#EFE6DD] dark:border-[#2D231E] px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-[#523219] text-[#FDF8F2] rounded-full flex items-center justify-center">
            <Coffee className="w-4 h-4" />
          </div>
          <span className="font-serif font-black text-base text-[#362219] dark:text-[#F5EBE1]">Coffee crush</span>
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl bg-[#F5EBE1] dark:bg-[#2D241F] text-[#523219] dark:text-[#E8D5C4] cursor-pointer"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </header>

      {/* Mobile Drawer */}
      {mobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-[#362219]/40 backdrop-blur-xs" onClick={() => setMobileMenuOpen(false)}>
          <div className="bg-[#FDF8F2] dark:bg-[#1E1713] w-64 h-full flex flex-col border-r border-[#EFE6DD] p-5 space-y-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <span className="font-serif font-bold text-sm">Navigation</span>
              <button onClick={() => setMobileMenuOpen(false)} className="p-1 rounded-full bg-[#F5EBE1]">
                <X className="w-4 h-4" />
              </button>
            </div>

            <nav className="flex-1 space-y-4 overflow-y-auto">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-[#A0937D] uppercase tracking-wider block mb-1">MENU</span>
                {menuNavLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = pathname === link.href;

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#EFE3D5] text-[#362219]'
                          : 'text-[#8D7B68] hover:bg-[#F5EBE1]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>

              <div className="space-y-1">
                <span className="text-[10px] font-bold text-[#A0937D] uppercase tracking-wider block mb-1">OTHERS</span>
                {othersNavLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = pathname === link.href;

                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                        isActive
                          ? 'bg-[#EFE3D5] text-[#362219]'
                          : 'text-[#8D7B68] hover:bg-[#F5EBE1]'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </div>
            </nav>

            <div className="space-y-2 border-t border-[#EFE6DD] pt-4">
              <Link
                href="/kitchen"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-center gap-2 w-full py-2 bg-[#F5EBE1] text-[#523219] text-xs font-bold rounded-xl"
              >
                <ChefHat className="w-4 h-4" /> Kitchen Screen
              </Link>
              <button
                onClick={handleLogout}
                className="w-full flex items-center justify-center gap-2 py-2 text-[#C62828] text-xs font-bold hover:bg-[#C62828]/10 rounded-xl cursor-pointer"
              >
                <LogOut className="w-4 h-4" /> Log Out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Workspace Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header Bar */}
        <header className="hidden md:flex bg-[#FAF7F2] dark:bg-[#181310] h-18 px-8 items-center justify-between gap-6 shrink-0 border-b border-[#EFE6DD]/40 dark:border-[#2D231E]">
          {/* Middle Pill Search Bar */}
          <div className="flex-1 max-w-lg relative">
            <Search className="w-4 h-4 text-[#8D7B68] absolute left-4 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search"
              className="w-full bg-[#FFFFFF] dark:bg-[#231C18] border border-[#EFE6DD] dark:border-[#352B25] rounded-full pl-11 pr-5 py-2 text-xs font-medium text-[#362219] dark:text-[#F5EBE1] placeholder-[#A0937D] outline-none focus:ring-2 focus:ring-[#523219]/20 transition-all shadow-xs"
            />
          </div>

          {/* Right User & Cafe Controls */}
          <div className="flex items-center gap-5 shrink-0">
            {/* Cafe / User Profile Badge */}
            <div className="flex items-center gap-3 bg-[#FFFFFF] dark:bg-[#231C18] border border-[#EFE6DD] dark:border-[#352B25] px-3.5 py-1.5 rounded-full shadow-xs cursor-pointer hover:border-[#523219]/30 transition-all">
              <div className="w-7 h-7 bg-[#EFE3D5] dark:bg-[#3D302A] text-[#523219] dark:text-[#D9A066] rounded-full flex items-center justify-center font-bold text-xs">
                ☕
              </div>
              <span className="text-xs font-bold text-[#362219] dark:text-[#F5EBE1]">{cafeDisplayName}</span>
              <ChevronDown className="w-3.5 h-3.5 text-[#8D7B68]" />
            </div>

            {/* Notification Bell Icon */}
            <button className="relative w-9 h-9 bg-[#FFFFFF] dark:bg-[#231C18] border border-[#EFE6DD] dark:border-[#352B25] rounded-full flex items-center justify-center text-[#523219] dark:text-[#F5EBE1] hover:bg-[#F5EBE1]/40 transition-all shadow-xs cursor-pointer">
              <Bell className="w-4 h-4" />
              <span className="absolute top-2 right-2 w-2 h-2 bg-[#C62828] rounded-full ring-2 ring-[#FFFFFF]" />
            </button>

            <ThemeToggle />
          </div>
        </header>

        {/* Dynamic Page Content */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
