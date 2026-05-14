import { useState } from 'react'
import { Check, Copy, HeartHandshake } from 'lucide-react'
import { Seo } from '../components/Seo'
import { SectionHeading } from '../components/SiteLayout'

const DONATION_NUMBER = '0112224991'

export function DonatePage() {
  const [copied, setCopied] = useState(false)

  async function copyNumber() {
    try {
      await navigator.clipboard.writeText(DONATION_NUMBER)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="content-section">
      <Seo
        title="Donate"
        description="Support local journalism at Ochibo Times."
        path="/donate"
      />

      <section className="hero-panel" style={{ marginBottom: 0 }}>
        <div className="hero-copy">
          <SectionHeading
            eyebrow="Support"
            title="Promote local journalism"
            description="Your donation goes a long way in making us more productive and independent."
          />

          <p className="muted" style={{ maxWidth: '40rem' }}>
            Every contribution helps us report more stories, publish better books, and keep our newsroom
            focused on work that matters to the community.
          </p>

          <div className="donate-card" style={{ marginTop: '1.5rem' }}>
            <div className="card-topline">
              <span>
                <HeartHandshake size={16} />
                Donation number
              </span>
            </div>
            <div className="donate-number-row">
              <strong className="donate-number">{DONATION_NUMBER}</strong>
              <button className="primary-button" type="button" onClick={copyNumber}>
                {copied ? <Check size={16} /> : <Copy size={16} />}
                {copied ? 'Copied' : 'Copy number'}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
