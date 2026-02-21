import { useState } from "react"

// ─── Mock Screenshot Components ──────────────────────────────────────────────

function ChatMockup() {
  return (
    <div style={{
      background: "#0d0d0d",
      border: "1px solid #2a2a2a",
      borderRadius: "12px",
      overflow: "hidden",
      fontFamily: "system-ui, sans-serif",
      width: "100%",
      maxWidth: "700px",
      boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
    }}>
      {/* Window chrome */}
      <div style={{ background: "#1a1a1a", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #2a2a2a" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
        <span style={{ marginLeft: 8, color: "#555", fontSize: 12 }}>FanBot — Chat Manager</span>
      </div>
      <div style={{ display: "flex", height: 340 }}>
        {/* Left: conversation list */}
        <div style={{ width: 220, borderRight: "1px solid #1e1e1e", overflowY: "auto", flexShrink: 0 }}>
          {[
            { name: "Jessica M.", msg: "omg yes please 🔥", time: "2m", unread: 3, active: true },
            { name: "tyler_fan99", msg: "when's the new drop?", time: "5m", unread: 1, active: false },
            { name: "BigSpender21", msg: "I want the PPV 💸", time: "12m", unread: 0, active: false },
            { name: "crypto_king", msg: "you're amazing 😍", time: "1h", unread: 0, active: false },
            { name: "darkwave_dan", msg: "sent you a tip!", time: "2h", unread: 0, active: false },
          ].map((c, i) => (
            <div key={i} style={{
              padding: "12px 14px",
              background: c.active ? "#1a1a1a" : "transparent",
              borderBottom: "1px solid #141414",
              cursor: "pointer",
            }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: c.unread ? 600 : 400 }}>{c.name}</span>
                <span style={{ color: "#555", fontSize: 11 }}>{c.time}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 3 }}>
                <span style={{ color: "#777", fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{c.msg}</span>
                {c.unread > 0 && <span style={{ background: "#00c853", color: "#000", fontSize: 10, fontWeight: 700, borderRadius: 10, padding: "1px 6px" }}>{c.unread}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Right: chat area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 32, height: 32, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #00c853)", flexShrink: 0 }} />
            <div>
              <div style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>Jessica M.</div>
              <div style={{ color: "#00c853", fontSize: 11 }}>● Online now</div>
            </div>
            <div style={{ marginLeft: "auto", background: "#00c853", color: "#000", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>AI Auto ●</div>
          </div>

          <div style={{ flex: 1, overflowY: "auto", padding: "14px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
            {/* Fan message */}
            <div style={{ alignSelf: "flex-start", maxWidth: "75%" }}>
              <div style={{ background: "#1e1e1e", color: "#ddd", fontSize: 13, padding: "8px 12px", borderRadius: "14px 14px 14px 4px" }}>
                hey can I see more of that beach content? 👀
              </div>
              <div style={{ color: "#555", fontSize: 10, marginTop: 3 }}>Jessica • 2:34 PM</div>
            </div>
            {/* AI reply */}
            <div style={{ alignSelf: "flex-end", maxWidth: "80%" }}>
              <div style={{ background: "linear-gradient(135deg, #004d20, #00c853)", color: "#fff", fontSize: 13, padding: "8px 12px", borderRadius: "14px 14px 4px 14px" }}>
                Heyy 😊 I just added 12 new beach pics to my vault — super exclusive stuff. I made a special PPV set just for you, only $8! Want me to send it over? 🌊🔥
              </div>
              <div style={{ color: "#555", fontSize: 10, marginTop: 3, textAlign: "right" }}>
                <span style={{ color: "#00c853", marginRight: 4 }}>✦ AI</span>2:34 PM ✓✓
              </div>
            </div>
            {/* Fan reply */}
            <div style={{ alignSelf: "flex-start", maxWidth: "75%" }}>
              <div style={{ background: "#1e1e1e", color: "#ddd", fontSize: 13, padding: "8px 12px", borderRadius: "14px 14px 14px 4px" }}>
                omg yes please 🔥
              </div>
              <div style={{ color: "#555", fontSize: 10, marginTop: 3 }}>Jessica • 2:35 PM</div>
            </div>
            {/* Generating indicator */}
            <div style={{ alignSelf: "flex-end", maxWidth: "80%" }}>
              <div style={{ background: "#1a2a1a", border: "1px solid #00c853", color: "#00c853", fontSize: 12, padding: "8px 14px", borderRadius: "14px 14px 4px 14px", display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: "#00c853", animation: "pulse 1s infinite" }} />
                AI is writing a reply...
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function AnalyticsMockup() {
  return (
    <div style={{
      background: "#0d0d0d",
      border: "1px solid #2a2a2a",
      borderRadius: "12px",
      overflow: "hidden",
      fontFamily: "system-ui, sans-serif",
      width: "100%",
      maxWidth: "500px",
      boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
    }}>
      <div style={{ background: "#1a1a1a", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #2a2a2a" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
        <span style={{ marginLeft: 8, color: "#555", fontSize: 12 }}>FanBot — Analytics</span>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Your Top Earners This Month</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 20 }}>
          {[
            { label: "Total Earned", value: "$1,847", color: "#00c853" },
            { label: "AI Replies Sent", value: "342", color: "#7c3aed" },
            { label: "Conversion Rate", value: "68%", color: "#f59e0b" },
          ].map((stat, i) => (
            <div key={i} style={{ flex: 1, background: "#151515", border: "1px solid #2a2a2a", borderRadius: 8, padding: "12px 10px", textAlign: "center" }}>
              <div style={{ color: stat.color, fontSize: 18, fontWeight: 700 }}>{stat.value}</div>
              <div style={{ color: "#666", fontSize: 10, marginTop: 3 }}>{stat.label}</div>
            </div>
          ))}
        </div>
        {[
          { name: "BigSpender21", spent: "$420", msgs: 47, badge: "🏆" },
          { name: "crypto_king", spent: "$315", msgs: 29, badge: "🥈" },
          { name: "Jessica M.", spent: "$280", msgs: 61, badge: "🥉" },
          { name: "tyler_fan99", spent: "$195", msgs: 18, badge: "" },
          { name: "darkwave_dan", spent: "$140", msgs: 22, badge: "" },
        ].map((fan, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: i < 4 ? "1px solid #1a1a1a" : "none" }}>
            <span style={{ fontSize: 14 }}>{fan.badge || `#${i + 1}`}</span>
            <div style={{ flex: 1 }}>
              <div style={{ color: "#ddd", fontSize: 13 }}>{fan.name}</div>
              <div style={{ color: "#555", fontSize: 11 }}>{fan.msgs} messages</div>
            </div>
            <div style={{ color: "#00c853", fontSize: 14, fontWeight: 700 }}>{fan.spent}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PersonaMockup() {
  return (
    <div style={{
      background: "#0d0d0d",
      border: "1px solid #2a2a2a",
      borderRadius: "12px",
      overflow: "hidden",
      fontFamily: "system-ui, sans-serif",
      width: "100%",
      maxWidth: "480px",
      boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
    }}>
      <div style={{ background: "#1a1a1a", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #2a2a2a" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
        <span style={{ marginLeft: 8, color: "#555", fontSize: 12 }}>FanBot — AI Persona Setup</span>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Train Your AI Twin</div>
        <div style={{ color: "#666", fontSize: 12, marginBottom: 16 }}>Tell FanBot exactly how you talk and what you sell.</div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: "#aaa", fontSize: 11, marginBottom: 5 }}>YOUR NAME / PERSONA</div>
          <div style={{ background: "#151515", border: "1px solid #2a2a2a", borderRadius: 8, padding: "10px 12px", color: "#fff", fontSize: 13 }}>Luna 🌙</div>
        </div>
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: "#aaa", fontSize: 11, marginBottom: 5 }}>HOW YOU TALK (your vibe)</div>
          <div style={{ background: "#151515", border: "1px solid #7c3aed", borderRadius: 8, padding: "10px 12px", color: "#ccc", fontSize: 12, lineHeight: 1.6 }}>
            I'm flirty, fun and a little mysterious 😈 I use emojis a lot and I always make my fans feel special. I love teasing before sending PPV content. My fans call me Lulu. I never say "no", I say "maybe later, babe" 🌙
          </div>
        </div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ color: "#aaa", fontSize: 11, marginBottom: 5 }}>AI MODE</div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ background: "#00c853", color: "#000", fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 20 }}>● Auto Reply</div>
            <div style={{ background: "#1e1e1e", color: "#666", fontSize: 12, padding: "6px 14px", borderRadius: 20 }}>Suggest Only</div>
            <div style={{ background: "#1e1e1e", color: "#666", fontSize: 12, padding: "6px 14px", borderRadius: 20 }}>Manual</div>
          </div>
        </div>
        <div style={{ background: "#0a1f0a", border: "1px solid #00c853", borderRadius: 8, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ fontSize: 18 }}>✓</span>
          <div>
            <div style={{ color: "#00c853", fontSize: 12, fontWeight: 600 }}>AI is live and replying</div>
            <div style={{ color: "#555", fontSize: 11 }}>342 messages sent today</div>
          </div>
        </div>
      </div>
    </div>
  )
}

function BulkMsgMockup() {
  return (
    <div style={{
      background: "#0d0d0d",
      border: "1px solid #2a2a2a",
      borderRadius: "12px",
      overflow: "hidden",
      fontFamily: "system-ui, sans-serif",
      width: "100%",
      maxWidth: "420px",
      boxShadow: "0 25px 60px rgba(0,0,0,0.6)",
    }}>
      <div style={{ background: "#1a1a1a", padding: "10px 16px", display: "flex", alignItems: "center", gap: "8px", borderBottom: "1px solid #2a2a2a" }}>
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#ff5f57" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#febc2e" }} />
        <div style={{ width: 10, height: 10, borderRadius: "50%", background: "#28c840" }} />
        <span style={{ marginLeft: 8, color: "#555", fontSize: 12 }}>FanBot — Mass Message</span>
      </div>
      <div style={{ padding: 20 }}>
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Send to Everyone at Once</div>
        <div style={{ color: "#666", fontSize: 12, marginBottom: 16 }}>Blast a message to all your subscribers instantly.</div>
        <div style={{ background: "#151515", border: "1px solid #2a2a2a", borderRadius: 8, padding: 12, marginBottom: 14 }}>
          <div style={{ color: "#555", fontSize: 11, marginBottom: 6 }}>MESSAGE</div>
          <div style={{ color: "#ddd", fontSize: 13, lineHeight: 1.6 }}>
            Hey babe 😘 I just dropped something really special for my loyal fans only. First 10 to message me back get it at half price! 🔥
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "#111", border: "1px solid #1e1e1e", borderRadius: 8, padding: "10px 14px", marginBottom: 14 }}>
          <div>
            <div style={{ color: "#aaa", fontSize: 12 }}>Sending to</div>
            <div style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>847 subscribers</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ color: "#aaa", fontSize: 12 }}>Est. replies</div>
            <div style={{ color: "#00c853", fontSize: 16, fontWeight: 700 }}>~200+</div>
          </div>
        </div>
        <div style={{ background: "#00c853", color: "#000", fontWeight: 700, fontSize: 14, padding: "12px", borderRadius: 8, textAlign: "center", cursor: "pointer" }}>
          🚀 Send Now
        </div>
      </div>
    </div>
  )
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  const faqs = [
    {
      q: "Do I need to give you my Fanvue password?",
      a: "Never. We use Fanvue's official login system (OAuth), the same secure method used by other trusted apps. We only ever get access to what you approve — nothing more."
    },
    {
      q: "Will my fans know it's AI replying?",
      a: "No. The AI replies in your voice, your style, your slang. To your fans, it just looks like you're super responsive. You can even review messages before they send if you want full control."
    },
    {
      q: "What if the AI says something I don't want?",
      a: "You're always in control. You can use 'Suggest Only' mode — the AI writes the reply and you approve it before it sends. Or use full Auto mode and let it run. Your choice."
    },
    {
      q: "How long does setup take?",
      a: "About 5 minutes. You connect your Fanvue account, tell the AI how you talk, and turn it on. That's it. Most creators are up and running the same day."
    },
    {
      q: "Can I cancel the subscription anytime?",
      a: "Yes, cancel any time with one click. No contracts, no questions asked. If you cancel, you keep access until the end of your billing period."
    },
    {
      q: "What if I manage multiple Fanvue accounts?",
      a: "Each account gets its own FanBot subscription with separate AI settings, personas, and memory for each subscriber. Perfect for agencies running multiple creators."
    }
  ]

  const gradientText: React.CSSProperties = {
    background: "linear-gradient(135deg, #00c853 0%, #7c3aed 100%)",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    backgroundClip: "text",
  }

  const section: React.CSSProperties = {
    padding: "80px 24px",
    maxWidth: 1100,
    margin: "0 auto",
  }

  const pill: React.CSSProperties = {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    background: "rgba(0,200,83,0.08)",
    border: "1px solid rgba(0,200,83,0.2)",
    color: "#00c853",
    fontSize: 12,
    fontWeight: 600,
    padding: "5px 14px",
    borderRadius: 20,
    marginBottom: 20,
    letterSpacing: "0.05em",
  }

  return (
    <div style={{ background: "#080808", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", overflowX: "hidden" }}>

      {/* ── CSS Animations ── */}
      <style>{`
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.4} }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        @keyframes glow { 0%,100%{box-shadow:0 0 20px rgba(0,200,83,0.3)} 50%{box-shadow:0 0 40px rgba(0,200,83,0.6)} }
        .cta-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 30px rgba(0,200,83,0.4) !important; }
        .cta-btn { transition: all 0.2s ease; }
        .outline-btn:hover { background: rgba(255,255,255,0.05) !important; }
        .outline-btn { transition: all 0.2s ease; }
        .faq-row:hover { background: #111 !important; }
        .faq-row { transition: background 0.15s ease; }
        .feature-card:hover { border-color: #00c853 !important; transform: translateY(-3px); }
        .feature-card { transition: all 0.2s ease; }
        .pain-card:hover { border-color: #444 !important; }
        .pain-card { transition: border-color 0.2s ease; }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(8,8,8,0.85)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #1a1a1a",
        padding: "0 24px",
        display: "flex", alignItems: "center", justifyContent: "space-between",
        height: 64,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 32, height: 32, borderRadius: 8,
            background: "linear-gradient(135deg, #00c853, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 16
          }}>🤖</div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>FanBot</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <a href="#features" style={{ color: "#888", fontSize: 14, textDecoration: "none" }}>Features</a>
          <a href="#how-it-works" style={{ color: "#888", fontSize: 14, textDecoration: "none" }}>How It Works</a>
          <a href="#pricing" style={{ color: "#888", fontSize: 14, textDecoration: "none" }}>Pricing</a>
          <a
            href="/login"
            className="cta-btn"
            style={{
              background: "#00c853", color: "#000",
              fontWeight: 700, fontSize: 13,
              padding: "8px 18px", borderRadius: 8,
              textDecoration: "none",
            }}
          >
            Get Started Free →
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div style={{ padding: "90px 24px 60px", maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <div style={pill}>✦ &nbsp;Free 7-day trial — no credit card needed</div>
        <h1 style={{
          fontSize: "clamp(36px, 6vw, 72px)",
          fontWeight: 900, lineHeight: 1.1,
          letterSpacing: "-0.03em", marginBottom: 24,
        }}>
          Stop Typing. <br />
          <span style={gradientText}>Start Earning.</span>
        </h1>
        <p style={{ color: "#aaa", fontSize: "clamp(16px, 2vw, 20px)", maxWidth: 620, margin: "0 auto 36px", lineHeight: 1.6 }}>
          FanBot connects to your Fanvue account and replies to your fans in your exact voice — 24/7. No missed messages. No burnout. Just more conversions and more money.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <a
            href="/login"
            className="cta-btn"
            style={{
              background: "#00c853", color: "#000",
              fontWeight: 800, fontSize: 16,
              padding: "14px 32px", borderRadius: 10,
              textDecoration: "none", display: "inline-block",
              boxShadow: "0 4px 20px rgba(0,200,83,0.3)",
            }}
          >
            Start Free Trial → Login with Fanvue
          </a>
          <a
            href="#how-it-works"
            className="outline-btn"
            style={{
              background: "transparent",
              border: "1px solid #333",
              color: "#fff", fontWeight: 600, fontSize: 16,
              padding: "14px 32px", borderRadius: 10,
              textDecoration: "none", display: "inline-block",
            }}
          >
            See How It Works
          </a>
        </div>

        {/* Hero screenshot */}
        <div style={{ marginTop: 60, display: "flex", justifyContent: "center", animation: "float 6s ease-in-out infinite" }}>
          <ChatMockup />
        </div>
      </div>

      {/* ── STATS STRIP ── */}
      <div style={{ borderTop: "1px solid #1a1a1a", borderBottom: "1px solid #1a1a1a", padding: "30px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 30 }}>
          {[
            { value: "24/7", label: "Auto-replies, even while you sleep" },
            { value: "5 min", label: "Setup time — seriously that fast" },
            { value: "3×", label: "More messages = more conversions" },
            { value: "$0", label: "Free for 7 days, no card needed" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 900, ...gradientText }}>{s.value}</div>
              <div style={{ color: "#666", fontSize: 13, marginTop: 4 }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PAIN POINTS ── */}
      <div style={{ ...section, textAlign: "center" }}>
        <div style={pill}>😩 &nbsp;Sound familiar?</div>
        <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, marginBottom: 14, letterSpacing: "-0.02em" }}>
          Running an AI girlfriend account is <span style={gradientText}>exhausting.</span>
        </h2>
        <p style={{ color: "#888", fontSize: 16, maxWidth: 560, margin: "0 auto 50px" }}>
          Most creators burn out trying to keep up with hundreds of conversations every day. It doesn't have to be this hard.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 16 }}>
          {[
            { emoji: "😓", title: "Drowning in DMs", desc: "You have 200 unread messages and no idea where to start. Every unanswered fan is a missed sale." },
            { emoji: "🌙", title: "Up Until 2am Replying", desc: "Your fans message all hours. You can't sleep because you're scared of losing subscribers." },
            { emoji: "💸", title: "Losing Sales While You Sleep", desc: "When a fan messages about PPV and you don't reply in time, they move on. That's money gone." },
            { emoji: "😶", title: "Don't Know What To Say", desc: "Writer's block is real. Saying the same thing over and over doesn't convert fans into buyers." },
            { emoji: "🔁", title: "Copying & Pasting the Same Replies", desc: "You're manually sending the same messages to 50 different fans every single day. Waste of your life." },
            { emoji: "📉", title: "Fans Go Cold Without You", desc: "When you take a day off, engagement drops and subscribers cancel. You can never fully disconnect." },
          ].map((p, i) => (
            <div key={i} className="pain-card" style={{
              background: "#0e0e0e", border: "1px solid #1e1e1e",
              borderRadius: 12, padding: "22px 20px", textAlign: "left",
            }}>
              <div style={{ fontSize: 28, marginBottom: 10 }}>{p.emoji}</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{p.title}</div>
              <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6 }}>{p.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SOLUTION INTRO ── */}
      <div style={{ padding: "60px 24px", textAlign: "center", background: "linear-gradient(180deg, #080808 0%, #0d140d 100%)" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={pill}>🤖 &nbsp;Meet FanBot</div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 52px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 20 }}>
            Your AI that works <span style={gradientText}>while you don't.</span>
          </h2>
          <p style={{ color: "#aaa", fontSize: 17, lineHeight: 1.7 }}>
            FanBot plugs into your Fanvue account and handles your chats for you. It learns exactly how you talk, remembers every fan's name and preferences, and replies in a way that feels 100% human. Your fans stay happy. Your income keeps growing. You get your life back.
          </p>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <div id="features" style={{ ...section }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={pill}>⚡ Features</div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em" }}>
            Everything you need to run your account on autopilot
          </h2>
        </div>

        {/* Feature 1: AI Replies */}
        <div style={{ display: "flex", alignItems: "center", gap: 60, marginBottom: 80, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ ...pill, marginBottom: 16 }}>💬 AI Chat</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 16, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              AI that replies exactly like you
            </h3>
            <p style={{ color: "#aaa", fontSize: 15, lineHeight: 1.7, marginBottom: 20 }}>
              You tell FanBot how you talk — your slang, your emojis, your vibe. It learns your style and replies to fans as if it's you. Fans can't tell the difference. They just think you're incredibly responsive.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {["Learns your tone and personality", "Uses your catchphrases and emojis", "Handles flirting, PPV pushes, and general chat", "Gets smarter the more it's used"].map((item, i) => (
                <li key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#00c853", fontWeight: 700 }}>✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <ChatMockup />
          </div>
        </div>

        {/* Feature 2: Memory */}
        <div style={{ display: "flex", alignItems: "center", gap: 60, marginBottom: 80, flexWrap: "wrap-reverse" }}>
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <PersonaMockup />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ ...pill, background: "rgba(124,58,237,0.08)", border: "1px solid rgba(124,58,237,0.2)", color: "#a78bfa", marginBottom: 16 }}>🧠 Smart Memory</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 16, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              Remembers every fan, every time
            </h3>
            <p style={{ color: "#aaa", fontSize: 15, lineHeight: 1.7, marginBottom: 20 }}>
              FanBot builds a profile for each subscriber. It remembers their name, what content they like, what they've bought before, and what makes them tip. Every conversation feels personal, even when it's automated.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {["Remembers past conversations", "Tracks what each fan has purchased", "Knows which fans are most likely to buy", "Personalises every single reply"].map((item, i) => (
                <li key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#a78bfa", fontWeight: 700 }}>✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Feature 3: Analytics */}
        <div style={{ display: "flex", alignItems: "center", gap: 60, marginBottom: 80, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ ...pill, background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.2)", color: "#f59e0b", marginBottom: 16 }}>📊 Analytics</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 16, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              Know exactly who's worth your time
            </h3>
            <p style={{ color: "#aaa", fontSize: 15, lineHeight: 1.7, marginBottom: 20 }}>
              See which fans have spent the most money, which ones engage the most, and who's most likely to buy PPV. Stop guessing and start focusing your energy where it actually pays off.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {["Top spenders leaderboard", "Message-to-sale conversion rate", "Which content types earn the most", "Daily earnings and AI reply stats"].map((item, i) => (
                <li key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#f59e0b", fontWeight: 700 }}>✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <AnalyticsMockup />
          </div>
        </div>

        {/* Feature 4: Bulk Messaging */}
        <div style={{ display: "flex", alignItems: "center", gap: 60, marginBottom: 20, flexWrap: "wrap-reverse" }}>
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <BulkMsgMockup />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={{ ...pill, background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.2)", color: "#f87171", marginBottom: 16 }}>🚀 Mass Message</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 16, lineHeight: 1.2, letterSpacing: "-0.02em" }}>
              Blast one message to all your fans at once
            </h3>
            <p style={{ color: "#aaa", fontSize: 15, lineHeight: 1.7, marginBottom: 20 }}>
              Got a new drop? Running a sale? Drop a message to your entire subscriber list in one click. No copying and pasting 500 times. One message, delivered to everyone, instantly.
            </p>
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              {["Send to all subscribers at once", "Announce new PPV drops", "Run limited-time offers and sales", "Schedule messages in advance"].map((item, i) => (
                <li key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ color: "#f87171", fontWeight: 700 }}>✓</span> {item}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Feature cards grid */}
        <div style={{ marginTop: 60, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          {[
            { emoji: "🎭", title: "AI Persona", desc: "Fully customisable AI that sounds just like you" },
            { emoji: "🔒", title: "PPV Suggestions", desc: "AI picks the right content to upsell at the right moment" },
            { emoji: "⚡", title: "Instant Replies", desc: "Fans get a response in seconds, not hours" },
            { emoji: "📱", title: "Works on Any Device", desc: "Manage everything from your phone, tablet or desktop" },
          ].map((f, i) => (
            <div key={i} className="feature-card" style={{
              background: "#0e0e0e", border: "1px solid #1e1e1e",
              borderRadius: 12, padding: "20px 18px",
            }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{f.emoji}</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{f.title}</div>
              <div style={{ color: "#666", fontSize: 13, lineHeight: 1.5 }}>{f.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div id="how-it-works" style={{ background: "#0a0a0a", padding: "80px 24px", borderTop: "1px solid #1a1a1a", borderBottom: "1px solid #1a1a1a" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <div style={pill}>🛠 Simple Setup</div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 14 }}>
            Up and running in <span style={gradientText}>5 minutes</span>
          </h2>
          <p style={{ color: "#888", fontSize: 16, marginBottom: 56 }}>No tech skills required. Seriously.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 24 }}>
            {[
              {
                step: "01",
                emoji: "🔗",
                title: "Connect your Fanvue",
                desc: "Click 'Login with Fanvue'. We connect securely using Fanvue's official login. No password ever given to us."
              },
              {
                step: "02",
                emoji: "🎭",
                title: "Set up your AI twin",
                desc: "Tell FanBot how you talk, what you sell, and your personality. Takes 5 minutes. The more you tell it, the better it sounds."
              },
              {
                step: "03",
                emoji: "✅",
                title: "Turn it on and relax",
                desc: "Flip Auto Mode on. FanBot starts replying for you immediately. Check in whenever you like. It never stops working."
              },
            ].map((s, i) => (
              <div key={i} style={{ position: "relative" }}>
                <div style={{
                  background: "#111", border: "1px solid #1e1e1e",
                  borderRadius: 14, padding: "28px 22px", height: "100%",
                }}>
                  <div style={{ color: "#222", fontSize: 56, fontWeight: 900, position: "absolute", top: 16, right: 20, lineHeight: 1 }}>{s.step}</div>
                  <div style={{ fontSize: 36, marginBottom: 14 }}>{s.emoji}</div>
                  <div style={{ color: "#fff", fontWeight: 700, fontSize: 18, marginBottom: 10 }}>{s.title}</div>
                  <div style={{ color: "#777", fontSize: 14, lineHeight: 1.7 }}>{s.desc}</div>
                </div>
                {i < 2 && (
                  <div style={{ position: "absolute", right: -28, top: "50%", transform: "translateY(-50%)", color: "#333", fontSize: 24, display: "none" }}>→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── SOCIAL PROOF / QUOTE ── */}
      <div style={{ padding: "80px 24px", background: "#080808" }}>
        <div style={{ maxWidth: 760, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>💬</div>
          <blockquote style={{
            fontSize: "clamp(18px, 2.5vw, 26px)",
            color: "#ddd",
            fontStyle: "italic",
            lineHeight: 1.6,
            marginBottom: 24,
            fontWeight: 500
          }}>
            "I went from spending 4 hours a day replying to fans, to maybe 20 minutes. My earnings actually went <strong style={{ color: "#00c853" }}>up</strong> because fans get faster replies and feel more looked after. It's insane."
          </blockquote>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ width: 42, height: 42, borderRadius: "50%", background: "linear-gradient(135deg, #7c3aed, #00c853)" }} />
            <div style={{ textAlign: "left" }}>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>Luna 🌙</div>
              <div style={{ color: "#666", fontSize: 12 }}>Fanvue creator — 1,200 subscribers</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PRICING ── */}
      <div id="pricing" style={{ background: "#0a0a0a", padding: "80px 24px", borderTop: "1px solid #1a1a1a" }}>
        <div style={{ maxWidth: 560, margin: "0 auto", textAlign: "center" }}>
          <div style={pill}>💳 Pricing</div>
          <h2 style={{ fontSize: "clamp(28px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 14 }}>
            Simple, honest pricing
          </h2>
          <p style={{ color: "#888", fontSize: 16, marginBottom: 40 }}>Try it free. Pay only when you're hooked.</p>

          <div style={{
            background: "#0e0e0e",
            border: "2px solid #00c853",
            borderRadius: 20, padding: "40px 36px",
            animation: "glow 3s ease-in-out infinite",
          }}>
            <div style={{ display: "inline-block", background: "#00c853", color: "#000", fontSize: 11, fontWeight: 800, padding: "4px 12px", borderRadius: 20, marginBottom: 20, letterSpacing: "0.08em" }}>
              MOST POPULAR
            </div>
            <div style={{ color: "#fff", fontSize: 22, fontWeight: 700, marginBottom: 8 }}>FanBot Pro</div>
            <div style={{ marginBottom: 6 }}>
              <span style={{ fontSize: 52, fontWeight: 900, color: "#fff" }}>$29</span>
              <span style={{ color: "#666", fontSize: 16 }}>/month</span>
            </div>
            <div style={{ color: "#00c853", fontSize: 14, fontWeight: 600, marginBottom: 28 }}>✦ Start with 7 days completely free</div>

            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", textAlign: "left" }}>
              {[
                "Unlimited AI replies — no caps",
                "Full auto-reply mode (24/7)",
                "Subscriber memory for every fan",
                "Smart PPV upsell suggestions",
                "Bulk messaging to all subscribers",
                "Analytics — top spenders, earnings, stats",
                "AI persona customisation",
                "Priority support",
              ].map((item, i) => (
                <li key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 10, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#00c853", fontWeight: 700, fontSize: 16 }}>✓</span> {item}
                </li>
              ))}
            </ul>

            <a
              href="/login"
              className="cta-btn"
              style={{
                display: "block", width: "100%", boxSizing: "border-box",
                background: "#00c853", color: "#000",
                fontWeight: 800, fontSize: 16,
                padding: "16px", borderRadius: 10,
                textDecoration: "none", textAlign: "center",
                boxShadow: "0 4px 20px rgba(0,200,83,0.3)",
              }}
            >
              Start Free Trial → Login with Fanvue
            </a>
            <p style={{ color: "#555", fontSize: 12, marginTop: 14 }}>No credit card required for your free trial. Cancel any time.</p>
          </div>
        </div>
      </div>

      {/* ── FAQ ── */}
      <div style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={pill}>❓ FAQ</div>
            <h2 style={{ fontSize: "clamp(26px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-0.02em" }}>
              Questions? We've got answers.
            </h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="faq-row"
                style={{ borderRadius: 10, overflow: "hidden", border: "1px solid #1a1a1a" }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  style={{
                    width: "100%", padding: "18px 20px",
                    background: "transparent", border: "none",
                    color: "#fff", fontSize: 15, fontWeight: 600,
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    cursor: "pointer", textAlign: "left", gap: 12,
                  }}
                >
                  <span>{faq.q}</span>
                  <span style={{ color: "#555", fontSize: 20, flexShrink: 0, transition: "transform 0.2s", transform: openFaq === i ? "rotate(45deg)" : "none" }}>+</span>
                </button>
                {openFaq === i && (
                  <div style={{ padding: "0 20px 18px", color: "#888", fontSize: 14, lineHeight: 1.7 }}>
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FINAL CTA ── */}
      <div style={{ padding: "80px 24px", background: "linear-gradient(180deg, #080808 0%, #0d1a0d 100%)", borderTop: "1px solid #1a1a1a", textAlign: "center" }}>
        <div style={{ maxWidth: 700, margin: "0 auto" }}>
          <div style={{ fontSize: 48, marginBottom: 20 }}>🚀</div>
          <h2 style={{ fontSize: "clamp(28px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 16 }}>
            Ready to let AI do <br /><span style={gradientText}>the heavy lifting?</span>
          </h2>
          <p style={{ color: "#888", fontSize: 17, marginBottom: 40, maxWidth: 500, margin: "0 auto 40px" }}>
            Join Fanvue creators who are earning more and working less. Your 7-day free trial starts the moment you log in.
          </p>
          <a
            href="/login"
            className="cta-btn"
            style={{
              display: "inline-block",
              background: "#00c853", color: "#000",
              fontWeight: 800, fontSize: 18,
              padding: "18px 44px", borderRadius: 12,
              textDecoration: "none",
              boxShadow: "0 6px 30px rgba(0,200,83,0.4)",
            }}
          >
            Login with Fanvue — It's Free →
          </a>
          <p style={{ color: "#444", fontSize: 13, marginTop: 16 }}>No credit card required · Cancel any time · 7-day free trial</p>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ borderTop: "1px solid #141414", padding: "30px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{
            width: 28, height: 28, borderRadius: 6,
            background: "linear-gradient(135deg, #00c853, #7c3aed)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 14
          }}>🤖</div>
          <span style={{ color: "#fff", fontWeight: 800 }}>FanBot</span>
          <span style={{ color: "#444", fontSize: 13 }}>© 2026</span>
        </div>
        <div style={{ display: "flex", gap: 24 }}>
          <a href="#features" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Features</a>
          <a href="#pricing" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Pricing</a>
          <a href="#" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Privacy</a>
          <a href="#" style={{ color: "#555", fontSize: 13, textDecoration: "none" }}>Terms</a>
        </div>
      </div>
    </div>
  )
}
