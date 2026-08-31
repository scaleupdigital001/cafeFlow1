'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '../../store/authStore';
import useSocket from '../../hooks/useSocket';
import api from '../../lib/axios';
import { getBackendBillUrl } from '../../lib/config';
import { printThermalReceipt, ThermalReceiptData } from '../../lib/printService';
import { Button } from '../../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../../components/ui/card';
import { Badge } from '../../components/ui/badge';
import ThemeToggle from '../../components/ThemeToggle';
import { 
  Loader2, LogOut, Clock, ChefHat, CheckSquare, BellRing, 
  Sparkles, Coffee, AlertTriangle, CheckCircle2, X, Plus, Smartphone, Printer
} from 'lucide-react';

import { Order, OrderItem, WaiterRequest, Bill } from '../../types';
import { formatCurrency } from '../../lib/formatters';

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

  // Track order IDs currently being completed to prevent double-clicks
  const [completingOrderIds, setCompletingOrderIds] = useState<string[]>([]);

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

  const handleAcceptOrder = async (orderId: string) => {
    try {
      const response = await api.patch(`/orders/${orderId}/status`, { status: 'accepted' });
      const updated = response.data.data;
      setOrders((prev) => prev.map((o) => (o._id === orderId ? updated : o)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to accept order.');
    }
  };

  const handleOrderServed = async (orderId: string) => {
    try {
      const response = await api.patch(`/orders/${orderId}/status`, { status: 'served' });
      const updated = response.data.data;
      setOrders((prev) => prev.map((o) => (o._id === orderId ? updated : o)));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to mark order as served.');
    }
  };

  const handleReprintReceipt = async (bill: Bill) => {
    const orderObj = bill.orderId as any;
    const restaurantObj = bill.restaurantId as any;

    const receiptData: ThermalReceiptData = {
      restaurantName: restaurantObj?.name || restaurant?.name || 'CafeFlow Restaurant',
      restaurantAddress: restaurantObj?.address || restaurant?.address || '',
      restaurantContact: restaurantObj?.contact || restaurant?.contact || '',
      gstNumber: restaurantObj?.gstNumber || restaurant?.gstNumber || '',
      billNumber: bill.billNumber,
      date: bill.createdAt,
      tableNumber: orderObj?.tableNumber || (bill as any).tableNumber || 'N/A',
      customerName: orderObj?.customerName || 'Guest',
      customerPhone: orderObj?.phoneNumber || '',
      items: orderObj?.items ? orderObj.items.map((i: any) => ({
        name: i.name,
        quantity: i.quantity,
        price: i.price,
        customizations: i.customizations,
        specialInstructions: i.specialInstructions,
      })) : [],
      subtotal: bill.subtotal || 0,
      tax: bill.tax || 0,
      taxRate: restaurant?.taxRate !== undefined && restaurant?.taxRate !== null ? Number(restaurant.taxRate) : 5,
      totalAmount: bill.totalAmount || 0,
      paymentStatus: bill.paymentStatus || 'unpaid',
      paymentMethod: bill.paymentMethod || '',
    };

    await printThermalReceipt(receiptData);
  };

  const handleCancelOrder = async (orderId: string) => {
    try {
      await api.patch(`/orders/${orderId}/status`, { status: 'cancelled' });
      setOrders((prev) => prev.filter((o) => o._id !== orderId));
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to cancel order.');
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
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { label: 'Pending Acceptance', count: orders.filter((o) => o.status === 'received').length, color: 'text-red-500' },
            { label: 'In Kitchen Queue', count: orders.filter((o) => o.status === 'accepted' || o.status === 'preparing' || o.status === 'ready').length, color: 'text-blue-500' },
            { label: 'Active Table Calls', count: waiterRequests.length, color: 'text-amber-500' },
          ].map((card, i) => (
            <Card key={i} className="border border-border/40 p-4 shadow-sm flex items-center justify-between">
              <span className="text-xs font-semibold text-muted-foreground">{card.label}</span>
              <span className={`text-2xl font-black ${card.color}`}>{card.count}</span>
            </Card>
          ))}
        </div>

        {/* Table Service Calls Alert Queue (if any table calls active) */}
        {waiterRequests.length > 0 && (
          <Card className="border border-amber-500/30 bg-amber-500/5 shadow-md">
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-serif font-black flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                <BellRing className="w-4 h-4 animate-bounce text-amber-600" /> Active Table Calls
              </CardTitle>
              <p className="text-[10px] text-amber-600 dark:text-amber-400/80">Customers requesting table service</p>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {waiterRequests.map((req) => (
                  <div
                    key={req._id}
                    className="relative border border-amber-200 dark:border-amber-950/60 p-3 rounded-xl bg-amber-500/10 flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="text-[9px] uppercase font-bold text-amber-700 dark:text-amber-400 font-sans block">
                        Table T-{req.tableNumber}
                      </span>
                      <h4 className="text-xs font-bold text-foreground font-sans capitalize">
                        {req.type.replace('_', ' ')}
                      </h4>
                    </div>

                    <button
                      onClick={() => handleResolveWaiterRequest(req._id)}
                      className="px-2.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-[10px] font-bold cursor-pointer transition-colors font-sans uppercase tracking-wider shrink-0"
                    >
                      Resolve
                    </button>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Active Kitchen Orders Queue */}
        <div className="space-y-6">
          {orders.length === 0 ? (
            /* Empty Active Queue */
            <div className="text-center py-24 border-2 border-dashed border-border/60 rounded-3xl space-y-3 bg-card/20">
              <Coffee className="w-12 h-12 text-muted-foreground/40 mx-auto" />
              <h2 className="font-serif font-bold text-muted-foreground text-lg">Kitchen Queue Clear!</h2>
              <p className="text-xs text-muted-foreground/80 max-w-xs mx-auto">There are no incoming active dine-in orders currently. Chime alerts will play when customers order.</p>
            </div>
          ) : (
            /* Active orders card grid */
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    order.status === 'served' ? 'bg-emerald-500' : 'bg-amber-500'
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
                      onClick={() => handleCancelOrder(order._id)}
                      className="px-3 py-2 bg-background border border-border text-destructive hover:bg-destructive/10 hover:border-destructive/30 rounded-lg text-xs font-semibold cursor-pointer transition-all shrink-0"
                      title="Cancel Order"
                    >
                      Cancel
                    </button>

                    <div className="flex-1">
                      {order.status === 'received' ? (
                        <Button
                          size="sm"
                          onClick={() => handleAcceptOrder(order._id)}
                          className="w-full text-xs font-bold gap-1.5 bg-blue-600 hover:bg-blue-700 text-white cursor-pointer shadow-blue-500/10"
                        >
                          Accept Order <CheckSquare className="w-3.5 h-3.5" />
                        </Button>
                      ) : order.status === 'served' ? (
                        <div className="w-full text-xs font-bold text-center py-2 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg border border-emerald-500/20 flex items-center justify-center gap-1.5 font-sans">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Order Served
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          onClick={() => handleOrderServed(order._id)}
                          className="w-full text-xs font-bold gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer shadow-emerald-500/10"
                        >
                          Mark as Served <CheckCircle2 className="w-3.5 h-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
