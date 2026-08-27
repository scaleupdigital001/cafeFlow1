'use client';

import React, { useEffect, useState } from 'react';
import api from '../../../lib/axios';
import useSocket from '../../../hooks/useSocket';
import { useAuthStore } from '../../../store/authStore';
import { printThermalReceipt, ThermalReceiptData } from '../../../lib/printService';
import { getBackendBillUrl } from '../../../lib/config';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';
import { 
  Loader2, Plus, Trash2, Printer, Download, QrCode, 
  Layers, AlertCircle, Info, CheckCircle2, Clock, 
  Smartphone, RefreshCw, X, Receipt, ShoppingBag, AlertTriangle, Check
} from 'lucide-react';

interface Table {
  _id: string;
  tableNumber: string;
  qrCodeUrl?: string;
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
  subtotal?: number;
  tax?: number;
  totalAmount: number;
  createdAt: string;
}

interface WaiterRequest {
  _id: string;
  tableNumber: string;
  type: 'call_waiter' | 'request_water' | 'request_bill' | 'other';
  status: 'pending' | 'resolved';
  createdAt: string;
}

interface Bill {
  _id: string;
  billNumber: string;
  totalAmount: number;
  subtotal?: number;
  tax?: number;
  pdfUrl?: string;
  orderId?: any;
  restaurantId?: any;
  tableNumber?: string;
  paymentStatus?: 'pending' | 'verifying' | 'paid';
  paymentMethod?: 'upi_link' | 'cash';
  createdAt: string;
}

