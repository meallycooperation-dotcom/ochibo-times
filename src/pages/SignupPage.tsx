import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { AuthShell } from '../components/AuthShell'
import { Seo } from '../components/Seo'
import { supabase } from '../lib/supabase'
import { upsertCachedProfile } from '../lib/cache'

export function SignupPage() {
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [message, setMessage] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setLoading(true)
    setMessage(null)

    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim().toLowerCase(),
        password,
        options: {
          data: {
            name,
          },
        },
      })

      if (error) {
        throw error
      }

      if (!data.user?.id) {
        throw new Error('Failed to create user account')
      }

      // Insert user into profiles table
      const { error: profileError } = await supabase.from('profiles').insert({
        id: data.user.id,
        name,
        email: email.trim().toLowerCase(),
        role: 'user',
      })

      if (profileError) {
        throw profileError
      }

      await upsertCachedProfile({
        id: data.user.id,
        name,
        email: email.trim().toLowerCase(),
        role: 'user',
        avatar_url: null,
      })

      setMessage(
        'Signup successful. Check your email if confirmation is enabled, then sign in.'
      )

      setTimeout(() => {
        navigate('/login')
      }, 1500)
    } catch (signupError) {
      setMessage(signupError instanceof Error ? signupError.message : 'Signup failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Create your account"
      subtitle="Sign up for your personal profile."
    >
      <Seo title="Sign up" description="Create your Ochibo Times account." noindex />
      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          Full name
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Brian Ochieng"
            required
          />
        </label>

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
            placeholder="Create a password"
            minLength={6}
            required
          />
        </label>

        <button type="submit" className="primary-button auth-submit" disabled={loading}>
          <UserPlus size={16} />
          {loading ? 'Creating account...' : 'Sign up'}
        </button>
      </form>

      {message ? <p className="form-message success">{message}</p> : null}

      <p className="auth-footer-note">
        Already have an account? <Link to="/login">Login here</Link>.
      </p>
    </AuthShell>
  )
}
