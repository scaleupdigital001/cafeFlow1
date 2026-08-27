'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCartStore, CartCustomization } from '../../../../store/cartStore';
import api from '../../../../lib/axios';
import { getBackendBillUrl } from '../../../../lib/config';
import { Button } from '../../../../components/ui/button';
import { Badge } from '../../../../components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '../../../../components/ui/card';
import ThemeToggle from '../../../../components/ThemeToggle';
import Link from 'next/link';
import useSocket from '../../../../hooks/useSocket';
import { 
  Loader2, ShoppingBag, Search, Plus, Minus, X, Check, Coffee, 
  Trash2, Phone, User, ShieldCheck, ChevronRight, MessageSquare, Bell,
  BookOpen, Home, Receipt, Coins, Store, MapPin, Clock, Star, Printer, QrCode, Copy, AlertCircle, Award, Download, Smartphone, CheckCircle2, Sparkles
} from 'lucide-react';

interface CustomizationOption {
  name: string;
  extraPrice: number;
}

interface CustomizationGroup {
  name: string;
  type: 'single' | 'multiple';
  options: CustomizationOption[];
}

interface Dish {
  _id: string;
  name: string;
  description?: string;
  image?: string;
  category: string;
  price: number;
  veg: boolean;
  available: boolean;
  customizations: CustomizationGroup[];
}

interface Restaurant {
  _id: string;
  name: string;
  slug: string;
  logo?: string;
  address?: string;
  contact?: string;
  taxRate: number;
}

