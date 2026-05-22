import { supabase } from './supabase'
import { loadStoredProducts } from './products'
import type { ProductRecord, ProductVariant } from '../pages/products.types'

function normalizeVariant(variant: ProductVariant): ProductVariant {
  return {
    id: variant.id,
    product_id: variant.product_id,
    color: variant.color,
    size: variant.size,
    price: Number(variant.price) || 0,
    instock: Number(variant.instock) || 0,
  }
}

export function getProductPrice(product: ProductRecord) {
  const prices = product.variants.map((variant) => Number(variant.price) || 0)
  if (prices.length === 0) {
    return 0
  }

  return Math.min(...prices)
}

export async function syncProducts(): Promise<ProductRecord[]> {
  const [{ data: products, error: productsError }, { data: variants, error: variantsError }] =
    await Promise.all([
      supabase.from('products').select('id, author_id, name, description, image_url, created_at, updated_at'),
      supabase.from('product_variants').select('id, product_id, color, size, price, instock'),
    ])

  const storedProducts = loadStoredProducts()
  const variantList = (variantsError ? [] : ((variants ?? []) as ProductVariant[])).map(normalizeVariant)

  if (productsError) {
    if (storedProducts.length > 0) {
      return storedProducts
        .map((product) => ({
          ...product,
          description: product.description ?? '',
          image_url: product.image_url ?? '',
          updated_at: product.updated_at ?? product.created_at,
        }))
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
    }

    throw productsError
  }

  const dbProducts = ((products ?? []) as ProductRecord[]).map((product) => ({
    ...product,
    description: product.description ?? '',
    image_url: product.image_url ?? '',
    updated_at: product.updated_at ?? product.created_at,
    variants: variantList.filter((variant) => variant.product_id === product.id),
  }))

  if (dbProducts.length > 0) {
    return dbProducts.sort((left, right) => right.updated_at.localeCompare(left.updated_at))
  }

  return storedProducts
    .map((product) => ({
      ...product,
      description: product.description ?? '',
      image_url: product.image_url ?? '',
      updated_at: product.updated_at ?? product.created_at,
    }))
    .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
}

export async function getProductById(productId: string) {
  const products = await syncProducts()
  return products.find((product) => product.id === productId) ?? null
}
