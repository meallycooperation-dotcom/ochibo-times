import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import { getCurrentSession } from '../lib/auth'
import type { ProductRecord, ProductVariant } from '../pages/products.types'

/* eslint-disable react-refresh/only-export-components */

export type CartItem = {
  id: string
  product_id: string
  product_variant_id: string
  product_name: string
  product_image: string
  variant_color: string
  variant_size: string
  unit_price: number
  quantity: number
}

type CartContextType = {
  items: CartItem[]
  itemCount: number
  addToCart: (product: ProductRecord, variant?: ProductVariant, quantity?: number) => void
  removeFromCart: (itemId: string) => void
  updateQuantity: (itemId: string, quantity: number) => void
  clearCart: () => void
}

const CartContext = createContext<CartContextType | null>(null)

function getCartStorageKey(userId: string | null) {
  return userId ? `ochibo-cart:${userId}` : 'ochibo-cart:guest'
}

function loadCart(storageKey: string): CartItem[] {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(storageKey)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as CartItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [sessionUserId, setSessionUserId] = useState<string | null>(null)

  useEffect(() => {
    let active = true

    async function bootstrapSession() {
      const session = await getCurrentSession()
      if (!active) {
        return
      }

      setSessionUserId(session?.user?.id ?? null)
    }

    bootstrapSession()

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSessionUserId(nextSession?.user?.id ?? null)
    })

    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  return (
    <CartProviderInner key={sessionUserId ?? 'guest'} storageUserId={sessionUserId}>
      {children}
    </CartProviderInner>
  )
}

function CartProviderInner({
  storageUserId,
  children,
}: {
  storageUserId: string | null
  children: ReactNode
}) {
  const storageKey = getCartStorageKey(storageUserId)
  const [items, setItems] = useState<CartItem[]>(() => loadCart(storageKey))

  useEffect(() => {
    if (typeof window === 'undefined') {
      return
    }

    window.localStorage.setItem(storageKey, JSON.stringify(items))
  }, [items, storageKey])

  const value = useMemo<CartContextType>(() => {
    return {
      items,
      itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
      addToCart(product, variant, quantity = 1) {
        const chosenVariant = variant ?? product.variants[0]
        const unitPrice = Number(chosenVariant?.price) || 0
        const key = chosenVariant?.id ?? `${product.id}:${chosenVariant?.color ?? ''}:${chosenVariant?.size ?? ''}`

        setItems((current) => {
          const existing = current.find((item) => item.id === key)
          if (existing) {
            return current.map((item) =>
              item.id === key
                ? {
                    ...item,
                    quantity: Math.max(1, item.quantity + quantity),
                  }
                : item,
            )
          }

          return [
            {
              id: key,
              product_id: product.id,
              product_variant_id: chosenVariant?.id ?? key,
              product_name: product.name,
              product_image: product.image_url ?? '',
              variant_color: chosenVariant?.color ?? '',
              variant_size: chosenVariant?.size ?? '',
              unit_price: unitPrice,
              quantity: Math.max(1, quantity),
            },
            ...current,
          ]
        })
      },
      removeFromCart(itemId) {
        setItems((current) => current.filter((item) => item.id !== itemId))
      },
      updateQuantity(itemId, quantity) {
        setItems((current) =>
          current.map((item) =>
            item.id === itemId
              ? {
                  ...item,
                  quantity: Math.max(1, quantity),
                }
              : item,
          ),
        )
      },
      clearCart() {
        setItems([])
      },
    }
  }, [items])

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart() {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart must be used within a CartProvider')
  }

  return context
}
