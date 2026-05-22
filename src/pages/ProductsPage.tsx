import { useEffect, useMemo, useState } from 'react'
import { PencilLine, PlusCircle, Trash2 } from 'lucide-react'
import { EmptyState } from '../components/SiteLayout'
import { getProductPrice, loadStoredProducts, saveStoredProducts } from '../lib/products'
import { syncProducts } from '../lib/merchandise'
import type { ProductRecord } from './products.types'
import { ProductUploadForm } from './ProductUploadForm'

function formatPrice(value: number) {
  return value.toLocaleString()
}

export function ProductsPage() {
  const [products, setProducts] = useState<ProductRecord[]>(() => loadStoredProducts())
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingProduct, setEditingProduct] = useState<ProductRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadProducts() {
      try {
        setLoading(true)
        const data = await syncProducts()
        if (!active) return
        setProducts(data)
        setError(null)
        saveStoredProducts(data)
      } catch (loadError) {
        if (!active) return
        const fallback = loadStoredProducts()
        setProducts(fallback)
        setError(loadError instanceof Error ? loadError.message : 'Failed to load products from the database')
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadProducts()

    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!loading) {
      saveStoredProducts(products)
    }
  }, [products, loading])

  const orderedProducts = useMemo(
    () => [...products].sort((left, right) => right.updated_at.localeCompare(left.updated_at)),
    [products],
  )

  function openUploadForm() {
    setEditingProduct(null)
    setIsFormOpen(true)
  }

  function editProduct(product: ProductRecord) {
    setEditingProduct(product)
    setIsFormOpen(true)
  }

  function deleteProduct(id: string) {
    const confirmed = window.confirm('Delete this product?')
    if (!confirmed) {
      return
    }

    setProducts((current) => current.filter((product) => product.id !== id))
  }

  return (
    <section className="panel products-panel">
      <div className="panel-header">
        <div className="product-page-title">
          <p className="eyebrow">Admin</p>
          <h2>Products</h2>
          <p>Upload merchandise, manage variants, and keep the catalog ready for the storefront.</p>
        </div>

        <button className="primary-button" onClick={openUploadForm}>
          <PlusCircle size={16} />
          Upload product
        </button>
      </div>

      {error ? <EmptyState title="Using cached products" description={error} /> : null}

      {isFormOpen ? (
        <ProductUploadForm
          key={editingProduct?.id ?? 'new-product'}
          initialProduct={editingProduct}
          onCancel={() => {
            setIsFormOpen(false)
            setEditingProduct(null)
          }}
          onPublish={(nextProduct) => {
            setProducts((current) => {
              const exists = current.some((product) => product.id === nextProduct.id)
              if (exists) {
                return current.map((product) => (product.id === nextProduct.id ? nextProduct : product))
              }

              return [nextProduct, ...current]
            })
            setIsFormOpen(false)
            setEditingProduct(null)
          }}
        />
      ) : null}

      {loading ? (
        <div className="loading-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="loading-card" />
          ))}
        </div>
      ) : orderedProducts.length === 0 ? (
        <EmptyState
          title="No products yet"
          description="Use the upload button above to create the first product card."
          action={
            <button className="primary-button" onClick={openUploadForm}>
              <PlusCircle size={16} />
              Upload product
            </button>
          }
        />
      ) : (
        <div className="product-grid">
          {orderedProducts.map((product) => {
            const price = getProductPrice(product)
            const priceLabel = product.variants.length > 1 ? 'From' : 'Price'

            return (
              <article key={product.id} className="product-card dashboard-card">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} className="product-card-image" />
                ) : (
                  <div className="product-card-image product-card-image-fallback">
                    <span>No image</span>
                  </div>
                )}

                <div className="product-card-body">
                  <div className="card-topline">
                    <span>{product.variants.length} variant{product.variants.length === 1 ? '' : 's'}</span>
                    <span>{new Date(product.updated_at).toLocaleDateString()}</span>
                  </div>
                  <h3>{product.name}</h3>
                  <p>{product.description || 'No description added yet.'}</p>
                  <strong className="product-card-price">
                    {priceLabel}: {formatPrice(price)}
                  </strong>
                </div>

                <div className="card-actions product-card-actions">
                  <button className="secondary-button small" onClick={() => editProduct(product)}>
                    <PencilLine size={16} />
                    Edit
                  </button>
                  <button className="danger-button small" onClick={() => deleteProduct(product.id)}>
                    <Trash2 size={16} />
                    Delete
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}
