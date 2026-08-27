'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/authStore';
import useSocket from '../../hooks/useSocket';
import api from '../../lib/axios';
import { getBackendBillUrl } from '../../lib/config';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import ThemeToggle from '../../components/ThemeToggle';
import { 
  Loader2, LogOut, Clock, ChefHat, CheckSquare, BellRing, 
  Sparkles, Coffee, AlertTriangle, Play, CheckCircle2, X, Plus, Smartphone
} from 'lucide-react';

interface Bill {
  _id: string;
  billNumber: string;
  totalAmount: number;
  pdfUrl?: string;
  orderId?: {
    customerName?: string;
    tableNumber?: string;
  };
  paymentStatus?: 'pending' | 'verifying' | 'paid';
  paymentMethod?: 'upi_link' | 'cash';
  createdAt: string;
}

interface WaiterRequest {
  _id: string;
  tableNumber: string;
  type: 'call_waiter' | 'request_water' | 'request_bill' | 'other';
  status: 'pending';
  createdAt: string;
}


interface OrderItem {
  dishId: string;
  name: string;
  price: number;
  quantity: number;
  customizations?: {
    name: string;
    selectedOption: string;
    extraPrice: number;
  }[];
  specialInstructions?: string;
}

interface Order {
  _id: string;
  customerName: string;
  phoneNumber: string;
  tableNumber: string;
  items: OrderItem[];
  status: 'received' | 'accepted' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  totalAmount: number;
  createdAt: string;
}

