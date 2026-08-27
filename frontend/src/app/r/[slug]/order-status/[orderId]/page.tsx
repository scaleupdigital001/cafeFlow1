'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSocket from '../../../../../hooks/useSocket';
import api from '../../../../../lib/axios';
import { getBackendBillUrl } from '../../../../../lib/config';
import { Button } from '../../../../../components/ui/button';
import { Badge } from '../../../../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../../../../../components/ui/card';
import ThemeToggle from '../../../../../components/ThemeToggle';
import { 
  Loader2, Coffee, CheckCircle2, ChefHat, Bell, Sparkles, 
  Receipt, Download, Printer, ArrowLeft, MessageSquare, AlertCircle, Plus,
  Smartphone, Coins, Copy, Check, QrCode
} from 'lucide-react';
import Link from 'next/link';

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
  restaurantId: string;
  customerName: string;
  phoneNumber: string;
  tableNumber: string;
  items: OrderItem[];
  status: 'received' | 'accepted' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  subtotal: number;
  tax: number;
  totalAmount: number;
  createdAt: string;
}

interface Bill {
  _id: string;
  billNumber: string;
  pdfUrl?: string;
  totalAmount: number;
  paymentStatus: 'pending' | 'verifying' | 'paid';
  paymentMethod?: 'upi_link' | 'cash';
  restaurantId?: {
    name: string;
    paymentSettings?: {
      upiId?: string;
      upiPhone?: string;
    };
  };
}

