// Types mirror SRS section 2.4 / 4.2 so the Laravel API can drop in later.

export type OrderStatus = 'received' | 'processing' | 'shipping' | 'closed'
export type Fulfillment = 'pickup' | 'delivery'
export type OptionType = 'sweetness' | 'ice' | 'topping'
export type DiscountType = 'shipping' | 'seasonings' | 'special_event'

export interface Category { id: number; name: string; nameEn: string }

export interface Product {
  id: number
  categoryId: number
  name: string
  nameEn: string
  tagline: string
  description: string
  price: number
  tint: string // illustration liquid colour (stands in for image_url)
  topping: 'none' | 'pearl' | 'jelly' | 'foam'
  optionIds: number[] // PRODUCT_OPTION
  isDeleted: boolean
}

export interface CustomOption { id: number; type: OptionType; name: string; extraPrice: number }

export interface Store { id: number; name: string; address: string; contactEmail: string; phone: string }

export interface StoreProduct { storeId: number; productId: number; stockQty: number; safetyQty: number }

export interface Discount {
  code: string
  type: DiscountType
  description: string
  startDate: string // yyyy-mm-dd
  endDate: string
  discountRate?: number // fraction taken off (0.1 = 10% off)
  ruleType?: 'rate' | 'buy1get1'
  minPurchaseAmount?: number
  productIds?: number[] // DISCOUNT_PRODUCT
}

export interface User {
  userId: number
  loginId: string
  name: string
  email: string
  address: string
  status: 0 | 1
  roles: ('customer' | 'staff' | 'admin')[]
}

export interface Member { memberId: number; userId: number; pointsBalance: number }

export interface CartItem { id: number; productId: number; storeId: number; optionIds: number[]; quantity: number }

export interface OrderItemOption { optionId: number; name: string; extraPrice: number }
export interface OrderItem {
  id: number
  productId: number
  productName: string
  unitPrice: number
  options: OrderItemOption[]
  quantity: number
}

export interface AppliedDiscount { code: string; description: string; amount: number }

export interface Order {
  id: number
  userId: number
  storeId: number
  orderTime: string
  fulfillment: Fulfillment
  deliveryAddress?: string
  pickupNo: number
  status: OrderStatus
  subtotal: number
  tax: number
  shippingFee: number
  discountAmount: number
  pointsUsed: number
  totalAmount: number
  items: OrderItem[]
  discounts: AppliedDiscount[]
}

export interface PointLog {
  id: number
  userId: number
  orderId: number | null
  change: number
  reason: 'earn' | 'redeem' | 'refund'
  createdAt: string
}

export interface Review { id: number; orderId: number; userId: number; storeId: number; rating: number; comment: string; createdAt: string }
