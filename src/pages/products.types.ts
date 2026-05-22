export type ProductVariant = {
  id: string
  product_id: string
  color: string
  size: string
  price: number
  instock: number
}

export type ProductRecord = {
  id: string
  author_id: string | null
  name: string
  description: string | null
  image_url: string | null
  variants: ProductVariant[]
  created_at: string
  updated_at: string
}

export type ProductDraft = {
  name: string
  description: string
  image_url: string
  image_file: File | null
  variants: Array<{
    id?: string
    color: string
    size: string
    price: string
    instock: string
  }>
}