export default function OrderStatusPage() {
  const params = useParams();
  const router = useRouter();
  
  const slug = params.slug as string;
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [bill, setBill] = useState<Bill | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [paymentLoading, setPaymentLoading] = useState(false);
  const [copiedUpiId, setCopiedUpiId] = useState(false);
  const [copiedUpiPhone, setCopiedUpiPhone] = useState(false);
  const [showUpiPanel, setShowUpiPanel] = useState(false);

  // Initialize socket listener for this order room
  const socket = useSocket('order', orderId);

  // Load initial order details
  useEffect(() => {
    if (!orderId) return;

    const fetchOrderDetails = async () => {
      try {
        const response = await api.get(`/orders/${orderId}`);
        setOrder(response.data.data);

        // Check if bill already exists (if completed)
        if (response.data.data.status === 'completed') {
          fetchBillDetails();
        }
      } catch (err: any) {
        console.error('Fetch order error:', err);
        setError('We could not find this order. Please make sure the ID is correct.');
      } finally {
        setLoading(false);
      }
    };

    const fetchBillDetails = async () => {
      try {
        const billRes = await api.get(`/bills/order/${orderId}`);
        if (billRes.data.success) {
          setBill(billRes.data.data);
        }
      } catch (err) {
        console.log('Bill not generated yet');
      }
    };

    fetchOrderDetails();
  }, [orderId]);

  // Hook socket triggers for real time state updates
  useEffect(() => {
    if (!socket) return;

    // Listen to status changes
    socket.on('order_status_updated', (updatedOrder: Order) => {
      console.log('[Socket] Order status updated:', updatedOrder.status);
      setOrder(updatedOrder);

      if (updatedOrder.status === 'completed') {
        // Trigger bill fetch
        api.get(`/bills/order/${orderId}`)
          .then((res) => {
            if (res.data.success) setBill(res.data.data);
          })
          .catch((err) => console.log('Bill generation in progress...'));
      }
    });

    // Listen to billing outputs
    socket.on('bill_ready', (billRecord: Bill) => {
      console.log('[Socket] Invoice generated:', billRecord.billNumber);
      setBill(billRecord);
    });

    socket.on('bill_status_updated', (updatedBill: Bill) => {
      console.log('[Socket] Bill status updated:', updatedBill.paymentStatus);
      setBill(updatedBill);
    });

    return () => {
      socket.off('order_status_updated');
      socket.off('bill_ready');
      socket.off('bill_status_updated');
    };
  }, [socket, orderId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 dark:bg-stone-950 p-6 text-center">
        <AlertCircle className="w-12 h-12 text-destructive mb-3" />
        <h2 className="font-serif text-xl font-bold mb-2">Order Not Found</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Link href={`/r/${slug}/menu`} className="px-5 py-2.5 bg-primary text-primary-foreground font-semibold rounded-lg hover:bg-primary/95 transition-all">
          Back to Menu
        </Link>
      </div>
    );
  }

  // Map progress phases to 3 customer-facing statuses: Received (0), Accepted (1), Served (2)
  const getStatusPhase = (): number => {
    switch (order.status) {
      case 'received': return 0;
      case 'accepted':
      case 'preparing':
      case 'ready': return 1;
      case 'served':
      case 'completed': return 2;
      case 'cancelled': return -1;
      default: return 0;
    }
  };

  const currentPhase = getStatusPhase();

  // 3 Customer-facing milestones
  const milestones = [
    { label: 'Received', desc: 'Order received', icon: Sparkles },
    { label: 'Accepted', desc: 'Accepted by kitchen', icon: CheckCircle2 },
    { label: 'Served', desc: 'Food served', icon: Coffee },
  ];

  const handleCashPayClick = async () => {
    if (!bill) return;
    setPaymentLoading(true);

    try {
      // Notify backend we want to pay via cash
      await api.post(`/bills/${bill._id}/pay/cash-intent`, {
        tableNumber: order?.tableNumber || 'N/A'
      });

      // Update local state to show "verifying" immediately
      setBill((prev: any) => {
        if (!prev) return null;
        return { ...prev, paymentStatus: 'verifying', paymentMethod: 'cash' };
      });
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to request cash settlement.');
    } finally {
      setPaymentLoading(false);
    }
  };

  const getUpiUrl = (): string => {
    if (!bill) return '';
    const upiSettings = bill.restaurantId?.paymentSettings;
    if (!upiSettings?.upiId && !upiSettings?.upiPhone) return '';

    let payeeAddress = upiSettings.upiId || '';
    if (upiSettings.upiPhone) {
      const cleanPhone = upiSettings.upiPhone.replace(/[^0-9]/g, '');
      const tenDigitPhone = cleanPhone.length > 10 ? cleanPhone.slice(-10) : cleanPhone;
      if (tenDigitPhone.length === 10) {
        payeeAddress = `${tenDigitPhone}@upi`;
      }
    }

    if (!payeeAddress) return '';

    const name = encodeURIComponent(bill.restaurantId?.name || 'Restaurant');
    const amount = bill.totalAmount.toFixed(2);
    const note = encodeURIComponent(`Invoice_${bill.billNumber}`);
    return `upi://pay?pa=${payeeAddress}&pn=${name}&am=${amount}&cu=INR&tn=${note}`;
  };

  const handleCopyText = (text: string, isPhone: boolean) => {
    navigator.clipboard.writeText(text);
    if (isPhone) {
      setCopiedUpiPhone(true);
      setTimeout(() => setCopiedUpiPhone(false), 2000);
    } else {
      setCopiedUpiId(true);
      setTimeout(() => setCopiedUpiId(false), 2000);
    }
  };

  const handleUPIPayClick = async () => {
    if (!bill || !bill.restaurantId?.paymentSettings?.upiId) return;
    setPaymentLoading(true);

    try {
      // Notify backend we are attempting UPI
      await api.post(`/bills/${bill._id}/pay/upi-intent`, {
        tableNumber: order?.tableNumber || 'N/A'
      });

      // Update local state to show "verifying" immediately
      setBill((prev: any) => {
        if (!prev) return null;
        return { ...prev, paymentStatus: 'verifying', paymentMethod: 'upi_link' };
      });
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to initialize UPI payment.');
    } finally {
      setPaymentLoading(false);
    }
  };



  return (
    <div className="bg-background text-foreground min-h-screen pb-12">
      {/* Header */}
      <header className="bg-background/80 backdrop-blur border-b border-border/50 px-4 py-3 flex items-center justify-between sticky top-0 z-40">
        <Link href={`/r/${slug}/menu`} className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground hover:text-foreground transition-all cursor-pointer">
          <ArrowLeft className="w-4 h-4" /> Back to Menu
        </Link>
        <h2 className="font-serif font-bold text-sm tracking-tight text-center">Track Order</h2>
        <ThemeToggle />
      </header>

      <main className="max-w-xl mx-auto px-4 mt-6 space-y-6">
        {/* Status tracker visual */}
        <Card className="border border-border/60 shadow-lg p-5 space-y-6 overflow-hidden relative">
          <div className="text-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-primary tracking-widest block">Live Status</span>
            <h2 className="font-serif text-2xl font-black capitalize text-foreground">
              {order.status === 'cancelled' ? 'Order Cancelled' : milestones[Math.min(Math.max(0, currentPhase), 4)].label}
            </h2>
            <p className="text-xs text-muted-foreground">
              {order.status === 'cancelled'
                ? 'We apologize, your order has been cancelled by staff.'
                : 'Your order updates instantly as our chefs start preparing.'}
            </p>
          </div>

          {/* Cancelled Alert */}
          {order.status === 'cancelled' ? (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-sm p-4 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>We apologize, this order was cancelled. Please speak with cafe staff or place a new order.</span>
            </div>
          ) : (
            /* Milestone timelines */
            <div className="relative pt-3 pb-4">
              <div className="absolute top-[28px] left-[20px] right-[20px] h-1 bg-secondary rounded-full -z-10">
                <div 
                  className="h-full bg-primary transition-all duration-700 rounded-full" 
                  style={{ width: `${(Math.min(currentPhase, 2) / 2) * 100}%` }}
                />
              </div>

              <div className="flex justify-between items-center relative">
                {milestones.map((step, idx) => {
                  const Icon = step.icon;
                  const isActive = idx <= currentPhase;
                  const isCurrent = idx === currentPhase;

                  return (
                    <div key={idx} className="flex flex-col items-center space-y-2">
                      <div className={`w-8 h-8 rounded-full border flex items-center justify-center transition-all duration-300 ${
                        isCurrent 
                          ? 'bg-primary border-primary text-primary-foreground scale-110 shadow-md shadow-primary/20 animate-pulse'
                          : isActive 
                            ? 'bg-primary/10 border-primary text-primary' 
                            : 'bg-background border-border text-muted-foreground'
                      }`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      
                      <div className="text-center hidden sm:block">
                        <h4 className={`text-[10px] font-bold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                          {step.label}
                        </h4>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* Invoice Generator Card */}
        {bill && (
          <Card className="border border-border/60 shadow-lg p-5 flex flex-col items-center justify-between gap-4 animate-slide-up">
            {bill.paymentStatus === 'paid' ? (
              <div className="flex flex-col gap-4 w-full">
                <div className="flex items-center gap-3 bg-emerald-500/10 p-4 rounded-xl border border-emerald-500/20 text-emerald-800 dark:text-emerald-400">
                  <CheckCircle2 className="w-6 h-6 shrink-0 text-emerald-500 animate-bounce" />
                  <div className="text-xs">
                    <h4 className="font-bold text-sm">Payment Confirmed!</h4>
                    <p className="text-muted-foreground/90 mt-0.5">Thank you for dining with us. Your bill is fully settled.</p>
                  </div>
                </div>
                
                <div className="flex gap-2 w-full justify-between items-center pt-2">
                  <span className="text-xs font-semibold text-muted-foreground font-mono">Invoice: {bill.billNumber}</span>
                  {bill.pdfUrl && (
                    <a
                      href={getBackendBillUrl(bill.pdfUrl)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" /> Download PDF Receipt
                    </a>
                  )}
                </div>
              </div>
            ) : bill.paymentStatus === 'verifying' ? (
              <div className="flex flex-col gap-3 w-full">
                <div className="flex items-center gap-3 bg-amber-500/10 p-4 rounded-xl border border-amber-500/20 text-amber-800 dark:text-amber-400">
                  <Loader2 className="w-5 h-5 shrink-0 animate-spin text-amber-600" />
                  <div className="text-xs">
                    <h4 className="font-bold text-sm">Verifying UPI Payment</h4>
                    <p className="text-muted-foreground/90 mt-0.5">Wait a moment, we are verifying the transaction at the counter.</p>
                  </div>
                </div>
                <div className="flex justify-between items-center text-[10px] text-muted-foreground pt-1 px-1 font-mono">
                  <span>Code: {bill.billNumber}</span>
                  <span>Rs. {bill.totalAmount.toFixed(2)}</span>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-4 w-full">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-serif font-black text-sm md:text-base text-foreground">Settlement Invoice Generated</h3>
                    <p className="text-xs text-muted-foreground">Code: {bill.billNumber} • Rs. {bill.totalAmount.toFixed(2)}</p>
                  </div>
                  {bill.pdfUrl && (
                    <button
                      onClick={() => {
                        const win = window.open(getBackendBillUrl(bill.pdfUrl || ''), '_blank');
                        if (win) win.focus();
                      }}
                      className="p-2 border border-border rounded-lg bg-background text-foreground hover:bg-secondary cursor-pointer"
                      title="View Invoice PDF"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Payment Options Selection / Interactive Panel */}
                {showUpiPanel ? (
                  <div className="space-y-4 pt-3 border-t border-border/30 w-full animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-foreground flex items-center gap-1.5">
                        <QrCode className="w-4 h-4 text-amber-500 animate-pulse" /> UPI Payment Panel
                      </h4>
                      <button
                        onClick={() => setShowUpiPanel(false)}
                        className="text-[10px] font-bold text-muted-foreground hover:text-foreground cursor-pointer"
                      >
                        ← Back to Methods
                      </button>
                    </div>

                    {/* QR Code display */}
                    <div className="flex flex-col items-center justify-center p-3 bg-secondary/30 rounded-xl border border-border/40 gap-1.5">
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getUpiUrl())}`}
                        alt="UPI Payment QR Code"
                        className="w-40 h-40 bg-white p-2 rounded-lg border border-border shadow-sm"
                      />
                      <span className="text-[10px] text-muted-foreground font-medium text-center">
                        Scan this QR code using GPay, PhonePe, or Paytm to pay
                      </span>
                    </div>

                    {/* Copy details block */}
                    <div className="space-y-2.5">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">UPI Address (VPA)</label>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            readOnly
                            value={bill.restaurantId?.paymentSettings?.upiId || ''}
                            className="bg-secondary/60 border border-border/80 rounded-xl px-3 py-2 text-xs font-mono font-medium flex-1 text-foreground focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleCopyText(bill.restaurantId?.paymentSettings?.upiId || '', false)}
                            className="px-3 border border-border rounded-xl bg-background hover:bg-secondary cursor-pointer flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                            title="Copy VPA"
                          >
                            {copiedUpiId ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </div>

                      {bill.restaurantId?.paymentSettings?.upiPhone && (
                        <div className="space-y-1">
                          <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Linked Phone Number</label>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              readOnly
                              value={bill.restaurantId.paymentSettings.upiPhone}
                              className="bg-secondary/60 border border-border/80 rounded-xl px-3 py-2 text-xs font-medium flex-1 text-foreground focus:outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => handleCopyText(bill.restaurantId?.paymentSettings?.upiPhone || '', true)}
                              className="px-3 border border-border rounded-xl bg-background hover:bg-secondary cursor-pointer flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                              title="Copy Phone Number"
                            >
                              {copiedUpiPhone ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Trigger App Launch fallback */}
                    <div className="space-y-2 pt-1.5 border-t border-border/20">
                      <a
                        href={getUpiUrl()}
                        className="flex items-center justify-center gap-2 w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm text-center"
                      >
                        <Smartphone className="w-4 h-4" /> Open UPI App Directly
                      </a>
                      <p className="text-[9px] text-muted-foreground leading-normal pl-1">
                        ⚠️ **Risk Policy Warning**: If your UPI App blocks the transaction directly, please copy the **VPA Address** or **Phone Number** above and make a manual transfer.
                      </p>
                    </div>

                    {/* Notify counter trigger */}
                    <button
                      onClick={handleUPIPayClick}
                      disabled={paymentLoading}
                      className="w-full mt-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-md shadow-emerald-500/10 uppercase tracking-wider"
                    >
                      {paymentLoading ? 'Submitting...' : 'I Have Paid (Notify Cashier)'}
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3 pt-2.5 border-t border-border/30 w-full animate-in fade-in duration-300">
                    <span className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider block">Choose Settlement Method</span>
                    
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {/* Direct UPI Intent Option */}
                      {(bill.restaurantId?.paymentSettings?.upiId || bill.restaurantId?.paymentSettings?.upiPhone) && (
                        <button
                          onClick={() => setShowUpiPanel(true)}
                          disabled={paymentLoading}
                          className="flex items-center justify-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
                        >
                          <Smartphone className="w-4 h-4" /> Pay via UPI Online
                        </button>
                      )}

                      {/* Pay in Cash Option */}
                      <button
                        onClick={handleCashPayClick}
                        disabled={paymentLoading}
                        className="flex items-center justify-center gap-2 px-4 py-2.5 bg-secondary hover:bg-muted text-foreground border border-border/80 rounded-xl text-xs font-bold cursor-pointer transition-colors shadow-sm"
                      >
                        <Coins className="w-4 h-4 text-primary" /> Pay in Cash / Counter
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </Card>
        )}

        {/* Order Items Summary */}
        <Card className="border border-border/60 shadow-md">
          <CardHeader className="pb-3">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-base font-serif font-black">Order Summary</CardTitle>
                <CardDescription className="text-xs">Dine-in Table {order.tableNumber}</CardDescription>
              </div>
              <Badge variant={order.status === 'cancelled' ? 'danger' : 'outline'} className="text-[10px] py-0.5 capitalize">
                {order.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4 text-xs">
            {/* List */}
            <div className="divide-y divide-border/40">
              {order.items.map((item, idx) => {
                const extra = item.customizations
                  ? item.customizations.reduce((acc, c) => acc + c.extraPrice, 0)
                  : 0;
                const priceTotal = (item.price + extra) * item.quantity;

                return (
                  <div key={idx} className="py-3 flex justify-between gap-4">
                    <div className="space-y-0.5">
                      <span className="font-bold text-foreground text-xs">
                        {item.name} <span className="text-primary font-bold">x {item.quantity}</span>
                      </span>
                      {item.customizations && item.customizations.length > 0 && (
                        <div className="text-[10px] text-muted-foreground">
                          {item.customizations.map(c => `${c.name}: ${c.selectedOption}`).join(', ')}
                        </div>
                      )}
                      {item.specialInstructions && (
                        <div className="text-[9px] text-amber-600 dark:text-amber-400 italic">
                          * Instructions: "{item.specialInstructions}"
                        </div>
                      )}
                    </div>
                    <span className="font-bold text-foreground">Rs. {priceTotal.toFixed(2)}</span>
                  </div>
                );
              })}
            </div>

            {/* Calculations */}
            <div className="border-t border-border/50 pt-3 space-y-1.5 text-muted-foreground">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span className="text-foreground font-semibold">Rs. {order.subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Taxes & GST</span>
                <span className="text-foreground font-semibold">Rs. {order.tax.toFixed(2)}</span>
              </div>
              <div className="flex justify-between border-t border-border/40 pt-2 text-sm font-extrabold text-foreground">
                <span>Grand Total</span>
                <span className="text-primary text-base">Rs. {order.totalAmount.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
          <CardFooter className="bg-secondary/10 border-t border-border/30 justify-between items-center py-3.5 text-[11px] text-muted-foreground">
            <span>Client: {order.customerName}</span>
            <span>Placed: {new Date(order.createdAt).toLocaleTimeString()}</span>
          </CardFooter>
        </Card>

        {/* Order More Items CTA Button */}
        {order.status !== 'completed' && order.status !== 'cancelled' && (
          <div className="text-center pt-2">
            <Link 
              href={`/r/${slug}/menu`} 
              className="inline-flex items-center justify-center gap-1.5 px-6 py-3 w-full bg-amber-600 hover:bg-amber-700 text-white rounded-2xl text-sm font-bold shadow-lg shadow-amber-500/10 cursor-pointer transition-all hover:scale-[1.01]"
            >
              <Plus className="w-4.5 h-4.5" /> Order More Items
            </Link>
          </div>
        )}
      </main>
    </div>
  );
}
