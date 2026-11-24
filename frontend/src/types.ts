// Shapes returned by the API (backend/src/app.ts). Field names follow SRS section 4.2 in camelCase.

export type OrderStatus = 'received' | 'processing' | 'shipping' | 'closed' | 'cancelled'
export type Fulfillment = 'pickup' | 'delivery'
export type OptionType = 'sweetness' | 'ice' | 'topping'
export type DiscountType = 'shipping' | 'seasonal' | 'special_event'
export type Role = 'customer' | 'staff' | 'admin'
export type Topping = 'none' | 'pearl' | 'jelly' | 'foam'

export interface Category { id: number; name: string; nameEn: string | null; productCount?: number }

export interface Product {
  id: number
  categoryId: number
  name: string
  nameEn: string | null
  tagline: string | null
  description: string | null
  imageUrl: string | null
  price: number
  tint: string // liquid colour of the drawn cup when there is no photo
  topping: Topping
  optionIds: number[] // PRODUCT_OPTION
  isDeleted: boolean
}

export interface CustomOption { id: number; type: OptionType; name: string; extraPrice: number; isDeleted?: boolean; productCount?: number }

export interface Store {
  id: number; name: string; address: string; contactEmail: string; phone: string
  avgRating: number; reviewCount: number
}

export interface StockRow { productId: number; stockQty: number }

export interface Discount {
  code: string
  type: DiscountType
  description: string
  startDate: string
  endDate: string
  discountRate: number | null // fraction off: 0.1 = 10% off
  ruleType: 'rate' | 'buy1get1' | null
  minPurchaseAmount: number | null
  productIds: number[]
  state?: 'active' | 'upcoming' | 'ended'
  orderCount?: number
  amountGiven?: number
}

export interface Catalog {
  categories: Category[]
  products: Product[]
  options: CustomOption[]
  stores: Store[]
  discounts: Discount[]
  popular: { productId: number; qty: number }[]
  today: string
}

export interface User {
  userId: number
  loginId: string
  name: string
  email: string
  address: string | null
  status: number
  roles: Role[]
  memberId: number | null
  pointsBalance: number
  storeIds: number[]
  emailVerified: boolean
  warnings: { reason: string; createdAt: string }[]
}

/** A cart line. Guests keep these in localStorage; signed-in customers on the server. */
export interface CartItem { id: number; storeId: number; productId: number; optionIds: number[]; quantity: number }

export interface AppliedDiscount { code: string; type: DiscountType; description: string; amount: number }

export interface Quote {
  subtotal: number
  tax: number
  shippingFee: number
  discountAmount: number
  applied: AppliedDiscount[]
  payable: number
  maxPoints: number
  pointsUsed: number
  total: number
  pointsEarned: number
  lines: { cup: number; lineTotal: number; ok: boolean }[]
  problems: string[]
  pointsBalance: number
}

export interface OrderItemOption { optionId: number; name: string; extraPrice: number }
export interface OrderItem { id: number; productId: number; productName: string; unitPrice: number; quantity: number; options: OrderItemOption[] }

export interface Order {
  id: number
  memberId: number
  storeId: number
  storeName: string
  orderTime: string
  fulfillment: Fulfillment
  deliveryAddress: string | null
  pickupNo: number
  status: OrderStatus
  subtotal: number
  tax: number
  shippingFee: number
  discountAmount: number
  pointsUsed: number
  totalAmount: number
  customerName: string
  items: OrderItem[]
  discounts: AppliedDiscount[]
  timeline: { status: OrderStatus; at: string }[]
  review: { id: number; rating: number; comment: string | null; createdAt: string } | null
  pointsEarned: number | null
}

export interface PointLog {
  id: number
  orderId: number | null
  pickupNo: number | null
  storeName: string | null
  change: number
  reason: 'earn' | 'redeem' | 'refund' | 'adjust'
  createdAt: string
}

export interface Review { id: number; rating: number; comment: string | null; createdAt: string; author: string }