export default function AdminTablesPage() {
  const { user, restaurant } = useAuthStore();
  const restaurantId = user?.restaurantId;

  // View state: 'live' (Operational Dashboard) or 'qr' (Sticker Roster)
  const [activeTab, setActiveTab] = useState<'live' | 'qr'>('live');

  // Master Data States
  const [tables, setTables] = useState<Table[]>([]);
  const [activeOrders, setActiveOrders] = useState<Order[]>([]);
  const [waiterRequests, setWaiterRequests] = useState<WaiterRequest[]>([]);
  const [recentBills, setRecentBills] = useState<Bill[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Selected Table Modal State
  const [selectedTableNum, setSelectedTableNum] = useState<string | null>(null);
  const [completingTable, setCompletingTable] = useState(false);

  // Register Table Form state
  const [tableNumber, setTableNumber] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Bind real-time Socket.IO updates
  const socket = useSocket('restaurant', restaurantId);

  const fetchAllData = async () => {
    setLoading(true);
    try {
      const [tablesRes, ordersRes, requestsRes, billsRes] = await Promise.allSettled([
        api.get('/tables'),
        api.get('/orders'),
        api.get('/orders/waiter-requests/active'),
        api.get('/bills/recent'),
      ]);

      if (tablesRes.status === 'fulfilled') setTables(tablesRes.value.data.data);
      if (ordersRes.status === 'fulfilled') {
        // Active non-completed, non-cancelled orders
        const all = ordersRes.value.data.data as Order[];
        setActiveOrders(all.filter((o) => o.status !== 'completed' && o.status !== 'cancelled'));
      }
      if (requestsRes.status === 'fulfilled') setWaiterRequests(requestsRes.value.data.data);
      if (billsRes.status === 'fulfilled') setRecentBills(billsRes.value.data.data);
    } catch (err: any) {
      console.error('Fetch dashboard data error:', err);
      setError('Failed to load table operational data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Handle Socket.IO real-time events
  useEffect(() => {
    if (!socket) return;

    const handleNewOrder = () => fetchAllData();
    const handleOrderUpdated = () => fetchAllData();
    const handleWaiterRequest = () => fetchAllData();
    const handleTableStatus = () => fetchAllData();
    const handleBillReady = () => fetchAllData();

    socket.on('new_order', handleNewOrder);
    socket.on('order_updated', handleOrderUpdated);
    socket.on('order_status_updated', handleOrderUpdated);
    socket.on('waiter_requested', handleWaiterRequest);
    socket.on('bill_requested', handleTableStatus);
    socket.on('table_status_updated', handleTableStatus);
    socket.on('bill_ready', handleBillReady);

    return () => {
      socket.off('new_order', handleNewOrder);
      socket.off('order_updated', handleOrderUpdated);
      socket.off('order_status_updated', handleOrderUpdated);
      socket.off('waiter_requested', handleWaiterRequest);
      socket.off('bill_requested', handleTableStatus);
      socket.off('table_status_updated', handleTableStatus);
      socket.off('bill_ready', handleBillReady);
    };
  }, [socket]);

  // Form Submit for Register Table
  const handleAddTableSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!tableNumber) return;

    setFormLoading(true);
    try {
      const response = await api.post('/tables', { tableNumber });
      setTables((prev) => [...prev, response.data.data].sort((a, b) => a.tableNumber.localeCompare(b.tableNumber)));
      setTableNumber('');
    } catch (err: any) {
      setFormError(err.response?.data?.message || 'Failed to generate table QR code.');
    } finally {
      setFormLoading(false);
    }
  };

  // Delete Table
  const handleDeleteTable = async (tableId: string, tableNum: string) => {
    if (!window.confirm(`Are you sure you want to delete Table ${tableNum}? This will invalidate its QR code.`)) return;

    try {
      await api.delete(`/tables/${tableId}`);
      setTables((prev) => prev.filter((t) => t._id !== tableId));
    } catch (err: any) {
      alert('Failed to remove table.');
    }
  };

  // Helper to determine single table operational status & details
  const getTableInfo = (tableNum: string) => {
    // 1. Check active orders for this table
    const tableOrders = activeOrders.filter((o) => o.tableNumber === tableNum);
    const hasOrder = tableOrders.length > 0;
    const latestOrder = hasOrder ? tableOrders[tableOrders.length - 1] : null;

    // 2. Check pending bill requests or if order is fully served (making it eligible for billing)
    const hasBillRequest = 
      (latestOrder as any)?.billRequested === true ||
      (latestOrder as any)?.status === 'served' ||
      waiterRequests.some(
        (r) => r.tableNumber === tableNum && r.type === 'request_bill' && r.status === 'pending'
      );

    // 3. Check pending verification bills
    const matchingBill = recentBills.find(
      (b) =>
        (b.tableNumber === tableNum || (b.orderId as any)?.tableNumber === tableNum) &&
        (b.paymentStatus === 'pending' || b.paymentStatus === 'verifying')
    );

    let status: 'AVAILABLE' | 'ACTIVE' | 'BILL_REQUESTED' = 'AVAILABLE';

    if (hasBillRequest || matchingBill) {
      status = 'BILL_REQUESTED';
    } else if (hasOrder) {
      status = 'ACTIVE';
    }

    const totalItems = tableOrders.reduce((sum, o) => sum + o.items.reduce((s, i) => s + i.quantity, 0), 0);
    const totalAmount = tableOrders.reduce((sum, o) => sum + (o.totalAmount || 0), 0);

    return {
      status,
      orders: tableOrders,
      latestOrder,
      hasBillRequest,
      matchingBill,
      totalItems,
      totalAmount,
    };
  };

  // Handle Admin COMPLETE & PRINT BILL
  const handleAdminCompleteAndPrint = async (order: Order) => {
    if (completingTable) return;
    setCompletingTable(true);

    try {
      const response = await api.patch(`/orders/${order._id}/status`, { status: 'completed' });
      const billData = response.data.bill;

      // Construct receipt data for thermal print
      const receiptData: ThermalReceiptData = {
        restaurantName: restaurant?.name || 'CafeFlow Restaurant',
        restaurantAddress: (billData?.restaurantId as any)?.address || restaurant?.address || '',
        restaurantContact: (billData?.restaurantId as any)?.contact || restaurant?.contact || '',
        gstNumber: (billData?.restaurantId as any)?.gstNumber || restaurant?.gstNumber || '',
        billNumber: billData?.billNumber || 'INV-COMPLETED',
        date: billData?.createdAt || new Date().toISOString(),
        tableNumber: order.tableNumber,
        customerName: order.customerName,
        customerPhone: order.phoneNumber,
        items: order.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          customizations: i.customizations,
          specialInstructions: i.specialInstructions,
        })),
        subtotal: order.subtotal || billData?.subtotal || 0,
        tax: order.tax || billData?.tax || 0,
        taxRate: restaurant?.taxRate || 5,
        totalAmount: order.totalAmount || billData?.totalAmount || 0,
        paymentStatus: billData?.paymentStatus || 'unpaid',
        paymentMethod: billData?.paymentMethod || '',
      };

      // Trigger thermal printing engine
      await printThermalReceipt(receiptData);

      // Close modal and refresh dashboard state
      setSelectedTableNum(null);
      await fetchAllData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to complete order and print bill.');
    } finally {
      setCompletingTable(false);
    }
  };

  // Print QR sticker popup
  const handlePrintQR = (tableNum: string, qrBase64: string) => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Print QR - Table ${tableNum}</title>
          <style>
            body { font-family: 'Outfit', sans-serif; text-align: center; padding: 40px; color: #1c1917; }
            .sticker-card { border: 3px double #d97706; border-radius: 20px; padding: 30px; display: inline-block; max-width: 320px; background-color: #fafaf9; }
            h1 { font-size: 26px; margin-bottom: 5px; text-transform: uppercase; letter-spacing: 1px; }
            p { font-size: 14px; color: #78716c; margin-bottom: 25px; }
            img { width: 250px; height: 250px; }
            .footer-note { font-size: 10px; color: #a8a29e; margin-top: 20px; text-transform: uppercase; letter-spacing: 2px; }
          </style>
        </head>
        <body onload="window.print();window.close();">
          <div class="sticker-card">
            <h1>Table ${tableNum}</h1>
            <p>Scan to view menu & place your order</p>
            <img src="${qrBase64}" alt="QR code" />
            <div class="footer-note">Powered by CafeFlow</div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Compute table dashboard counters
  const tableDataList = tables.map((t) => ({ table: t, info: getTableInfo(t.tableNumber) }));
  const billRequestedCount = tableDataList.filter((td) => td.info.status === 'BILL_REQUESTED').length;
  const activeCount = tableDataList.filter((td) => td.info.status === 'ACTIVE').length;
  const availableCount = tableDataList.filter((td) => td.info.status === 'AVAILABLE').length;

  // Sort: BILL_REQUESTED first, then ACTIVE, then AVAILABLE
  const sortedTableDataList = [...tableDataList].sort((a, b) => {
    const priority = { BILL_REQUESTED: 0, ACTIVE: 1, AVAILABLE: 2 };
    return priority[a.info.status] - priority[b.info.status];
  });

  const selectedTableInfo = selectedTableNum ? getTableInfo(selectedTableNum) : null;

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif font-black text-2xl tracking-tight">Table Operations & Billing</h2>
          <p className="text-xs text-muted-foreground">Monitor real-time table dining activity, bill requests, and execute final bill printing.</p>
        </div>

        {/* Tab switch buttons */}
        <div className="flex items-center gap-2 bg-secondary/50 p-1 rounded-xl border border-border/60">
          <button
            onClick={() => setActiveTab('live')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'live'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            <Receipt className="w-4 h-4" /> Live Table Operations
          </button>
          <button
            onClick={() => setActiveTab('qr')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'qr'
                ? 'bg-primary text-primary-foreground shadow-md'
                : 'text-muted-foreground hover:bg-secondary'
            }`}
          >
            <QrCode className="w-4 h-4" /> QR Stickers Roster
          </button>
        </div>
      </div>

      {/* Summary Metrics Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="border border-border/40 p-4 shadow-sm flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Total Tables</span>
          <span className="text-2xl font-black text-foreground">{tables.length}</span>
        </Card>

        <Card className="border border-border/40 p-4 shadow-sm flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Active Dining</span>
          <span className="text-2xl font-black text-blue-600">{activeCount}</span>
        </Card>

        <Card className={`border p-4 shadow-sm flex items-center justify-between transition-all ${
          billRequestedCount > 0 ? 'border-amber-500/50 bg-amber-500/10 animate-pulse' : 'border-border/40'
        }`}>
          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">Bill Requested</span>
          <span className="text-2xl font-black text-amber-600">{billRequestedCount}</span>
        </Card>

        <Card className="border border-border/40 p-4 shadow-sm flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground">Available</span>
          <span className="text-2xl font-black text-emerald-600">{availableCount}</span>
        </Card>
      </div>

      {/* VIEW TAB 1: Live Table Operations */}
      {activeTab === 'live' && (
        <div className="space-y-4">
          {loading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : tables.length === 0 ? (
            <Card className="border-2 border-dashed border-border/60 py-20 text-center space-y-2">
              <Layers className="w-12 h-12 text-muted-foreground/30 mx-auto" />
              <h3 className="font-serif font-bold text-muted-foreground">No dining tables configured yet</h3>
              <p className="text-xs text-muted-foreground/80">Switch to the "QR Stickers Roster" tab to register your restaurant tables.</p>
            </Card>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {sortedTableDataList.map(({ table, info }) => {
                const isBillReq = info.status === 'BILL_REQUESTED';
                const isActive = info.status === 'ACTIVE';

                return (
                  <Card
                    key={table._id}
                    className={`overflow-hidden border transition-all duration-300 flex flex-col justify-between relative ${
                      isBillReq
                        ? 'border-2 border-amber-500 bg-amber-500/5 shadow-lg shadow-amber-500/10 scale-[1.01]'
                        : isActive
                        ? 'border-blue-500/40 hover:border-blue-500 shadow-md'
                        : 'border-border/60 opacity-80 hover:opacity-100'
                    }`}
                  >
                    {/* Visual Status Strip at top */}
                    <div
                      className={`h-1.5 w-full absolute top-0 left-0 ${
                        isBillReq ? 'bg-amber-500 animate-pulse' : isActive ? 'bg-blue-500' : 'bg-stone-300 dark:bg-stone-700'
                      }`}
                    />

                    <div className="p-5 space-y-3 pt-6">
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest">Dining Table</span>
                          <h3 className="font-serif font-black text-3xl tracking-tight text-foreground">
                            Table {table.tableNumber}
                          </h3>
                        </div>

                        <Badge
                          variant={
                            isBillReq ? 'danger' : isActive ? 'default' : 'secondary'
                          }
                          className={`text-[10px] py-0.5 font-bold capitalize gap-1 ${
                            isBillReq ? 'bg-amber-600 text-white animate-pulse' : ''
                          }`}
                        >
                          {isBillReq ? (
                            <>
                              <AlertTriangle className="w-3 h-3" /> BILL REQUESTED
                            </>
                          ) : isActive ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> ACTIVE OCCUPIED
                            </>
                          ) : (
                            'AVAILABLE'
                          )}
                        </Badge>
                      </div>

                      {/* Content details based on operational status */}
                      {isBillReq || isActive ? (
                        <div className="bg-secondary/40 border border-border/50 rounded-xl p-3.5 space-y-2 text-xs">
                          <div className="flex justify-between items-center text-muted-foreground">
                            <span>Customer:</span>
                            <span className="font-bold text-foreground">{info.latestOrder?.customerName || 'Guest'}</span>
                          </div>
                          <div className="flex justify-between items-center text-muted-foreground">
                            <span>Order Status:</span>
                            <span className="font-bold text-primary capitalize">{info.latestOrder?.status || 'Active'}</span>
                          </div>
                          <div className="flex justify-between items-center text-muted-foreground">
                            <span>Items Ordered:</span>
                            <span className="font-bold text-foreground">{info.totalItems} items</span>
                          </div>
                          <div className="flex justify-between items-center border-t border-border/40 pt-2 font-extrabold text-sm text-foreground">
                            <span>Current Total:</span>
                            <span className="text-primary text-base">Rs. {info.totalAmount.toFixed(2)}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="py-6 text-center text-xs text-muted-foreground space-y-1">
                          <span className="block font-semibold">No active order session</span>
                          <span className="text-[10px] opacity-70">Table is ready for new customers</span>
                        </div>
                      )}
                    </div>

                    {/* Card Action Button */}
                    <div className="p-4 border-t border-border/40 bg-secondary/10">
                      {isBillReq ? (
                        <Button
                          onClick={() => setSelectedTableNum(table.tableNumber)}
                          className="w-full text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white shadow-md shadow-amber-500/20 cursor-pointer gap-1.5"
                        >
                          <Receipt className="w-4 h-4" /> VIEW ORDER & COMPLETE BILL
                        </Button>
                      ) : isActive ? (
                        <Button
                          onClick={() => setSelectedTableNum(table.tableNumber)}
                          variant="outline"
                          className="w-full text-xs font-bold cursor-pointer gap-1.5"
                        >
                          <ShoppingBag className="w-4 h-4" /> View Order Details
                        </Button>
                      ) : (
                        <Button
                          disabled
                          variant="secondary"
                          className="w-full text-xs font-semibold opacity-50 cursor-not-allowed"
                        >
                          Table Available
                        </Button>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* VIEW TAB 2: QR Code Stickers Roster */}
      {activeTab === 'qr' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
          {/* Register Table form */}
          <Card className="border border-border/60 shadow-md">
            <CardHeader>
              <CardTitle className="text-base font-serif font-black flex items-center gap-1.5">
                <QrCode className="w-5 h-5 text-primary" /> Register Dining Table
              </CardTitle>
              <CardDescription className="text-xs">Creates a table database entry and generates its menu QR sticker.</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddTableSubmit} className="space-y-4 text-sm">
                {formError && (
                  <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs px-3 py-2 rounded-lg flex items-center gap-1.5">
                    <AlertCircle className="w-4.5 h-4.5" />
                    <span>{formError}</span>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                    Table Number/Name
                  </label>
                  <input
                    type="text"
                    required
                    value={tableNumber}
                    onChange={(e) => setTableNumber(e.target.value)}
                    placeholder="e.g. 5 or Table 5"
                    className="w-full text-xs bg-secondary/40 text-foreground border border-border rounded-xl px-3 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                  />
                </div>

                <Button type="submit" disabled={formLoading} className="w-full font-bold cursor-pointer">
                  {formLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Register & Create QR'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Tables list display */}
          <Card className="lg:col-span-2 border border-border/60 shadow-md min-h-[40vh] flex flex-col justify-between">
            <CardHeader className="pb-3 border-b border-border/30">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-base font-serif font-black flex items-center gap-1.5">
                    <Layers className="w-5 h-5 text-primary" /> Table Roster
                  </CardTitle>
                  <CardDescription className="text-xs">Current list of registered tables and QR codes</CardDescription>
                </div>
                <Badge variant="outline" className="text-[10px] font-bold">
                  Total: {tables.length}
                </Badge>
              </div>
            </CardHeader>

            {tables.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center p-12 text-center space-y-2 text-muted-foreground">
                <QrCode className="w-10 h-10 text-muted-foreground/30" />
                <h4 className="font-serif font-bold">No tables registered</h4>
                <p className="text-xs max-w-xs">Use the registration form on the left to initialize table menu codes.</p>
              </div>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 p-5">
                {tables.map((table) => (
                  <div key={table._id} className="bg-secondary/20 border border-border/50 rounded-2xl p-4 flex flex-col items-center justify-between gap-4 shadow-sm group">
                    <div className="relative w-44 h-44 bg-white border border-border/30 rounded-xl overflow-hidden flex items-center justify-center p-2.5">
                      {table.qrCodeUrl ? (
                        <img src={table.qrCodeUrl} alt={`Table ${table.tableNumber} QR`} className="w-full h-full object-contain" />
                      ) : (
                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                      )}
                    </div>

                    <div className="w-full text-center space-y-3">
                      <div>
                        <h4 className="font-serif font-black text-lg text-foreground">Table {table.tableNumber}</h4>
                        <span className="text-[9px] text-muted-foreground font-semibold">Registered: {new Date(table.createdAt).toLocaleDateString()}</span>
                      </div>

                      <div className="flex items-center gap-2 border-t border-border/40 pt-3 justify-center">
                        {table.qrCodeUrl && (
                          <>
                            <a
                              href={table.qrCodeUrl}
                              download={`Table-${table.tableNumber}-QR.png`}
                              className="p-2 rounded-lg border border-border bg-background hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center justify-center"
                              title="Download PNG File"
                            >
                              <Download className="w-4 h-4" />
                            </a>
                            
                            <button
                              onClick={() => handlePrintQR(table.tableNumber, table.qrCodeUrl || '')}
                              className="p-2 rounded-lg border border-border bg-background hover:bg-secondary text-muted-foreground hover:text-foreground transition-all cursor-pointer flex items-center justify-center"
                              title="Print Label"
                            >
                              <Printer className="w-4 h-4" />
                            </button>
                          </>
                        )}

                        <button
                          onClick={() => handleDeleteTable(table._id, table.tableNumber)}
                          className="p-2 rounded-lg border border-border bg-background hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-all cursor-pointer flex items-center justify-center"
                          title="Delete Table"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ADMIN TABLE DETAIL & CHECKOUT MODAL */}
      {selectedTableNum && selectedTableInfo && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground w-full max-w-xl rounded-2xl border border-border shadow-2xl overflow-hidden animate-fade-in max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-border flex items-center justify-between bg-secondary/20">
              <div>
                <h3 className="font-serif font-black text-xl flex items-center gap-2">
                  Table {selectedTableNum} Operational Checkout
                </h3>
                <span className="text-xs text-muted-foreground">Review order details and process final billing</span>
              </div>
              <button
                onClick={() => setSelectedTableNum(null)}
                className="p-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-sm flex-1">
              {/* Table status badge */}
              <div className="flex justify-between items-center bg-secondary/30 p-3 rounded-xl border border-border/50">
                <span className="text-xs font-bold text-muted-foreground">Table Status:</span>
                <Badge
                  variant={selectedTableInfo.status === 'BILL_REQUESTED' ? 'danger' : 'default'}
                  className="font-bold uppercase tracking-wider text-xs"
                >
                  {selectedTableInfo.status === 'BILL_REQUESTED' ? '⚠️ BILL REQUESTED' : 'ACTIVE SESSION'}
                </Badge>
              </div>

              {/* Order breakdown list */}
              {selectedTableInfo.orders.length > 0 ? (
                <div className="space-y-4">
                  {selectedTableInfo.orders.map((ord) => (
                    <div key={ord._id} className="border border-border/60 rounded-xl p-4 space-y-3">
                      <div className="flex justify-between items-start border-b border-border/40 pb-2">
                        <div>
                          <span className="font-bold text-xs text-foreground block">Customer: {ord.customerName}</span>
                          <span className="text-[10px] text-muted-foreground font-mono">Phone: {ord.phoneNumber}</span>
                        </div>
                        <Badge variant="outline" className="text-[9px] font-extrabold capitalize">
                          {ord.status}
                        </Badge>
                      </div>

                      {/* Items table */}
                      <div className="divide-y divide-border/30 text-xs">
                        {ord.items.map((item, idx) => {
                          const extra = item.customizations
                            ? item.customizations.reduce((acc, c) => acc + c.extraPrice, 0)
                            : 0;
                          const lineTotal = (item.price + extra) * item.quantity;

                          return (
                            <div key={idx} className="py-2 flex justify-between items-start">
                              <div>
                                <span className="font-semibold text-foreground">
                                  {item.name} <span className="text-primary font-bold">x {item.quantity}</span>
                                </span>
                                {item.customizations && item.customizations.length > 0 && (
                                  <div className="text-[10px] text-muted-foreground">
                                    {item.customizations.map((c) => `${c.name}: ${c.selectedOption}`).join(', ')}
                                  </div>
                                )}
                              </div>
                              <span className="font-bold text-foreground">Rs. {lineTotal.toFixed(2)}</span>
                            </div>
                          );
                        })}
                      </div>

                      {/* Financial breakdown */}
                      <div className="border-t border-border/40 pt-2 space-y-1 text-xs text-muted-foreground">
                        <div className="flex justify-between">
                          <span>Subtotal:</span>
                          <span className="font-semibold text-foreground">Rs. {(ord.subtotal || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Taxes & GST:</span>
                          <span className="font-semibold text-foreground">Rs. {(ord.tax || 0).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-black text-foreground pt-1 border-t border-border/30">
                          <span>Total Amount:</span>
                          <span className="text-primary">Rs. {ord.totalAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground text-xs">No active order data available for this table.</div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-border flex items-center justify-end gap-3 bg-secondary/10">
              <Button variant="outline" onClick={() => setSelectedTableNum(null)} className="cursor-pointer font-bold">
                Cancel
              </Button>

              {selectedTableInfo.latestOrder && (
                <Button
                  disabled={completingTable}
                  onClick={() => handleAdminCompleteAndPrint(selectedTableInfo.latestOrder!)}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer font-bold gap-1.5 shadow-md shadow-emerald-500/20"
                >
                  {completingTable ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Finalizing & Printing...
                    </>
                  ) : (
                    <>
                      <Printer className="w-4 h-4" /> COMPLETE & PRINT BILL
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
