import { Link } from 'react-router-dom'
import { Seo } from '../components/Seo'

export function NotFoundPage() {
  return (
    <div className="content-section">
      <Seo title="Page not found" description="This page does not exist." noindex />
      <div className="empty-state">
        <h3>Page not found</h3>
        <p>The page you tried to open does not exist.</p>
        <Link to="/" className="primary-button">
          Back home
        </Link>
      </div>
    </div>
  )
}
