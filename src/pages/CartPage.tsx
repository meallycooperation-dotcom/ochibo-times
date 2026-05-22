import { Link, useNavigate } from 'react-router-dom'
import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react'
import { EmptyState, SectionHeading } from '../components/SiteLayout'
import { useCart } from '../context/CartContext'
import { getCurrentSession } from '../lib/auth'
import { useState } from 'react'

function formatPrice(value: number) {
  return value.toLocaleString()
}

export function CartPage() {
  const { items, removeFromCart, updateQuantity, clearCart } = useCart()
  const navigate = useNavigate()
  const [checkoutMessage, setCheckoutMessage] = useState<string | null>(null)

  const subtotal = items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0)

  async function checkoutCart() {
    setCheckoutMessage(null)

    if (items.length === 0) {
      setCheckoutMessage('Your cart is empty.')
      return
    }

    const session = await getCurrentSession()
    if (!session?.user?.id) {
      navigate('/login')
      return
    }

    navigate('/checkout/location')
  }

  return (
    <section className="content-section">
      <SectionHeading
        eyebrow="Checkout"
        title="Cart"
        description="Review the items you have added before you place an order."
      />

      {items.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart size={18} />}
          title="Your cart is empty"
          description="Add merchandise from the store to see it here."
          action={
            <Link to="/merchandise" className="primary-button">
              Browse merchandise
            </Link>
          }
        />
      ) : (
        <div className="cart-layout">
          <div className="cart-items">
            {items.map((item) => (
              <article key={item.id} className="cart-item panel">
                {item.product_image ? (
                  <img src={item.product_image} alt={item.product_name} className="cart-item-image" />
                ) : (
                  <div className="cart-item-image product-card-image-fallback">
                    <span>No image</span>
                  </div>
                )}

                <div className="cart-item-body">
                  <div className="card-topline">
                    <span>
                      {item.variant_color || 'Default'} {item.variant_size ? `- ${item.variant_size}` : ''}
                    </span>
                    <strong>{formatPrice(item.unit_price)}</strong>
                  </div>
                  <h3>{item.product_name}</h3>
                  <div className="cart-item-controls">
                    <button
                      type="button"
                      className="secondary-button small"
                      onClick={() => updateQuantity(item.id, item.quantity - 1)}
                    >
                      <Minus size={16} />
                    </button>
                    <span className="cart-quantity">{item.quantity}</span>
                    <button
                      type="button"
                      className="secondary-button small"
                      onClick={() => updateQuantity(item.id, item.quantity + 1)}
                    >
                      <Plus size={16} />
                    </button>
                    <button
                      type="button"
                      className="danger-button small"
                      onClick={() => removeFromCart(item.id)}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <aside className="cart-summary panel">
            <h2>Order summary</h2>
            <div className="cart-summary-row">
              <span>Items</span>
              <strong>{items.reduce((sum, item) => sum + item.quantity, 0)}</strong>
            </div>
            <div className="cart-summary-row">
              <span>Subtotal</span>
              <strong>{formatPrice(subtotal)}</strong>
            </div>
            {checkoutMessage ? <p className="book-purchase-note">{checkoutMessage}</p> : null}
            <button type="button" className="primary-button" onClick={() => void checkoutCart()}>
              Checkout
            </button>
            <button type="button" className="secondary-button" onClick={clearCart}>
              Clear cart
            </button>
          </aside>
        </div>
      )}
    </section>
  )
}
