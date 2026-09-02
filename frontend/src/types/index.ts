export interface OrderItemCustomization {
  name: string;
  selectedOption: string;
  extraPrice: number;
}

export interface OrderItem {
  dishId: string;
  name: string;
  price: number;
  quantity: number;
  customizations?: OrderItemCustomization[];
  specialInstructions?: string;
}

export interface Order {
  _id: string;
  restaurantId?: string;
  customerName: string;
  phoneNumber: string;
  tableNumber: string;
  items: OrderItem[];
  status: 'received' | 'accepted' | 'preparing' | 'ready' | 'served' | 'completed' | 'cancelled';
  billRequested?: boolean;
  subtotal: number;
  tax: number;
  totalAmount: number;
  createdAt: string;
  updatedAt?: string;
}

export interface Table {
  _id: string;
  tableNumber: string;
  capacity?: number;
  qrCodeUrl?: string;
  status?: string;
  createdAt: string;
}

export interface WaiterRequest {
  _id: string;
  tableNumber: string;
  type: 'call_waiter' | 'request_water' | 'request_bill' | 'other';
  status: 'pending' | 'resolved';
  createdAt: string;
}

export interface Bill {
  _id: string;
  billNumber: string;
  totalAmount?: number;
  subtotal?: number;
  tax?: number;
  taxAmount?: number;
  finalAmount?: number;
  pdfUrl?: string;
  orderId?: any;
  restaurantId?: any;
  tableNumber?: string;
  paymentStatus?: 'pending' | 'verifying' | 'paid' | 'void';
  paymentMethod?: string;
  voidNote?: string;
  createdAt: string;
}
