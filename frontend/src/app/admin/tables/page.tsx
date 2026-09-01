'use client';

import React, { useEffect, useState, useMemo } from 'react';
import api from '../../../lib/axios';
import useSocket from '../../../hooks/useSocket';
import { useAuthStore } from '../../../store/authStore';
import { printThermalReceipt, printDualThermalReceipt, printSingleCopy, ThermalReceiptData, DualPrintResult } from '../../../lib/printService';
import { getBackendBillUrl } from '../../../lib/config';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/badge';
import { Card, CardHeader, CardTitle, CardContent, CardDescription } from '../../../components/ui/card';
import { 
  Loader2, Plus, Trash2, Printer, Download, QrCode, 
  Layers, AlertCircle, Info, CheckCircle2, Clock, 
  Smartphone, RefreshCw, X, Receipt, ShoppingBag, AlertTriangle, Check,
  Search, Utensils, Minus, Coffee, Sparkles
} from 'lucide-react';

import { Table, Order, OrderItem, WaiterRequest, Bill } from '../../../types';
import { formatCurrency } from '../../../lib/formatters';

interface DishCustomizationOption {
  name: string;
  extraPrice: number;
}

interface DishCustomizationGroup {
  name: string;
  type: 'single' | 'multiple';
  options: DishCustomizationOption[];
}

interface DishItem {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  category: string;
  price: number;
  veg: boolean;
  available: boolean;
  customizations?: DishCustomizationGroup[];
}

interface ManualCartItem {
  dishId: string;
  name: string;
  price: number;
  quantity: number;
  veg: boolean;
  category: string;
  customizations: { name: string; selectedOption: string; extraPrice: number }[];
  specialInstructions: string;
}

/**
 * Natural numerical comparison helper for table identifiers (e.g. "1" < "2" < "9" < "10" < "11" < "20")
 * Handles pure numeric strings as well as prefixed identifiers ("Table 1", "T-2", etc.)
 */
const compareTableNumbers = (aStr: string, bStr: string): number => {
  const matchA = aStr.match(/\d+/);
  const matchB = bStr.match(/\d+/);
  const numA = matchA ? parseInt(matchA[0], 10) : NaN;
  const numB = matchB ? parseInt(matchB[0], 10) : NaN;

  if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
    return numA - numB;
  }
  return aStr.localeCompare(bStr, undefined, { numeric: true, sensitivity: 'base' });
};

