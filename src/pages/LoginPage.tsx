import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogIn } from 'lucide-react'
import { AuthShell } from '../components/AuthShell'
import { getCurrentSession, getProfileById, isAdminSession } from '../lib/auth'
import { supabase } from '../lib/supabase'

export function LoginPage() {
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    let active = true

    async function checkExistingSession() {
      const session = await getCurrentSession()
      if (!active || !session) {
        return
      }

      const admin = await isAdminSession(session)
      if (admin) {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/profile', { replace: true })
      }
    }

    checkExistingSession()

    return () => {
      active = false
    }
  }, [navigate])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })

      if (error) {
        throw error
      }

      const admin = await isAdminSession(data.session)
      if (admin) {
        navigate('/dashboard', { replace: true })
      } else {
        navigate('/profile', { replace: true })
      }
    } catch (loginError) {
      setMessage(loginError instanceof Error ? loginError.message : 'Login failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Login"
      subtitle="Sign in to your account to view your profile and access dashboard if you're an admin."
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>

        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="••••••••"
            required
          />
        </label>

        <button type="submit" className="primary-button auth-submit" disabled={loading}>
          <LogIn size={16} />
          {loading ? 'Signing in...' : 'Login'}
        </button>
      </form>

      {message ? <p className="form-message error">{message}</p> : null}

      <p className="auth-footer-note">
        Need an account? <Link to="/signup">Create one here</Link>.
      </p>
    </AuthShell>
  )
}
