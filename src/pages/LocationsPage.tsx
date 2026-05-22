import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { CheckCircle2, MapPin, RefreshCcw, Save, Search } from 'lucide-react'
import { EmptyState } from '../components/SiteLayout'
import { supabase } from '../lib/supabase'

type LocationRecord = {
  id: string
  name: string
  location_type: 'county' | 'country' | 'region' | string | null
}

type ShippingRateRecord = {
  id: string
  author_id: string | null
  location_id: string
  delivery_price: number | string
  estimated_days: number | null
  created_at: string
}

type LocationsPageProps = {
  sessionUserId: string | null
}

type LocationOption = LocationRecord & {
  rate: ShippingRateRecord | null
}

const locationTypeOrder: Record<string, number> = {
  county: 0,
  country: 1,
  region: 2,
}

function formatPrice(value: number) {
  return new Intl.NumberFormat('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
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

export function LocationsPage({ sessionUserId }: LocationsPageProps) {
  const [locations, setLocations] = useState<LocationRecord[]>([])
  const [rates, setRates] = useState<ShippingRateRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedLocationId, setSelectedLocationId] = useState('')
  const [deliveryPrice, setDeliveryPrice] = useState('')

  useEffect(() => {
    if (!sessionUserId) {
      return
    }

    let active = true

    async function loadLocations() {
      try {
        setLoading(true)
        const [{ data: locationRows, error: locationError }, { data: rateRows, error: rateError }] =
          await Promise.all([
            supabase.from('locations').select('id, name, location_type').order('location_type', { ascending: true }).order('name', { ascending: true }),
            supabase
              .from('author_shipping_rates')
              .select('id, author_id, location_id, delivery_price, estimated_days, created_at')
              .eq('author_id', sessionUserId)
              .order('created_at', { ascending: false }),
          ])

        if (locationError) {
          throw locationError
        }

        if (rateError) {
          throw rateError
        }

        if (!active) {
          return
        }

        const nextLocations = (locationRows ?? []) as LocationRecord[]
        const nextRates = (rateRows ?? []) as ShippingRateRecord[]

        setLocations(nextLocations)
        setRates(nextRates)
        setError(null)
      } catch (loadError) {
        if (!active) {
          return
        }

        setError(loadError instanceof Error ? loadError.message : 'Failed to load locations.')
        setLocations([])
        setRates([])
      } finally {
        if (active) {
          setLoading(false)
        }
      }
    }

    void loadLocations()

    return () => {
      active = false
    }
  }, [sessionUserId])

  const locationOptions = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase()

    return [...locations]
      .sort((left, right) => {
        const leftOrder = locationTypeOrder[left.location_type ?? ''] ?? 99
        const rightOrder = locationTypeOrder[right.location_type ?? ''] ?? 99

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder
        }

        return left.name.localeCompare(right.name)
      })
      .filter((location) => {
        if (!normalizedSearch) {
          return true
        }

        return (
          location.name.toLowerCase().includes(normalizedSearch) ||
          formatLocationType(location.location_type).toLowerCase().includes(normalizedSearch)
        )
      })
  }, [locations, searchTerm])

  const selectedLocation = locations.find((location) => location.id === selectedLocationId) ?? null
  const selectedRate = rates.find((rate) => rate.location_id === selectedLocationId) ?? null

  const dropdownLocations = useMemo(() => {
    if (!selectedLocation) {
      return locationOptions
    }

    if (locationOptions.some((location) => location.id === selectedLocation.id)) {
      return locationOptions
    }

    return [selectedLocation, ...locationOptions]
  }, [locationOptions, selectedLocation])

  const groupedLocations = useMemo(() => {
    return dropdownLocations.reduce<Record<string, LocationOption[]>>((groups, location) => {
      const rate = rates.find((entry) => entry.location_id === location.id) ?? null
      const groupKey = location.location_type ?? 'other'

      if (!groups[groupKey]) {
        groups[groupKey] = []
      }

      groups[groupKey].push({
        ...location,
        rate,
      })

      return groups
    }, {})
  }, [dropdownLocations, rates])

  const displayedRates = useMemo(() => {
    return [...locations]
      .map((location) => {
        const rate = rates.find((entry) => entry.location_id === location.id) ?? null

        return {
          ...location,
          rate,
        }
      })
      .sort((left, right) => {
        const leftOrder = locationTypeOrder[left.location_type ?? ''] ?? 99
        const rightOrder = locationTypeOrder[right.location_type ?? ''] ?? 99

        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder
        }

        return left.name.localeCompare(right.name)
      })
  }, [locations, rates])

  async function saveRate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!sessionUserId) {
      setError('You must be signed in to save shipping rates.')
      return
    }

    if (!selectedLocationId) {
      setError('Choose a delivery location first.')
      return
    }

    const parsedPrice = Number(deliveryPrice)
    if (!Number.isFinite(parsedPrice) || parsedPrice < 0) {
      setError('Enter a valid delivery price.')
      return
    }

    setSaving(true)
    setStatusMessage(null)
    setError(null)

    const payload = {
      author_id: sessionUserId,
      location_id: selectedLocationId,
      delivery_price: parsedPrice,
      estimated_days: selectedRate?.estimated_days ?? null,
    }

    const { data, error: saveError } = await supabase
      .from('author_shipping_rates')
      .upsert(payload, { onConflict: 'author_id,location_id' })
      .select('id, author_id, location_id, delivery_price, estimated_days, created_at')
      .single()

    if (saveError) {
      setError(saveError.message)
      setSaving(false)
      return
    }

    const nextRate = data as ShippingRateRecord
    setRates((current) => {
      const exists = current.some((rate) => rate.location_id === nextRate.location_id)
      if (exists) {
        return current.map((rate) => (rate.location_id === nextRate.location_id ? nextRate : rate))
      }

      return [nextRate, ...current]
    })
    setStatusMessage('Delivery rate saved.')
    setSaving(false)
  }

  function startEditing(location: LocationRecord, rate: ShippingRateRecord | null) {
    setSelectedLocationId(location.id)
    setDeliveryPrice(rate ? String(normalizePrice(rate.delivery_price)) : '')
    setStatusMessage(null)
    setError(null)
  }

  return (
    <section className="panel locations-panel">
      <div className="panel-header">
        <div className="product-page-title">
          <p className="eyebrow">Admin</p>
          <h2>Locations</h2>
          <p>Choose where each author can deliver and set the shipping price for that destination.</p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setSearchTerm('')
            setError(null)
            setStatusMessage(null)
          }}
        >
          <RefreshCcw size={16} />
          Clear filters
        </button>
      </div>

      {statusMessage ? <div className="form-message success">{statusMessage}</div> : null}
      {error ? <div className="form-message error">{error}</div> : null}

      <form className="editor-form locations-form" onSubmit={saveRate}>
        <label>
          Search locations
          <div className="input-icon-wrap">
            <Search size={16} />
            <input
              type="text"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search counties, countries, and regions"
            />
          </div>
        </label>

        <label>
          Delivery location
          <select
            value={selectedLocationId}
            onChange={(event) => {
              const nextId = event.target.value
              setSelectedLocationId(nextId)
              const nextRate = rates.find((rate) => rate.location_id === nextId) ?? null
              setDeliveryPrice(nextRate ? String(normalizePrice(nextRate.delivery_price)) : '')
              setStatusMessage(null)
              setError(null)
            }}
            disabled={locationOptions.length === 0}
          >
            <option value="">{locationOptions.length === 0 ? 'No matching locations' : 'Select a location'}</option>
            {Object.entries(groupedLocations).map(([groupName, entries]) => (
              <optgroup key={groupName} label={formatLocationType(groupName === 'other' ? null : groupName)}>
                {entries.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                    {location.rate ? ` - ${formatPrice(normalizePrice(location.rate.delivery_price))}` : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

        <label>
          Delivery price
          <input
            type="number"
            min="0"
            step="0.01"
            value={deliveryPrice}
            onChange={(event) => setDeliveryPrice(event.target.value)}
            placeholder="Enter delivery price"
          />
        </label>

        <div className="form-row">
          <button type="submit" className="primary-button" disabled={saving || loading}>
            <Save size={16} />
            {saving ? 'Saving...' : 'Save delivery rate'}
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => {
              if (selectedLocation) {
                const rate = selectedRate ? String(normalizePrice(selectedRate.delivery_price)) : ''
                setDeliveryPrice(rate)
              } else {
                setDeliveryPrice('')
              }
            }}
            disabled={!selectedLocation}
          >
            <MapPin size={16} />
            Reset price
          </button>
        </div>
      </form>

      <div className="location-summary-strip">
        <div className="metric-card">
          <strong>{locations.length}</strong>
          <span>Total locations</span>
        </div>
        <div className="metric-card">
          <strong>{rates.length}</strong>
          <span>Saved rates</span>
        </div>
        <div className="metric-card">
          <strong>{selectedLocation ? selectedLocation.name : 'None'}</strong>
          <span>Current selection</span>
        </div>
      </div>

      {loading ? (
        <div className="loading-grid">
          {Array.from({ length: 3 }).map((_, index) => (
            <div key={index} className="loading-card" />
          ))}
        </div>
      ) : displayedRates.length === 0 ? (
        <EmptyState
          title="No locations found"
          description="Try a different search term, or make sure the locations table has data."
        />
      ) : (
        <div className="location-rate-grid">
          {displayedRates.map((location) => {
            const rate = location.rate ? normalizePrice(location.rate.delivery_price) : null
            const isSelected = location.id === selectedLocationId

            return (
              <article key={location.id} className={isSelected ? 'dashboard-card location-rate-card active' : 'dashboard-card location-rate-card'}>
                <div className="card-topline">
                  <span>{formatLocationType(location.location_type)}</span>
                  <span>{location.rate ? 'Enabled' : 'Unset'}</span>
                </div>
                <h3>{location.name}</h3>
                <p>
                  {rate !== null ? `Delivery price: ${formatPrice(rate)}` : 'No price set yet.'}
                </p>
                <div className="card-actions">
                  <button type="button" className="secondary-button small" onClick={() => startEditing(location, location.rate)}>
                    <CheckCircle2 size={16} />
                    {isSelected ? 'Editing' : 'Edit'}
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
