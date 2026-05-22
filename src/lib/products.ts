import type { ProductRecord } from '../pages/products.types'

export const PRODUCTS_STORAGE_KEY = 'ochibo-admin-products'

export function loadStoredProducts(): ProductRecord[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(PRODUCTS_STORAGE_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as ProductRecord[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveStoredProducts(products: ProductRecord[]) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(PRODUCTS_STORAGE_KEY, JSON.stringify(products))
}

export function getProductPrice(product: ProductRecord) {
  if (product.variants.length === 0) {
    return 0
  }

  return Math.min(...product.variants.map((variant) => Number(variant.price) || 0))
}

export function findProductById(productId: string) {
  return loadStoredProducts().find((product) => product.id === productId) ?? null
}
