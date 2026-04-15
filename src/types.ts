export type Screen = 'dashboard' | 'upload' | 'inventory' | 'returns' | 'stockin' | 'profit' | 'success' | 'reprint' | 'accounts' | 'upgrade' | 'settings';

export interface UserProfile {
  uid: string;
  email: string;
  phone?: string;
  role: 'admin' | 'user';
  status: 'active' | 'inactive';
  paymentStatus: 'none' | 'pending' | 'completed';
  expiryDate: string | null;
  createdAt: string;
}

export interface PaymentHistory {
  id: string;
  email: string;
  amount: number;
  package: string;
  activatedAt: string;
  userId: string;
}

export interface Product {
  id: string;
  sku: string;
  name: string;
  stock: number;
  status: 'in_stock' | 'low_stock' | 'out_of_stock';
  image: string;
  category: string;
  variant?: string;
  costPrice?: number;
  sellingPrice?: number;
  destination?: string;
  supplier?: string;
}

export interface InventoryLog {
  id: string;
  timestamp: any; // Firestore Timestamp
  trackingCode?: string;
  sku: string;
  productName: string;
  variant?: string;
  change: number;
  type: 'deduction' | 'addition' | 'manual_edit' | 'bulk_import';
  userId?: string;
}

export interface Order {
  id: string;
  trackingCode: string;
  status: 'delivered' | 'shipping' | 'returned' | 'pending';
  recipient: string;
  phone: string;
  address: string;
  carrier: string;
  history: {
    status: string;
    time: string;
    date: string;
  }[];
  totalRevenue?: number;
  totalCost?: number;
  platformFee?: number;
  taxFee?: number;
  packagingFee?: number;
}

export type TrackingStatus = 'delivered' | 'shipping' | 'returned' | 'problematic' | 'pending';

export interface ProblematicOrder {
  id: string;
  trackingCode: string;
  reason: string;
  status: string;
  updatedAt: string;
  userId: string;
  recipient?: string;
  phone?: string;
}

export interface ProfitConfig {
  platformFeePercent: number; // Default for others
  platformFeeCup: number;
  platformFeeBottle: number;
  taxPercent: number;
  packagingCostBottle: number;
  packagingCostCup: number;
  marketingCost: number;
  otherCosts: number;
  lastUpdated: string;
  cutoffHour?: number;
  dailyMarketingCosts?: Record<string, number>;
}

export interface ReturnRecord {
  id: string;
  trackingCode: string;
  returnedAt: string;
  reason: string;
  items: {
    sku: string;
    variant: string;
    quantity: number;
    sellingPrice?: number;
    productName?: string;
    productId?: string;
  }[];
  userId: string;
}

export const MOCK_PRODUCTS: Product[] = [
  {
    id: '1',
    sku: '315',
    name: 'Cốc giữ nhiệt COSTA 1000ml',
    stock: 100,
    status: 'in_stock',
    image: 'https://picsum.photos/seed/bottle/200/200',
    category: 'Gia dụng',
    variant: 'Lót Sứ Màu Xanh'
  },
  {
    id: '2',
    sku: '315',
    name: 'Cốc giữ nhiệt COSTA 1000ml',
    stock: 100,
    status: 'in_stock',
    image: 'https://picsum.photos/seed/bottle/200/200',
    category: 'Gia dụng',
    variant: 'Lót Sứ Màu Hồng'
  },
  {
    id: '3',
    sku: '315',
    name: 'Cốc giữ nhiệt COSTA 1000ml',
    stock: 100,
    status: 'in_stock',
    image: 'https://picsum.photos/seed/bottle/200/200',
    category: 'Gia dụng',
    variant: 'Lót Sứ Màu Tím'
  },
  {
    id: '4',
    sku: '338',
    name: 'Bình giữ nhiệt 1200ml',
    stock: 50,
    status: 'in_stock',
    image: 'https://picsum.photos/seed/bottle2/200/200',
    category: 'Gia dụng',
    variant: 'Màu Xám'
  },
  {
    id: '5',
    sku: '330',
    name: 'Ly giữ nhiệt COSTA 1200ml',
    stock: 80,
    status: 'in_stock',
    image: 'https://picsum.photos/seed/bottle3/200/200',
    category: 'Gia dụng',
    variant: 'Màu Hồng Phấn'
  },
  {
    id: '6',
    sku: '336',
    name: 'Cốc giữ nhiệt COSTA 1200ml',
    stock: 120,
    status: 'in_stock',
    image: 'https://picsum.photos/seed/bottle4/200/200',
    category: 'Gia dụng',
    variant: 'Màu Hồng'
  },
  {
    id: '7',
    sku: '339',
    name: 'Bình giữ nhiệt 1200ml',
    stock: 60,
    status: 'in_stock',
    image: 'https://picsum.photos/seed/bottle5/200/200',
    category: 'Gia dụng',
    variant: 'Màu Xanh'
  },
  {
    id: '8',
    sku: '226',
    name: 'Cốc giữ nhiệt 1000ml',
    stock: 45,
    status: 'in_stock',
    image: 'https://picsum.photos/seed/bottle6/200/200',
    category: 'Gia dụng',
    variant: 'Màu Trắng'
  }
];

export const MOCK_ORDER: Order = {
  id: 'SHP99283741',
  trackingCode: 'SPX092183742',
  status: 'delivered',
  recipient: 'Nguyễn Văn A',
  phone: '090****123',
  address: '123 Đường Lê Lợi, Phường Bến Thành, Quận 1, TP. Hồ Chí Minh',
  carrier: 'Shopee Xpress',
  history: [
    { status: 'Giao hàng thành công', time: '14:30', date: '24/05/2024' },
    { status: 'Đang giao đến người nhận', time: '08:15', date: '24/05/2024' },
    { status: 'Đã rời kho phân loại', time: '22:00', date: '23/05/2024' }
  ]
};
