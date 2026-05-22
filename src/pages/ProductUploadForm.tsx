import { useState, type ChangeEvent } from 'react'
import { Plus, Save, Trash2, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import type { ProductDraft, ProductRecord } from './products.types'

type ProductUploadFormProps = {
  initialProduct: ProductRecord | null
  onCancel: () => void
  onPublish: (product: ProductRecord) => void
}

const emptyDraft: ProductDraft = {
  name: '',
  description: '',
  image_url: '',
  image_file: null,
  variants: [
    {
      color: '',
      size: '',
      price: '',
      instock: '',
    },
  ],
}

function buildDraft(product: ProductRecord | null): ProductDraft {
  if (!product) {
    return emptyDraft
  }

  return {
    name: product.name,
    description: product.description ?? '',
    image_url: product.image_url ?? '',
    image_file: null,
    variants: product.variants.length
      ? product.variants.map((variant) => ({
          id: variant.id,
          color: variant.color,
          size: variant.size,
          price: String(variant.price),
          instock: String(variant.instock),
        }))
      : emptyDraft.variants,
  }
}

export function ProductUploadForm({ initialProduct, onCancel, onPublish }: ProductUploadFormProps) {
  const [product, setProduct] = useState<ProductDraft>(() => buildDraft(initialProduct))
  const [isSaving, setIsSaving] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)

  function sanitizeFileName(value: string) {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9._-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/(^-|-$)+/g, '')
  }

  const handleChange = (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = event.target
    setProduct((current) => ({
      ...current,
      [name]: value,
    }))
  }

  const handleImageChange = (event: ChangeEvent<HTMLInputElement>) => {
    setProduct((current) => ({
      ...current,
      image_file: event.target.files?.[0] ?? null,
    }))
  }

  const handleVariantChange = (
    index: number,
    field: keyof ProductDraft['variants'][number],
    value: string,
  ) => {
    setProduct((current) => {
      const updatedVariants = current.variants.map((variant, variantIndex) =>
        variantIndex === index ? { ...variant, [field]: value } : variant,
      )

      return {
        ...current,
        variants: updatedVariants,
      }
    })
  }

  const addVariant = () => {
    setProduct((current) => ({
      ...current,
      variants: [
        ...current.variants,
        {
          id: crypto.randomUUID(),
          color: '',
          size: '',
          price: '',
          instock: '',
        },
      ],
    }))
  }

  const removeVariant = (index: number) => {
    setProduct((current) => {
      const updatedVariants = current.variants.filter((_, variantIndex) => variantIndex !== index)

      return {
        ...current,
        variants: updatedVariants.length
          ? updatedVariants
          : [
              {
                id: crypto.randomUUID(),
                color: '',
                size: '',
                price: '',
                instock: '',
              },
            ],
      }
    })
  }

  const publishProduct = async () => {
    const productId = initialProduct?.id ?? crypto.randomUUID()
    const normalizedVariants = product.variants
      .filter((variant) => variant.color.trim() || variant.size.trim() || variant.price.trim() || variant.instock.trim())
      .map((variant) => ({
        id: variant.id ?? crypto.randomUUID(),
        product_id: productId,
        color: variant.color.trim(),
        size: variant.size.trim(),
        price: Number(variant.price) || 0,
        instock: Number(variant.instock) || 0,
      }))

    try {
      setIsSaving(true)
      setStatusMessage(null)

      const now = new Date().toISOString()
      let imageUrl = initialProduct?.image_url ?? ''

      if (product.image_file) {
        const safeName = sanitizeFileName(product.image_file.name) || 'product-image'
        const path = `products/${crypto.randomUUID()}-${safeName}`

        const { error: uploadError } = await supabase.storage.from('products').upload(path, product.image_file, {
          upsert: true,
        })

        if (uploadError) {
          throw uploadError
        }

        const { data } = supabase.storage.from('products').getPublicUrl(path)
        imageUrl = data.publicUrl
      }

      onPublish({
        id: productId,
        author_id: initialProduct?.author_id ?? null,
        name: product.name.trim(),
        description: product.description.trim(),
        image_url: imageUrl,
        variants: normalizedVariants.length
          ? normalizedVariants
          : [
              {
                id: crypto.randomUUID(),
                product_id: productId,
                color: '',
                size: '',
                price: 0,
                instock: 0,
              },
            ],
        created_at: initialProduct?.created_at ?? now,
        updated_at: now,
      })

      const productRow = {
        id: productId,
        author_id: initialProduct?.author_id ?? null,
        name: product.name.trim(),
        description: product.description.trim() || null,
        image_url: imageUrl || null,
        created_at: initialProduct?.created_at ?? now,
        updated_at: now,
      }

      const { error: productError } = await supabase.from('products').upsert(productRow)
      if (productError) {
        throw productError
      }

      const { error: deleteVariantsError } = await supabase.from('product_variants').delete().eq('product_id', productId)
      if (deleteVariantsError) {
        throw deleteVariantsError
      }

      const variantsToInsert = (normalizedVariants.length
        ? normalizedVariants
        : [
            {
              id: crypto.randomUUID(),
              product_id: productId,
              color: '',
              size: '',
              price: 0,
              instock: 0,
            },
          ]
      ).map((variant) => ({
        id: variant.id,
        product_id: variant.product_id,
        color: variant.color,
        size: variant.size,
        price: variant.price,
        instock: variant.instock,
      }))

      const { error: variantsError } = await supabase.from('product_variants').insert(variantsToInsert)
      if (variantsError) {
        throw variantsError
      }

      setStatusMessage('Product saved.')
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Failed to upload product image.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="panel product-editor-panel">
      <div className="panel-header">
        <h2>{initialProduct ? 'Edit product' : 'Upload merchandise'}</h2>
        <button type="button" className="secondary-button" onClick={onCancel}>
          <X size={16} />
          Close
        </button>
      </div>

      {statusMessage ? <div className="form-message info">{statusMessage}</div> : null}

      <form
        className="editor-form product-editor-form"
        onSubmit={(event) => {
          event.preventDefault()
          void publishProduct()
        }}
      >
        <label>
          Product name
          <input
            type="text"
            name="name"
            placeholder="Product Name"
            value={product.name}
            onChange={handleChange}
            required
          />
        </label>

        <label>
          Description
          <textarea
            name="description"
            placeholder="Description"
            value={product.description}
            onChange={handleChange}
            rows={4}
          />
        </label>

        <label>
          Product image
          <input type="file" accept="image/*" onChange={handleImageChange} />
          {initialProduct && !product.image_file ? (
            <p className="field-hint">Current image will be kept unless you choose a new file.</p>
          ) : (
            <p className="field-hint">Upload an image from your device. It will be saved to the products bucket.</p>
          )}
        </label>

        <div className="product-variants-head">
          <h3>Variants</h3>
          <button type="button" className="secondary-button small" onClick={addVariant}>
            <Plus size={16} />
            Add variant
          </button>
        </div>

        {product.variants.map((variant, index) => (
          <div key={index} className="product-variant-card">
            <div className="product-variant-grid">
              <label>
                Color
                <input
                  type="text"
                  placeholder="Color"
                  value={variant.color}
                  onChange={(event) => handleVariantChange(index, 'color', event.target.value)}
                />
              </label>

              <label>
                Size
                <select
                  value={variant.size}
                  onChange={(event) => handleVariantChange(index, 'size', event.target.value)}
                >
                  <option value="">Select Size</option>
                  <option value="S">S</option>
                  <option value="M">M</option>
                  <option value="L">L</option>
                  <option value="XL">XL</option>
                  <option value="XXL">XXL</option>
                </select>
              </label>

              <label>
                Price
                <input
                  type="number"
                  min="0"
                  placeholder="Price"
                  value={variant.price}
                  onChange={(event) => handleVariantChange(index, 'price', event.target.value)}
                />
              </label>

              <label>
                Stock
                <input
                  type="number"
                  min="0"
                  placeholder="Stock"
                  value={variant.instock}
                  onChange={(event) => handleVariantChange(index, 'instock', event.target.value)}
                />
              </label>
            </div>

            <div className="product-variant-actions">
              <button
                type="button"
                className="danger-button small"
                onClick={() => removeVariant(index)}
                disabled={product.variants.length === 1}
              >
                <Trash2 size={16} />
                Remove
              </button>
            </div>
          </div>
        ))}

        <div className="form-row">
          <button type="submit" className="primary-button" disabled={isSaving}>
            <Save size={16} />
            {isSaving ? 'Saving...' : initialProduct ? 'Save changes' : 'Publish product'}
          </button>
          <button type="button" className="secondary-button" onClick={addVariant} disabled={isSaving}>
            <Plus size={16} />
            Add another variant
          </button>
        </div>
      </form>
    </section>
  )
}