export default function AdminTablesPage() {
  const { user, restaurant, updateRestaurant } = useAuthStore();
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

  // POS Manual Order Modal State
  const [isManualOrderOpen, setIsManualOrderOpen] = useState(false);
  const [manualOrderTable, setManualOrderTable] = useState('');
  const [manualCustomerName, setManualCustomerName] = useState('');
  const [manualCustomerPhone, setManualCustomerPhone] = useState('');
  const [manualCartItems, setManualCartItems] = useState<ManualCartItem[]>([]);
  const [manualOrderLoading, setManualOrderLoading] = useState(false);
  const [manualOrderError, setManualOrderError] = useState<string | null>(null);
  const [manualOrderSuccess, setManualOrderSuccess] = useState<string | null>(null);

  // Menu Dishes state for manual ordering
  const [menuDishes, setMenuDishes] = useState<DishItem[]>([]);
  const [menuDishesLoading, setMenuDishesLoading] = useState(false);
  const [dishSearchQuery, setDishSearchQuery] = useState('');
  const [dishCategoryFilter, setDishCategoryFilter] = useState('All');
  const [dishVegFilter, setDishVegFilter] = useState<'all' | 'veg' | 'non-veg'>('all');

  // Customization dialog state for a selected dish
  const [customizingDish, setCustomizingDish] = useState<DishItem | null>(null);
  const [selectedCustomizations, setSelectedCustomizations] = useState<Record<string, { option: string; extraPrice: number }>>({});
  const [customizingInstructions, setCustomizingInstructions] = useState('');

  // Bind real-time Socket.IO updates
  const socket = useSocket('restaurant', restaurantId);

  const inFlightRef = React.useRef(false);
  const hasQueuedFetchRef = React.useRef(false);

  const fetchAllData = async () => {
    if (inFlightRef.current) {
      hasQueuedFetchRef.current = true;
      return;
    }
    inFlightRef.current = true;
    setLoading(true);
    try {
      const [tablesRes, ordersRes, requestsRes, billsRes, restRes] = await Promise.allSettled([
        api.get('/tables'),
        api.get('/orders/my-restaurant'),
        api.get('/orders/waiter-requests/active'),
        api.get('/bills/recent'),
        api.get('/restaurants/my-restaurant'),
      ]);

      if (tablesRes.status === 'fulfilled') setTables(tablesRes.value.data.data);
      if (ordersRes.status === 'fulfilled') {
        // Active non-completed, non-cancelled orders
        const all = ordersRes.value.data.data as Order[];
        setActiveOrders(all.filter((o) => o.status !== 'completed' && o.status !== 'cancelled'));
      }
      if (requestsRes.status === 'fulfilled') setWaiterRequests(requestsRes.value.data.data);
      if (billsRes.status === 'fulfilled') setRecentBills(billsRes.value.data.data);
      if (restRes.status === 'fulfilled' && restRes.value.data.data) {
        updateRestaurant(restRes.value.data.data);
      }
    } catch (err: any) {
      console.error('Fetch dashboard data error:', err);
      setError('Failed to load table operational data.');
    } finally {
      setLoading(false);
      inFlightRef.current = false;
      if (hasQueuedFetchRef.current) {
        hasQueuedFetchRef.current = false;
        fetchAllData();
      }
    }
  };

  useEffect(() => {
    fetchAllData();
  }, []);

  // Handle Socket.IO real-time events with targeted state updates
  useEffect(() => {
    if (!socket) return;

    const handleNewOrder = (order?: Order) => {
      if (!order?._id || !order?.tableNumber) return fetchAllData();
      const orderIdStr = String(order._id);
      setActiveOrders((prev) => [order, ...prev.filter((o) => String(o._id) !== orderIdStr)]);
    };

    const handleOrderUpdated = (order?: Order) => {
      if (!order?._id) return fetchAllData();
      const orderIdStr = String(order._id);
      if (order.status === 'completed' || order.status === 'cancelled') {
        setActiveOrders((prev) => prev.filter((o) => String(o._id) !== orderIdStr));
      } else {
        setActiveOrders((prev) =>
          prev.some((o) => String(o._id) === orderIdStr)
            ? prev.map((o) => (String(o._id) === orderIdStr ? order : o))
            : [order, ...prev]
        );
      }
    };

    const handleWaiterRequest = (req?: WaiterRequest) => {
      if (!req?._id || !req?.tableNumber) return fetchAllData();
      const reqIdStr = String(req._id);
      setWaiterRequests((prev) => [req, ...prev.filter((r) => String(r._id) !== reqIdStr)]);
    };

    const handleWaiterRequestResolved = (payload?: { _id: string }) => {
      if (!payload?._id) return fetchAllData();
      const reqIdStr = String(payload._id);
      setWaiterRequests((prev) => prev.filter((r) => String(r._id) !== reqIdStr));
    };

    const handleBillPaymentVerifying = (data?: { billId: string; tableNumber: string }) => {
      if (!data?.tableNumber) return fetchAllData();
      setActiveOrders((prev) =>
        prev.map((o) => (o.tableNumber === data.tableNumber ? { ...o, billRequested: true } : o))
      );
    };

    const handleBillRequested = (data?: { tableNumber: string }) => {
      if (!data?.tableNumber) return fetchAllData();
      setActiveOrders((prev) =>
        prev.map((o) => (o.tableNumber === data.tableNumber ? { ...o, billRequested: true } : o))
      );
    };

    const handleBillPaymentApproved = (payload?: { billId: string; orderId?: string }) => {
      if (!payload?.billId) return fetchAllData();
      const billIdStr = String(payload.billId);
      setRecentBills((prev) => prev.filter((b) => String(b._id) !== billIdStr));
      if (payload.orderId) {
        const orderIdStr = String(payload.orderId);
        setActiveOrders((prev) => prev.filter((o) => String(o._id) !== orderIdStr));
      }
    };

    const handleBillReady = (bill?: Bill) => {
      if (!bill?._id) return fetchAllData();
      const billIdStr = String(bill._id);
      setRecentBills((prev) => [bill, ...prev.filter((b) => String(b._id) !== billIdStr)]);
    };

    const handleRestaurantUpdated = (updatedRestaurant?: any) => {
      if (updatedRestaurant) {
        updateRestaurant(updatedRestaurant);
      } else {
        fetchAllData();
      }
    };

    socket.on('new_order', handleNewOrder);
    socket.on('order_updated', handleOrderUpdated);
    socket.on('order_status_updated', handleOrderUpdated);
    socket.on('waiter_requested', handleWaiterRequest);
    socket.on('waiter_request_resolved', handleWaiterRequestResolved);
    socket.on('bill_requested', handleBillRequested);
    socket.on('bill_payment_verifying', handleBillPaymentVerifying);
    socket.on('bill_payment_approved', handleBillPaymentApproved);
    socket.on('bill_ready', handleBillReady);
    socket.on('restaurant_updated', handleRestaurantUpdated);

    return () => {
      socket.off('new_order', handleNewOrder);
      socket.off('order_updated', handleOrderUpdated);
      socket.off('order_status_updated', handleOrderUpdated);
      socket.off('waiter_requested', handleWaiterRequest);
      socket.off('waiter_request_resolved', handleWaiterRequestResolved);
      socket.off('bill_requested', handleBillRequested);
      socket.off('bill_payment_verifying', handleBillPaymentVerifying);
      socket.off('bill_payment_approved', handleBillPaymentApproved);
      socket.off('bill_ready', handleBillReady);
      socket.off('restaurant_updated', handleRestaurantUpdated);
    };
  }, [socket, updateRestaurant]);

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

  // Fetch Menu Dishes for POS Manual Ordering
  const fetchMenuDishes = async () => {
    if (menuDishes.length > 0) return;
    setMenuDishesLoading(true);
    try {
      const response = await api.get('/dishes/my-restaurant');
      setMenuDishes(response.data.data || []);
    } catch (err: any) {
      console.error('Failed to load menu dishes:', err);
    } finally {
      setMenuDishesLoading(false);
    }
  };

  // Open Manual POS Order Modal
  const openManualOrderModal = (tableNum?: string) => {
    if (tableNum) {
      setManualOrderTable(tableNum);
    } else if (tables.length > 0) {
      setManualOrderTable(tables[0].tableNumber);
    } else {
      setManualOrderTable('1');
    }
    setManualCustomerName('');
    setManualCustomerPhone('');
    setManualCartItems([]);
    setManualOrderError(null);
    setManualOrderSuccess(null);
    setDishSearchQuery('');
    setDishCategoryFilter('All');
    setDishVegFilter('all');
    setIsManualOrderOpen(true);
    fetchMenuDishes();
  };

  // Add Item to Manual Cart
  const handleAddItemToManualCart = (
    dish: DishItem,
    custs: { name: string; selectedOption: string; extraPrice: number }[] = [],
    instructions: string = ''
  ) => {
    setManualCartItems((prev) => {
      const existingIdx = prev.findIndex(
        (item) =>
          item.dishId === dish._id &&
          JSON.stringify(item.customizations) === JSON.stringify(custs) &&
          item.specialInstructions === instructions
      );

      if (existingIdx > -1) {
        const updated = [...prev];
        updated[existingIdx].quantity += 1;
        return updated;
      }

      return [
        ...prev,
        {
          dishId: dish._id,
          name: dish.name,
          price: dish.price,
          quantity: 1,
          veg: dish.veg,
          category: dish.category,
          customizations: custs,
          specialInstructions: instructions,
        },
      ];
    });
  };

  // Update Manual Cart Item Quantity
  const handleUpdateManualCartQty = (index: number, delta: number) => {
    setManualCartItems((prev) => {
      const updated = [...prev];
      const newQty = updated[index].quantity + delta;
      if (newQty <= 0) {
        return updated.filter((_, i) => i !== index);
      }
      updated[index].quantity = newQty;
      return updated;
    });
  };

  // Remove Manual Cart Item
  const handleRemoveManualCartItem = (index: number) => {
    setManualCartItems((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculate Manual Order Financial Totals
  const manualOrderTotals = useMemo(() => {
    const taxRate = restaurant?.taxRate !== undefined && restaurant?.taxRate !== null ? Number(restaurant.taxRate) : 5;
    const subtotal = manualCartItems.reduce((acc, item) => {
      const extraCost = item.customizations.reduce((sum, c) => sum + (c.extraPrice || 0), 0);
      return acc + (item.price + extraCost) * item.quantity;
    }, 0);
    const tax = Number(((subtotal * taxRate) / 100).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));
    return { subtotal, tax, taxRate, total };
  }, [manualCartItems, restaurant]);

  // Submit Manual Order to Backend
  const handleManualOrderSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualOrderTable) {
      setManualOrderError('Please select a table number.');
      return;
    }
    if (manualCartItems.length === 0) {
      setManualOrderError('Please add at least one dish to the order.');
      return;
    }

    setManualOrderLoading(true);
    setManualOrderError(null);

    try {
      const payload = {
        tableNumber: manualOrderTable,
        customerName: manualCustomerName.trim() || 'Walk-in Guest',
        phoneNumber: manualCustomerPhone.trim() || '9999999999',
        items: manualCartItems.map((i) => ({
          dishId: i.dishId,
          name: i.name,
          quantity: i.quantity,
          customizations: i.customizations,
          specialInstructions: i.specialInstructions,
        })),
      };

      await api.post('/orders/manual', payload);
      setManualOrderSuccess(`Order for Table ${manualOrderTable} placed successfully!`);

      // Refresh dashboard data instantly
      await fetchAllData();

      setTimeout(() => {
        setIsManualOrderOpen(false);
        setManualCartItems([]);
        setManualOrderSuccess(null);
      }, 1000);
    } catch (err: any) {
      setManualOrderError(err.response?.data?.message || 'Failed to place manual order.');
    } finally {
      setManualOrderLoading(false);
    }
  };

  // Dish Categories and Filtering for POS Menu Browser
  const dishCategories = useMemo(() => {
    const cats = new Set<string>();
    cats.add('All');
    for (const d of menuDishes) {
      if (d.category) cats.add(d.category);
    }
    return Array.from(cats);
  }, [menuDishes]);

  const filteredDishes = useMemo(() => {
    return menuDishes.filter((d) => {
      if (!d.available) return false;
      const matchesSearch =
        d.name.toLowerCase().includes(dishSearchQuery.toLowerCase()) ||
        (d.description && d.description.toLowerCase().includes(dishSearchQuery.toLowerCase()));
      const matchesCat = dishCategoryFilter === 'All' || d.category === dishCategoryFilter;
      const matchesVeg =
        dishVegFilter === 'all' ||
        (dishVegFilter === 'veg' && d.veg) ||
        (dishVegFilter === 'non-veg' && !d.veg);
      return matchesSearch && matchesCat && matchesVeg;
    });
  }, [menuDishes, dishSearchQuery, dishCategoryFilter, dishVegFilter]);

  // Normalize table strings for resilient key matching (e.g. "Table 1", "T-1", " 1 " -> "1")
  const normalizeTableKey = (t: string | number | undefined | null): string => {
    if (!t) return '';
    return String(t).trim().toLowerCase().replace(/^(table|t)[-\s]*/i, '');
  };

  // Precompute derived table information indexed by tableNumber (O(N) data passes instead of O(tables * N))
  const tableInfoMap = React.useMemo(() => {
    // 1. Group active orders by tableNumber with resilient multi-key matching
    const ordersByTable: Record<string, Order[]> = {};
    for (const order of activeOrders) {
      if (!order.tableNumber) continue;
      const raw = String(order.tableNumber).trim();
      const norm = normalizeTableKey(raw);
      const keys = new Set([raw, norm, `Table ${norm}`, `Table ${raw}`]);

      for (const k of keys) {
        if (!ordersByTable[k]) ordersByTable[k] = [];
        if (!ordersByTable[k].some((o) => String(o._id) === String(order._id))) {
          ordersByTable[k].push(order);
        }
      }
    }

    // 2. Map pending bill waiter requests by tableNumber
    const pendingBillRequests = new Set<string>();
    for (const req of waiterRequests) {
      if (req.type === 'request_bill' && req.status === 'pending') {
        const raw = String(req.tableNumber).trim();
        const norm = normalizeTableKey(raw);
        pendingBillRequests.add(raw);
        pendingBillRequests.add(norm);
        pendingBillRequests.add(`Table ${norm}`);
      }
    }

    // 3. Map pending/verifying bills and last completed bills by tableNumber
    const billsByTable: Record<string, Bill> = {};
    const lastCompletedBillsByTable: Record<string, Bill> = {};

    for (const bill of recentBills) {
      const tableNum = bill.tableNumber || (bill.orderId as any)?.tableNumber;
      if (!tableNum) continue;

      const raw = String(tableNum).trim();
      const norm = normalizeTableKey(raw);
      const keys = [raw, norm, `Table ${norm}`];

      if (bill.paymentStatus === 'pending' || bill.paymentStatus === 'verifying') {
        for (const k of keys) {
          if (!billsByTable[k]) billsByTable[k] = bill;
        }
      } else if (bill.paymentStatus === 'paid') {
        for (const k of keys) {
          if (!lastCompletedBillsByTable[k]) lastCompletedBillsByTable[k] = bill;
        }
      }
    }

    // 4. Construct table information dictionary for all tables
    const map: Record<
      string,
      {
        status: 'AVAILABLE' | 'ACTIVE' | 'SERVED' | 'BILL_REQUESTED';
        orders: Order[];
        latestOrder: Order | null;
        hasExplicitBillRequest: boolean;
        isEligibleForBilling: boolean;
        matchingBill: Bill | undefined;
        lastCompletedBill: Bill | undefined;
        totalItems: number;
        totalAmount: number;
      }
    > = {};

    for (const t of tables) {
      const tableNum = t.tableNumber;
      const norm = normalizeTableKey(tableNum);
      const tableOrders = ordersByTable[tableNum] || ordersByTable[norm] || [];
      const hasOrder = tableOrders.length > 0;
      const latestOrder = hasOrder ? tableOrders[0] : null;

      const hasExplicitBillRequest =
        (latestOrder as any)?.billRequested === true ||
        pendingBillRequests.has(tableNum) ||
        pendingBillRequests.has(norm);

      const matchingBill = billsByTable[tableNum] || billsByTable[norm];
      const lastCompletedBill = lastCompletedBillsByTable[tableNum] || lastCompletedBillsByTable[norm];

      const isEligibleForBilling =
        (latestOrder as any)?.status === 'served' || hasExplicitBillRequest || Boolean(matchingBill);

      let status: 'AVAILABLE' | 'ACTIVE' | 'SERVED' | 'BILL_REQUESTED' = 'AVAILABLE';
      if (hasExplicitBillRequest || matchingBill) {
        status = 'BILL_REQUESTED';
      } else if (latestOrder?.status === 'served') {
        status = 'SERVED';
      } else if (hasOrder) {
        status = 'ACTIVE';
      }

      let totalItems = 0;
      let totalAmount = 0;
      for (const o of tableOrders) {
        totalAmount += o.totalAmount || 0;
        for (const item of o.items) {
          totalItems += item.quantity;
        }
      }

      const infoObj = {
        status,
        orders: tableOrders,
        latestOrder,
        hasExplicitBillRequest,
        isEligibleForBilling,
        matchingBill,
        lastCompletedBill,
        totalItems,
        totalAmount,
      };

      map[tableNum] = infoObj;
      if (norm) map[norm] = infoObj;
    }

    return map;
  }, [tables, activeOrders, waiterRequests, recentBills]);

  // Fast O(1) lookup helper
  const getTableInfo = (tableNum: string) => {
    const raw = String(tableNum).trim();
    const norm = normalizeTableKey(raw);
    return (
      tableInfoMap[raw] ||
      tableInfoMap[norm] ||
      tableInfoMap[`Table ${norm}`] || {
        status: 'AVAILABLE',
        orders: [],
        latestOrder: null,
        hasExplicitBillRequest: false,
        isEligibleForBilling: false,
        matchingBill: undefined,
        lastCompletedBill: undefined,
        totalItems: 0,
        totalAmount: 0,
      }
    );
  };

  // Dual-copy printing tracking state
  const [lastReceiptData, setLastReceiptData] = useState<ThermalReceiptData | null>(null);
  const [printAlert, setPrintAlert] = useState<{ copy1: boolean; copy2: boolean; message: string } | null>(null);
  const [retryingMerchantCopy, setRetryingMerchantCopy] = useState(false);

  // Independent Retry for Merchant Copy without DB or Payment re-triggering
  const handleRetryMerchantCopy = async () => {
    if (!lastReceiptData || retryingMerchantCopy) return;
    setRetryingMerchantCopy(true);
    try {
      const res = await printSingleCopy(lastReceiptData, 'MERCHANT COPY');
      if (res.success) {
        setPrintAlert(null);
        alert('Merchant Copy printed and cut successfully.');
      } else {
        alert('Failed to print Merchant Copy: ' + res.message);
      }
    } catch (err: any) {
      alert('Error printing Merchant Copy: ' + (err.message || 'Unknown error'));
    } finally {
      setRetryingMerchantCopy(false);
    }
  };

  // Direct Print Receipt (Both Copies: Customer -> Feed/Cut -> Merchant -> Feed/Cut)
  const handleReprintBill = async (bill: Bill) => {
    try {
      const order = typeof bill.orderId === 'object' ? (bill.orderId as any) : null;
      const receiptData: ThermalReceiptData = {
        restaurantName: restaurant?.name || 'CafeFlow Restaurant',
        restaurantAddress: (bill.restaurantId as any)?.address || restaurant?.address || '',
        restaurantContact: (bill.restaurantId as any)?.contact || restaurant?.contact || '',
        gstNumber: (bill.restaurantId as any)?.gstNumber || restaurant?.gstNumber || '',
        billNumber: bill.billNumber || 'INV-REPRINT',
        date: bill.createdAt || new Date().toISOString(),
        tableNumber: bill.tableNumber || order?.tableNumber || selectedTableNum || '1',
        customerName: order?.customerName || 'Guest',
        customerPhone: order?.phoneNumber || '',
        items: (order?.items || []).map((i: any) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          customizations: i.customizations,
          specialInstructions: i.specialInstructions,
        })),
        subtotal: bill.subtotal || order?.subtotal || 0,
        tax: bill.tax || order?.tax || 0,
        taxRate: (bill as any)?.taxRate !== undefined && (bill as any)?.taxRate !== null ? Number((bill as any).taxRate) : (restaurant?.taxRate !== undefined && restaurant?.taxRate !== null ? Number(restaurant.taxRate) : 5),
        totalAmount: bill.totalAmount || order?.totalAmount || 0,
        paymentStatus: bill.paymentStatus || 'paid',
        paymentMethod: bill.paymentMethod || 'cash',
      };
      
      setLastReceiptData(receiptData);
      const dualResult = await printDualThermalReceipt(receiptData);
      setPrintAlert({
        copy1: dualResult.copy1Success,
        copy2: dualResult.copy2Success,
        message: dualResult.message,
      });
    } catch (err: any) {
      alert('Failed to reprint receipt copies: ' + (err.message || 'Unknown error'));
    }
  };

  // Handle Admin COMPLETE & PRINT BILL / APPROVE PAYMENT & PRINT BILL
  const handleAdminCompleteAndPrint = async (order: Order) => {
    // Double-click / Idempotency protection
    if (completingTable) return;
    setCompletingTable(true);
    setPrintAlert(null);

    try {
      const info = selectedTableInfo;
      let billData: any = null;

      let responseOrder: Order | null = null;

      // Scenario B: Customer requested payment (bill is verifying)
      if (info?.matchingBill && info.matchingBill.paymentStatus === 'verifying') {
        const response = await api.post(`/bills/${info.matchingBill._id}/pay/approve`, {
          paymentMethod: info.matchingBill.paymentMethod || 'cash',
        });
        billData = response.data.data;
        responseOrder = response.data.order || (billData?.orderId as any);
      } else {
        // Scenario A: Direct counter payment
        const response = await api.patch(`/orders/${order._id}/status`, {
          status: 'completed',
          paymentMethod: 'cash',
        });
        billData = response.data.bill;
        responseOrder = response.data.data;
      }

      const finalOrder = responseOrder || order;
      const activeItems = finalOrder.items && finalOrder.items.length > 0 ? finalOrder.items : order.items;
      const activeSubtotal = finalOrder.subtotal !== undefined ? finalOrder.subtotal : (billData?.subtotal || order.subtotal || 0);

      const activeTaxRate = billData?.taxRate !== undefined && billData?.taxRate !== null
        ? Number(billData.taxRate)
        : (restaurant?.taxRate !== undefined && restaurant?.taxRate !== null ? Number(restaurant.taxRate) : 5);
      const activeTax = activeTaxRate === 0 ? 0 : (billData?.tax !== undefined ? billData.tax : (finalOrder.tax || order.tax || 0));
      const activeTotal = activeTaxRate === 0 ? activeSubtotal : (billData?.totalAmount || finalOrder.totalAmount || order.totalAmount || 0);

      const receiptData: ThermalReceiptData = {
        restaurantName: restaurant?.name || 'CafeFlow Restaurant',
        restaurantAddress: (billData?.restaurantId as any)?.address || restaurant?.address || '',
        restaurantContact: (billData?.restaurantId as any)?.contact || restaurant?.contact || '',
        gstNumber: (billData?.restaurantId as any)?.gstNumber || restaurant?.gstNumber || '',
        billNumber: billData?.billNumber || 'INV-COMPLETED',
        date: billData?.createdAt || new Date().toISOString(),
        tableNumber: finalOrder.tableNumber || order.tableNumber,
        customerName: finalOrder.customerName || order.customerName,
        customerPhone: finalOrder.phoneNumber || order.phoneNumber,
        items: activeItems.map((i: any) => ({
          name: i.name,
          quantity: i.quantity,
          price: i.price,
          customizations: i.customizations,
          specialInstructions: i.specialInstructions,
        })),
        subtotal: activeSubtotal,
        tax: activeTax,
        taxRate: activeTaxRate,
        totalAmount: activeTotal,
        paymentStatus: billData?.paymentStatus || 'paid',
        paymentMethod: billData?.paymentMethod || 'cash',
      };

      setLastReceiptData(receiptData);

      // Trigger sequential dual-copy thermal printing: COPY 1 -> FEED & CUT -> COPY 2 -> FEED & CUT
      try {
        const dualResult = await printDualThermalReceipt(receiptData);
        setPrintAlert({
          copy1: dualResult.copy1Success,
          copy2: dualResult.copy2Success,
          message: dualResult.message,
        });
      } catch (printErr: any) {
        console.error('Dual thermal print error:', printErr);
        setPrintAlert({
          copy1: false,
          copy2: false,
          message: 'Printer error: ' + (printErr.message || 'Unknown printer error'),
        });
      }

      // Instantly remove ALL active orders for this table from activeOrders state
      const completedTableKey = normalizeTableKey(finalOrder.tableNumber || order.tableNumber);
      setActiveOrders((prev) =>
        prev.filter((o) => normalizeTableKey(o.tableNumber) !== completedTableKey)
      );
      if (info?.matchingBill) {
        const billIdStr = String(info.matchingBill._id);
        setRecentBills((prev) => prev.filter((b) => String(b._id) !== billIdStr));
      }
      setWaiterRequests((prev) => prev.filter((r) => r.tableNumber !== order.tableNumber || r.type !== 'request_bill'));

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
  const billRequestedCount = tableDataList.filter((td) => td.info.status === 'BILL_REQUESTED' || td.info.status === 'SERVED').length;
  const activeCount = tableDataList.filter((td) => td.info.status === 'ACTIVE').length;
  const availableCount = tableDataList.filter((td) => td.info.status === 'AVAILABLE').length;

  // Sort: Status priority first (BILL_REQUESTED -> SERVED -> ACTIVE -> AVAILABLE), then natural numerical table order
  const sortedTableDataList = useMemo(() => {
    return [...tableDataList].sort((a, b) => {
      const priority: Record<'BILL_REQUESTED' | 'SERVED' | 'ACTIVE' | 'AVAILABLE', number> = {
        BILL_REQUESTED: 0,
        SERVED: 1,
        ACTIVE: 2,
        AVAILABLE: 3,
      };
      const prioDiff = priority[a.info.status] - priority[b.info.status];
      if (prioDiff !== 0) {
        return prioDiff;
      }
      return compareTableNumbers(a.table.tableNumber, b.table.tableNumber);
    });
  }, [tables, activeOrders, waiterRequests, recentBills]);

  const selectedTableInfo = selectedTableNum ? getTableInfo(selectedTableNum) : null;

  return (
    <div className="space-y-6">
      {/* Header Panel */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="font-serif font-black text-2xl tracking-tight">Table Operations & Billing</h2>
          <p className="text-xs text-muted-foreground">Monitor real-time table dining activity, take manual orders, and execute final bill printing.</p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() => openManualOrderModal()}
            className="bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-bold shadow-md cursor-pointer gap-1.5 px-3.5 py-2 h-auto"
          >
            <Plus className="w-4 h-4" /> Take Order (POS)
          </Button>

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
              onClick={() => setActiveTab('manage')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                activeTab === 'manage'
                  ? 'bg-primary text-primary-foreground shadow-md'
                  : 'text-muted-foreground hover:bg-secondary'
              }`}
            >
              <QrCode className="w-4 h-4" /> Manage QR Tables
            </button>
          </div>
        </div>
      </div>

      {/* Dual-Copy Print Status & Retry Alert Notification */}
      {printAlert && (
        <div className={`p-4 rounded-xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-semibold ${
          printAlert.copy1 && printAlert.copy2
            ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-700 dark:text-emerald-300'
            : 'bg-amber-500/10 border-amber-500/40 text-amber-800 dark:text-amber-300'
        }`}>
          <div className="flex items-center gap-2">
            {printAlert.copy1 && printAlert.copy2 ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
            )}
            <div>
              <p className="font-bold">{printAlert.message}</p>
              <p className="text-[11px] opacity-80 mt-0.5">
                Copy 1 (Customer): {printAlert.copy1 ? 'Printed & Cut' : 'Failed'} | Copy 2 (Merchant): {printAlert.copy2 ? 'Printed & Cut' : 'Failed'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {!printAlert.copy2 && printAlert.copy1 && lastReceiptData && (
              <Button
                onClick={handleRetryMerchantCopy}
                disabled={retryingMerchantCopy}
                size="sm"
                className="bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs cursor-pointer gap-1"
              >
                {retryingMerchantCopy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
                Retry Merchant Copy
              </Button>
            )}
            <Button
              onClick={() => setPrintAlert(null)}
              variant="ghost"
              size="sm"
              className="text-xs cursor-pointer"
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

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
                        info.status === 'BILL_REQUESTED'
                          ? 'bg-amber-500 animate-pulse'
                          : info.status === 'SERVED'
                          ? 'bg-emerald-500'
                          : isActive
                          ? 'bg-blue-500'
                          : 'bg-stone-300 dark:bg-stone-700'
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
                            info.status === 'BILL_REQUESTED'
                              ? 'danger'
                              : info.status === 'SERVED'
                              ? 'success'
                              : isActive
                              ? 'default'
                              : 'secondary'
                          }
                          className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1"
                        >
                          {info.status === 'BILL_REQUESTED' ? (
                            <>
                              <AlertTriangle className="w-3 h-3 text-amber-600" /> BILL REQUESTED
                            </>
                          ) : info.status === 'SERVED' ? (
                            <>
                              <CheckCircle2 className="w-3 h-3" /> SERVED / READY FOR BILLING
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
                      {info.isEligibleForBilling || isActive ? (
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
                            <span className="text-primary text-base">{formatCurrency(info.totalAmount)}</span>
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
                      {info.isEligibleForBilling ? (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => setSelectedTableNum(table.tableNumber)}
                            className={`flex-1 text-xs font-bold shadow-md cursor-pointer gap-1.5 ${
                              info.status === 'BILL_REQUESTED'
                                ? 'bg-amber-600 hover:bg-amber-700 text-white shadow-amber-500/20'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                            }`}
                          >
                            <Receipt className="w-4 h-4" /> View & Complete Bill
                          </Button>
                          <Button
                            onClick={() => openManualOrderModal(table.tableNumber)}
                            variant="outline"
                            className="px-3 text-xs font-bold cursor-pointer gap-1"
                            title="Add more items to this table"
                          >
                            <Plus className="w-4 h-4" /> Add
                          </Button>
                        </div>
                      ) : isActive ? (
                        <div className="flex gap-2">
                          <Button
                            onClick={() => setSelectedTableNum(table.tableNumber)}
                            variant="outline"
                            className="flex-1 text-xs font-bold cursor-pointer gap-1.5"
                          >
                            <ShoppingBag className="w-4 h-4" /> View Details
                          </Button>
                          <Button
                            onClick={() => openManualOrderModal(table.tableNumber)}
                            variant="secondary"
                            className="px-3 text-xs font-bold cursor-pointer gap-1 text-primary hover:bg-secondary"
                            title="Add more items to this table"
                          >
                            <Plus className="w-4 h-4" /> Add Items
                          </Button>
                        </div>
                      ) : (
                        <Button
                          onClick={() => openManualOrderModal(table.tableNumber)}
                          className="w-full text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-md cursor-pointer gap-1.5"
                        >
                          <Plus className="w-4 h-4" /> Take Order
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
                {[...tables].sort((a, b) => compareTableNumbers(a.tableNumber, b.tableNumber)).map((table) => (
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
                <span className="text-xs font-bold text-muted-foreground">Table Operational Status:</span>
                <Badge
                  variant={
                    selectedTableInfo.status === 'BILL_REQUESTED'
                      ? 'danger'
                      : selectedTableInfo.status === 'SERVED'
                      ? 'success'
                      : selectedTableInfo.status === 'ACTIVE'
                      ? 'default'
                      : 'secondary'
                  }
                  className="font-bold uppercase tracking-wider text-xs"
                >
                  {selectedTableInfo.status === 'BILL_REQUESTED'
                    ? '⚠️ BILL REQUESTED'
                    : selectedTableInfo.status === 'SERVED'
                    ? '✅ SERVED / READY FOR BILLING'
                    : selectedTableInfo.status === 'ACTIVE'
                    ? '🟢 ACTIVE DINING SESSION'
                    : 'TABLE AVAILABLE'}
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
                          <span className="text-primary font-extrabold">Rs. {ord.totalAmount.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4 py-4">
                  <div className="p-6 bg-secondary/30 rounded-2xl border border-border/60 text-center space-y-3">
                    <ShoppingBag className="w-10 h-10 text-muted-foreground/40 mx-auto" />
                    <div>
                      <h4 className="font-serif font-black text-sm text-foreground">
                        Table {selectedTableNum} has no active orders
                      </h4>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        This table is available and ready for a new dining party.
                      </p>
                    </div>

                    <Button
                      onClick={() => {
                        const tNum = selectedTableNum;
                        setSelectedTableNum(null);
                        openManualOrderModal(tNum || undefined);
                      }}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-xs gap-1.5 cursor-pointer shadow-md"
                    >
                      <Plus className="w-4 h-4" /> Take New Order (POS)
                    </Button>
                  </div>

                  {/* Last Completed Bill Reprint option if available */}
                  {selectedTableInfo.lastCompletedBill && (
                    <div className="p-4 bg-secondary/20 rounded-xl border border-border/50 flex items-center justify-between gap-3 text-xs">
                      <div>
                        <span className="font-bold text-foreground block">
                          Last Bill: #{selectedTableInfo.lastCompletedBill.billNumber}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          Paid: {formatCurrency(selectedTableInfo.lastCompletedBill.totalAmount)}
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleReprintBill(selectedTableInfo.lastCompletedBill!)}
                        className="font-bold gap-1 cursor-pointer text-xs"
                      >
                        <Printer className="w-3.5 h-3.5" /> Reprint Receipt
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Modal Footer Actions */}
            <div className="p-4 border-t border-border flex items-center justify-between gap-3 bg-secondary/10">
              {selectedTableInfo.orders.length > 0 ? (
                <>
                  <Button
                    variant="outline"
                    onClick={() => {
                      const tNum = selectedTableNum;
                      setSelectedTableNum(null);
                      openManualOrderModal(tNum || undefined);
                    }}
                    className="cursor-pointer font-bold gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                  >
                    <Plus className="w-4 h-4" /> Add More Items
                  </Button>

                  <div className="flex items-center gap-3">
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
                            <Printer className="w-4 h-4" />{' '}
                            {selectedTableInfo.matchingBill?.paymentStatus === 'verifying'
                              ? 'APPROVE PAYMENT & PRINT BILL'
                              : 'COMPLETE & PRINT BILL'}
                          </>
                        )}
                      </Button>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-end w-full gap-2">
                  <Button variant="outline" onClick={() => setSelectedTableNum(null)} className="cursor-pointer font-bold">
                    Close
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* POS MANUAL ORDER MODAL */}
      {isManualOrderOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
          <div className="bg-card text-card-foreground w-full max-w-5xl rounded-2xl border border-border shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-fade-in">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-border flex items-center justify-between bg-secondary/20">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-xl bg-primary/10 text-primary">
                  <Utensils className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-serif font-black text-lg sm:text-xl text-foreground flex items-center gap-2">
                    Take Manual Order (POS)
                  </h3>
                  <span className="text-xs text-muted-foreground">
                    Punch in food & drink orders directly for dine-in tables
                  </span>
                </div>
              </div>
              <button
                onClick={() => setIsManualOrderOpen(false)}
                className="p-1.5 rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body: 2 Columns (Left: Dish Browser, Right: Cart & Customer Info) */}
            <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 min-h-0">
              {/* Left Column: Menu Dish Browser (7 cols) */}
              <div className="lg:col-span-7 p-4 sm:p-5 overflow-y-auto space-y-4 border-b lg:border-b-0 lg:border-r border-border">
                {/* Search & Filter Bar */}
                <div className="space-y-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
                    <input
                      type="text"
                      value={dishSearchQuery}
                      onChange={(e) => setDishSearchQuery(e.target.value)}
                      placeholder="Search menu dishes by name or keyword..."
                      className="w-full text-xs bg-secondary/40 text-foreground border border-border rounded-xl pl-9 pr-3 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                    />
                  </div>

                  {/* Veg / Non-Veg Toggle & Categories */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs">
                    <div className="flex items-center bg-secondary/50 rounded-lg p-0.5 border border-border/50">
                      <button
                        type="button"
                        onClick={() => setDishVegFilter('all')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer ${
                          dishVegFilter === 'all' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground'
                        }`}
                      >
                        All
                      </button>
                      <button
                        type="button"
                        onClick={() => setDishVegFilter('veg')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          dishVegFilter === 'veg' ? 'bg-emerald-600 text-white shadow-xs' : 'text-emerald-600 dark:text-emerald-400'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block" /> Veg
                      </button>
                      <button
                        type="button"
                        onClick={() => setDishVegFilter('non-veg')}
                        className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          dishVegFilter === 'non-veg' ? 'bg-rose-600 text-white shadow-xs' : 'text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full bg-rose-500 inline-block" /> Non-Veg
                      </button>
                    </div>

                    {/* Category Pills */}
                    <div className="flex items-center gap-1 overflow-x-auto pb-1 max-w-full">
                      {dishCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setDishCategoryFilter(cat)}
                          className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all cursor-pointer border ${
                            dishCategoryFilter === cat
                              ? 'bg-primary text-primary-foreground border-primary'
                              : 'bg-secondary/40 text-muted-foreground border-border/60 hover:bg-secondary'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Dishes Grid */}
                {menuDishesLoading ? (
                  <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                    <Loader2 className="w-7 h-7 animate-spin text-primary mb-2" />
                    <span className="text-xs font-semibold">Loading restaurant menu dishes...</span>
                  </div>
                ) : filteredDishes.length === 0 ? (
                  <div className="text-center py-16 text-muted-foreground space-y-2">
                    <Coffee className="w-9 h-9 text-muted-foreground/30 mx-auto" />
                    <p className="text-xs font-semibold">No dishes found matching your filter.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[48vh] overflow-y-auto pr-1">
                    {filteredDishes.map((dish) => {
                      const hasCustomizations = dish.customizations && dish.customizations.length > 0;

                      return (
                        <div
                          key={dish._id}
                          className="bg-secondary/20 hover:bg-secondary/40 border border-border/60 rounded-xl p-3 flex flex-col justify-between gap-2.5 transition-all group"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="space-y-1">
                              <div className="flex items-center gap-1.5">
                                <span
                                  className={`w-2 h-2 rounded-full shrink-0 ${
                                    dish.veg ? 'bg-emerald-500' : 'bg-rose-500'
                                  }`}
                                  title={dish.veg ? 'Vegetarian' : 'Non-Vegetarian'}
                                />
                                <h4 className="font-bold text-xs text-foreground line-clamp-1">{dish.name}</h4>
                              </div>
                              {dish.description && (
                                <p className="text-[10px] text-muted-foreground line-clamp-1">{dish.description}</p>
                              )}
                              <span className="text-[10px] text-primary/80 font-semibold bg-primary/10 px-1.5 py-0.5 rounded">
                                {dish.category}
                              </span>
                            </div>

                            <span className="font-extrabold text-xs text-foreground whitespace-nowrap">
                              {formatCurrency(dish.price)}
                            </span>
                          </div>

                          <Button
                            type="button"
                            size="sm"
                            onClick={() => {
                              if (hasCustomizations) {
                                setCustomizingDish(dish);
                                const defaultCusts: Record<string, { option: string; extraPrice: number }> = {};
                                dish.customizations?.forEach((grp) => {
                                  if (grp.options.length > 0) {
                                    defaultCusts[grp.name] = {
                                      option: grp.options[0].name,
                                      extraPrice: grp.options[0].extraPrice || 0,
                                    };
                                  }
                                });
                                setSelectedCustomizations(defaultCusts);
                                setCustomizingInstructions('');
                              } else {
                                handleAddItemToManualCart(dish);
                              }
                            }}
                            className="w-full text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer h-8 gap-1 shadow-xs"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            {hasCustomizations ? 'Customize & Add' : 'Add to Order'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Right Column: Order Configuration & Live Cart (5 cols) */}
              <div className="lg:col-span-5 p-4 sm:p-5 flex flex-col justify-between overflow-y-auto space-y-4 bg-secondary/10">
                {/* Table & Customer Setup */}
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1 uppercase tracking-wide">
                        Dining Table *
                      </label>
                      <select
                        value={manualOrderTable}
                        onChange={(e) => setManualOrderTable(e.target.value)}
                        className="w-full text-xs bg-background text-foreground border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary font-bold transition-all"
                      >
                        {tables.map((t) => (
                          <option key={t._id} value={t.tableNumber}>
                            Table {t.tableNumber}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[11px] font-bold text-muted-foreground mb-1 uppercase tracking-wide">
                        Guest Name
                      </label>
                      <input
                        type="text"
                        value={manualCustomerName}
                        onChange={(e) => setManualCustomerName(e.target.value)}
                        placeholder="e.g. Rahul / Walk-in"
                        className="w-full text-xs bg-background text-foreground border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-muted-foreground mb-1 uppercase tracking-wide">
                      Phone Number (Optional)
                    </label>
                    <input
                      type="tel"
                      value={manualCustomerPhone}
                      onChange={(e) => setManualCustomerPhone(e.target.value)}
                      placeholder="10-digit mobile number"
                      maxLength={10}
                      className="w-full text-xs bg-background text-foreground border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary transition-all"
                    />
                  </div>
                </div>

                {/* Selected Order Items List */}
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between border-b border-border/50 pb-2">
                    <span className="text-xs font-black uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-primary" /> Order Items ({manualCartItems.reduce((sum, i) => sum + i.quantity, 0)})
                    </span>
                    {manualCartItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setManualCartItems([])}
                        className="text-[10px] text-destructive hover:underline font-bold cursor-pointer"
                      >
                        Clear All
                      </button>
                    )}
                  </div>

                  {manualCartItems.length === 0 ? (
                    <div className="py-10 text-center text-muted-foreground text-xs space-y-1">
                      <Utensils className="w-6 h-6 text-muted-foreground/30 mx-auto mb-1" />
                      <p className="font-semibold">No items selected yet</p>
                      <p className="text-[10px] opacity-70">Click "+ Add" on any menu dish on the left</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[28vh] overflow-y-auto pr-1 divide-y divide-border/30">
                      {manualCartItems.map((item, idx) => {
                        const extraPrice = item.customizations.reduce((acc, c) => acc + (c.extraPrice || 0), 0);
                        const unitTotal = item.price + extraPrice;
                        const lineTotal = unitTotal * item.quantity;

                        return (
                          <div key={idx} className="pt-2 flex items-start justify-between gap-2 text-xs">
                            <div className="flex-1 space-y-0.5">
                              <div className="flex items-center gap-1 font-bold text-foreground">
                                <span className={`w-1.5 h-1.5 rounded-full ${item.veg ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                <span>{item.name}</span>
                              </div>
                              {item.customizations.length > 0 && (
                                <div className="text-[10px] text-muted-foreground italic">
                                  + {item.customizations.map((c) => `${c.name}: ${c.selectedOption}`).join(', ')}
                                </div>
                              )}
                              {item.specialInstructions && (
                                <div className="text-[10px] text-amber-600 dark:text-amber-400 font-semibold">
                                  * {item.specialInstructions}
                                </div>
                              )}
                              <div className="text-[10px] text-muted-foreground font-semibold">
                                {formatCurrency(unitTotal)} each
                              </div>
                            </div>

                            {/* Qty & Line Total Controls */}
                            <div className="flex items-center gap-2">
                              <div className="flex items-center border border-border rounded-lg bg-background overflow-hidden">
                                <button
                                  type="button"
                                  onClick={() => handleUpdateManualCartQty(idx, -1)}
                                  className="px-2 py-1 hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                                >
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="px-2 text-xs font-bold text-foreground">{item.quantity}</span>
                                <button
                                  type="button"
                                  onClick={() => handleUpdateManualCartQty(idx, 1)}
                                  className="px-2 py-1 hover:bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
                                >
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>

                              <span className="font-black text-xs text-foreground min-w-[55px] text-right">
                                {formatCurrency(lineTotal)}
                              </span>

                              <button
                                type="button"
                                onClick={() => handleRemoveManualCartItem(idx)}
                                className="p-1 text-muted-foreground hover:text-destructive cursor-pointer rounded"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Financial Summary & Actions */}
                <div className="border-t border-border pt-3 space-y-3">
                  <div className="space-y-1 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Subtotal:</span>
                      <span className="font-bold text-foreground">{formatCurrency(manualOrderTotals.subtotal)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Taxes & GST ({manualOrderTotals.taxRate}%):</span>
                      <span className="font-bold text-foreground">{formatCurrency(manualOrderTotals.tax)}</span>
                    </div>
                    <div className="flex justify-between text-sm font-black text-foreground pt-1 border-t border-border/40">
                      <span>Grand Total:</span>
                      <span className="text-primary text-base">{formatCurrency(manualOrderTotals.total)}</span>
                    </div>
                  </div>

                  {manualOrderError && (
                    <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs px-3 py-2 rounded-xl flex items-center gap-1.5">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      <span>{manualOrderError}</span>
                    </div>
                  )}

                  {manualOrderSuccess && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs px-3 py-2 rounded-xl flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 shrink-0" />
                      <span>{manualOrderSuccess}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 pt-1">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setIsManualOrderOpen(false)}
                      className="cursor-pointer font-bold flex-1"
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      disabled={manualOrderLoading || manualCartItems.length === 0}
                      onClick={handleManualOrderSubmit}
                      className="bg-primary hover:bg-primary/90 text-primary-foreground cursor-pointer font-bold flex-[2] gap-1.5 shadow-md shadow-primary/20"
                    >
                      {manualOrderLoading ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" /> Placing Order...
                        </>
                      ) : (
                        <>
                          <Check className="w-4 h-4" /> Send Order to Kitchen
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* DISH CUSTOMIZATION SUB-MODAL */}
      {customizingDish && (
        <div className="fixed inset-0 z-60 bg-stone-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground w-full max-w-md rounded-2xl border border-border shadow-2xl overflow-hidden p-5 space-y-4 animate-scale-in">
            <div className="flex justify-between items-start border-b border-border/50 pb-3">
              <div>
                <h4 className="font-serif font-black text-base text-foreground">{customizingDish.name}</h4>
                <span className="text-xs font-bold text-primary">{formatCurrency(customizingDish.price)} Base Price</span>
              </div>
              <button
                onClick={() => setCustomizingDish(null)}
                className="p-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Customization Options */}
            <div className="space-y-4 max-h-[50vh] overflow-y-auto pr-1">
              {customizingDish.customizations?.map((grp, gIdx) => (
                <div key={gIdx} className="space-y-2 border border-border/50 rounded-xl p-3 bg-secondary/20">
                  <span className="text-xs font-bold text-foreground block">{grp.name}</span>
                  <div className="space-y-1.5">
                    {grp.options.map((opt, oIdx) => {
                      const isSelected = selectedCustomizations[grp.name]?.option === opt.name;

                      return (
                        <label
                          key={oIdx}
                          onClick={() => {
                            setSelectedCustomizations((prev) => ({
                              ...prev,
                              [grp.name]: { option: opt.name, extraPrice: opt.extraPrice || 0 },
                            }));
                          }}
                          className={`flex items-center justify-between p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                            isSelected
                              ? 'border-primary bg-primary/10 text-primary font-bold'
                              : 'border-border/40 hover:bg-secondary/50 text-foreground'
                          }`}
                        >
                          <span>{opt.name}</span>
                          <span className="text-[11px] font-semibold opacity-80">
                            {opt.extraPrice > 0 ? `+${formatCurrency(opt.extraPrice)}` : 'Free'}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Special Note */}
              <div>
                <label className="block text-[11px] font-bold text-muted-foreground mb-1 uppercase tracking-wide">
                  Special Kitchen Note
                </label>
                <input
                  type="text"
                  value={customizingInstructions}
                  onChange={(e) => setCustomizingInstructions(e.target.value)}
                  placeholder="e.g. Extra hot, crisp, less oil"
                  className="w-full text-xs bg-secondary/30 text-foreground border border-border rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-primary transition-all"
                />
              </div>
            </div>

            {/* Customization Footer */}
            <div className="flex items-center justify-end gap-2 border-t border-border/50 pt-3">
              <Button variant="outline" size="sm" onClick={() => setCustomizingDish(null)} className="cursor-pointer font-bold">
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={() => {
                  const custArray = Object.keys(selectedCustomizations).map((grpName) => {
                    const item = selectedCustomizations[grpName];
                    return {
                      name: grpName,
                      selectedOption: item.option,
                      extraPrice: item.extraPrice,
                    };
                  });
                  handleAddItemToManualCart(customizingDish, custArray, customizingInstructions.trim());
                  setCustomizingDish(null);
                }}
                className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold cursor-pointer"
              >
                Add to Cart
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

