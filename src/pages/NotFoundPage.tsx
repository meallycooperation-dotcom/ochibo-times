import { Link } from 'react-router-dom'

export function NotFoundPage() {
  return (
    <div className="content-section">
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
