import { Zap, CheckCircle2 } from "lucide-react"

interface PaywallPageProps {
  username?: string
}

export function PaywallPage({ username }: PaywallPageProps) {
  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%', backgroundColor: '#121212', overflowY: 'auto' }}>
      <div style={{ margin: 'auto', width: '100%', maxWidth: '448px', padding: '48px 24px' }}>

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

        {/* Subscription card */}
        <div className="rounded-2xl border border-[#333] bg-[#1e1e1e] p-6">
          <div className="mb-6 text-center">
            <p className="text-[#888] text-sm mb-2">Subscribe via the Fanvue App Store to unlock</p>
            <h2 className="text-white font-bold text-lg">Fanvue Chatbot</h2>
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

          {/* App Store CTA */}
          <a
            href="https://www.fanvue.com/app-store"
            target="_blank"
            rel="noopener noreferrer"
            className="w-full rounded-lg bg-[#00c853] py-3 text-sm font-semibold text-black transition-colors hover:bg-[#00a843] flex items-center justify-center gap-2"
          >
            Subscribe on Fanvue App Store →
          </a>

          <p className="mt-4 text-center text-xs text-[#555]">
            Billing is handled securely by Fanvue
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