export default function CustomerMenuPage() {
  const params = useParams();
  const router = useRouter();
  const slug = params.slug as string;

  // Zustand Cart Store
  const cartItems = useCartStore((state) => state.items);
  const cartRestaurantId = useCartStore((state) => state.restaurantId);
  const cartTableNumber = useCartStore((state) => state.tableNumber);
  const cartTaxRate = useCartStore((state) => state.taxRate);
  const setTableContext = useCartStore((state) => state.setTableContext);
  const addItem = useCartStore((state) => state.addItem);
  const removeItem = useCartStore((state) => state.removeItem);
  const updateQuantity = useCartStore((state) => state.updateQuantity);
  const clearCart = useCartStore((state) => state.clearCart);
  const { subtotal, tax, total } = useCartStore((state) => state.getTotals)();

  // Component States
  const [restaurant, setRestaurant] = useState<Restaurant | null>(null);
  const [dishes, setDishes] = useState<Dish[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filter States
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [vegOnly, setVegOnly] = useState(false);

  // Cart Drawer & Modals
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [customizationDish, setCustomizationDish] = useState<Dish | null>(null);
  
  // Customization selection state
  const [selectedCustomizations, setSelectedCustomizations] = useState<CartCustomization[]>([]);
  const [specialInstructions, setSpecialInstructions] = useState('');

  // Checkout / Location Verification State
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [customerName, setCustomerName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('customer_name') || '';
    }
    return '';
  });
  const [phoneNumber, setPhoneNumber] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('customer_phone') || '';
    }
    return '';
  });
  const [otpLoading, setOtpLoading] = useState(false); // Used for order placement loading spinner
  const [checkoutError, setCheckoutError] = useState<string | null>(null);

  // Waiter Assistance States
  const [isWaiterModalOpen, setIsWaiterModalOpen] = useState(false);
  const [waiterRequestLoading, setWaiterRequestLoading] = useState(false);
  const [waiterRequestSuccess, setWaiterRequestSuccess] = useState(false);
  const [waiterRequestType, setWaiterRequestType] = useState<'call_waiter' | 'request_water' | 'request_bill' | 'other'>('call_waiter');

  // Active Order Persistence States
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [activeOrderStatus, setActiveOrderStatus] = useState<string | null>(null);
  const [order, setOrder] = useState<any | null>(null);
  const [bill, setBill] = useState<any | null>(null);
  const billRequested = order?.billRequested === true;

  // Tab Shell States
  const [activeTab, setActiveTab] = useState<'home' | 'menu' | 'orders' | 'bill'>('menu');
  const [copiedUpiId, setCopiedUpiId] = useState(false);
  const [copiedUpiPhone, setCopiedUpiPhone] = useState(false);
  const [showUpiPanel, setShowUpiPanel] = useState(false);
  const [paymentLoading, setPaymentLoading] = useState(false);

  const handleDismissActiveOrderBanner = () => {
    localStorage.removeItem(`active_order_${slug}`);
    setActiveOrderId(null);
    setActiveOrderStatus(null);
  };

  const handleCallWaiterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setWaiterRequestLoading(true);
    try {
      await api.post('/orders/waiter-request', {
        restaurantId: restaurant?._id || cartRestaurantId,
        tableNumber: cartTableNumber || '1',
        type: waiterRequestType,
      });
      setWaiterRequestSuccess(true);
      setTimeout(() => {
        setIsWaiterModalOpen(false);
        setWaiterRequestSuccess(false);
      }, 2000);
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to submit service request.');
    } finally {
      setWaiterRequestLoading(false);
    }
  };

  // Categories List
  const categories = ['All', 'Coffee', 'Tea', 'Mocktails', 'Snacks', 'Breakfast', 'Lunch', 'Dinner', 'Desserts'];

  // Check for active order in localStorage on mount
  useEffect(() => {
    const storedOrderId = localStorage.getItem(`active_order_${slug}`);
    if (storedOrderId) {
      const checkOrderStatus = async () => {
        try {
          const res = await api.get(`/orders/${storedOrderId}`);
          const orderData = res.data.data;
          if (orderData.status === 'cancelled') {
            localStorage.removeItem(`active_order_${slug}`);
          } else {
            setActiveOrderId(storedOrderId);
            setActiveOrderStatus(orderData.status);
            setOrder(orderData);
            
            // Check if bill exists
            if (orderData.status === 'completed') {
              try {
                const billRes = await api.get(`/bills/order/${storedOrderId}`);
                if (billRes.data.success) {
                  setBill(billRes.data.data);
                }
              } catch (bErr) {
                console.log('Bill not generated yet');
              }
            }
          }
        } catch (e) {
          console.error('Failed to check active order status:', e);
          localStorage.removeItem(`active_order_${slug}`);
        }
      };
      checkOrderStatus();
    }
  }, [slug]);

  // Connect to socket when activeOrderId is available
  const socket = useSocket('order', activeOrderId);

  // Hook socket triggers for real time state updates
  useEffect(() => {
    if (!socket || !activeOrderId) return;

    socket.on('order_status_updated', (updatedOrder: any) => {
      console.log('[Socket] Order status updated:', updatedOrder.status);
      setActiveOrderStatus(updatedOrder.status);
      setOrder(updatedOrder);

      if (updatedOrder.status === 'completed') {
        api.get(`/bills/order/${activeOrderId}`)
          .then((res) => {
            if (res.data.success) setBill(res.data.data);
          })
          .catch((err) => console.log('Bill generation in progress...'));
      }
    });

    socket.on('bill_ready', (billRecord: any) => {
      console.log('[Socket] Invoice generated:', billRecord.billNumber);
      setBill(billRecord);
    });

    socket.on('bill_status_updated', (updatedBill: any) => {
      console.log('[Socket] Bill status updated:', updatedBill.paymentStatus);
      setBill(updatedBill);
    });

    return () => {
      socket.off('order_status_updated');
      socket.off('bill_ready');
      socket.off('bill_status_updated');
    };
  }, [socket, activeOrderId]);

  const getUpiUrl = (): string => {
    if (!bill) return '';
    const upiSettings = bill.restaurantId?.paymentSettings;
    if (!upiSettings?.upiId && !upiSettings?.upiPhone) return '';

    let payeeAddress = '';
    if (upiSettings.upiId) {
      payeeAddress = upiSettings.upiId;
    } else if (upiSettings.upiPhone) {
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
    if (!bill) return;
    setPaymentLoading(true);

    try {
      // Notify backend we are attempting UPI
      await api.post(`/bills/${bill._id}/pay/upi-intent`, {
        tableNumber: cartTableNumber || 'N/A'
      });

      // Try to open deep link directly
      const upiUrl = getUpiUrl();
      if (upiUrl) {
        window.location.href = upiUrl;
      }

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

  const handleCashPayClick = async () => {
    if (!bill) return;
    setPaymentLoading(true);

    try {
      // Notify backend we want to pay via cash
      await api.post(`/bills/${bill._id}/pay/cash-intent`, {
        tableNumber: cartTableNumber || 'N/A'
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

  // Load Dishes & Restaurant Tenant details
  useEffect(() => {
    if (!slug) return;

    const loadMenu = async () => {
      try {
        const tenantRes = await api.get(`/restaurants/slug/${slug}`);
        const restData = tenantRes.data.data;
        setRestaurant(restData);

        const dishesRes = await api.get(`/dishes/slug/${slug}`);
        setDishes(dishesRes.data.data);

        // If table parameters are not initialized (direct web URL access), default to mock Table 1
        if (!cartTableNumber || cartRestaurantId !== restData._id) {
          setTableContext(restData._id, '1', restData.taxRate || 5);
        }
      } catch (err: any) {
        console.error('Menu load error:', err);
        setErrorMsg('Failed to load menu. Please check the URL.');
      } finally {
        setLoading(false);
      }
    };

    loadMenu();
  }, [slug, cartTableNumber, cartRestaurantId, setTableContext]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-50 dark:bg-stone-950">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (errorMsg || !restaurant) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-stone-50 dark:bg-stone-950 p-6 text-center">
        <h2 className="font-serif text-xl font-bold mb-2">Error</h2>
        <p className="text-muted-foreground">{errorMsg || 'Restaurant not found'}</p>
      </div>
    );
  }

  // Handle Add to Cart action
  const handleAddToCartClick = (dish: Dish) => {
    if (dish.customizations && dish.customizations.length > 0) {
      // Setup initial defaults for customizations
      const initialCusts: CartCustomization[] = [];
      dish.customizations.forEach((group) => {
        if (group.type === 'single' && group.options.length > 0) {
          initialCusts.push({
            name: group.name,
            selectedOption: group.options[0].name,
            extraPrice: group.options[0].extraPrice,
          });
        }
      });
      setSelectedCustomizations(initialCusts);
      setSpecialInstructions('');
      setCustomizationDish(dish);
    } else {
      // Add immediately if no customizations required
      addItem({
        dishId: dish._id,
        name: dish.name,
        price: dish.price,
        veg: dish.veg,
        category: dish.category,
        customizations: [],
        specialInstructions: '',
        image: dish.image,
      });
    }
  };

  // Toggle single customization (Radio behavior)
  const handleSingleCustSelect = (groupName: string, option: CustomizationOption) => {
    setSelectedCustomizations((prev) => {
      const filtered = prev.filter((c) => c.name !== groupName);
      return [
        ...filtered,
        { name: groupName, selectedOption: option.name, extraPrice: option.extraPrice },
      ];
    });
  };

  // Toggle multiple customizations (Checkbox behavior)
  const handleMultipleCustSelect = (groupName: string, option: CustomizationOption) => {
    setSelectedCustomizations((prev) => {
      const exists = prev.find((c) => c.name === groupName && c.selectedOption === option.name);
      if (exists) {
        return prev.filter((c) => !(c.name === groupName && c.selectedOption === option.name));
      } else {
        return [
          ...prev,
          { name: groupName, selectedOption: option.name, extraPrice: option.extraPrice },
        ];
      }
    });
  };

  // Confirm custom configurations and add to store
  const handleConfirmCustomizations = () => {
    if (!customizationDish) return;
    addItem({
      dishId: customizationDish._id,
      name: customizationDish.name,
      price: customizationDish.price,
      veg: customizationDish.veg,
      category: customizationDish.category,
      customizations: selectedCustomizations,
      specialInstructions,
      image: customizationDish.image,
    });
    setCustomizationDish(null);
  };

  // Compute live customization total preview
  const getCustomizationPreviewTotal = (): number => {
    if (!customizationDish) return 0;
    const extra = selectedCustomizations.reduce((acc, c) => acc + c.extraPrice, 0);
    return customizationDish.price + extra;
  };

  // Place order directly with optional geofencing check
  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setCheckoutError(null);
    setOtpLoading(true);

    if (!customerName || !phoneNumber) {
      setCheckoutError('Please enter your name and phone number.');
      setOtpLoading(false);
      return;
    }

    const cleanedPhone = phoneNumber.replace(/\D/g, '');
    if (cleanedPhone.length !== 10) {
      setCheckoutError('Mobile number must be exactly 10 digits.');
      setOtpLoading(false);
      return;
    }

    const placeOrderWithCoords = async (latitude?: number, longitude?: number) => {
      try {
        const orderData = {
          restaurantId: restaurant._id,
          customerName,
          phoneNumber: cleanedPhone,
          tableNumber: cartTableNumber || '1',
          items: cartItems.map((item) => ({
            dishId: item.dishId,
            name: item.name,
            price: item.price,
            quantity: item.quantity,
            customizations: item.customizations,
            specialInstructions: item.specialInstructions,
          })),
          latitude,
          longitude,
        };

        const orderResponse = await api.post('/orders', orderData);
        const newOrder = orderResponse.data.data;

        // Reset state
        clearCart();
        setIsCheckoutOpen(false);
        setIsCartOpen(false);

        // Store active order ID in localStorage for tracking persistence
        localStorage.setItem(`active_order_${slug}`, newOrder._id);
        localStorage.setItem('customer_name', customerName);
        localStorage.setItem('customer_phone', cleanedPhone);
        setActiveOrderId(newOrder._id);
        setActiveOrderStatus(newOrder.status);
        setOrder(newOrder);
        setBill(null);

        // Switch to tracker tab
        setActiveTab('orders');
      } catch (err: any) {
        console.error('[Order Placement Failed]:', err.response?.data || err.message);
        setCheckoutError(err.response?.data?.message || 'Failed to place order. Please try again.');
      } finally {
        setOtpLoading(false);
      }
    };

    // Attempt to request geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          placeOrderWithCoords(position.coords.latitude, position.coords.longitude);
        },
        (error) => {
          console.warn('[Geolocation Error]: Failed to get location:', error.message);
          // Proceed to place order; the backend handles checking if geofencing is mandatory
          placeOrderWithCoords();
        },
        { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
      );
    } else {
      console.warn('[Geolocation API]: Not supported in browser.');
      placeOrderWithCoords();
    }
  };

  const handleAppendToOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOrderId) return;
    setCheckoutError(null);
    setOtpLoading(true);

    try {
      const orderData = {
        items: cartItems.map((item) => ({
          dishId: item.dishId,
          name: item.name,
          price: item.price,
          quantity: item.quantity,
          customizations: item.customizations,
          specialInstructions: item.specialInstructions,
        })),
      };

      const res = await api.post(`/orders/${activeOrderId}/append`, orderData);
      const updatedOrder = res.data.data;

      // Reset cart and modals
      clearCart();
      setIsCheckoutOpen(false);
      setIsCartOpen(false);

      // Set order state and switch to tracker tab
      setActiveOrderId(updatedOrder._id);
      setActiveOrderStatus(updatedOrder.status);
      setOrder(updatedOrder);
      setActiveTab('orders');
    } catch (err: any) {
      console.error('[Append Order Failed]:', err.response?.data || err.message);
      setCheckoutError(err.response?.data?.message || 'Failed to add items to order. Please try again.');
    } finally {
      setOtpLoading(false);
    }
  };

  // Dynamic subviews for the persistent tabbed interface
  const renderHomeTab = () => {
    if (!restaurant) return null;
    return (
      <main className="max-w-xl mx-auto px-4 py-6 space-y-6 animate-fade-in pb-20">
        {/* Cover photo */}
        <div className="h-44 rounded-3xl overflow-hidden relative shadow-md">
          <img
            src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=800&auto=format&fit=crop"
            alt={restaurant.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-stone-900/60 to-transparent" />
          <div className="absolute bottom-4 left-4 text-white">
            <h3 className="font-serif font-black text-xl">{restaurant.name}</h3>
            <p className="text-xs font-light text-stone-200">Contactless QR Dine-in Table {cartTableNumber || '1'}</p>
          </div>
        </div>

        {/* Cafe Profile Card */}
        <Card className="border border-border/60 shadow p-5 space-y-4">
          <h4 className="text-sm font-bold uppercase tracking-wider text-primary">Cafe Profile</h4>
          
          <div className="grid grid-cols-1 gap-4 text-xs">
            <div className="flex items-start gap-3">
              <MapPin className="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-foreground">Address</h5>
                <p className="text-muted-foreground mt-0.5 leading-relaxed">{restaurant.address || 'Address not configured.'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Phone className="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-foreground">Contact & Support</h5>
                <p className="text-muted-foreground mt-0.5">{restaurant.contact || 'No phone number.'}</p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <Clock className="w-4.5 h-4.5 text-primary shrink-0 mt-0.5" />
              <div>
                <h5 className="font-bold text-foreground">Operational Hours</h5>
                <p className="text-muted-foreground mt-0.5">Mon - Sun: 8:00 AM - 10:30 PM</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Story details */}
        <Card className="border border-border/60 shadow p-5 space-y-3">
          <h4 className="text-sm font-bold uppercase tracking-wider text-primary">About Us</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">
            Welcome to {restaurant.name}! We prepare our food with high-altitude artisanal organic ingredients sourced locally. 
            Enjoy seamless zero-wait service directly at your table. Simply add items to your cart, place orders, and pay online or in cash when you checkout.
          </p>
        </Card>

        {/* Map Placeholder */}
        <div className="h-40 bg-secondary/60 rounded-3xl relative overflow-hidden shadow border border-border/50 flex flex-col items-center justify-center text-center p-4">
          <MapPin className="w-7 h-7 text-primary animate-bounce mb-1" />
          <h4 className="font-bold text-foreground text-xs">Table Service Active</h4>
          <p className="text-[10px] text-muted-foreground max-w-xs">{restaurant.address}</p>
        </div>
      </main>
    );
  };

  const renderOrdersTab = () => {
    if (!activeOrderId || !order) {
      return (
        <main className="max-w-xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center space-y-4 pb-20">
          <div className="w-16 h-16 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground">
            <Coffee className="w-8 h-8" />
          </div>
          <h3 className="font-serif font-bold text-lg text-foreground">No active orders</h3>
          <p className="text-xs text-muted-foreground max-w-xs">
            You haven't ordered anything yet in this session. Go to the menu tab to choose your items!
          </p>
          <Button
            onClick={() => setActiveTab('menu')}
            className="text-xs font-bold bg-primary hover:bg-primary/95 text-white"
          >
            Open Menu Tab
          </Button>
        </main>
      );
    }

    const getStatusPhase = (status: string): number => {
      switch (status) {
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

    const currentPhase = getStatusPhase(order.status);
    const milestones = [
      { label: 'Received', icon: Sparkles },
      { label: 'Accepted', icon: CheckCircle2 },
      { label: 'Served', icon: Coffee },
    ];

    return (
      <main className="max-w-xl mx-auto px-4 py-6 space-y-6 animate-fade-in pb-20">
        {/* Milestones status */}
        <Card className="border border-border/60 shadow-lg p-5 space-y-6 overflow-hidden relative">
          <div className="text-center space-y-1">
            <span className="text-[10px] uppercase font-bold text-primary tracking-widest block font-sans">Dine-in Status</span>
            <h2 className="font-serif text-2xl font-black capitalize text-foreground">
              {order.status === 'cancelled' ? 'Order Cancelled' : order.status === 'completed' ? 'Order Completed' : milestones[Math.min(Math.max(0, currentPhase), 2)].label}
            </h2>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {order.status === 'cancelled'
                ? 'We apologize, your order has been cancelled by staff.'
                : order.status === 'completed'
                  ? 'Your order is completed and settled. Thank you!'
                  : 'Our chefs are crafting your dishes fresh. Updates reflect in real-time.'}
            </p>
          </div>

          {order.status === 'cancelled' ? (
            <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs p-4 rounded-xl flex items-start gap-2">
              <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
              <span>We apologize, this order was cancelled. Please speak with cafe staff or request assistance.</span>
            </div>
          ) : order.status === 'completed' ? (
            <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-800 dark:text-emerald-400 text-xs p-4 rounded-xl flex items-start gap-2">
              <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500 mt-0.5" />
              <span>Order has been successfully served and finalized. Feel free to check the **Pay Bill** tab.</span>
            </div>
          ) : (
            /* Milestone timelines */
            <div className="relative pt-3 pb-2">
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
                      <span className={`text-[9px] font-bold ${isActive ? 'text-foreground' : 'text-muted-foreground'}`}>
                        {step.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </Card>

        {/* Items Summary card */}
        <Card className="border border-border/60 shadow p-5 space-y-4">
          <div>
            <h4 className="text-sm font-serif font-black text-foreground">Order Items Summary</h4>
            <p className="text-[10px] text-muted-foreground">Order Ref: {order._id.slice(-6)} • Dine-in Table {order.tableNumber}</p>
          </div>

          <div className="divide-y divide-border/40 text-xs">
            {order.items?.map((item: any, idx: number) => (
              <div key={idx} className="py-2.5 flex items-start justify-between gap-4">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5 font-bold">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.veg ? 'bg-green-600' : 'bg-red-600'}`} />
                    <span>{item.name}</span>
                    <span className="text-muted-foreground text-[10px] font-normal font-sans">x{item.quantity}</span>
                  </div>
                  {item.customizations && item.customizations.length > 0 && (
                    <p className="text-[10px] text-muted-foreground pl-3 leading-normal">
                      + {item.customizations.map((c: any) => `${c.name}: ${c.selectedOption}`).join(', ')}
                    </p>
                  )}
                  {item.specialInstructions && (
                    <p className="text-[10px] text-amber-600 dark:text-amber-400 italic pl-3 leading-normal">
                      * Note: "{item.specialInstructions}"
                    </p>
                  )}
                </div>
                <span className="font-semibold text-foreground">
                  Rs. {((item.price + (item.customizations?.reduce((sum: number, c: any) => sum + c.extraPrice, 0) || 0)) * item.quantity).toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          <div className="pt-3 border-t border-border/40 flex justify-between items-center text-xs font-bold text-foreground font-sans">
            <span>Payable Amount (Tax Incl.)</span>
            <span>Rs. {order.totalAmount.toFixed(2)}</span>
          </div>
        </Card>
      </main>
    );
  };

  const renderBillTab = () => {
    if (!activeOrderId) {
      return (
        <main className="max-w-xl mx-auto px-4 py-16 flex flex-col items-center justify-center text-center space-y-4 pb-20">
          <div className="w-16 h-16 rounded-full bg-secondary/80 flex items-center justify-center text-muted-foreground">
            <Receipt className="w-8 h-8" />
          </div>
          <h3 className="font-serif font-bold text-lg text-foreground">No unpaid bills</h3>
          <p className="text-xs text-muted-foreground max-w-xs">
            There are no generated invoices at your table yet. Switch to the menu to place an order.
          </p>
          <Button
            onClick={() => setActiveTab('menu')}
            className="text-xs font-bold bg-primary hover:bg-primary/95 text-white"
          >
            Browse Menu
          </Button>
        </main>
      );
    }

    if (!bill) {
      return (
        <main className="max-w-xl mx-auto px-4 py-12 space-y-6 animate-fade-in pb-20">
          <Card className="border border-border/60 shadow p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-600 mx-auto animate-pulse">
              <Clock className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-serif font-bold text-lg text-foreground">Items are cooking/serving...</h3>
              <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                Once the kitchen has prepared and served your items, the staff will mark the order complete and your invoice will appear here instantly.
              </p>
            </div>
            
            <div className="pt-4 border-t border-border/40 space-y-3">
              <p className="text-[10px] text-muted-foreground">Ready to leave and want to settle up?</p>
              {billRequested ? (
                <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-700 dark:text-emerald-400 p-3.5 rounded-xl text-center space-y-1">
                  <span className="text-xs font-bold block">✓ Bill Request Sent</span>
                  <p className="text-[10px] text-muted-foreground">Staff has been notified and will bring your bill shortly.</p>
                </div>
              ) : (
                <Button
                  onClick={async () => {
                    try {
                      await api.post('/orders/waiter-request', {
                        restaurantId: restaurant?._id,
                        tableNumber: cartTableNumber || '1',
                        type: 'request_bill',
                      });
                      alert('Bill requested successfully! The waiter will bring it shortly.');
                    } catch (err: any) {
                      alert('Failed to send bill request.');
                    }
                  }}
                  className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white w-full py-2.5 rounded-xl cursor-pointer"
                >
                  COMPLETE & BILL (Request Checkout)
                </Button>
              )}
            </div>
          </Card>
        </main>
      );
    }

    return (
      <main className="max-w-xl mx-auto px-4 py-6 space-y-6 animate-fade-in pb-20">
        <Card className="border border-border/60 shadow-lg p-5 flex flex-col items-center justify-between gap-4">
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
                  <h4 className="font-bold text-sm">Verifying Settlement Request</h4>
                  <p className="text-muted-foreground/90 mt-0.5">
                    {bill.paymentMethod === 'cash' 
                      ? 'Wait a moment, the cashier is collecting cash at your table/counter.'
                      : 'Wait a moment, we are verifying the UPI transaction at the counter.'}
                  </p>
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
                    {bill.restaurantId?.paymentSettings?.upiQrImage ? (
                      <>
                        <img
                          src={bill.restaurantId.paymentSettings.upiQrImage}
                          alt="Custom merchant UPI QR Code"
                          className="w-40 h-40 object-contain bg-white p-2 rounded-lg border border-border shadow-sm"
                        />
                        <span className="text-[10px] text-muted-foreground font-medium text-center">
                          Scan this custom merchant QR code to pay
                        </span>
                      </>
                    ) : (
                      <>
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(getUpiUrl())}`}
                          alt="UPI Payment QR Code"
                          className="w-40 h-40 bg-white p-2 rounded-lg border border-border shadow-sm"
                        />
                        <span className="text-[10px] text-muted-foreground font-medium text-center">
                          Scan this QR code using GPay, PhonePe, or Paytm to pay
                        </span>
                      </>
                    )}
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
                    <p className="text-[10px] text-muted-foreground leading-normal pl-1 space-y-1.5">
                      <span>⚠️ **UPI App Block Warning**: Google Pay sometimes restricts scanning direct QR codes for certain personal VPAs (like `@ptaxis`).</span>
                      <span className="block text-amber-500 font-semibold">💡 **GPay Workaround**: Copy the **Linked Phone Number** above, open Google Pay, choose **"Pay Phone Number"**, paste the number, and pay directly! Alternatively, scan the QR code using **PhonePe** or **Paytm** which will resolve the payment immediately.</span>
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
      </main>
    );
  };

  const renderMenuTab = () => {
    return (
      <div className="animate-fade-in">
        {/* Hero Banner Intro */}
        <section className="bg-stone-900 text-stone-100 py-8 px-4 text-center relative overflow-hidden">
          <div className="absolute inset-0 z-0">
            <img 
              src="https://images.unsplash.com/photo-1554118811-1e0d58224f24?q=80&w=800&auto=format&fit=crop" 
              alt="Hero Menu" 
              className="w-full h-full object-cover opacity-20 filter blur-[1px]" 
            />
          </div>
          <div className="relative z-10 space-y-1">
            <h1 className="font-serif text-2xl md:text-3xl font-extrabold text-stone-50">Our Digital Menu</h1>
            <p className="text-xs text-stone-300">Tap items to customize, verify details, and check out table-side.</p>
          </div>
        </section>

        {/* Filters & Categories block */}
        <section className="sticky top-[61px] z-30 bg-background/95 backdrop-blur px-4 py-3 border-b border-border/40 space-y-3 shadow-sm">
          {/* Search & Veg Toggle */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search dishes..."
                className="w-full text-sm bg-secondary/60 border border-border/80 rounded-xl pl-9 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
              />
            </div>

            <button
              onClick={() => setVegOnly(!vegOnly)}
              className={`px-3 py-2.5 rounded-xl border text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                vegOnly 
                  ? 'bg-green-600/10 text-green-600 border-green-600/20' 
                  : 'bg-secondary/40 border-border text-muted-foreground'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full ${vegOnly ? 'bg-green-600' : 'border border-muted-foreground/60'}`} />
              Veg Only
            </button>
          </div>

          {/* Scrollable Categories selector */}
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all border cursor-pointer ${
                  selectedCategory === cat
                    ? 'bg-primary text-primary-foreground border-transparent shadow shadow-primary/10 scale-105'
                    : 'bg-secondary/50 text-muted-foreground border-border hover:bg-secondary'
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
        </section>

        {/* Dishes Grid */}
        <main className="max-w-4xl mx-auto px-4 mt-6 pb-24">
          {filteredDishes.length === 0 ? (
            <div className="text-center py-16 space-y-2">
              <Coffee className="w-10 h-10 text-muted-foreground/40 mx-auto" />
              <h3 className="font-serif font-bold text-muted-foreground">No dishes matching filters</h3>
              <p className="text-xs text-muted-foreground/80">Try modifying your search queries or category tags.</p>
            </div>
          ) : (
            <div className="grid gap-4">
              {filteredDishes.map((dish) => (
                <Card key={dish._id} className="overflow-hidden border border-border/60 hover:border-primary/20 shadow-sm transition-all duration-200">
                  <CardContent className="p-0 flex min-h-[8rem] h-auto">
                    {/* Dish Details */}
                    <div className="flex-1 p-4 flex flex-col justify-between pr-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`w-2.5 h-2.5 rounded-full shrink-0 flex items-center justify-center border ${dish.veg ? 'bg-green-600 border-green-700/20' : 'bg-red-600 border-red-700/20'}`}>
                            <span className="w-1 h-1 bg-white rounded-full" />
                          </span>
                          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">{dish.category}</span>
                        </div>
                        
                        <h3 className="font-serif font-bold text-sm md:text-base leading-snug">{dish.name}</h3>
                        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{dish.description}</p>
                      </div>

                      <div className="flex items-center justify-between pt-1">
                        <span className="font-extrabold text-sm text-foreground">Rs. {dish.price.toFixed(2)}</span>
                        
                        {!dish.available ? (
                          <Badge variant="secondary" className="text-[10px]">Out of stock</Badge>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleAddToCartClick(dish)}
                            className="h-8 rounded-lg px-3 text-xs bg-primary/5 text-primary border-primary/20 hover:bg-primary hover:text-primary-foreground transition-all cursor-pointer font-bold gap-1"
                          >
                            Add <Plus className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Dish Image */}
                    <div className="w-32 h-full relative shrink-0">
                      <img
                        src={dish.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=250&auto=format&fit=crop'}
                        alt={dish.name}
                        className="w-full h-full object-cover"
                      />
                      {!dish.available && (
                        <div className="absolute inset-0 bg-stone-900/60 flex items-center justify-center backdrop-blur-[1px]">
                          <span className="text-[10px] font-bold text-stone-100 uppercase tracking-widest">Unavailable</span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </main>

        {/* Floating Bottom Cart Bar */}
        {cartItems.length > 0 && !isCartOpen && (
          <div className="fixed bottom-20 left-4 right-4 z-40 max-w-lg mx-auto bg-primary text-primary-foreground rounded-2xl p-4 flex items-center justify-between shadow-xl shadow-primary/20 border border-primary/20 animate-slide-up">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary-foreground/15 flex items-center justify-center font-bold">
                <ShoppingBag className="w-5 h-5 text-primary-foreground" />
              </div>
              <div>
                <h4 className="text-xs font-extrabold text-primary-foreground/90 uppercase tracking-wide">
                  {cartItems.reduce((acc, i) => acc + i.quantity, 0)} Items Added
                </h4>
                <span className="text-base font-extrabold">Rs. {total.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={() => setIsCartOpen(true)}
              className="flex items-center gap-1 font-bold text-xs bg-primary-foreground text-primary rounded-xl px-4 py-2.5 hover:bg-stone-50 transition-all cursor-pointer uppercase tracking-wider"
            >
              View Cart <ChevronRight className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
      </div>
    );
  };

  const isAppendable = !!(activeOrderId && activeOrderStatus && !['completed', 'cancelled'].includes(activeOrderStatus));

  // Filter logic
  const filteredDishes = dishes.filter((dish) => {
    const matchesCategory = selectedCategory === 'All' || dish.category === selectedCategory;
    const matchesSearch = dish.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          dish.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesVeg = !vegOnly || dish.veg;
    return matchesCategory && matchesSearch && matchesVeg;
  });

  return (
    <div className="bg-background text-foreground min-h-screen pb-24 relative">
      {/* Header Bar */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href={`/r/${slug}`} className="flex items-center gap-2 group">
            <div className="w-9 h-9 bg-primary text-primary-foreground rounded-xl flex items-center justify-center font-serif font-bold text-sm group-hover:scale-105 transition-all">
              {restaurant.name.charAt(0)}
            </div>
            <div>
              <h2 className="font-serif font-bold text-sm tracking-tight">{restaurant.name}</h2>
              <span className="text-[10px] bg-accent/60 text-accent-foreground border border-accent px-2 py-0.5 rounded-full font-bold">
                Dine-in: Table {cartTableNumber || '1'}
              </span>
            </div>
          </Link>
        </div>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          <button
            onClick={() => setIsWaiterModalOpen(true)}
            className="p-2.5 bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/20 rounded-xl hover:bg-amber-500/20 transition-all cursor-pointer flex items-center gap-1.5 text-xs font-bold"
            title="Call Service"
          >
            <Bell className="w-4 h-4 animate-pulse text-amber-500" />
            <span className="hidden xs:inline">Call Service</span>
          </button>
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative p-2.5 bg-primary/10 text-primary border border-primary/20 rounded-xl hover:bg-primary/20 transition-all cursor-pointer"
          >
            <ShoppingBag className="w-5 h-5" />
            {cartItems.length > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-primary text-primary-foreground text-[10px] font-extrabold w-5 h-5 rounded-full flex items-center justify-center border-2 border-background animate-pulse">
                {cartItems.reduce((acc, i) => acc + i.quantity, 0)}
              </span>
            )}
          </button>
        </div>
      </header>



      {/* Tab Selector Content */}
      {activeTab === 'home' && renderHomeTab()}
      {activeTab === 'menu' && renderMenuTab()}
      {activeTab === 'orders' && renderOrdersTab()}
      {activeTab === 'bill' && renderBillTab()}

      {/* Bottom Navigation Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 bg-background/95 backdrop-blur border-t border-border/60 py-2.5 px-6 flex items-center justify-around shadow-lg">
        <button
          onClick={() => {
            setShowUpiPanel(false);
            setActiveTab('home');
          }}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'home' ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-sans">Home</span>
        </button>

        <button
          onClick={() => {
            setShowUpiPanel(false);
            setActiveTab('menu');
          }}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-colors ${
            activeTab === 'menu' ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <BookOpen className="w-5 h-5" />
          <span className="text-[10px] font-sans">Menu</span>
        </button>

        <button
          onClick={() => {
            setShowUpiPanel(false);
            setActiveTab('orders');
          }}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-colors relative ${
            activeTab === 'orders' ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Coffee className="w-5 h-5" />
          <span className="text-[10px] font-sans">Orders</span>
          {activeOrderId && activeOrderStatus !== 'completed' && activeOrderStatus !== 'cancelled' && (
            <span className="absolute top-0.5 right-1.5 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-background animate-pulse" />
          )}
        </button>

        <button
          onClick={() => {
            setShowUpiPanel(false);
            setActiveTab('bill');
          }}
          className={`flex flex-col items-center gap-1 cursor-pointer transition-colors relative ${
            activeTab === 'bill' ? 'text-primary font-bold' : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Receipt className="w-5 h-5" />
          <span className="text-[10px] font-sans">Pay Bill</span>
          {bill && bill.paymentStatus === 'pending' && (
            <span className="absolute top-0.5 right-2 w-2.5 h-2.5 bg-emerald-500 rounded-full border-2 border-background animate-pulse" />
          )}
        </button>
      </div>

      {/* Customization Selection Modal Overlay */}
      {customizationDish && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-end justify-center sm:items-center p-0 sm:p-4">
          <div className="bg-card text-card-foreground w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl border border-border overflow-hidden shadow-2xl animate-slide-up sm:animate-fade-in max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-border flex items-center justify-between">
              <div>
                <h3 className="font-serif font-bold text-base md:text-lg">{customizationDish.name}</h3>
                <span className="text-xs text-muted-foreground">Customize your dish preferences</span>
              </div>
              <button 
                onClick={() => setCustomizationDish(null)}
                className="p-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-6 flex-1 text-sm">
              {customizationDish.customizations.map((group) => (
                <div key={group.name} className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-sm text-foreground">{group.name}</h4>
                    <span className="text-[10px] bg-secondary text-muted-foreground font-semibold px-2 py-0.5 rounded-md">
                      {group.type === 'single' ? 'Select One (Required)' : 'Select Multiple'}
                    </span>
                  </div>

                  <div className="grid gap-2">
                    {group.options.map((opt) => {
                      const isSelected = selectedCustomizations.some(
                        (c) => c.name === group.name && c.selectedOption === opt.name
                      );

                      return (
                        <button
                          key={opt.name}
                          onClick={() => 
                            group.type === 'single' 
                              ? handleSingleCustSelect(group.name, opt) 
                              : handleMultipleCustSelect(group.name, opt)
                          }
                          className={`w-full p-3 rounded-xl border flex items-center justify-between transition-all cursor-pointer text-left ${
                            isSelected
                              ? 'border-primary bg-primary/5 text-foreground font-semibold'
                              : 'border-border bg-background text-muted-foreground hover:bg-secondary/40'
                          }`}
                        >
                          <span className="text-xs">{opt.name}</span>
                          <div className="flex items-center gap-2">
                            {opt.extraPrice > 0 && (
                              <span className="text-[10px] text-primary">+Rs.{opt.extraPrice}</span>
                            )}
                            <div className={`w-4 h-4 rounded-full border flex items-center justify-center ${isSelected ? 'bg-primary border-primary' : 'border-border'}`}>
                              {isSelected && <Check className="w-2.5 h-2.5 text-primary-foreground stroke-[3px]" />}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {/* Special Instructions text area */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-foreground flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-primary" /> Special Instructions
                </label>
                <textarea
                  value={specialInstructions}
                  onChange={(e) => setSpecialInstructions(e.target.value)}
                  placeholder="e.g. Make it extra hot, no onions, etc."
                  className="w-full text-xs bg-secondary/50 text-foreground border border-border rounded-xl p-3 h-20 resize-none outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                  maxLength={160}
                />
              </div>
            </div>

            <div className="p-4 border-t border-border bg-secondary/20 flex items-center justify-between gap-4">
              <div>
                <span className="text-xs text-muted-foreground block">Item Total</span>
                <span className="font-extrabold text-lg text-foreground">Rs. {getCustomizationPreviewTotal().toFixed(2)}</span>
              </div>

              <Button onClick={handleConfirmCustomizations} className="px-6 cursor-pointer font-bold">
                Add to Cart <Plus className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Cart Slider Drawer Overlay */}
      {isCartOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex justify-end">
          <div className="bg-card text-card-foreground w-full max-w-md h-full flex flex-col shadow-2xl border-l border-border animate-slide-left relative">
            <div className="p-4 border-b border-border flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-primary" />
                <h3 className="font-serif font-bold text-base md:text-lg">Your Cart</h3>
              </div>
              <button 
                onClick={() => setIsCartOpen(false)}
                className="p-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {cartItems.length === 0 ? (
              /* Empty Cart Screen */
              <div className="flex-1 flex flex-col items-center justify-center p-8 space-y-3 text-center">
                <div className="w-14 h-14 rounded-full bg-secondary flex items-center justify-center text-muted-foreground/60">
                  <ShoppingBag className="w-6 h-6" />
                </div>
                <h4 className="font-serif font-bold text-muted-foreground">Cart is empty</h4>
                <p className="text-xs text-muted-foreground/80 max-w-xs">Scan menu and click Add on items to populate your order.</p>
                <Button onClick={() => setIsCartOpen(false)} className="mt-2 text-xs font-bold cursor-pointer">
                  Browse Menu
                </Button>
              </div>
            ) : (
              /* Cart Contents */
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {cartItems.map((item) => {
                    const extra = item.customizations.reduce((acc, c) => acc + c.extraPrice, 0);
                    const itemUnitTotal = item.price + extra;

                    return (
                      <div key={item.key} className="flex gap-3 bg-secondary/20 p-3.5 rounded-2xl border border-border/40 relative">
                        {/* Remove item button */}
                        <button
                          onClick={() => removeItem(item.key)}
                          className="absolute top-2 right-2 p-1 text-muted-foreground hover:text-destructive cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>

                        <img
                          src={item.image || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?q=80&w=100&auto=format&fit=crop'}
                          alt={item.name}
                          className="w-16 h-16 rounded-xl object-cover border border-border/30 shrink-0"
                        />

                        <div className="flex-1 space-y-1 pr-6 text-xs">
                          <h4 className="font-serif font-bold text-foreground leading-snug">{item.name}</h4>
                          
                          {/* Customizations display */}
                          {item.customizations.length > 0 && (
                            <div className="text-[10px] text-muted-foreground leading-relaxed">
                              {item.customizations.map(c => `${c.name}: ${c.selectedOption}`).join(', ')}
                            </div>
                          )}

                          {/* Instructions */}
                          {item.specialInstructions && (
                            <div className="text-[9px] text-amber-600 dark:text-amber-400 italic">
                              * Note: "{item.specialInstructions}"
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-1">
                            <span className="font-extrabold text-foreground">Rs. {(itemUnitTotal * item.quantity).toFixed(2)}</span>
                            
                            {/* Quantity buttons */}
                            <div className="flex items-center bg-background border border-border rounded-lg h-7 px-1">
                              <button 
                                onClick={() => updateQuantity(item.key, -1)}
                                className="p-1 hover:text-primary cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="px-2 text-xs font-bold">{item.quantity}</span>
                              <button 
                                onClick={() => updateQuantity(item.key, 1)}
                                className="p-1 hover:text-primary cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Subtotal summaries and Checkout Button */}
                <div className="p-4 border-t border-border bg-secondary/15 space-y-4">
                  <div className="space-y-1.5 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span className="text-foreground font-semibold">Rs. {subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>GST ({cartTaxRate}%)</span>
                      <span className="text-foreground font-semibold">Rs. {tax.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-t border-border/50 pt-2 text-sm font-extrabold text-foreground">
                      <span>Grand Total</span>
                      <span className="text-primary text-base">Rs. {total.toFixed(2)}</span>
                    </div>
                  </div>

                  <Button onClick={() => setIsCheckoutOpen(true)} className="w-full cursor-pointer font-bold">
                    Checkout Dine-In Order <ChevronRight className="w-4.5 h-4.5" />
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Verification & Checkout Overlay Modal */}
      {isCheckoutOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground w-full max-w-md rounded-2xl border border-border overflow-hidden shadow-2xl p-6 space-y-5 animate-fade-in">
            <div className="flex items-center justify-between border-b border-border/50 pb-3">
              <h3 className="font-serif font-bold text-base md:text-lg flex items-center gap-1.5">
                              {isAppendable ? (
                  <>
                    <Plus className="w-5 h-5 text-primary animate-pulse" /> Add to Active Order
                  </>
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5 text-primary animate-pulse" /> Customer Verification
                  </>
                )}
              </h3>
             <button
               onClick={() => {
                  setCheckoutError(null);
                  setIsCheckoutOpen(false);
                }}
                className="p-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {checkoutError && (
              <div className="bg-destructive/10 border border-destructive/20 text-destructive text-xs px-3.5 py-2.5 rounded-lg">
                {checkoutError}
              </div>
            )}

            {isAppendable ? (
              /* Append Order Confirmation Mode */
              <form onSubmit={handleAppendToOrder} className="space-y-5 text-sm">
                <p className="text-xs text-muted-foreground leading-relaxed">
                  You already have an active order in progress at Table {cartTableNumber || '1'}. These additional items will be added directly to your existing bill without re-verifying your details.
                </p>

                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-800 dark:text-amber-400 p-3.5 rounded-xl text-xs flex gap-2">
                  <div className="font-bold shrink-0">Note:</div>
                  <div>Your items will be merged into a single combined bill when you check out and settle.</div>
                </div>

                <Button type="submit" disabled={otpLoading} className="w-full cursor-pointer font-bold gap-2 bg-amber-600 hover:bg-amber-700 text-white">
                  {otpLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Adding to Bill...
                    </>
                  ) : (
                    <>Add to Table Bill (Rs. {total.toFixed(2)})</>
                  )}
                </Button>
              </form>
            ) : (
              /* Regular Verification Mode */
              <form onSubmit={handlePlaceOrder} className="space-y-4 text-sm">
                <p className="text-xs text-muted-foreground">
                  Please enter your details below to place your dine-in order. We will verify your location to ensure you are at the table.
                </p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                      Your Full Name
                    </label>
                    <div className="relative">
                      <User className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                      <input
                        type="text"
                        required
                        value={customerName}
                        onChange={(e) => setCustomerName(e.target.value)}
                        placeholder="John Doe"
                        className="w-full text-xs bg-secondary/50 text-foreground border border-border rounded-xl pl-9 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-muted-foreground mb-1 uppercase tracking-wide">
                      Mobile Number
                    </label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-3 w-4 h-4 text-muted-foreground" />
                      <input
                        type="tel"
                        required
                        value={phoneNumber}
                        onChange={(e) => {
                          const val = e.target.value.replace(/\D/g, '');
                          setPhoneNumber(val);
                        }}
                        maxLength={10}
                        placeholder="e.g. 9876543210"
                        className="w-full text-xs bg-secondary/50 text-foreground border border-border rounded-xl pl-9 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-primary focus:bg-background transition-all"
                      />
                    </div>
                  </div>
                </div>

                <Button type="submit" disabled={otpLoading} className="w-full mt-2 cursor-pointer font-bold gap-2">
                  {otpLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Verifying & Placing Order...
                    </>
                  ) : (
                    'Place Dine-in Order'
                  )}
                </Button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Call Waiter Modal Overlay */}
      {isWaiterModalOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card text-card-foreground w-full max-w-sm rounded-2xl border border-border overflow-hidden shadow-2xl p-6 space-y-4 animate-fade-in relative">
            <button
              onClick={() => setIsWaiterModalOpen(false)}
              className="absolute top-4 right-4 p-1 rounded-full bg-secondary text-muted-foreground hover:text-foreground cursor-pointer"
              disabled={waiterRequestLoading}
            >
              <X className="w-4 h-4" />
            </button>

            <div className="text-center pb-2">
              <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto mb-3">
                <Bell className="w-6 h-6 text-amber-500 animate-pulse" />
              </div>
              <h3 className="font-serif font-bold text-base md:text-lg">Table Assistance</h3>
              <p className="text-xs text-muted-foreground mt-0.5">Need help at Table {cartTableNumber || '1'}?</p>
            </div>

            {waiterRequestSuccess ? (
              <div className="bg-emerald-500/15 border border-emerald-500/20 text-emerald-600 dark:text-emerald-400 text-xs p-4 rounded-xl text-center font-semibold animate-fade-in">
                🔔 Waiter alerted successfully!
              </div>
            ) : (
              <form onSubmit={handleCallWaiterSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { type: 'call_waiter', label: '🔔 Call Waiter', desc: 'General assistance' },
                    { type: 'request_water', label: '💧 Request Water', desc: 'Drinking water' },
                    { type: 'request_bill', label: '📄 Request Bill', desc: 'Invoice / Check' },
                    { type: 'other', label: '✏️ Other Help', desc: 'Any other requests' }
                  ].map((opt) => (
                    <button
                      key={opt.type}
                      type="button"
                      onClick={() => setWaiterRequestType(opt.type as any)}
                      className={`p-3 rounded-xl border flex flex-col items-center justify-center text-center cursor-pointer gap-1 transition-all ${
                        waiterRequestType === opt.type
                          ? 'border-amber-500 bg-amber-500/10 text-foreground font-semibold'
                          : 'border-border bg-background text-muted-foreground hover:bg-secondary/40'
                      }`}
                    >
                      <span className="font-bold">{opt.label}</span>
                      <span className="text-[9px] text-muted-foreground leading-none">{opt.desc}</span>
                    </button>
                  ))}
                </div>

                <Button
                  type="submit"
                  disabled={waiterRequestLoading}
                  className="w-full font-bold cursor-pointer bg-amber-600 hover:bg-amber-700 text-white"
                >
                  {waiterRequestLoading ? 'Alerting Waiter...' : 'Send Service Alert'}
                </Button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
