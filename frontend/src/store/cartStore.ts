import { create } from 'zustand';

export interface CartCustomization {
  name: string;
  selectedOption: string;
  extraPrice: number;
}

export interface CartItem {
  key: string; // Unique composite key: dishId + JSON.stringify(customizations)
  dishId: string;
  name: string;
  price: number; // Base dish price
  quantity: number;
  image?: string;
  veg: boolean;
  category: string;
  customizations: CartCustomization[];
  specialInstructions: string;
}

interface CartState {
  items: CartItem[];
  restaurantId: string | null;
  tableNumber: string | null;
  taxRate: number; // Default tax rate for calculations
  setTableContext: (restaurantId: string, tableNumber: string, taxRate: number) => void;
  addItem: (item: Omit<CartItem, 'key' | 'quantity'>, quantity?: number) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, delta: number) => void;
  clearCart: () => void;
  getTotals: () => { subtotal: number; tax: number; total: number };
}

// Generate a deterministic unique key based on item details and chosen options
const generateItemKey = (dishId: string, customizations: CartCustomization[]): string => {
  const sortedCusts = [...customizations].sort((a, b) => a.name.localeCompare(b.name));
  return `${dishId}-${JSON.stringify(sortedCusts)}`;
};

const getSafeLocalStorage = (key: string): string | null => {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(key);
  }
  return null;
};

const setSafeLocalStorage = (key: string, value: string) => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(key, value);
  }
};

const removeSafeLocalStorage = (key: string) => {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(key);
  }
};

export const useCartStore = create<CartState>((set, get) => ({
  items: [],
  restaurantId: getSafeLocalStorage('cart_restaurantId'),
  tableNumber: getSafeLocalStorage('cart_tableNumber'),
  taxRate: getSafeLocalStorage('cart_taxRate') ? Number(getSafeLocalStorage('cart_taxRate')) : 5,

  setTableContext: (restaurantId, tableNumber, taxRate) => {
    setSafeLocalStorage('cart_restaurantId', restaurantId);
    setSafeLocalStorage('cart_tableNumber', tableNumber);
    setSafeLocalStorage('cart_taxRate', taxRate.toString());

    // If scanning a new table or restaurant, clear unplaced cart items
    const currentRestaurantId = get().restaurantId;
    const currentTableNumber = get().tableNumber;
    if (
      (currentRestaurantId && currentRestaurantId !== restaurantId) ||
      (currentTableNumber && currentTableNumber !== tableNumber)
    ) {
      set({ items: [], restaurantId, tableNumber, taxRate });
    } else {
      set({ restaurantId, tableNumber, taxRate });
    }
  },

  addItem: (item, quantity = 1) => {
    const key = generateItemKey(item.dishId, item.customizations);
    const existingItems = get().items;
    const existingIndex = existingItems.findIndex((i) => i.key === key);

    if (existingIndex > -1) {
      // Item with identical customizations already in cart; increment quantity
      const updatedItems = [...existingItems];
      updatedItems[existingIndex].quantity += quantity;
      
      // Merge special instructions if any
      if (item.specialInstructions) {
        const prevInst = updatedItems[existingIndex].specialInstructions;
        updatedItems[existingIndex].specialInstructions = prevInst 
          ? `${prevInst}; ${item.specialInstructions}` 
          : item.specialInstructions;
      }
      
      set({ items: updatedItems });
    } else {
      // Add new unique item configuration
      set({
        items: [...existingItems, { ...item, key, quantity }],
      });
    }
  },

  removeItem: (key) => {
    set({
      items: get().items.filter((item) => item.key !== key),
    });
  },

  updateQuantity: (key, delta) => {
    const updatedItems = get().items
      .map((item) => {
        if (item.key === key) {
          const newQty = item.quantity + delta;
          return { ...item, quantity: newQty };
        }
        return item;
      })
      .filter((item) => item.quantity > 0); // Remove item if quantity drops to 0

    set({ items: updatedItems });
  },

  clearCart: () => {
    set({ items: [] });
  },

  getTotals: () => {
    const items = get().items;
    const taxRate = get().taxRate;

    const subtotal = items.reduce((acc, item) => {
      const extraCost = item.customizations.reduce((sum, cust) => sum + cust.extraPrice, 0);
      const unitPrice = item.price + extraCost;
      return acc + unitPrice * item.quantity;
    }, 0);

    const tax = Number(((subtotal * taxRate) / 100).toFixed(2));
    const total = Number((subtotal + tax).toFixed(2));

    return { subtotal, tax, total };
  },
}));
