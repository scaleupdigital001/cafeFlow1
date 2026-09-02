'use client';

import React, { useEffect, useState, useMemo } from 'react';
import api from '../../../lib/axios';
import useSocket from '../../../hooks/useSocket';
import { useAuthStore } from '../../../store/authStore';
import { printQuickTicket } from '../../../lib/printService';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent } from '../../../components/ui/card';
import { 
  Loader2, Printer, CheckCircle2, Clock, 
  Search, RefreshCw, ChefHat, Filter, Ticket
} from 'lucide-react';
import { QT } from '../../../types';

export default function AdminQTPage() {
  const { user, restaurant } = useAuthStore();
  const restaurantId = user?.restaurantId;

  const [qts, setQts] = useState<QT[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'printed' | 'served'>('all');
  const [tableSearchQuery, setTableSearchQuery] = useState('');
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Bind real-time socket connection
  const socket = useSocket('restaurant', restaurantId);

  // Fetch QTs from API (Initial / Explicit Refresh)
  const fetchQTs = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get('/qt');
      setQts(res.data.data);
    } catch (err: any) {
      console.error('Fetch QTs error:', err);
      setError(err.response?.data?.message || 'Failed to fetch Kitchen Order Tickets.');
    } finally {
      setLoading(false);
    }
  };

  // Silent background fetch (prevents UI flickering during automatic background refresh)
  const fetchQTsSilent = async () => {
    try {
      const res = await api.get('/qt');
      setQts(res.data.data);
    } catch (err: any) {
      console.error('Silent fetch QTs error:', err);
    }
  };

  useEffect(() => {
    fetchQTs();
  }, []);

  // Visibility-aware fallback polling interval (10-second interval, pauses when tab is backgrounded)
  useEffect(() => {
    let timer: NodeJS.Timeout | null = null;

    const startPolling = () => {
      if (!timer) {
        timer = setInterval(() => {
          if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
            fetchQTsSilent();
          }
        }, 10000);
      }
    };

    const stopPolling = () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        fetchQTsSilent(); // Immediate silent sync on tab focus
        startPolling();
      } else {
        stopPolling();
      }
    };

    startPolling();
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', handleVisibilityChange);
    }

    return () => {
      stopPolling();
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', handleVisibilityChange);
      }
    };
  }, []);

  // Listen for real-time Socket.IO events (new_qt, qt_status_updated, qt_cleared)
  useEffect(() => {
    if (!socket) return;

    const handleNewQT = (newQt: QT) => {
      console.log('[QT Admin Socket] New ticket received:', newQt.ticketNumber);
      setQts((prev) => [newQt, ...prev.filter((q) => q._id !== newQt._id)]);
    };

    const handleQTStatusUpdated = (updatedQt: QT) => {
      console.log('[QT Admin Socket] Ticket status updated:', updatedQt.ticketNumber, updatedQt.status);
      if (updatedQt.status === 'cleared') {
        setQts((prev) => prev.filter((q) => q._id !== updatedQt._id));
      } else {
        setQts((prev) => prev.map((q) => (q._id === updatedQt._id ? updatedQt : q)));
      }
    };

    const handleQTCleared = (data: { tableNumber: string }) => {
      console.log('[QT Admin Socket] QTs cleared for table:', data?.tableNumber);
      fetchQTsSilent();
    };

    socket.on('new_qt', handleNewQT);
    socket.on('qt_status_updated', handleQTStatusUpdated);
    socket.on('qt_cleared', handleQTCleared);

    return () => {
      socket.off('new_qt', handleNewQT);
      socket.off('qt_status_updated', handleQTStatusUpdated);
      socket.off('qt_cleared', handleQTCleared);
    };
  }, [socket]);

  // Handler for marking QT as printed and launching thermal print
  const handlePrintQT = async (qt: QT) => {
    setActionLoadingId(`${qt._id}_print`);
    try {
      // 1. Mark as printed via backend API
      const res = await api.patch(`/qt/${qt._id}/printed`);
      const updatedQt = res.data.data;
      setQts((prev) => prev.map((q) => (q._id === qt._id ? updatedQt : q)));

      // 2. Trigger thermal receipt print dialog scoped to this ticket
      await printQuickTicket(updatedQt, restaurant?.name);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to mark ticket as printed.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Handler for marking QT as served
  const handleServeQT = async (qt: QT) => {
    setActionLoadingId(`${qt._id}_serve`);
    try {
      const res = await api.patch(`/qt/${qt._id}/served`);
      const updatedQt = res.data.data;
      setQts((prev) => prev.map((q) => (q._id === qt._id ? updatedQt : q)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to mark ticket as served.');
    } finally {
      setActionLoadingId(null);
    }
  };

  // Filtered QT list (newest first)
  const filteredQTs = useMemo(() => {
    return qts.filter((qt) => {
      // Status filter
      if (statusFilter !== 'all' && qt.status !== statusFilter) {
        return false;
      }
      // Table search filter
      if (tableSearchQuery.trim()) {
        const query = tableSearchQuery.trim().toLowerCase();
        const matchTable = qt.tableNumber.toLowerCase().includes(query);
        const matchTicket = qt.ticketNumber.toLowerCase().includes(query);
        if (!matchTable && !matchTicket) return false;
      }
      return true;
    });
  }, [qts, statusFilter, tableSearchQuery]);

  // Helper for status badge styling & visual distinction
  const getStatusBadge = (status: 'pending' | 'printed' | 'served') => {
    switch (status) {
      case 'pending':
        return (
          <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 text-[10px] font-extrabold uppercase px-2 py-0.5 tracking-wider">
            🟡 Pending
          </Badge>
        );
      case 'printed':
        return (
          <Badge className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30 text-[10px] font-extrabold uppercase px-2 py-0.5 tracking-wider">
            🖨️ Printed
          </Badge>
        );
      case 'served':
        return (
          <Badge className="bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px] font-extrabold uppercase px-2 py-0.5 tracking-wider">
            ✅ Served
          </Badge>
        );
    }
  };

  // Helper for elapsed time string
  const getElapsedString = (createdAt: string): string => {
    const elapsedMs = Date.now() - new Date(createdAt).getTime();
    const elapsedMin = Math.floor(elapsedMs / 1000 / 60);
    if (elapsedMin < 1) return 'Just now';
    return `${elapsedMin}m ago`;
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-6 rounded-2xl border border-border/80 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-primary/10 text-primary rounded-2xl flex items-center justify-center border border-primary/20 shrink-0">
            <Ticket className="w-6 h-6" />
          </div>
          <div>
            <h1 className="font-serif font-black text-xl md:text-2xl text-foreground">
              Kitchen Order Tickets (KOT / QT)
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Real-time ticket queue for {restaurant?.name || 'Restaurant'}. Each order generates an independent printable ticket.
            </p>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={fetchQTs}
          disabled={loading}
          className="cursor-pointer font-bold text-xs gap-1.5 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Queue
        </Button>
      </div>

      {/* Filter and Search Controls Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-card p-4 rounded-xl border border-border/70 shadow-sm">
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 bg-secondary/50 p-1 rounded-xl w-full sm:w-auto">
          {(['all', 'pending', 'printed', 'served'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all capitalize cursor-pointer ${
                statusFilter === st
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {st === 'all' ? `All (${qts.length})` : `${st} (${qts.filter((q) => q.status === st).length})`}
            </button>
          ))}
        </div>

        {/* Search input */}
        <div className="relative w-full sm:w-64">
          <Search className="w-4 h-4 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={tableSearchQuery}
            onChange={(e) => setTableSearchQuery(e.target.value)}
            placeholder="Search by table or ticket #..."
            className="w-full bg-secondary/30 text-foreground text-xs pl-9 pr-4 py-2 rounded-xl border border-border/80 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
          />
        </div>
      </div>

      {/* QT Cards Queue Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-xl">
          {error}
        </div>
      ) : filteredQTs.length === 0 ? (
        <div className="text-center py-20 border-2 border-dashed border-border/60 rounded-2xl space-y-3 bg-card/20">
          <ChefHat className="w-12 h-12 text-muted-foreground/40 mx-auto" />
          <h3 className="font-serif font-bold text-base text-foreground">No Tickets Found</h3>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {statusFilter !== 'all' || tableSearchQuery
              ? 'No Quick Tickets match your active search filter.'
              : 'The kitchen ticket queue is clear. New dining orders will automatically create tickets here.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredQTs.map((qt) => {
            const isPrinting = actionLoadingId === `${qt._id}_print`;
            const isServing = actionLoadingId === `${qt._id}_serve`;

            return (
              <Card
                key={qt._id}
                className={`flex flex-col justify-between shadow-sm relative overflow-hidden transition-all border ${
                  qt.status === 'pending'
                    ? 'border-amber-500/40 bg-amber-500/5 shadow-amber-500/5'
                    : qt.status === 'printed'
                    ? 'border-blue-500/30 bg-blue-500/5'
                    : 'border-border/70 opacity-90'
                }`}
              >
                {/* Visual status bar */}
                <div
                  className={`h-1.5 w-full absolute top-0 left-0 ${
                    qt.status === 'pending'
                      ? 'bg-amber-500 animate-pulse'
                      : qt.status === 'printed'
                      ? 'bg-blue-500'
                      : 'bg-emerald-500'
                  }`}
                />

                <CardHeader className="pb-3 pt-5 px-5">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-mono text-muted-foreground uppercase font-bold block">
                        Ticket: {qt.ticketNumber}
                      </span>
                      <h2 className="font-serif text-2xl font-black text-foreground">
                        {qt.tableNumber}
                      </h2>
                    </div>

                    <div className="text-right space-y-1">
                      {getStatusBadge(qt.status)}
                      <div className="flex items-center gap-1 text-[10px] text-muted-foreground justify-end font-medium">
                        <Clock className="w-3 h-3" />
                        <span>{getElapsedString(qt.createdAt)}</span>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                {/* Items List */}
                <CardContent className="px-5 py-3 flex-1">
                  <div className="divide-y divide-border/30 text-xs">
                    {qt.items.map((item, idx) => (
                      <div key={idx} className="py-2 space-y-1">
                        <div className="flex justify-between items-start">
                          <span className="font-bold text-foreground text-sm">
                            {item.name} <span className="text-primary font-black">x {item.quantity}</span>
                          </span>
                        </div>
                        {item.notes && (
                          <p className="text-[10px] text-amber-700 dark:text-amber-400 font-medium italic bg-amber-500/10 p-1.5 rounded-lg border border-amber-500/20">
                            * {item.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>

                {/* Card Footer Buttons */}
                <div className="p-4 border-t border-border/40 bg-secondary/10 flex items-center justify-between gap-3">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={isPrinting}
                    onClick={() => handlePrintQT(qt)}
                    className="flex-1 text-xs font-bold gap-1.5 border-blue-500/30 text-blue-600 dark:text-blue-400 hover:bg-blue-500/10 cursor-pointer"
                  >
                    {isPrinting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <>
                        <Printer className="w-3.5 h-3.5" /> Print Ticket
                      </>
                    )}
                  </Button>

                  {qt.status !== 'served' && (
                    <Button
                      size="sm"
                      disabled={isServing}
                      onClick={() => handleServeQT(qt)}
                      className="flex-1 text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                    >
                      {isServing ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <>
                          <CheckCircle2 className="w-3.5 h-3.5" /> Mark Served
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
