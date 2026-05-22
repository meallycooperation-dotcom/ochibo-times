export type CheckoutItemType = 'book' | 'merchandise'

export type CheckoutItem = {
  item_type: CheckoutItemType
  quantity: number
  unit_price: number
  book_format_id?: string | null
  product_variant_id?: string | null
  label?: string
}

export type InitializePaymentPayload = {
  email: string
  amount: number
  orderItems: CheckoutItem[]
  metadata?: Record<string, unknown>
  callbackUrl?: string
}

type InitializePaymentResponse = {
  authorization_url?: string
  access_code?: string
  reference?: string
}

function getBackendBaseUrl() {
  return (import.meta.env.VITE_BACKEND_BASE_URL ?? '/api').replace(/\/$/, '')
}

export async function initializePayment(payload: InitializePaymentPayload) {
  const response = await fetch(`${getBackendBaseUrl()}/payments/initializePayment`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(errorText || 'Failed to initialize payment')
  }

  return (await response.json()) as InitializePaymentResponse
}
