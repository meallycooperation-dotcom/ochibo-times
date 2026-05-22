import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, ShoppingBag } from 'lucide-react'
import { EmptyState, SectionHeading } from '../components/SiteLayout'
import { useCart } from '../context/CartContext'
import { getProductPrice, syncProducts } from '../lib/merchandise'
import type { ProductRecord } from './products.types'

function formatPrice(value: number) {
  return value.toLocaleString()
}

export function ProductDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { addToCart } = useCart()
  const [product, setProduct] = useState<ProductRecord | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function loadProduct() {
      try {
        setLoading(true)
        const products = await syncProducts()
        if (!active) return
        setProduct(id ? products.find((entry) => entry.id === id) ?? null : null)
        setError(null)
      } catch (loadError) {
        if (!active) return
        setError(loadError instanceof Error ? loadError.message : 'Failed to load product')
        setProduct(null)
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadProduct()

    return () => {
      active = false
    }
  }, [id])

  const defaultVariant = useMemo(() => product?.variants[0] ?? null, [product])

  if (loading) {
    return <div className="loading-card" />
  }

  if (error) {
    return <EmptyState title="Could not load product" description={error} />
  }

  if (!product) {
    return (
      <EmptyState
        icon={<ShoppingBag size={18} />}
        title="Product not found"
        description="The product you are looking for may have been removed."
        action={
          <Link to="/merchandise" className="primary-button">
            Back to merchandise
          </Link>
        }
      />
    )
  }

  return (
    <section className="content-section">
      <div className="product-detail-topbar">
        <button type="button" className="secondary-button" onClick={() => navigate('/merchandise')}>
          <ArrowLeft size={16} />
          Back to merchandise
        </button>
        <Link to="/cart" className="secondary-button">
          Cart
        </Link>
      </div>

      <SectionHeading
        eyebrow="Product"
        title={product.name}
        description={product.description || 'No description added yet.'}
      />

      <div className="product-detail-layout">
        {product.image_url ? (
          <img src={product.image_url} alt={product.name} className="product-detail-image" />
        ) : (
          <div className="product-detail-image product-card-image-fallback">
            <span>No image</span>
          </div>
        )}

        <div className="product-detail-panel panel">
          <div className="card-topline">
            <span>
              {product.variants.length} available variant{product.variants.length === 1 ? '' : 's'}
            </span>
            <strong>{formatPrice(getProductPrice(product))}</strong>
          </div>

          <div className="product-variant-list">
            {product.variants.map((variant, index) => (
              <button
                key={`${variant.color}-${variant.size}-${index}`}
                type="button"
                className="product-variant-option"
                onClick={() => addToCart(product, variant)}
              >
                <span>
                  {variant.color || 'No color'} {variant.size ? `- ${variant.size}` : ''}
                </span>
                <strong>{formatPrice(Number(variant.price) || 0)}</strong>
                </button>
              ))}
          </div>

          <button type="button" className="primary-button" onClick={() => addToCart(product, defaultVariant ?? undefined)}>
            Add default to cart
          </button>
        </div>
      </div>
    </section>
  )
}
