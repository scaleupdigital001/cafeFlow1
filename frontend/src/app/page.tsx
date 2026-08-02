'use client';

import React from 'react';
import Link from 'next/link';
import ThemeToggle from '../components/ThemeToggle';
import { Card } from '../components/ui/card';
import { 
  Coffee, QrCode, Tablet, BarChart3, ShieldCheck, 
  ChevronRight, ArrowUpRight, Award, Zap, HelpCircle, Globe,
  ChefHat, Sparkles, CheckCircle2, ArrowRight, Utensils
} from 'lucide-react';

export default function SaaSLandingPage() {
  return (
    <div className="bg-background text-foreground min-h-screen selection:bg-amber-500/20 selection:text-amber-600">
      {/* Top Floating Glass Header */}
      <header className="sticky top-0 z-50 bg-background/80 dark:bg-background/80 backdrop-blur-xl border-b border-border/40 transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
              <Coffee className="w-5.5 h-5.5 stroke-[2.2]" />
            </div>
            <span className="font-serif font-black text-xl md:text-2xl tracking-tight">
              Cafe<span className="text-amber-600 dark:text-amber-500 font-sans font-extrabold">Flow</span>
            </span>
          </div>

          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link
              href="/login"
              className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white rounded-full text-xs md:text-sm font-bold shadow-lg shadow-amber-600/20 hover:shadow-amber-600/30 transition-all duration-200 hover:scale-[1.03] active:scale-[0.98]"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative py-20 md:py-28 px-4 text-center overflow-hidden">
        {/* Glowing Background Orbs */}
        <div className="absolute top-10 left-1/2 -translate-x-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-amber-500/15 to-orange-500/10 rounded-full blur-[120px] -z-10 pointer-events-none" />
        <div className="absolute top-1/3 left-10 w-72 h-72 bg-amber-600/10 rounded-full blur-[90px] -z-10 pointer-events-none" />
        <div className="absolute top-1/3 right-10 w-72 h-72 bg-orange-600/10 rounded-full blur-[90px] -z-10 pointer-events-none" />

        <div className="max-w-4xl mx-auto space-y-6">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs font-bold tracking-wide uppercase shadow-xs backdrop-blur-md">
            <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
            <span>Next-Gen Multi-Tenant Cafe SaaS</span>
          </div>
          
          {/* Main Title */}
          <h1 className="font-serif text-4xl sm:text-6xl md:text-7xl font-extrabold tracking-tight leading-[1.08] text-foreground">
            The Smart Dining Loop <br />
            For Modern <span className="bg-gradient-to-r from-amber-600 via-orange-500 to-amber-700 bg-clip-text text-transparent italic font-serif">Cafes & Bistros</span>
          </h1>
          
          {/* Subtitle */}
          <p className="text-base sm:text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto font-normal leading-relaxed">
            Automate table ordering with dynamic QR codes, run real-time kitchen displays, manage digital menus, and track sales revenue seamlessly.
          </p>

          {/* Action CTA Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
            <Link
              href="/login"
              className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-full shadow-xl shadow-amber-600/25 transition-all duration-200 hover:scale-[1.03] text-center flex items-center justify-center gap-2 text-sm cursor-pointer"
            >
              Configure Restaurant Now <ArrowRight className="w-4 h-4" />
            </Link>
            
            <Link
              href="/r/central-cafe"
              target="_blank"
              className="w-full sm:w-auto px-8 py-4 bg-card/80 dark:bg-card/40 hover:bg-card text-foreground border border-border/80 font-bold rounded-full transition-all duration-200 text-center flex items-center justify-center gap-2 cursor-pointer text-sm shadow-xs hover:border-amber-500/40"
            >
              Explore Demo Cafe <ArrowUpRight className="w-4 h-4 text-amber-600 dark:text-amber-500" />
            </Link>
          </div>

          {/* Feature Hero Preview Mockup Card */}
          <div className="pt-12 max-w-4xl mx-auto">
            <div className="bg-gradient-to-b from-amber-500/10 to-transparent p-1.5 rounded-3xl border border-amber-500/20 shadow-2xl backdrop-blur-xl">
              <div className="bg-card dark:bg-stone-950 rounded-[22px] p-6 md:p-8 border border-border/60 text-left space-y-6">
                <div className="flex items-center justify-between border-b border-border/60 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-red-500/80" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                    <div className="w-3 h-3 rounded-full bg-green-500/80" />
                    <span className="text-xs font-mono text-muted-foreground ml-2">cafeflow.com/r/central-cafe</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-500/10 text-amber-600 px-3 py-1 rounded-full border border-amber-500/20">
                    Live System Active
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Mockup Widget 1 */}
                  <div className="bg-background/80 dark:bg-stone-900/60 p-4 rounded-2xl border border-border/60 space-y-2">
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-500 font-bold text-xs">
                      <QrCode className="w-4 h-4" /> Table 03 QR Code
                    </div>
                    <div className="text-lg font-black font-serif">Contactless Menu</div>
                    <div className="text-[11px] text-muted-foreground">Scans automatically detect table location & customer OTP checkout.</div>
                  </div>

                  {/* Mockup Widget 2 */}
                  <div className="bg-background/80 dark:bg-stone-900/60 p-4 rounded-2xl border border-border/60 space-y-2">
                    <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-bold text-xs">
                      <ChefHat className="w-4 h-4" /> Real-time Kitchen
                    </div>
                    <div className="text-lg font-black font-serif">Instant Tickets</div>
                    <div className="text-[11px] text-muted-foreground">Socket.io broadcasts new orders instantly to chef prep screens.</div>
                  </div>

                  {/* Mockup Widget 3 */}
                  <div className="bg-background/80 dark:bg-stone-900/60 p-4 rounded-2xl border border-border/60 space-y-2">
                    <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-xs">
                      <BarChart3 className="w-4 h-4" /> Analytics Engine
                    </div>
                    <div className="text-lg font-black font-serif">PDF & Sales CSV</div>
                    <div className="text-[11px] text-muted-foreground">Generate automated GST invoices & daily sales export reports.</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Core Features Suite Grid */}
      <section className="py-20 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        <div className="text-center max-w-xl mx-auto space-y-3">
          <span className="inline-block text-amber-600 dark:text-amber-500 text-xs font-extrabold tracking-widest uppercase bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
            Features
          </span>
          <h2 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-foreground">
            Complete Operations Suite
          </h2>
          <p className="text-muted-foreground text-xs md:text-sm">
            Everything your cafe needs to streamline workflow and boost revenue.
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[
            {
              title: 'Multi-Tenant Setup',
              desc: 'Every restaurant gets its own custom landing page and menu catalog.',
              icon: Globe,
              gradient: 'from-amber-500/20 to-orange-500/10',
            },
            {
              title: 'Contactless QR Menu',
              desc: 'Table-specific QRs automatically assign order context without app download.',
              icon: QrCode,
              gradient: 'from-orange-500/20 to-amber-600/10',
            },
            {
              title: 'Kitchen Dashboard',
              desc: 'Socket.io powered live status cards for cooks and prep line staff.',
              icon: Tablet,
              gradient: 'from-amber-600/20 to-yellow-500/10',
            },
            {
              title: 'Sales Analytics',
              desc: 'Revenue breakdown charts, item request analytics, and PDF invoice generator.',
              icon: BarChart3,
              gradient: 'from-orange-600/20 to-amber-500/10',
            },
          ].map((feat, i) => {
            const Icon = feat.icon;
            return (
              <div 
                key={i} 
                className="bg-card dark:bg-card/60 border border-border/60 hover:border-amber-500/40 p-6 rounded-3xl shadow-xs hover:shadow-xl hover:shadow-amber-500/5 transition-all duration-300 flex flex-col justify-between group"
              >
                <div className="space-y-4">
                  <div className={`w-12 h-12 bg-gradient-to-br ${feat.gradient} text-amber-600 dark:text-amber-400 border border-amber-500/20 rounded-2xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200`}>
                    <Icon className="w-6 h-6 stroke-[2]" />
                  </div>
                  <h3 className="font-serif font-bold text-lg text-foreground group-hover:text-amber-600 dark:group-hover:text-amber-500 transition-colors">{feat.title}</h3>
                  <p className="text-xs text-muted-foreground leading-relaxed">{feat.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Modern How It Works Lifecycle */}
      <section className="py-24 bg-gradient-to-b from-amber-500/5 via-orange-500/5 to-transparent border-y border-border/40 relative overflow-hidden">
        <div className="max-w-5xl mx-auto px-4 text-center space-y-16">
          <div className="space-y-3">
            <span className="inline-block text-amber-600 dark:text-amber-500 text-xs font-extrabold tracking-widest uppercase bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
              How It Works
            </span>
            <h2 className="font-serif text-3xl md:text-5xl font-bold tracking-tight text-foreground">
              Ordering Loop Lifecycle
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground max-w-lg mx-auto">
              From table scan to kitchen completion in 3 seamless steps.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              { 
                step: '01', 
                title: 'Scan Table QR', 
                desc: 'Customer sits at table, scans dynamic QR code, and opens table-specific menu instantly.' 
              },
              { 
                step: '02', 
                title: 'OTP & Customization', 
                desc: 'Customer selects dish modifiers, verifies phone via SMS OTP, and completes checkout.' 
              },
              { 
                step: '03', 
                title: 'Cook & Generate Bill', 
                desc: 'Kitchen accepts live order socket, marks preparation stages, and streams PDF GST bill.' 
              },
            ].map((s, i) => (
              <div 
                key={i} 
                className="bg-card dark:bg-card/70 border border-border/60 hover:border-amber-500/30 p-8 rounded-3xl shadow-sm hover:shadow-lg transition-all duration-300 relative text-left space-y-4"
              >
                <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-amber-600 to-orange-600 text-white font-black text-base flex items-center justify-center shadow-md shadow-amber-600/20">
                  {s.step}
                </div>
                <h3 className="font-serif font-bold text-lg text-foreground">{s.title}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Direct Interactive Demo Links */}
      <section className="py-16 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-gradient-to-r from-amber-900/10 via-orange-900/10 to-amber-900/10 border border-amber-500/20 rounded-3xl p-8 md:p-12 text-center space-y-8 backdrop-blur-md">
          <div className="max-w-2xl mx-auto space-y-2">
            <h2 className="font-serif text-2xl md:text-4xl font-bold text-foreground">
              Experience CafeFlow Sandbox
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground">
              Launch pre-seeded demonstration screens for customer, kitchen, and management views.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 max-w-3xl mx-auto">
            <Link
              href="/r/central-cafe/menu/table/3"
              target="_blank"
              className="bg-card hover:bg-amber-500/10 p-5 rounded-2xl border border-border hover:border-amber-500/30 transition-all flex flex-col items-center gap-2 group cursor-pointer"
            >
              <QrCode className="w-6 h-6 text-amber-600 group-hover:scale-110 transition-transform" />
              <span className="font-bold text-xs text-foreground">Sample Table 3 QR Scan</span>
              <span className="text-[10px] text-muted-foreground">Customer Menu View</span>
            </Link>

            <Link
              href="/kitchen"
              target="_blank"
              className="bg-card hover:bg-amber-500/10 p-5 rounded-2xl border border-border hover:border-amber-500/30 transition-all flex flex-col items-center gap-2 group cursor-pointer"
            >
              <ChefHat className="w-6 h-6 text-amber-600 group-hover:scale-110 transition-transform" />
              <span className="font-bold text-xs text-foreground">Live Kitchen Screen</span>
              <span className="text-[10px] text-muted-foreground">Cook Orders Display</span>
            </Link>

            <Link
              href="/login"
              className="bg-card hover:bg-amber-500/10 p-5 rounded-2xl border border-border hover:border-amber-500/30 transition-all flex flex-col items-center gap-2 group cursor-pointer"
            >
              <Coffee className="w-6 h-6 text-amber-600 group-hover:scale-110 transition-transform" />
              <span className="font-bold text-xs text-foreground">Cafe Admin Panel</span>
              <span className="text-[10px] text-muted-foreground">Owner Dashboard</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-16 text-center border-t border-border/60 bg-stone-950 text-stone-400">
        <div className="max-w-5xl mx-auto px-4 space-y-6">
          <div className="flex items-center justify-center gap-2 text-stone-100">
            <div className="w-8 h-8 bg-gradient-to-br from-amber-500 to-orange-600 text-white rounded-xl flex items-center justify-center">
              <Coffee className="w-5 h-5" />
            </div>
            <span className="font-serif font-black text-xl">CafeFlow</span>
          </div>
          
          <p className="text-xs max-w-md mx-auto text-stone-400 leading-relaxed">
            Multi-Tenant Cafe Ordering SaaS built with Next.js 15, Express.js, Socket.io, PDFKit & MongoDB.
          </p>

          <div className="flex flex-wrap justify-center gap-6 text-xs font-semibold pt-2 text-stone-300">
            <Link href="/login" className="hover:text-amber-400 transition-colors">Partner Sign In</Link>
            <Link href="/r/central-cafe" className="hover:text-amber-400 transition-colors">Central Cafe Demo</Link>
            <Link href="/r/central-cafe/menu/table/3" className="hover:text-amber-400 transition-colors">Sample Table 3 Scan</Link>
          </div>

          <div className="text-[11px] text-stone-500 pt-4 border-t border-stone-800/80">
            &copy; {new Date().getFullYear()} CafeFlow SaaS. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
