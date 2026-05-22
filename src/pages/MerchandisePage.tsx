import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { ArrowRight, ShoppingBag } from 'lucide-react'
import { EmptyState, SectionHeading } from '../components/SiteLayout'
import { useCart } from '../context/CartContext'
import { getProductPrice, syncProducts } from '../lib/merchandise'
import type { ProductRecord, ProductVariant } from './products.types'

function formatPrice(value: number) {
  return value.toLocaleString()
}

export function MerchandisePage() {
  const navigate = useNavigate()
  const { addToCart } = useCart()
  const [products, setProducts] = useState<ProductRecord[]>([])
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
      } catch (loadError) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load merchandise')
        setProducts([])
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

  function openProduct(productId: string) {
    navigate(`/merchandise/${productId}`)
  }

  function addProductToCart(product: ProductRecord, variant?: ProductVariant) {
    addToCart(product, variant)
  }

  return (
    <section className="content-section">
      <SectionHeading
        eyebrow="Store"
        title="Merchandise"
        description="Browse the latest products and open a product to see more details before you add it to cart."
      />

      {loading ? (
        <div className="loading-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="loading-card" />
          ))}
        </div>
      ) : error ? (
        <EmptyState title="Could not load merchandise" description={error} />
      ) : products.length === 0 ? (
        <EmptyState
          icon={<ShoppingBag size={18} />}
          title="No merchandise yet"
          description="Products added will and should appear here."
          action={
            <Link to="/" className="secondary-button">
              Back home
            </Link>
          }
        />
      ) : (
        <div className="product-grid storefront-grid">
          {products.map((product) => {
            const price = getProductPrice(product)
            const defaultVariant = product.variants[0]

            return (
              <article
                key={product.id}
                className="product-card storefront-card dashboard-card"
                role="button"
                tabIndex={0}
                onClick={() => openProduct(product.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openProduct(product.id)
                  }
                }}
              >
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
                    <span className="storefront-price">{formatPrice(price)}</span>
                  </div>
                  <h3>{product.name}</h3>
                </div>

                <div className="card-actions product-card-actions">
                  <button
                    type="button"
                    className="primary-button small"
                    onClick={(event) => {
                      event.stopPropagation()
                      addProductToCart(product, defaultVariant)
                    }}
                  >
                    Add to cart
                    <ArrowRight size={16} />
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
