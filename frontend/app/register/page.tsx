'use client'
import { useState, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { authApi } from '@/lib/api'

export default function RegisterPage() {
  const router = useRouter()
  const [form, setForm] = useState({ username: '', email: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  function set(field: string) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [field]: e.target.value }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await authApi.register(form.username, form.email, form.password)
      router.replace('/login')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-title">Create Account</div>
        <div className="auth-sub">Join NDMA WeatherLens</div>

        {error && <div className="auth-error">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label">Username</label>
            <input className="auth-input" type="text" value={form.username} onChange={set('username')} placeholder="johndoe" required minLength={3} />
          </div>
          <div className="auth-field">
            <label className="auth-label">Email</label>
            <input className="auth-input" type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" required />
          </div>
          <div className="auth-field">
            <label className="auth-label">Password</label>
            <input className="auth-input" type="password" value={form.password} onChange={set('password')} placeholder="Min 8 characters" required minLength={8} />
          </div>
          <button className="auth-btn" type="submit" disabled={loading}>
            {loading ? 'Creating account…' : 'Create Account'}
          </button>
        </form>

        <div className="auth-link">
          Already have an account? <Link href="/login">Sign in</Link>
        </div>
      </div>
    </div>
  )
}