export default function KitchenDashboard() {
  const router = useRouter();
  const { user, restaurant, clearAuth } = useAuthStore();
  const restaurantId = user?.restaurantId;

  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Recent completed bills
  const [recentBills, setRecentBills] = useState<Bill[]>([]);
  const [dismissedBillIds, setDismissedBillIds] = useState<string[]>([]);

  // Waiter active requests
  const [waiterRequests, setWaiterRequests] = useState<WaiterRequest[]>([]);

  // Track order IDs that recently appended items (for visual highlight)
  const [recentlyAppendedOrderIds, setRecentlyAppendedOrderIds] = useState<string[]>([]);

  // Track UPI/Cash bills verifying state
  const [verifyingBills, setVerifyingBills] = useState<{ billId: string; billNumber: string; tableNumber: string; totalAmount: number; paymentMethod?: string }[]>([]);

  // Bind to socket updates for this restaurant room
  const socket = useSocket('restaurant', restaurantId);

  // Fetch waiter active requests
  const fetchActiveWaiterRequests = async () => {
    try {
      const response = await api.get('/orders/waiter-requests/active');
      setWaiterRequests(response.data.data);
    } catch (err) {
      console.error('Failed to fetch waiter requests:', err);
    }
  };

  // Load dismissed bill IDs from localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem('dismissed_bills');
    if (stored) {
      try {
        setDismissedBillIds(JSON.parse(stored));
      } catch (e) {
        console.error('Failed to parse dismissed bills:', e);
      }
    }
  }, []);

  // Fetch recent bills from API
  const fetchRecentBills = async () => {
    try {
      const response = await api.get('/bills/my-restaurant');
      setRecentBills(response.data.data);
    } catch (err) {
      console.error('Failed to fetch recent bills:', err);
    }
  };

  // Handle unauthorized users (ensure role is admin or staff)
  useEffect(() => {
    if (!user || (user.role !== 'staff' && user.role !== 'restaurant_admin')) {
      router.push('/login');
    }
  }, [user, router]);

  // Load active orders and recent bills on mount
  useEffect(() => {
    if (!restaurantId) return;

    const fetchActiveOrders = async () => {
      try {
        const response = await api.get('/orders/my-restaurant');
        // Filter out completed and cancelled orders
        const active = response.data.data.filter(
          (o: Order) => o.status !== 'completed' && o.status !== 'cancelled'
        );
        setOrders(active);
      } catch (err: any) {
        console.error('Fetch active orders error:', err);
        setError('Failed to fetch orders list.');
      } finally {
        setLoading(false);
      }
    };

    fetchActiveOrders();
    fetchRecentBills();
    fetchActiveWaiterRequests();
  }, [restaurantId]);

  // Hook socket triggers for real time order additions / modifications
  useEffect(() => {
    if (!socket) return;

    socket.on('new_order', (newOrder: Order) => {
      console.log('[Kitchen Socket] New order received:', newOrder._id);
      
      // Add to list if not already present
      setOrders((prev) => {
        if (prev.some((o) => o._id === newOrder._id)) return prev;
        return [newOrder, ...prev];
      });

      // Play audio chime
      playChime();
    });

    socket.on('order_updated', (updatedOrder: Order) => {
      console.log('[Kitchen Socket] Order status updated elsewhere:', updatedOrder._id, updatedOrder.status);
      
      setOrders((prev) => {
        // If completed or cancelled, remove from dashboard list
        if (updatedOrder.status === 'completed' || updatedOrder.status === 'cancelled') {
          if (updatedOrder.status === 'completed') {
            // Fetch recent bills to show updated info
            fetchRecentBills();
          }
          return prev.filter((o) => o._id !== updatedOrder._id);
        }
        
        // Otherwise, update in-place
        return prev.map((o) => (o._id === updatedOrder._id ? updatedOrder : o));
      });
    });

    socket.on('waiter_requested', (newReq: WaiterRequest) => {
      console.log('[Kitchen Socket] New service request:', newReq);
      setWaiterRequests((prev) => {
        if (prev.some((r) => r._id === newReq._id)) return prev;
        return [newReq, ...prev];
      });
      playWaiterChime();
    });

    socket.on('waiter_request_resolved', (payload: { _id: string }) => {
      console.log('[Kitchen Socket] Service request resolved elsewhere:', payload._id);
      setWaiterRequests((prev) => prev.filter((r) => r._id !== payload._id));
    });

    socket.on('bill_payment_verifying', (data: { billId: string; billNumber: string; tableNumber: string; totalAmount: number; paymentMethod?: string }) => {
      console.log('[Kitchen Socket] Bill verifying payment:', data.billId, data.paymentMethod);
      playChime();
      fetchRecentBills();
      setVerifyingBills((prev) => {
        if (prev.some((b) => b.billId === data.billId)) return prev;
        return [data, ...prev];
      });
    });

    socket.on('bill_payment_approved', (payload: { billId: string }) => {
      fetchRecentBills();
      setVerifyingBills((prev) => prev.filter((b) => b.billId !== payload.billId));
    });

    socket.on('order_items_appended', (data: { orderId: string; tableNumber: string; newItems: any[] }) => {
      console.log('[Kitchen Socket] Items appended to order:', data.orderId);
      playChime();
      setRecentlyAppendedOrderIds((prev) => {
        if (prev.includes(data.orderId)) return prev;
        return [...prev, data.orderId];
      });
      setTimeout(() => {
        setRecentlyAppendedOrderIds((prev) => prev.filter((id) => id !== data.orderId));
      }, 10000);
    });

    return () => {
      socket.off('new_order');
      socket.off('order_updated');
      socket.off('waiter_requested');
      socket.off('waiter_request_resolved');
      socket.off('order_items_appended');
      socket.off('bill_payment_verifying');
      socket.off('bill_payment_approved');
    };
  }, [socket]);

  const playChime = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(587.33, audioContext.currentTime); // D5
      osc.frequency.setValueAtTime(880, audioContext.currentTime + 0.15); // A5
      
      gain.gain.setValueAtTime(0.3, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.start();
      osc.stop(audioContext.currentTime + 0.4);
    } catch (e) {
      console.log('Audio chime not allowed by browser permissions yet');
    }
  };

  const handleUpdateStatus = async (orderId: string, nextStatus: string) => {
    try {
      const response = await api.patch(`/orders/${orderId}/status`, { status: nextStatus });
      const updated = response.data.data;

      // Update in local state
      setOrders((prev) => {
        if (nextStatus === 'completed' || nextStatus === 'cancelled') {
          if (nextStatus === 'completed') {
            // Refresh recent bills list
            fetchRecentBills();
          }
          return prev.filter((o) => o._id !== orderId);
        }
        return prev.map((o) => (o._id === orderId ? updated : o));
      });
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update order status.');
    }
  };

  const playWaiterChime = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(880, audioContext.currentTime); // A5
      osc.frequency.setValueAtTime(1320, audioContext.currentTime + 0.12); // E6
      
      gain.gain.setValueAtTime(0.2, audioContext.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.35);
      
      osc.connect(gain);
      gain.connect(audioContext.destination);
      
      osc.start();
      osc.stop(audioContext.currentTime + 0.35);
    } catch (e) {
      console.log('Audio chime not allowed by browser permissions yet');
    }
  };

  const handleResolveWaiterRequest = async (requestId: string) => {
    try {
      await api.patch(`/orders/waiter-requests/${requestId}/resolve`);
      setWaiterRequests((prev) => prev.filter((r) => r._id !== requestId));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to resolve service request.');
    }
  };

  const handleApprovePayment = async (billId: string, paymentMethod: string) => {
    try {
      await api.post(`/bills/${billId}/pay/approve`, { paymentMethod });
      setVerifyingBills((prev) => prev.filter((b) => b.billId !== billId));
      fetchRecentBills();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to approve payment.');
    }
  };



  const dismissBill = (billId: string) => {
    const updated = [...dismissedBillIds, billId];
    setDismissedBillIds(updated);
    localStorage.setItem('dismissed_bills', JSON.stringify(updated));
  };

  const clearAllRecentBills = () => {
    const allBillIds = recentBills.map(b => b._id);
    const updated = Array.from(new Set([...dismissedBillIds, ...allBillIds]));
    setDismissedBillIds(updated);
    localStorage.setItem('dismissed_bills', JSON.stringify(updated));
  };

  const visibleBills = recentBills
    .filter((b) => !dismissedBillIds.includes(b._id))
    .slice(0, 5);

  const handleLogout = () => {
    clearAuth();
    router.push('/login');
  };

  // Helper to determine elapsed time string
  const getElapsedString = (createdAt: string): string => {
    const elapsedMs = Date.now() - new Date(createdAt).getTime();
    const elapsedMin = Math.floor(elapsedMs / 1000 / 60);
    
    if (elapsedMin < 1) return 'Just now';
    return `${elapsedMin}m ago`;
  };

  // Helper for status styling variables
  const getStatusBadgeStyle = (status: string) => {
    switch (status) {
      case 'received': return 'danger'; // Red badge for attention
      case 'accepted': return 'info';
      case 'preparing': return 'warning';
      case 'ready': return 'success';
      case 'served': return 'default';
      default: return 'outline';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground min-h-screen flex flex-col">
      {/* Header Bar */}
      <header className="bg-card text-card-foreground border-b border-border/80 px-6 py-4 flex items-center justify-between sticky top-0 z-30 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary text-primary-foreground rounded-xl flex items-center justify-center">
            <ChefHat className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <h1 className="font-serif font-black text-lg md:text-xl tracking-tight">
              {restaurant?.name || 'CafeFlow'} Kitchen
            </h1>
            <span className="text-xs text-muted-foreground font-medium">
              Staff Portal: {user?.name} ({user?.role === 'restaurant_admin' ? 'Admin' : 'Staff'})
            </span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <ThemeToggle />
          <Button variant="outline" size="sm" onClick={handleLogout} className="text-xs cursor-pointer gap-1.5 h-9">
            <LogOut className="w-4 h-4" /> Sign Out
          </Button>
        </div>
      </header>

      {/* Main Panel grid */}
      <main className="flex-1 p-6 space-y-6 max-w-7xl mx-auto w-full">
        {error && (
          <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm px-4 py-3 rounded-lg flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Counter cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: 'Pending Approval', count: orders.filter((o) => o.status === 'received').length, color: 'text-red-500' },
            { label: 'Accepted / Queue', count: orders.filter((o) => o.status === 'accepted').length, color: 'text-blue-500' },
            { label: 'Active Cooking', count: orders.filter((o) => o.status === 'preparing').length, color: 'text-amber-500' },
            { label: 'Awaiting Service', count: orders.filter((o) => o.status === 'ready' || o.status === 'served').length, color: 'text-emerald-500' },
          ].map((card, i) => (
            <Card key={i} className="border border-border/40 p-4 shadow-sm flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">{card.label}</span>
              <span className={`text-2xl font-black ${card.color}`}>{card.count}</span>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Active Orders Queue (Left side, takes 9 columns on desktop) */}
          <div className="lg:col-span-9 space-y-6">
            {orders.length === 0 ? (
              /* Empty Active Queue */
              <div className="text-center py-24 border-2 border-dashed border-border/60 rounded-3xl space-y-3 bg-card/20">
                <Coffee className="w-12 h-12 text-muted-foreground/40 mx-auto" />
                <h2 className="font-serif font-bold text-muted-foreground text-lg">Kitchen Queue Clear!</h2>
                <p className="text-xs text-muted-foreground/80 max-w-xs mx-auto">There are no incoming active dine-in orders currently. Chime alerts will play when customers order.</p>
              </div>
            ) : (
              /* Active orders card grid */
              <div className="grid sm:grid-cols-2 gap-6">
                {orders.map((order) => (
                  <Card 
                    key={order._id} 
                    className={`flex flex-col justify-between shadow relative overflow-hidden transition-all duration-300 ${
                      recentlyAppendedOrderIds.includes(order._id)
                        ? 'border-2 border-amber-500 shadow-lg shadow-amber-500/10 scale-[1.01] bg-amber-500/5 animate-pulse'
                        : 'border border-border/70 hover:border-primary/30 shadow-stone-150/40'
                    }`}
                  >
                    {/* Visual Status Indicator Strip */}
                    <div className={`h-1.5 w-full absolute top-0 left-0 ${
                      order.status === 'received' ? 'bg-red-500 animate-pulse' :
                      order.status === 'accepted' ? 'bg-blue-500' :
                      order.status === 'preparing' ? 'bg-amber-500' :
                      order.status === 'ready' ? 'bg-emerald-500 animate-pulse' : 'bg-stone-500'
                    }`} />

                    {recentlyAppendedOrderIds.includes(order._id) && (
                      <div className="bg-amber-500 text-white text-[9px] uppercase font-black text-center py-1 tracking-widest flex items-center justify-center gap-1.5 font-sans">
                        <Plus className="w-3 h-3 shrink-0" /> Added More Items!
                      </div>
                    )}

                    <CardHeader className="pb-2 pt-5">
                      <div className="flex justify-between items-start">
                        <div>
                          <span className="text-[10px] uppercase font-bold text-muted-foreground">Table number</span>
                          <h3 className="font-serif text-3xl font-extrabold text-foreground tracking-tight">
                            T-{order.tableNumber}
                          </h3>
                        </div>

                        <div className="text-right space-y-1.5">
                          <Badge variant={getStatusBadgeStyle(order.status) as any} className="text-[10px] py-0.5 capitalize font-extrabold">
                            {order.status}
                          </Badge>
                          <div className="flex items-center gap-1 text-[10px] text-muted-foreground justify-end font-semibold">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{getElapsedString(order.createdAt)}</span>
                          </div>
                        </div>
                      </div>
                    </CardHeader>

                    {(() => {
                      const matchingBill = verifyingBills.find(b => b.tableNumber === order.tableNumber);
                      if (!matchingBill) return null;
                      return (
                        <div className="bg-emerald-500/10 border-y border-emerald-500/25 text-emerald-800 dark:text-emerald-400 text-xs px-4 py-3 flex items-center justify-between gap-3 font-sans">
                          <div className="flex items-center gap-2">
                            <Smartphone className="w-4.5 h-4.5 text-emerald-600 animate-pulse shrink-0" />
                            <div className="space-y-0.5">
                              <span className="block font-bold text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-400">
                                Payment Pending
                              </span>
                              <span className="block text-foreground font-black text-sm">
                                Rs. {matchingBill.totalAmount.toFixed(2)}
                                <span className="text-[10px] font-medium text-muted-foreground ml-1.5 capitalize">
                                  ({matchingBill.paymentMethod === 'cash' ? 'Cash' : 'UPI'})
                                </span>
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => handleApprovePayment(matchingBill.billId, matchingBill.paymentMethod || 'upi_link')}
                            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-all shadow-md shadow-emerald-500/20 uppercase tracking-wider"
                          >
                            Approve
                          </button>
                        </div>
                      );
                    })()}

                    {/* Items List */}
                    <CardContent className="py-3 flex-1">
                      <div className="divide-y divide-border/40 text-xs">
                        {order.items.map((item, idx) => (
                          <div key={idx} className="py-2.5 space-y-1">
                            <div className="flex justify-between items-start">
                              <span className="font-bold text-sm text-foreground">
                                {item.name} <span className="text-primary font-bold">x {item.quantity}</span>
                              </span>
                            </div>

                            {/* Customizations details */}
                            {item.customizations && item.customizations.length > 0 && (
                              <div className="text-[10px] text-muted-foreground font-medium pl-2">
                                {item.customizations.map(c => `${c.name}: ${c.selectedOption}`).join(', ')}
                              </div>
                            )}

                            {/* Instructions */}
                            {item.specialInstructions && (
                              <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-300 text-[10px] p-1.5 rounded-lg font-medium italic mt-1">
                                * note: "{item.specialInstructions}"
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </CardContent>

                    {/* Action buttons */}
                    <div className="p-4 border-t border-border/40 bg-secondary/10 flex items-center justify-between gap-3">
                      <button
                        onClick={() => handleUpdateStatus(order._id, 'cancelled')}
                        className="px-3 py-2 bg-background border border-border text-destructive hover:bg-destructive/10 hover:border-destructive/30 rounded-lg text-xs font-semibold cursor-pointer transition-all shrink-0"
                        title="Cancel Order"
                      >
                        Cancel
                      </button>

                      <div className="flex-1">
                        {order.status === 'received' && (
                          <Button
                            size="sm"
                            onClick={() => handleUpdateStatus(order._id, 'accepted')}
                            className="w-full text-xs font-bold gap-1 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-blue-500/10"
                          >
                            Accept Order <CheckSquare className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        {order.status === 'accepted' && (
                          <Button
                            size="sm"
                            onClick={() => handleUpdateStatus(order._id, 'preparing')}
                            className="w-full text-xs font-bold gap-1 bg-amber-600 hover:bg-amber-700 text-white cursor-pointer shadow-amber-500/10"
                          >
                            Start Cooking <Play className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        {order.status === 'preparing' && (
                          <Button
                            size="sm"
                            onClick={() => handleUpdateStatus(order._id, 'ready')}
                            className="w-full text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-emerald-500/10"
                          >
                            Mark Ready <BellRing className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        {order.status === 'ready' && (
                          <Button
                            size="sm"
                            onClick={() => handleUpdateStatus(order._id, 'served')}
                            className="w-full text-xs font-bold gap-1 bg-primary text-white cursor-pointer"
                          >
                            Mark Served <Coffee className="w-3.5 h-3.5" />
                          </Button>
                        )}

                        {order.status === 'served' && (
                          <Button
                            size="sm"
                            onClick={() => handleUpdateStatus(order._id, 'completed')}
                            className="w-full text-xs font-bold gap-1 bg-stone-900 hover:bg-stone-850 dark:bg-stone-100 dark:hover:bg-stone-50 dark:text-stone-950 text-white cursor-pointer"
                          >
                            Complete & Bill <CheckCircle2 className="w-3.5 h-3.5" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
          </div>

          {/* Recent Completed Bills (Right side, takes 3 columns on desktop) */}
          <div className="lg:col-span-3 space-y-4">
            {/* Table Payment Settlements queue */}
            {verifyingBills.length > 0 && (
              <Card className="border border-emerald-500 bg-emerald-500/5 shadow-lg">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-serif font-black flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                    <Smartphone className="w-4 h-4 animate-bounce text-emerald-600" /> Payment Settlements
                  </CardTitle>
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400/80">Confirm payments received at counter or in bank app</p>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-2.5">
                    {verifyingBills.map((billObj) => (
                      <div
                        key={billObj.billId}
                        className="relative border border-emerald-200 dark:border-emerald-950/60 p-3 rounded-xl bg-emerald-500/10 flex flex-col gap-1 hover:border-emerald-300 transition-all"
                      >
                        <div className="pr-16">
                          <span className="text-[9px] uppercase font-bold text-emerald-700 dark:text-emerald-400 font-sans flex items-center gap-1">
                            Table T-{billObj.tableNumber} • {billObj.billNumber}
                            <span className={`px-1 py-0.5 rounded text-[8px] font-sans font-bold uppercase ${
                              billObj.paymentMethod === 'cash' 
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/60' 
                                : 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200 dark:border-blue-900/60'
                            }`}>
                              {billObj.paymentMethod === 'cash' ? 'Cash' : 'UPI'}
                            </span>
                          </span>
                          <h4 className="text-xs font-black text-foreground font-sans mt-0.5">
                            Rs. {billObj.totalAmount.toFixed(2)}
                          </h4>
                        </div>

                        <button
                          onClick={() => handleApprovePayment(billObj.billId, billObj.paymentMethod || 'upi_link')}
                          className="absolute top-3 right-3 px-2 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow shadow-emerald-500/10 font-sans uppercase tracking-wider"
                        >
                          Approve
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Table Service Calls Alert Queue */}
            {waiterRequests.length > 0 && (
              <Card className="border border-amber-500/30 bg-amber-500/5 shadow-md">
                <CardHeader className="pb-2 pt-4 px-4">
                  <CardTitle className="text-sm font-serif font-black flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                    <BellRing className="w-4 h-4 animate-bounce text-amber-600" /> Active Table Calls
                  </CardTitle>
                  <p className="text-[10px] text-amber-600 dark:text-amber-400/80">Customers requesting table service</p>
                </CardHeader>
                <CardContent className="p-4 pt-0">
                  <div className="space-y-2.5">
                    {waiterRequests.map((req) => (
                      <div
                        key={req._id}
                        className="relative border border-amber-200 dark:border-amber-950/60 p-3 rounded-xl bg-amber-500/10 flex flex-col gap-1 hover:border-amber-300 transition-all"
                      >
                        <div className="pr-16">
                          <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-400 font-sans">
                            Table T-{req.tableNumber}
                          </span>
                          <h4 className="text-xs font-bold text-foreground font-sans mt-0.5 capitalize">
                            {req.type.replace('_', ' ')}
                          </h4>
                          <span className="text-[9px] text-muted-foreground font-semibold block mt-0.5 font-sans">
                            {getElapsedString(req.createdAt)}
                          </span>
                        </div>

                        <button
                          onClick={() => handleResolveWaiterRequest(req._id)}
                          className="absolute top-3 right-3 px-2 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors shadow shadow-amber-500/10 font-sans uppercase tracking-wider"
                        >
                          Resolve
                        </button>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card className="border border-border/60 shadow-md">
              <CardHeader className="pb-2 pt-4 px-4">
                <CardTitle className="text-sm font-serif font-black flex items-center gap-1.5 justify-between animate-fade-in">
                  <span className="flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-primary" /> Recent Bills
                  </span>
                  {visibleBills.length > 0 && (
                    <button
                      onClick={clearAllRecentBills}
                      className="text-[10px] font-sans font-semibold text-muted-foreground hover:text-destructive cursor-pointer transition-colors"
                    >
                      Clear All
                    </button>
                  )}
                </CardTitle>
                <p className="text-[10px] text-muted-foreground">Last 5 billed customers</p>
              </CardHeader>
              <CardContent className="p-4 pt-0">
                {visibleBills.length === 0 ? (
                  <div className="text-center py-8 text-xs text-muted-foreground font-medium">
                    No recent bills. Complete active orders to populate.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {visibleBills.map((bill) => (
                      <div
                        key={bill._id}
                        className="relative border border-border/40 p-3 rounded-xl bg-secondary/10 flex flex-col gap-1.5 hover:border-primary/20 transition-all animate-fade-in"
                      >
                        {/* Dismiss Button */}
                        <button
                          onClick={() => dismissBill(bill._id)}
                          className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-destructive cursor-pointer rounded-full hover:bg-secondary/40 transition-colors"
                          title="Dismiss"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>

                        <div className="pr-5">
                          <span className="text-[9px] uppercase font-bold text-muted-foreground font-sans">
                            Table {bill.orderId?.tableNumber || 'N/A'} • {bill.orderId?.customerName || 'Walk-in'}
                          </span>
                          <h4 className="text-xs font-bold text-foreground truncate mt-0.5 font-sans">
                            {bill.billNumber}
                          </h4>
                        </div>

                        {/* Payment Status & Action Section */}
                        <div className="flex flex-col gap-2 border-t border-border/20 pt-2.5 mt-1">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-foreground font-sans">
                              Rs. {bill.totalAmount.toFixed(2)}
                            </span>

                            {bill.paymentStatus === 'paid' ? (
                              <Badge className="bg-emerald-600/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 text-[9px] font-bold py-0.5 px-1.5 uppercase font-sans">
                                Paid
                              </Badge>
                            ) : bill.paymentStatus === 'verifying' ? (
                              <Badge className="bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20 text-[9px] font-bold py-0.5 px-1.5 uppercase animate-pulse font-sans">
                                Verifying {bill.paymentMethod === 'cash' ? 'Cash' : 'UPI'}
                              </Badge>
                            ) : (
                              <Badge className="bg-red-500/10 text-red-500 dark:text-red-400 border-red-500/20 text-[9px] font-bold py-0.5 px-1.5 uppercase font-sans">
                                Unpaid
                              </Badge>
                            )}
                          </div>

                          {/* Cashier payment approval/settlement buttons */}
                          {bill.paymentStatus !== 'paid' && (
                            <div className="flex gap-1.5 mt-1">
                              {bill.paymentStatus === 'verifying' ? (
                                <button
                                  onClick={() => handleApprovePayment(bill._id, bill.paymentMethod || 'upi_link')}
                                  className="flex-1 py-1.5 bg-emerald-600 hover:bg-emerald-750 text-white rounded-lg text-[9px] font-bold cursor-pointer transition-colors text-center uppercase tracking-wide font-sans shadow shadow-emerald-500/5"
                                >
                                  Approve {bill.paymentMethod === 'cash' ? 'Cash' : 'UPI'}
                                </button>
                              ) : (
                                <>
                                  <button
                                    onClick={() => handleApprovePayment(bill._id, 'cash')}
                                    className="flex-1 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/25 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 rounded-lg text-[9px] font-bold cursor-pointer transition-colors text-center uppercase tracking-wide font-sans border-none"
                                  >
                                    Settle Cash
                                  </button>
                                  <button
                                    onClick={() => handleApprovePayment(bill._id, 'upi_link')}
                                    className="flex-1 py-1.5 bg-blue-600/10 hover:bg-blue-600/25 border border-blue-500/20 text-blue-600 dark:text-blue-400 rounded-lg text-[9px] font-bold cursor-pointer transition-colors text-center uppercase tracking-wide font-sans border-none"
                                  >
                                    Settle UPI
                                  </button>
                                </>
                              )}
                            </div>
                          )}

                          {bill.pdfUrl && (
                            <button
                              onClick={() => {
                                const win = window.open(getBackendBillUrl(bill.pdfUrl || ''), '_blank');
                                win?.focus();
                              }}
                              className="text-[9px] text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-bold flex items-center gap-0.5 cursor-pointer mt-0.5 justify-end font-sans"
                            >
                              View Invoice
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}
