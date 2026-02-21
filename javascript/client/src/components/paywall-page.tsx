import { useState, useEffect } from "react"
import { startSubscription } from "@/lib/api"
import { Loader2, Zap, CheckCircle2, AlertCircle } from "lucide-react"

interface PaywallPageProps {
  username?: string
}

export function PaywallPage({ username }: PaywallPageProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [paymentStatus, setPaymentStatus] = useState<'success' | 'failed' | 'error' | null>(null)

  // Check for payment result in URL (from Paystack redirect)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const payment = params.get('payment')
    if (payment === 'failed' || payment === 'error') {
      setPaymentStatus(payment)
    }
    if (payment === 'success') {
      // Payment succeeded but subscription might not be in session yet
      // Reload to let the session refresh pick it up
      setPaymentStatus('success')
      setTimeout(() => window.location.href = '/', 2000)
    }
    // Clean URL
    if (payment) {
      window.history.replaceState({}, '', '/')
    }
  }, [])

  const handleSubscribe = async () => {
    setLoading(true)
    setError(null)
    try {
      const result = await startSubscription()
      if ('authorization_url' in result) {
        window.location.href = result.authorization_url
      } else {
        setError(result.error || 'Could not start checkout. Please try again.')
        setLoading(false)
      }
    } catch {
      setError('Network error. Please try again.')
      setLoading(false)
    }
  }

  return (
    <div className="flex h-screen w-full bg-[#121212] overflow-y-auto">
      <div className="m-auto w-full max-w-md px-6 py-12">

        {/* Payment success state */}
        {paymentStatus === 'success' && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-[#00c853]/30 bg-[#00c853]/10 p-4">
            <CheckCircle2 className="h-5 w-5 text-[#00c853] shrink-0" />
            <p className="text-sm text-[#00c853]">Payment successful! Setting up your account...</p>
          </div>
        )}

        {/* Payment failed state */}
        {(paymentStatus === 'failed' || paymentStatus === 'error') && (
          <div className="mb-6 flex items-center gap-3 rounded-lg border border-red-500/30 bg-red-500/10 p-4">
            <AlertCircle className="h-5 w-5 text-red-400 shrink-0" />
            <p className="text-sm text-red-400">Payment was not completed. You can try again below.</p>
          </div>
        )}

        {/* Logo / branding */}
        <div className="mb-8 text-center">
          <div className="mb-3 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-[#00c853]/15">
            <Zap className="h-6 w-6 text-[#00c853]" />
          </div>
          <h1 className="text-2xl font-bold text-white">Fanvue AI Assistant</h1>
          <p className="mt-1 text-sm text-[#888]">
            {username ? `Welcome, ${username}` : 'Your AI-powered chat manager'}
          </p>
        </div>

        {/* Pricing card */}
        <div className="rounded-2xl border border-[#333] bg-[#1e1e1e] p-6">
          <div className="mb-6 text-center">
            <div className="flex items-end justify-center gap-1">
              <span className="text-4xl font-bold text-white">$29</span>
              <span className="mb-1 text-[#888]">/month</span>
            </div>
            <p className="mt-1 text-sm text-[#00c853]">Cancel anytime</p>
          </div>

          {/* Feature list */}
          <ul className="mb-6 space-y-3">
            {[
              'AI replies in your voice & style',
              'Subscriber memory — AI remembers details',
              'Full auto mode with human-like timing',
              'Smart vault & PPV media suggestions',
              'Analytics — track messages & performance',
            ].map((text) => (
              <li key={text} className="flex items-center gap-3 text-sm text-[#ccc]">
                <CheckCircle2 className="h-4 w-4 text-[#00c853] shrink-0" />
                {text}
              </li>
            ))}
          </ul>

          {/* Subscribe button */}
          <button
            onClick={handleSubscribe}
            disabled={loading || paymentStatus === 'success'}
            className="w-full rounded-lg bg-[#00c853] py-3 text-sm font-semibold text-black transition-colors hover:bg-[#00a843] disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {loading
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Redirecting to checkout...</>
              : paymentStatus === 'success'
              ? <><Loader2 className="h-4 w-4 animate-spin" /> Activating account...</>
              : 'Subscribe — $29/month'
            }
          </button>

          {error && (
            <p className="mt-3 text-center text-xs text-red-400">{error}</p>
          )}

          <p className="mt-4 text-center text-xs text-[#555]">
            Secure payment via Paystack · No hidden fees
          </p>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-[#444]">
          Already subscribed?{' '}
          <a href="/logout" className="text-[#666] underline hover:text-[#888]">
            Log out and log back in
          </a>
        </p>
      </div>
    </div>
  )
}
