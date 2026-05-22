import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ArrowLeft, CreditCard, MapPin } from 'lucide-react'
import { Link, useNavigate } from 'react-router-dom'
import { EmptyState, SectionHeading } from '../components/SiteLayout'
import { getCurrentSession } from '../lib/auth'
import { initializePayment } from '../lib/payments'
import { supabase } from '../lib/supabase'
import { useCart } from '../context/CartContext'

type ShippingLocation = {
  id: string
  name: string
  location_type: 'county' | 'country' | 'region' | string | null
}

type AuthorShippingRate = {
  id: string
  author_id: string | null
  location_id: string
  delivery_price: number | string
  estimated_days: number | null
  created_at: string
  location: ShippingLocation | null
}

function formatPrice(value: number) {
  return value.toLocaleString()
}

function formatLocationType(value: string | null) {
  if (!value) {
    return 'Location'
  }

  return value.charAt(0).toUpperCase() + value.slice(1)
}

function normalizePrice(value: number | string) {
  return typeof value === 'number' ? value : Number(value)
}

export function CheckoutLocationPage() {
  const { items } = useCart()
  const navigate = useNavigate()
  const [checkingSession, setCheckingSession] = useState(true)
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)
  const [email, setEmail] = useState<string | null>(null)
  const [authorId, setAuthorId] = useState<string | null>(null)
  const [locations, setLocations] = useState<AuthorShippingRate[]>([])
  const [loadingLocations, setLoadingLocations] = useState(false)
  const [checkoutLoading, setCheckoutLoading] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const subtotal = useMemo(() => items.reduce((sum, item) => sum + item.unit_price * item.quantity, 0), [items])

  useEffect(() => {
    let active = true

    async function bootstrapSession() {
      const session = await getCurrentSession()

      if (!active) {
        return
      }

      if (!session?.user?.id || !session.user.email) {
        navigate('/login', { replace: true })
        return
      }

      setSessionUserId(session.user.id)
      setEmail(session.user.email)
      setCheckingSession(false)
    }

    void bootstrapSession()

    return () => {
      active = false
    }
  }, [navigate])

  const cartProductIds = useMemo(() => [...new Set(items.map((item) => item.product_id))], [items])

  useEffect(() => {
    if (cartProductIds.length === 0) {
      return
    }

    let active = true

    async function loadAuthorAndLocations() {
      try {
        setLoadingLocations(true)
        setError(null)

        const { data: productRows, error: productError } = await supabase
          .from('products')
          .select('id, author_id')
          .in('id', cartProductIds)

        if (productError) {
          throw productError
        }

        const productAuthorIds = [...new Set(((productRows ?? []) as Array<{ author_id: string | null }>).map((product) => product.author_id).filter((author): author is string => Boolean(author)))]

        if (productAuthorIds.length === 0) {
          throw new Error('Could not determine the author for this cart.')
        }

        if (productAuthorIds.length > 1) {
          if (active) {
            setAuthorId(null)
            setLocations([])
          }
          return
        }

        const nextAuthorId = productAuthorIds[0]
        const { data: ratesData, error: ratesError } = await supabase
          .from('author_shipping_rates')
          .select('id, author_id, location_id, delivery_price, estimated_days, created_at')
          .eq('author_id', nextAuthorId)
          .order('created_at', { ascending: false })

        if (ratesError) {
          throw ratesError
        }

        const rates = (ratesData ?? []) as Omit<AuthorShippingRate, 'location'>[]
        const locationIds = rates.map((rate) => rate.location_id).filter(Boolean)

        if (locationIds.length === 0) {
          if (active) {
            setAuthorId(nextAuthorId)
            setLocations([])
          }
          return
        }

        const { data: locationRows, error: locationError } = await supabase
          .from('locations')
          .select('id, name, location_type')
          .in('id', locationIds)

        if (locationError) {
          throw locationError
        }

        const locationMap = new Map(
          ((locationRows ?? []) as ShippingLocation[]).map((location) => [location.id, location]),
        )

        const nextLocations = rates
          .map((rate) => ({
            ...rate,
            delivery_price: normalizePrice(rate.delivery_price),
            location: locationMap.get(rate.location_id) ?? null,
          }))
          .filter((rate) => rate.location)

        if (!active) {
          return
        }

        setAuthorId(nextAuthorId)
        setLocations(nextLocations)
        setSelectedLocationId((current) => current || nextLocations[0]?.id || '')
      } catch (loadError) {
        if (!active) {
          return
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load delivery locations.')
        setLocations([])
      } finally {
        if (active) {
          setLoadingLocations(false)
        }
      }
    }

    void loadAuthorAndLocations()

    return () => {
      active = false
    }
  }, [cartProductIds])

  const selectedRate = useMemo(
    () => locations.find((location) => location.id === selectedLocationId) ?? null,
    [locations, selectedLocationId],
  )

  const shippingPrice = selectedRate ? normalizePrice(selectedRate.delivery_price) : 0
  const total = subtotal + shippingPrice

  async function continueToCheckout(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (items.length === 0) {
      setError('Your cart is empty.')
      return
    }

    if (!authorId) {
      setError('Checkout only works when your cart contains products from one author.')
      return
    }

    if (!selectedRate?.location) {
      setError('Select a delivery location first.')
      return
    }

    if (!sessionUserId || !email) {
      navigate('/login')
      return
    }

    setCheckoutLoading(true)
    setError(null)

    try {
      const response = await initializePayment({
        email,
        amount: total,
        orderItems: items.map((item) => ({
          item_type: 'merchandise',
          quantity: item.quantity,
          unit_price: item.unit_price,
          product_variant_id: item.product_variant_id,
          label: `${item.product_name} ${item.variant_color ? `(${item.variant_color}${item.variant_size ? `, ${item.variant_size}` : ''})` : ''}`,
        })),
        metadata: {
          userId: sessionUserId,
          kind: 'merchandise',
          authorId,
          locationId: selectedRate.location_id,
          locationName: selectedRate.location.name,
          shippingPrice,
          cartSize: items.length,
        },
        callbackUrl: `${window.location.origin}/cart`,
      })

      if (response.authorization_url) {
        window.location.assign(response.authorization_url)
        return
      }

      setError('Payment could not be started.')
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Checkout failed.')
    } finally {
      setCheckoutLoading(false)
    }
  }

  if (checkingSession) {
    return <div className="page-loading"><div className="loading-card" /></div>
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<MapPin size={18} />}
        title="Your cart is empty"
        description="Add merchandise first, then choose a delivery location before checkout."
        action={
          <Link to="/merchandise" className="primary-button">
            Browse merchandise
          </Link>
        }
      />
    )
  }

  if (items.length > 0 && !authorId && !loadingLocations) {
    return (
      <EmptyState
        icon={<MapPin size={18} />}
        title="Checkout needs one author"
        description="Your cart contains products from more than one author. Please checkout one author at a time."
        action={
          <Link to="/cart" className="primary-button">
            Back to cart
          </Link>
        }
      />
    )
  }

  return (
    <section className="content-section checkout-location-section">
      <SectionHeading
        eyebrow="Checkout"
        title="Choose a delivery location"
        description="Pick one of the locations this author has already saved, then continue to payment."
      />

      <div className="product-detail-topbar">
        <button type="button" className="secondary-button" onClick={() => navigate('/cart')}>
          <ArrowLeft size={16} />
          Back to cart
        </button>
      </div>

      <div className="checkout-location-layout">
        <form className="panel checkout-location-panel" onSubmit={continueToCheckout}>
          {error ? <div className="form-message error">{error}</div> : null}

          <label>
            Delivery location
            <select
              value={selectedLocationId}
              onChange={(event) => setSelectedLocationId(event.target.value)}
              disabled={loadingLocations || locations.length === 0}
            >
              <option value="">{locations.length === 0 ? 'No saved locations' : 'Select a location'}</option>
              {locations.map((rate) => (
                <option key={rate.id} value={rate.id}>
                  {rate.location?.name ?? 'Location'} - {formatPrice(normalizePrice(rate.delivery_price))}
                </option>
              ))}
            </select>
          </label>

          {selectedRate?.location ? (
            <div className="checkout-location-note">
              <span>{formatLocationType(selectedRate.location.location_type)}</span>
              <strong>
                Delivery: {formatPrice(shippingPrice)}
                {selectedRate.estimated_days ? ` - ${selectedRate.estimated_days} days` : ''}
              </strong>
            </div>
          ) : null}

          <button
            type="submit"
            className="primary-button"
            disabled={checkoutLoading || loadingLocations || locations.length === 0}
          >
            <CreditCard size={16} />
            {checkoutLoading ? 'Starting payment...' : 'Continue to checkout'}
          </button>
        </form>

        <aside className="panel checkout-summary-panel">
          <h2>Order summary</h2>
          <div className="cart-summary-row">
            <span>Items</span>
            <strong>{items.reduce((sum, item) => sum + item.quantity, 0)}</strong>
          </div>
          <div className="cart-summary-row">
            <span>Subtotal</span>
            <strong>{formatPrice(subtotal)}</strong>
          </div>
          <div className="cart-summary-row">
            <span>Delivery</span>
            <strong>{formatPrice(shippingPrice)}</strong>
          </div>
          <hr className="section-divider" />
          <div className="cart-summary-row">
            <span>Total</span>
            <strong>{formatPrice(total)}</strong>
          </div>
        </aside>
      </div>
    </section>
  )
}
