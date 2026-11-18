import type { Category, CustomOption, Discount, Product, Store, StoreProduct } from '@/types'

export const categories: Category[] = [
  { id: 1, name: '原葉茶', nameEn: 'Whole Leaf' },
  { id: 2, name: '鮮奶茶', nameEn: 'Milk Tea' },
  { id: 3, name: '果茶', nameEn: 'Fruit Tea' },
  { id: 4, name: '本草', nameEn: 'Herbal' },
]

// 1-5 sweetness, 6-10 ice, 11-14 toppings
export const options: CustomOption[] = [
  { id: 1, type: 'sweetness', name: '全糖', extraPrice: 0 },
  { id: 2, type: 'sweetness', name: '少糖', extraPrice: 0 },
  { id: 3, type: 'sweetness', name: '半糖', extraPrice: 0 },
  { id: 4, type: 'sweetness', name: '微糖', extraPrice: 0 },
  { id: 5, type: 'sweetness', name: '無糖', extraPrice: 0 },
  { id: 6, type: 'ice', name: '正常冰', extraPrice: 0 },
  { id: 7, type: 'ice', name: '少冰', extraPrice: 0 },
  { id: 8, type: 'ice', name: '微冰', extraPrice: 0 },
  { id: 9, type: 'ice', name: '去冰', extraPrice: 0 },
  { id: 10, type: 'ice', name: '熱飲', extraPrice: 0 },
  { id: 11, type: 'topping', name: '黑糖珍珠', extraPrice: 10 },
  { id: 12, type: 'topping', name: '椰果', extraPrice: 10 },
  { id: 13, type: 'topping', name: '仙草凍', extraPrice: 10 },
  { id: 14, type: 'topping', name: '奶蓋', extraPrice: 20 },
]

const base = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
const withToppings = [...base, 11, 12, 13, 14]
const herbalToppings = [...base, 12, 13]

const p = (x: Omit<Product, 'isDeleted'>): Product => ({ ...x, isDeleted: false })

export const products: Product[] = [
  p({ id: 1, categoryId: 1, name: '阿里山烏龍', nameEn: 'Alishan Oolong', tagline: '山霧入盞，回甘綿長', description: '高山烏龍輕焙，花香清雅，尾韻回甘。', price: 55, tint: '#C9A24A', topping: 'none', optionIds: [...base, 14] }),
  p({ id: 2, categoryId: 1, name: '炭焙鐵觀音', nameEn: 'Charcoal Tieguanyin', tagline: '焙火沉香，一飲生津', description: '傳統炭焙，果香與焙香交織，口感厚實。', price: 55, tint: '#9A6B34', topping: 'none', optionIds: [...base, 14] }),
  p({ id: 3, categoryId: 1, name: '錫蘭紅茶', nameEn: 'Ceylon Black', tagline: '琥珀色裡，一抹澀甜', description: '濃郁紅茶，適合搭配任何配料。', price: 45, tint: '#8A4B2A', topping: 'none', optionIds: withToppings }),
  p({ id: 4, categoryId: 1, name: '茉莉綠茶', nameEn: 'Jasmine Green', tagline: '茉莉初綻，雲淡風輕', description: '窨製茉莉花香，清爽不澀。', price: 45, tint: '#B9B66A', topping: 'none', optionIds: withToppings }),
  p({ id: 5, categoryId: 2, name: '珍珠鮮奶茶', nameEn: 'Pearl Milk Tea', tagline: '茶入牛乳，珠沉杯底', description: '手工黑糖珍珠，搭配鮮奶與紅茶。', price: 70, tint: '#B98C62', topping: 'pearl', optionIds: withToppings }),
  p({ id: 6, categoryId: 2, name: '桂花烏龍拿鐵', nameEn: 'Osmanthus Oolong Latte', tagline: '桂香滿袖，奶韻悠長', description: '桂花蜜與烏龍的溫柔組合。', price: 75, tint: '#D9B66F', topping: 'foam', optionIds: withToppings }),
  p({ id: 7, categoryId: 2, name: '黑糖薑母鮮奶', nameEn: 'Brown Sugar Ginger Milk', tagline: '暖薑入喉，冬日有光', description: '老薑熬製黑糖，搭配鮮奶。', price: 80, tint: '#7A4A33', topping: 'pearl', optionIds: [...base, 11, 14] }),
  p({ id: 8, categoryId: 3, name: '金桔檸檬', nameEn: 'Kumquat Lemon', tagline: '酸甜如初見', description: '手壓金桔與檸檬，清爽解膩。', price: 60, tint: '#E0B93E', topping: 'none', optionIds: [...base, 12] }),
  p({ id: 9, categoryId: 3, name: '蜜桃烏龍', nameEn: 'Peach Oolong', tagline: '桃影映茶，輕甜入夏', description: '白桃果醬與烏龍茶湯。', price: 65, tint: '#E3A58A', topping: 'none', optionIds: [...base, 12] }),
  p({ id: 10, categoryId: 4, name: '枸杞紅棗茶', nameEn: 'Goji & Red Date', tagline: '紅果如珠，暖身安神', description: '紅棗與枸杞慢火熬煮，天然甘甜。', price: 65, tint: '#A8452F', topping: 'none', optionIds: herbalToppings }),
  p({ id: 11, categoryId: 4, name: '仙草蜜', nameEn: 'Grass Jelly Honey', tagline: '清涼一盞，消暑解燥', description: '古法仙草凍搭配蜂蜜茶湯。', price: 55, tint: '#4A3B2E', topping: 'jelly', optionIds: herbalToppings }),
  p({ id: 12, categoryId: 4, name: '洛神花茶', nameEn: 'Roselle Tea', tagline: '一抹胭脂，酸中帶甜', description: '洛神花與冰糖慢煮，色澤如胭脂。', price: 60, tint: '#9C2F45', topping: 'none', optionIds: herbalToppings }),
]

export const stores: Store[] = [
  { id: 1, name: '北科店', address: '台北市大安區忠孝東路三段 1 號', contactEmail: 'ntut@tehcha.example', phone: '02-2771-0001' },
  { id: 2, name: '信義店', address: '台北市信義區松仁路 88 號', contactEmail: 'xinyi@tehcha.example', phone: '02-2720-0002' },
  { id: 3, name: '大稻埕店', address: '台北市大同區迪化街一段 21 號', contactEmail: 'dadaocheng@tehcha.example', phone: '02-2555-0003' },
]

// Seed stock; product 8 is sold out at store 2 and product 6 is low at store 1 to exercise the UI states.
export const initialStock = (): StoreProduct[] => {
  const rows: StoreProduct[] = []
  for (const s of stores) {
    for (const pr of products) {
      let qty = 40 + ((s.id * 7 + pr.id * 3) % 25)
      if (s.id === 2 && pr.id === 8) qty = 0
      if (s.id === 1 && pr.id === 6) qty = 4
      rows.push({ storeId: s.id, productId: pr.id, stockQty: qty, safetyQty: 10 })
    }
  }
  return rows
}

// Stand-in for historical OrderItem sales (drives "popular").
export const salesCount: Record<number, number> = {
  1: 320, 2: 210, 3: 180, 4: 150, 5: 520, 6: 410, 7: 260, 8: 340, 9: 280, 10: 140, 11: 120, 12: 130,
}

export const discounts: Discount[] = [
  { code: 'SHIP500', type: 'shipping', description: '滿 NT$500 免運費', startDate: '2026-01-01', endDate: '2026-12-31', minPurchaseAmount: 500 },
  { code: 'AUTUMN95', type: 'seasonings', description: '秋茗季 全單 95 折', startDate: '2026-10-01', endDate: '2026-12-31', discountRate: 0.05 },
  { code: 'OSMAN-B1G1', type: 'special_event', description: '桂花烏龍拿鐵 買一送一', startDate: '2026-11-01', endDate: '2026-11-30', ruleType: 'buy1get1', productIds: [6] },
  { code: 'PEACH85', type: 'special_event', description: '蜜桃烏龍 85 折', startDate: '2026-11-01', endDate: '2026-12-15', ruleType: 'rate', discountRate: 0.15, productIds: [9] },
]
