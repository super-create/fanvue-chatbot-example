import { useState, useEffect } from "react"

// ─── Shared helpers ──────────────────────────────────────────────────────────

const WIN = {
  background: "#111",
  border: "1px solid #222",
  borderRadius: 12,
  overflow: "hidden" as const,
  fontFamily: "system-ui, sans-serif",
  boxShadow: "0 20px 60px rgba(0,0,0,0.7)",
}

function Chrome({ title }: { title: string }) {
  return (
    <div style={{ background: "#1a1a1a", padding: "10px 14px", display: "flex", alignItems: "center", gap: 7, borderBottom: "1px solid #222" }}>
      <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#ff5f57" }} />
      <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#febc2e" }} />
      <div style={{ width: 9, height: 9, borderRadius: "50%", background: "#28c840" }} />
      <span style={{ marginLeft: 8, color: "#444", fontSize: 11 }}>{title}</span>
    </div>
  )
}

function Label({ children }: { children: string }) {
  return <div style={{ color: "#555", fontSize: 10, fontWeight: 700, letterSpacing: "0.07em", marginBottom: 5, textTransform: "uppercase" }}>{children}</div>
}

function Field({ value, placeholder }: { value?: string; placeholder?: string }) {
  return (
    <div style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 7, padding: "8px 10px", color: value ? "#ccc" : "#444", fontSize: 13 }}>
      {value || placeholder}
    </div>
  )
}

function Toggle({ on }: { on: boolean }) {
  return (
    <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? "#00c853" : "#333", position: "relative", flexShrink: 0 }}>
      <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: on ? 18 : 3, transition: "left 0.2s" }} />
    </div>
  )
}

// ─── Mockup: Full Chat App ────────────────────────────────────────────────────

function ChatAppMockup() {
  return (
    <div style={{ ...WIN, width: "100%", maxWidth: 760 }}>
      <Chrome title="FanBot — Julie R." />
      <div style={{ display: "flex", height: 380 }}>

        {/* Sidebar icons */}
        <div style={{ width: 46, background: "#141414", borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column", alignItems: "center", padding: "10px 0", gap: 6 }}>
          <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#00c853", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 8 }}>
            <span style={{ color: "#000", fontSize: 11, fontWeight: 700 }}>J</span>
          </div>
          {["💬", "🤖", "⚙️", "🖼️", "📊"].map((icon, i) => (
            <div key={i} style={{ width: 32, height: 32, borderRadius: 7, display: "flex", alignItems: "center", justifyContent: "center", background: i === 0 ? "#1e2e1e" : "transparent", fontSize: 14 }}>{icon}</div>
          ))}
        </div>

        {/* Conversation list */}
        <div style={{ width: 190, borderRight: "1px solid #1e1e1e", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 10px", borderBottom: "1px solid #1a1a1a", display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ flex: 1, background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 6, padding: "5px 8px", color: "#666", fontSize: 11 }}>appalling-mule-73</div>
            <div style={{ background: "#00c853", color: "#000", fontSize: 10, fontWeight: 700, padding: "4px 8px", borderRadius: 6 }}>↺</div>
          </div>
          {[
            { name: "alex_wl", msg: "I love your last pic 😍", time: "1m", unread: 2, active: true },
            { name: "TopFan_Mike", msg: "wanna see something? 🔥", time: "4m", unread: 1, active: false },
            { name: "crypto_k", msg: "sent you a tip!", time: "15m", unread: 0, active: false },
            { name: "darkwave9", msg: "hey baby 😘", time: "1h", unread: 0, active: false },
          ].map((c, i) => (
            <div key={i} style={{ padding: "9px 10px", background: c.active ? "#1a2a1a" : "transparent", borderBottom: "1px solid #141414" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#ddd", fontSize: 12, fontWeight: c.unread ? 600 : 400 }}>{c.name}</span>
                <span style={{ color: "#555", fontSize: 10 }}>{c.time}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                <span style={{ color: "#666", fontSize: 11, maxWidth: 130, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.msg}</span>
                {c.unread > 0 && <span style={{ background: "#00c853", color: "#000", fontSize: 9, fontWeight: 700, borderRadius: 8, padding: "1px 5px" }}>{c.unread}</span>}
              </div>
            </div>
          ))}
        </div>

        {/* Chat area */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "8px 12px", borderBottom: "1px solid #1e1e1e", display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#00c853)" }} />
            <div style={{ flex: 1 }}>
              <div style={{ color: "#fff", fontSize: 12, fontWeight: 600 }}>alex_wl</div>
              <div style={{ color: "#00c853", fontSize: 10 }}>● Online</div>
            </div>
            <div style={{ background: "#00c853", color: "#000", fontSize: 9, fontWeight: 700, padding: "2px 8px", borderRadius: 12 }}>AI Auto ●</div>
          </div>
          <div style={{ flex: 1, padding: "12px 12px", display: "flex", flexDirection: "column", gap: 8, overflowY: "hidden" }}>
            <div style={{ alignSelf: "flex-start", background: "#1e1e1e", color: "#ccc", fontSize: 12, padding: "7px 10px", borderRadius: "12px 12px 12px 3px", maxWidth: "75%" }}>
              I love your last picture! You look so adorable!
            </div>
            <div style={{ alignSelf: "flex-end", background: "linear-gradient(135deg,#005c25,#00c853)", color: "#fff", fontSize: 12, padding: "7px 10px", borderRadius: "12px 12px 3px 12px", maxWidth: "75%" }}>
              Aww thanks hun! I've got a lot more where that came from lol! Wanna see something extra spicy? 😈
            </div>
            <div style={{ alignSelf: "flex-start", background: "#1e1e1e", color: "#ccc", fontSize: 12, padding: "7px 10px", borderRadius: "12px 12px 12px 3px", maxWidth: "75%" }}>
              omg yes please 🔥🔥
            </div>
            <div style={{ alignSelf: "flex-end", maxWidth: "80%" }}>
              <div style={{ background: "#131f13", border: "1px solid #00c853", color: "#00c853", fontSize: 11, padding: "6px 12px", borderRadius: "12px 12px 3px 12px", display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#00c853", display: "inline-block", flexShrink: 0, animation: "pulse 1s infinite" }} />
                AI is writing a reply...
              </div>
            </div>
          </div>
          <div style={{ padding: "8px 10px", borderTop: "1px solid #1e1e1e", display: "flex", gap: 8 }}>
            <div style={{ flex: 1, background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 8, padding: "8px 10px", color: "#555", fontSize: 12 }}>Type your message...</div>
            <div style={{ background: "#00c853", borderRadius: 8, padding: "8px 12px", color: "#000", fontSize: 12, fontWeight: 700 }}>Send</div>
          </div>
        </div>

        {/* Subscriber panel */}
        <div style={{ width: 200, borderLeft: "1px solid #1e1e1e", display: "flex", flexDirection: "column" }}>
          <div style={{ padding: "10px", borderBottom: "1px solid #1e1e1e" }}>
            <div style={{ color: "#888", fontSize: 11, marginBottom: 8 }}>Subscriber</div>
            <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
              <div style={{ flex: 1, background: "#00c853", color: "#000", fontSize: 10, fontWeight: 700, padding: "6px 4px", borderRadius: 6, textAlign: "center" }}>🧠 Memory</div>
              <div style={{ flex: 1, background: "#1e1e1e", color: "#888", fontSize: 10, padding: "6px 4px", borderRadius: 6, textAlign: "center" }}>⚡ Profile</div>
            </div>
            <div style={{ background: "#111", border: "1px solid #00c853", borderRadius: 6, padding: 8, marginBottom: 8 }}>
              <div style={{ color: "#00c853", fontSize: 9, fontWeight: 700, marginBottom: 4 }}>🧠 AI Memory</div>
              <div style={{ color: "#888", fontSize: 10, lineHeight: 1.5 }}>Highly communicative. Interested in cooking. Open to travel. Expressed interest in meeting Julie.</div>
            </div>
            <div style={{ background: "#1a1a1a", borderRadius: 6, padding: "5px 8px", marginBottom: 6 }}>
              <div style={{ color: "#666", fontSize: 9, marginBottom: 3 }}>Monetization</div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#aaa", fontSize: 10 }}>Revenue:</span>
                <span style={{ color: "#00c853", fontSize: 10, fontWeight: 600 }}>$47.00</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Mockup: AI Modes ─────────────────────────────────────────────────────────

function AIModesMockup() {
  return (
    <div style={{ ...WIN, width: "100%", maxWidth: 480 }}>
      <Chrome title="FanBot — AI Settings" />
      <div style={{ padding: 20 }}>
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>AI Settings</div>
        <div style={{ color: "#555", fontSize: 12, marginBottom: 16 }}>Choose how much control AI has over your messages</div>

        {[
          {
            mode: "Manual",
            desc: "You write all replies yourself. FanBot is off.",
            icon: "✍️",
            active: false,
            color: "#555",
          },
          {
            mode: "Assisted",
            desc: "AI suggests a reply. You review and approve before it sends.",
            icon: "👁️",
            active: false,
            color: "#7c3aed",
          },
          {
            mode: "Full Auto — Instant",
            desc: "AI replies immediately, 24/7. Fastest response time.",
            icon: "⚡",
            active: false,
            color: "#f59e0b",
          },
          {
            mode: "Full Auto — Natural Delays",
            desc: "AI replies with human-like timing. Feels 100% real to fans.",
            icon: "🧠",
            active: true,
            color: "#00c853",
          },
        ].map((m, i) => (
          <div key={i} style={{
            display: "flex", alignItems: "flex-start", gap: 12, padding: "12px", marginBottom: 8,
            background: m.active ? "#0d1f0d" : "#151515",
            border: `1px solid ${m.active ? "#00c853" : "#222"}`,
            borderRadius: 10,
          }}>
            <div style={{ fontSize: 20, marginTop: 1 }}>{m.icon}</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
                <span style={{ color: m.active ? "#fff" : "#aaa", fontSize: 13, fontWeight: 600 }}>{m.mode}</span>
                {m.active && <span style={{ background: "#00c853", color: "#000", fontSize: 9, fontWeight: 700, padding: "1px 7px", borderRadius: 10 }}>ACTIVE ✓</span>}
              </div>
              <div style={{ color: "#666", fontSize: 11, lineHeight: 1.5 }}>{m.desc}</div>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ color: "#aaa", fontSize: 12, fontWeight: 600 }}>AI Model</span>
            <span style={{ color: "#00c853", fontSize: 12 }}>GPT-4o (Recommended)</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#aaa", fontSize: 12, fontWeight: 600 }}>Max Reply Tokens</span>
            <span style={{ color: "#ccc", fontSize: 12 }}>150</span>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Mockup: Media Control ────────────────────────────────────────────────────

function MediaMockup() {
  return (
    <div style={{ ...WIN, width: "100%", maxWidth: 420 }}>
      <Chrome title="FanBot — Media Control" />
      <div style={{ padding: 18 }}>
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Media Control</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
          {[
            { label: "TOTAL MEDIA", value: "203", icon: "🖼️", color: "#7c3aed" },
            { label: "SFW (FREE)", value: "11", icon: "📁", color: "#00c853" },
            { label: "PPV (PAID)", value: "5", icon: "💰", color: "#f59e0b" },
            { label: "UNCATEGORIZED", value: "187", icon: "📁", color: "#555" },
          ].map((s, i) => (
            <div key={i} style={{ background: "#151515", border: "1px solid #222", borderRadius: 8, padding: "10px 12px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
                <span style={{ fontSize: 12 }}>{s.icon}</span>
                <span style={{ color: "#555", fontSize: 9, fontWeight: 700 }}>{s.label}</span>
              </div>
              <div style={{ color: s.color, fontSize: 22, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        {[
          { label: "Vault Awareness", sub: "Allow AI to send media from your vault", on: true },
          { label: "Tip Tracking", sub: "Track tip requests and responses", on: true },
        ].map((t, i) => (
          <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #1a1a1a" }}>
            <div>
              <div style={{ color: "#ddd", fontSize: 13, fontWeight: 500 }}>{t.label}</div>
              <div style={{ color: "#555", fontSize: 11 }}>{t.sub}</div>
            </div>
            <Toggle on={t.on} />
          </div>
        ))}

        <div style={{ marginTop: 12 }}>
          <Label>SFW Folder Prefix</Label>
          <Field value="sfw" />
          <div style={{ color: "#444", fontSize: 10, marginTop: 4, marginBottom: 10 }}>Media files starting with this prefix will be sent for free</div>
          <Label>PPV Folder Prefix</Label>
          <Field value="ppv" />
          <div style={{ color: "#444", fontSize: 10, marginTop: 4, marginBottom: 14 }}>Media files starting with this prefix will be sent as PPV</div>
          <div style={{ background: "#00c853", color: "#000", fontWeight: 700, fontSize: 13, padding: "10px", borderRadius: 8, textAlign: "center" }}>💾 Save Settings</div>
        </div>
      </div>
    </div>
  )
}

// ─── Mockup: Subscriber Memory ────────────────────────────────────────────────

function SubscriberMockup() {
  return (
    <div style={{ ...WIN, width: "100%", maxWidth: 340 }}>
      <Chrome title="FanBot — Subscriber Panel" />
      <div style={{ padding: 16 }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1, background: "#00c853", color: "#000", fontSize: 12, fontWeight: 700, padding: "8px", borderRadius: 8, textAlign: "center" }}>🧠 Memory</div>
          <div style={{ flex: 1, background: "#1e1e1e", color: "#888", fontSize: 12, padding: "8px", borderRadius: 8, textAlign: "center" }}>⚡ Quick Profile</div>
        </div>

        <div style={{ background: "#0d1a0d", border: "1px solid #00c853", borderRadius: 8, padding: 12, marginBottom: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
            <span style={{ fontSize: 12 }}>🧠</span>
            <span style={{ color: "#00c853", fontSize: 11, fontWeight: 700 }}>AI Memory</span>
          </div>
          <div style={{ color: "#aaa", fontSize: 11, lineHeight: 1.6 }}>
            This individual is highly communicative and interested in making connections. They show a keen interest in cooking, specifically detailed recipes, and are open to travel and meeting new people.
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#888", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Personality:</div>
            <div style={{ color: "#888", fontSize: 11, lineHeight: 1.5 }}>Friendly, direct, and eager to connect. Detail-oriented and willing to take initiative in social situations.</div>
          </div>
          <div style={{ marginTop: 8 }}>
            <div style={{ color: "#888", fontSize: 11, fontWeight: 600, marginBottom: 4 }}>Facts:</div>
            {["They love cooking pasta.", "They are willing to travel.", "They've expressed interest in meeting."].map((f, i) => (
              <div key={i} style={{ color: "#777", fontSize: 10, marginBottom: 2 }}>▸ {f}</div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#555", fontSize: 9, fontWeight: 700, marginBottom: 5 }}>⚡ QUICK PROFILE</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
            {["cooking", "travel", "admiration", "social"].map((tag, i) => (
              <span key={i} style={{ color: "#00c853", fontSize: 10, background: "rgba(0,200,83,0.06)", border: "1px solid rgba(0,200,83,0.15)", borderRadius: 10, padding: "2px 8px" }}>{tag}</span>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 12 }}>
          <div style={{ color: "#555", fontSize: 10, marginBottom: 5 }}>Notes</div>
          <div style={{ background: "#151515", border: "1px solid #222", borderRadius: 7, padding: "8px 10px", color: "#444", fontSize: 11, minHeight: 50 }}>Add notes...</div>
        </div>

        <div style={{ background: "#0a1f0a", border: "1px solid #1e3a1e", borderRadius: 8, padding: "8px 12px", marginBottom: 12 }}>
          <div style={{ color: "#666", fontSize: 10, marginBottom: 6, fontWeight: 600 }}>Monetization</div>
          {[["Revenue:", "$127.00"], ["Purchases:", "3"], ["Conversion:", "68%"]].map(([k, v], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
              <span style={{ color: "#666", fontSize: 11 }}>{k}</span>
              <span style={{ color: i === 0 ? "#00c853" : "#888", fontSize: 11, fontWeight: i === 0 ? 600 : 400 }}>{v}</span>
            </div>
          ))}
        </div>

        <div style={{ background: "#00c853", color: "#000", fontWeight: 700, fontSize: 13, padding: "9px", borderRadius: 8, textAlign: "center" }}>💾 Save Notes</div>
      </div>
    </div>
  )
}

// ─── Mockup: Analytics Dashboard ─────────────────────────────────────────────

function AnalyticsMockup() {
  return (
    <div style={{ ...WIN, width: "100%", maxWidth: 480 }}>
      <Chrome title="FanBot — Analytics Dashboard" />
      <div style={{ padding: 18 }}>
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 14 }}>Analytics Dashboard</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
          {[
            { label: "MESSAGES SENT", value: "1,247", color: "#7c3aed", icon: "💬" },
            { label: "MESSAGES RECEIVED", value: "3,891", color: "#00c853", icon: "📨" },
            { label: "AI REPLIES", value: "1,189", color: "#00c853", icon: "🤖" },
            { label: "ACTIVE CHATS", value: "47", color: "#a78bfa", icon: "👥" },
            { label: "AI USAGE", value: "95%", color: "#f59e0b", icon: "📈" },
            { label: "TOTAL MESSAGES", value: "5,138", color: "#f87171", icon: "📊" },
          ].map((s, i) => (
            <div key={i} style={{ background: "#151515", border: "1px solid #222", borderRadius: 8, padding: "10px 10px" }}>
              <div style={{ color: "#444", fontSize: 8, fontWeight: 700, marginBottom: 5 }}>{s.icon} {s.label}</div>
              <div style={{ color: s.color, fontSize: 18, fontWeight: 800 }}>{s.value}</div>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 10 }}>
          <div style={{ color: "#aaa", fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Last 7 Days Activity</div>
          {[
            ["Sun", 142, 28], ["Mon", 198, 41], ["Tue", 223, 56],
            ["Wed", 187, 39], ["Thu", 251, 63], ["Fri", 312, 78], ["Sat", 134, 24],
          ].map(([day, msgs, ai], i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
              <span style={{ color: "#555", fontSize: 10, width: 28 }}>{day}</span>
              <div style={{ flex: 1, height: 6, background: "#1a1a1a", borderRadius: 3, overflow: "hidden" }}>
                <div style={{ width: `${(msgs as number) / 320 * 100}%`, height: "100%", background: "linear-gradient(90deg,#7c3aed,#00c853)", borderRadius: 3 }} />
              </div>
              <span style={{ color: "#888", fontSize: 10, width: 28 }}>{msgs}</span>
              <span style={{ color: "#00c853", fontSize: 9, width: 32 }}>🤖{ai}</span>
            </div>
          ))}
        </div>

        <div style={{ background: "#151515", border: "1px solid #1e1e1e", borderRadius: 8, padding: 10 }}>
          <div style={{ color: "#aaa", fontSize: 11, fontWeight: 600, marginBottom: 8 }}>Most Active Conversations</div>
          {[
            { name: "alex_wl", msgs: 312, revenue: "$127" },
            { name: "TopFan_Mike", msgs: 241, revenue: "$94" },
            { name: "crypto_k", msgs: 198, revenue: "$203" },
          ].map((c, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <span style={{ color: "#555", fontSize: 11 }}>#{i + 1}</span>
              <span style={{ color: "#ccc", fontSize: 12, flex: 1 }}>{c.name}</span>
              <span style={{ color: "#888", fontSize: 11 }}>{c.msgs} msgs</span>
              <span style={{ color: "#00c853", fontSize: 11, fontWeight: 600 }}>{c.revenue}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Mockup: Creator Persona ──────────────────────────────────────────────────

function PersonaMockup() {
  return (
    <div style={{ ...WIN, width: "100%", maxWidth: 340 }}>
      <Chrome title="FanBot — Creator Persona" />
      <div style={{ padding: 16 }}>
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Creator Persona</div>
        <div style={{ color: "#555", fontSize: 11, marginBottom: 14 }}>AI Identity — who the AI acts as</div>

        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <Label>Name</Label>
            <Field value="Julie" />
          </div>
          <div style={{ width: 60 }}>
            <Label>Age</Label>
            <Field value="25" />
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <Label>Accent / Style</Label>
          <Field value="British" />
        </div>
        <div style={{ marginBottom: 10 }}>
          <Label>Location</Label>
          <Field value="London" />
        </div>

        <div style={{ height: 1, background: "#1e1e1e", margin: "12px 0" }} />

        <div style={{ marginBottom: 10 }}>
          <Label>Physical</Label>
          <div style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 7, padding: "8px 10px", color: "#ccc", fontSize: 11, lineHeight: 1.5 }}>
            Sexy brunette with bangs and extremely large breasts
          </div>
        </div>

        <div style={{ marginBottom: 10 }}>
          <Label>Personality</Label>
          <div style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 7, padding: "8px 10px", color: "#ccc", fontSize: 11, lineHeight: 1.5 }}>
            Flirty, playful, very sexual. Loves her fans.
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <Label>Facts</Label>
          <div style={{ background: "#1e1e1e", border: "1px solid #2a2a2a", borderRadius: 7, padding: "8px 10px", color: "#ccc", fontSize: 11, lineHeight: 1.5 }}>
            Works as a make up artist. Does bridal makeup.
          </div>
        </div>

        <div style={{ background: "#00c853", color: "#000", fontWeight: 700, fontSize: 13, padding: "9px", borderRadius: 8, textAlign: "center" }}>💾 Save</div>
      </div>
    </div>
  )
}

// ─── Mockup: Chat Control ─────────────────────────────────────────────────────

function ChatControlMockup() {
  return (
    <div style={{ ...WIN, width: "100%", maxWidth: 400 }}>
      <Chrome title="FanBot — Chat Control" />
      <div style={{ padding: 18 }}>
        <div style={{ color: "#fff", fontSize: 15, fontWeight: 700, marginBottom: 4 }}>Chat Control Settings</div>
        <div style={{ color: "#555", fontSize: 11, marginBottom: 16 }}>Control automation speed and message timing</div>

        <div style={{ marginBottom: 14 }}>
          <Label>Operation Mode</Label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {[
              { label: "Manual", sub: "No automation. You reply to everything.", active: false },
              { label: "Assisted", sub: "AI suggests. You approve before sending.", active: false },
              { label: "Full Auto — Instant", sub: "Replies immediately as messages arrive.", active: false },
              { label: "Full Auto — Natural Delays", sub: "Waits a human-like amount of time before replying.", active: true },
            ].map((opt, i) => (
              <div key={i} style={{
                display: "flex", alignItems: "center", gap: 10, padding: "9px 12px",
                background: opt.active ? "#0d1f0d" : "#151515",
                border: `1px solid ${opt.active ? "#00c853" : "#222"}`,
                borderRadius: 8,
              }}>
                <div style={{ width: 14, height: 14, borderRadius: "50%", border: `2px solid ${opt.active ? "#00c853" : "#444"}`, background: opt.active ? "#00c853" : "transparent", flexShrink: 0 }} />
                <div>
                  <div style={{ color: opt.active ? "#fff" : "#aaa", fontSize: 12, fontWeight: 500 }}>{opt.label}</div>
                  <div style={{ color: "#555", fontSize: 10 }}>{opt.sub}</div>
                </div>
                {opt.active && <span style={{ marginLeft: "auto", color: "#00c853", fontSize: 10 }}>✓</span>}
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <Label>Refresh Interval</Label>
            <span style={{ color: "#00c853", fontSize: 11, fontWeight: 600 }}>30 seconds</span>
          </div>
          <div style={{ height: 6, background: "#1e1e1e", borderRadius: 3, position: "relative" }}>
            <div style={{ width: "18%", height: "100%", background: "linear-gradient(90deg,#7c3aed,#00c853)", borderRadius: 3 }} />
            <div style={{ width: 14, height: 14, borderRadius: "50%", background: "#00c853", position: "absolute", top: -4, left: "18%", transform: "translateX(-50%)" }} />
          </div>
          <div style={{ color: "#444", fontSize: 10, marginTop: 4 }}>How often to check for new messages (10–300 seconds)</div>
        </div>

        <div style={{ background: "#151515", border: "1px solid #1e1e1e", borderRadius: 8, padding: "10px 12px", marginBottom: 14 }}>
          <div style={{ color: "#666", fontSize: 10, fontWeight: 700, marginBottom: 6 }}>Current Configuration</div>
          <div style={{ color: "#888", fontSize: 11 }}>· Mode: <span style={{ color: "#00c853" }}>Full Auto — Natural Delays</span></div>
          <div style={{ color: "#888", fontSize: 11 }}>· Refresh: <span style={{ color: "#ccc" }}>30s</span></div>
        </div>

        <div style={{ background: "#00c853", color: "#000", fontWeight: 700, fontSize: 13, padding: "10px", borderRadius: 8, textAlign: "center" }}>💾 Save Settings</div>
      </div>
    </div>
  )
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export function LandingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  useEffect(() => {
    const body = document.body
    const root = document.getElementById('root')
    const prevBodyOverflow = body.style.overflow
    const prevBodyHeight = body.style.height
    const prevRootHeight = root ? root.style.height : ''
    body.style.overflow = 'auto'
    body.style.height = 'auto'
    if (root) root.style.height = 'auto'
    return () => {
      body.style.overflow = prevBodyOverflow
      body.style.height = prevBodyHeight
      if (root) root.style.height = prevRootHeight
    }
  }, [])

  const faqs = [
    { q: "Do I need to give you my Fanvue password?", a: "Never. We use Fanvue's official login system (OAuth), the same secure method used by other trusted apps. We only ever get access to what you approve — nothing more." },
    { q: "Will my fans know it's AI replying?", a: "No. The AI replies in your voice, your style, your slang. To your fans, it just looks like you're super responsive. You can even review messages before they send if you want full control." },
    { q: "What if the AI says something I don't want?", a: "You're always in control. Use 'Assisted' mode — the AI writes the reply and you approve before it sends. Or use Full Auto and let it run. Your choice." },
    { q: "How long does setup take?", a: "About 5 minutes. Connect your Fanvue account, tell the AI how you talk and who you are, and turn it on. Most creators are up and running the same day." },
    { q: "Can I cancel the subscription anytime?", a: "Yes, cancel any time with one click. No contracts, no questions asked. If you cancel, you keep access until the end of your billing period." },
    { q: "What if I manage multiple Fanvue accounts?", a: "Each account gets its own FanBot subscription with separate AI settings, personas, and memory for each subscriber. Perfect for agencies running multiple creators." },
  ]

  const grad: React.CSSProperties = {
    background: "linear-gradient(135deg, #00c853 0%, #7c3aed 100%)",
    WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
  }
  const sec: React.CSSProperties = { padding: "80px 24px", maxWidth: 1100, margin: "0 auto" }
  const pill = (col = "#00c853", bg = "rgba(0,200,83,0.08)", border = "rgba(0,200,83,0.2)"): React.CSSProperties => ({
    display: "inline-flex", alignItems: "center", gap: 6,
    background: bg, border: `1px solid ${border}`, color: col,
    fontSize: 11, fontWeight: 700, padding: "5px 14px", borderRadius: 20, marginBottom: 18, letterSpacing: "0.05em",
  })

  return (
    <div style={{ background: "#080808", color: "#fff", fontFamily: "system-ui, -apple-system, sans-serif", overflowX: "hidden" }}>
      <style>{`
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.4}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes glow{0%,100%{box-shadow:0 0 20px rgba(0,200,83,0.25)}50%{box-shadow:0 0 50px rgba(0,200,83,0.5)}}
        .cta{transition:all 0.2s;}.cta:hover{transform:translateY(-2px);box-shadow:0 10px 35px rgba(0,200,83,0.45)!important}
        .ghost{transition:all 0.2s;}.ghost:hover{background:rgba(255,255,255,0.05)!important}
        .faq-row{transition:background 0.15s;cursor:pointer;}.faq-row:hover{background:#111!important}
        .fc{transition:all 0.2s;}.fc:hover{border-color:#00c853!important;transform:translateY(-3px)}
      `}</style>

      {/* ── NAVBAR ── */}
      <nav style={{
        position: "sticky", top: 0, zIndex: 100,
        background: "rgba(8,8,8,0.9)", backdropFilter: "blur(12px)",
        borderBottom: "1px solid #161616",
        padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#00c853,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: "-0.02em" }}>FanBot</span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <a href="#features" style={{ color: "#777", fontSize: 14, textDecoration: "none" }}>Features</a>
          <a href="#how-it-works" style={{ color: "#777", fontSize: 14, textDecoration: "none" }}>How It Works</a>
          <a href="#pricing" style={{ color: "#777", fontSize: 14, textDecoration: "none" }}>Pricing</a>
          <a href="/login" className="cta" style={{ background: "#00c853", color: "#000", fontWeight: 700, fontSize: 13, padding: "8px 18px", borderRadius: 8, textDecoration: "none", boxShadow: "0 4px 16px rgba(0,200,83,0.25)" }}>
            Get Started Free →
          </a>
        </div>
      </nav>

      {/* ── HERO ── */}
      <div style={{ padding: "90px 24px 60px", maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <div style={pill()}>✦ &nbsp;Free 7-day trial — no credit card needed</div>
        <h1 style={{ fontSize: "clamp(38px, 6vw, 74px)", fontWeight: 900, lineHeight: 1.08, letterSpacing: "-0.03em", marginBottom: 22 }}>
          Stop Typing.<br /><span style={grad}>Start Earning.</span>
        </h1>
        <p style={{ color: "#999", fontSize: "clamp(16px, 2vw, 20px)", maxWidth: 600, margin: "0 auto 36px", lineHeight: 1.65 }}>
          FanBot connects to your Fanvue account and replies to your fans in your exact voice — 24/7. No missed messages. No burnout. Just more conversions and more money.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="/login" className="cta" style={{ background: "#00c853", color: "#000", fontWeight: 800, fontSize: 16, padding: "14px 32px", borderRadius: 10, textDecoration: "none", boxShadow: "0 4px 24px rgba(0,200,83,0.35)" }}>
            Start Free Trial → Login with Fanvue
          </a>
          <a href="#how-it-works" className="ghost" style={{ background: "transparent", border: "1px solid #2a2a2a", color: "#fff", fontWeight: 600, fontSize: 16, padding: "14px 32px", borderRadius: 10, textDecoration: "none" }}>
            See How It Works
          </a>
        </div>
        <div style={{ marginTop: 56, display: "flex", justifyContent: "center", animation: "float 7s ease-in-out infinite" }}>
          <ChatAppMockup />
        </div>
      </div>

      {/* ── STATS ── */}
      <div style={{ borderTop: "1px solid #141414", borderBottom: "1px solid #141414", padding: "28px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 28 }}>
          {[
            { v: "24/7", l: "Auto-replies, even while you sleep" },
            { v: "5 min", l: "Setup time — seriously that fast" },
            { v: "3×", l: "More replies = more conversions" },
            { v: "$0", l: "Free for 7 days, no card needed" },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: "center" }}>
              <div style={{ fontSize: 32, fontWeight: 900, ...grad }}>{s.v}</div>
              <div style={{ color: "#555", fontSize: 13, marginTop: 4 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── PAIN POINTS ── */}
      <div style={{ ...sec, textAlign: "center" }}>
        <div style={pill("#f87171", "rgba(248,113,113,0.06)", "rgba(248,113,113,0.15)")}>😩 &nbsp;Sound familiar?</div>
        <h2 style={{ fontSize: "clamp(26px, 4vw, 48px)", fontWeight: 800, marginBottom: 14, letterSpacing: "-0.02em" }}>
          Running an AI girlfriend account is <span style={grad}>exhausting.</span>
        </h2>
        <p style={{ color: "#777", fontSize: 16, maxWidth: 540, margin: "0 auto 48px" }}>
          Most creators burn out trying to keep up with hundreds of conversations a day. It doesn't have to be this hard.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {[
            { e: "😓", t: "Drowning in DMs", d: "200 unread messages. No idea where to start. Every unanswered fan is a missed sale." },
            { e: "🌙", t: "Up Until 2am Replying", d: "Your fans message at all hours. You can't sleep. You're terrified of losing subscribers." },
            { e: "💸", t: "Losing Sales While You Sleep", d: "A fan messages about PPV. You don't reply in time. They move on. That's money gone." },
            { e: "😶", t: "Don't Know What To Say", d: "Writer's block hits hard. Saying the same thing over and over doesn't convert fans into buyers." },
            { e: "🔁", t: "Copying the Same Reply 50 Times", d: "You're manually sending the same message to dozens of fans every single day. Total waste." },
            { e: "📉", t: "Fans Go Cold Without You", d: "Take one day off. Engagement drops. Subscribers cancel. You can never fully disconnect." },
          ].map((p, i) => (
            <div key={i} className="fc" style={{ background: "#0c0c0c", border: "1px solid #1a1a1a", borderRadius: 12, padding: "20px 18px", textAlign: "left" }}>
              <div style={{ fontSize: 26, marginBottom: 10 }}>{p.e}</div>
              <div style={{ color: "#fff", fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{p.t}</div>
              <div style={{ color: "#666", fontSize: 13, lineHeight: 1.6 }}>{p.d}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── SOLUTION ── */}
      <div style={{ padding: "60px 24px", textAlign: "center", background: "linear-gradient(180deg,#080808 0%,#0c180c 100%)" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={pill()}>🤖 &nbsp;Meet FanBot</div>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 52px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 18 }}>
            Your AI that works <span style={grad}>while you don't.</span>
          </h2>
          <p style={{ color: "#999", fontSize: 17, lineHeight: 1.7 }}>
            FanBot plugs into your Fanvue account and handles your chats for you. It learns exactly how you talk, remembers every fan's name and preferences, and replies in a way that feels 100% human. Your fans stay happy. Your income keeps growing. You get your life back.
          </p>
        </div>
      </div>

      {/* ── FEATURES ── */}
      <div id="features" style={{ ...sec }}>
        <div style={{ textAlign: "center", marginBottom: 60 }}>
          <div style={pill()}>⚡ Features</div>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em" }}>
            Everything you need to run on autopilot
          </h2>
        </div>

        {/* Feature 1: Chat + Full App */}
        <div style={{ display: "flex", alignItems: "center", gap: 56, marginBottom: 90, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={pill()}>💬 AI Chat</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 14, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              AI that replies exactly like you
            </h3>
            <p style={{ color: "#999", fontSize: 15, lineHeight: 1.7, marginBottom: 18 }}>
              Tell FanBot how you talk — your slang, your emojis, your vibe. It learns your style and replies to fans as if it's you. Fans can't tell the difference. They just think you're incredibly responsive.
            </p>
            {["Learns your tone, language, and personality", "Uses your catchphrases and emoji style", "Handles flirting, PPV pushes, and casual chat", "Gets smarter the more you use it"].map((item, i) => (
              <div key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#00c853", fontWeight: 700 }}>✓</span> {item}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 300, display: "flex", justifyContent: "center" }}>
            <ChatAppMockup />
          </div>
        </div>

        {/* Feature 2: AI Modes */}
        <div style={{ display: "flex", alignItems: "center", gap: 56, marginBottom: 90, flexWrap: "wrap-reverse" }}>
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <AIModesMockup />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={pill("#a78bfa", "rgba(124,58,237,0.08)", "rgba(124,58,237,0.2)")}>🧠 AI Modes</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 14, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              You choose how much control the AI has
            </h3>
            <p style={{ color: "#999", fontSize: 15, lineHeight: 1.7, marginBottom: 18 }}>
              Not ready to go fully automatic? No problem. FanBot has four modes so you stay in control at every level.
            </p>
            {[
              { m: "Manual", d: "You write every reply yourself. AI is off." },
              { m: "Assisted", d: "AI drafts replies. You review and approve each one before it sends." },
              { m: "Full Auto — Instant", d: "AI replies the second a message arrives. Fastest response time." },
              { m: "Full Auto — Natural Delays", d: "AI waits a human-like delay before replying. Feels 100% real to fans." },
            ].map((item, i) => (
              <div key={i} style={{ marginBottom: 10, padding: "10px 12px", background: "#0e0e0e", border: "1px solid #1a1a1a", borderRadius: 8 }}>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{item.m}</div>
                <div style={{ color: "#666", fontSize: 12 }}>{item.d}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Feature 3: Subscriber Memory */}
        <div style={{ display: "flex", alignItems: "center", gap: 56, marginBottom: 90, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={pill("#a78bfa", "rgba(124,58,237,0.08)", "rgba(124,58,237,0.2)")}>🧠 Smart Memory</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 14, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              Remembers every fan, every time
            </h3>
            <p style={{ color: "#999", fontSize: 15, lineHeight: 1.7, marginBottom: 18 }}>
              FanBot builds a profile for every subscriber — what they like, what they've bought, what makes them tip. Every conversation feels personal, even when it's automated.
            </p>
            {["Remembers past conversations", "Tracks what each fan has purchased", "Knows who's most likely to buy PPV", "Personalises every single reply"].map((item, i) => (
              <div key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#a78bfa", fontWeight: 700 }}>✓</span> {item}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <SubscriberMockup />
          </div>
        </div>

        {/* Feature 4: Creator Persona */}
        <div style={{ display: "flex", alignItems: "center", gap: 56, marginBottom: 90, flexWrap: "wrap-reverse" }}>
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <PersonaMockup />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={pill("#f59e0b", "rgba(245,158,11,0.08)", "rgba(245,158,11,0.2)")}>🎭 Creator Persona</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 14, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              Build your AI twin in 5 minutes
            </h3>
            <p style={{ color: "#999", fontSize: 15, lineHeight: 1.7, marginBottom: 18 }}>
              Tell FanBot who your character is — her name, age, personality, location, appearance, and backstory. The AI will use this to roleplay as her perfectly in every conversation.
            </p>
            {["Name, age, location, accent", "Physical description for context", "Personality and vibe", "Custom facts and backstory", "Fully editable any time"].map((item, i) => (
              <div key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#f59e0b", fontWeight: 700 }}>✓</span> {item}
              </div>
            ))}
          </div>
        </div>

        {/* Feature 5: Media Control */}
        <div style={{ display: "flex", alignItems: "center", gap: 56, marginBottom: 90, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={pill("#f87171", "rgba(248,113,113,0.08)", "rgba(248,113,113,0.2)")}>🖼️ Media Control</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 14, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              AI knows your content and sells it for you
            </h3>
            <p style={{ color: "#999", fontSize: 15, lineHeight: 1.7, marginBottom: 18 }}>
              Connect your Fanvue media vault and FanBot will suggest the right photos or videos at the right moment — free content to build connection, PPV content to build income.
            </p>
            {["Reads your full Fanvue media vault", "Sends SFW content to build connection", "Suggests PPV at the perfect moment", "Tracks tip requests and responses", "Configurable folder naming convention"].map((item, i) => (
              <div key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#f87171", fontWeight: 700 }}>✓</span> {item}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <MediaMockup />
          </div>
        </div>

        {/* Feature 6: Analytics */}
        <div style={{ display: "flex", alignItems: "center", gap: 56, marginBottom: 60, flexWrap: "wrap-reverse" }}>
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <AnalyticsMockup />
          </div>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={pill("#f59e0b", "rgba(245,158,11,0.08)", "rgba(245,158,11,0.2)")}>📊 Analytics</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 14, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              Know exactly who's worth your time
            </h3>
            <p style={{ color: "#999", fontSize: 15, lineHeight: 1.7, marginBottom: 18 }}>
              See which fans spend the most, which conversations earn the most, and how your AI is performing day by day. Stop guessing. Start focusing where it pays.
            </p>
            {["Top spenders and revenue per fan", "Daily message and AI usage stats", "Most active conversation tracking", "Conversion rate monitoring"].map((item, i) => (
              <div key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#f59e0b", fontWeight: 700 }}>✓</span> {item}
              </div>
            ))}
          </div>
        </div>

        {/* Feature 7: Chat Control */}
        <div style={{ display: "flex", alignItems: "center", gap: 56, marginBottom: 20, flexWrap: "wrap" }}>
          <div style={{ flex: 1, minWidth: 280 }}>
            <div style={pill("#00c853")}>⚙️ Chat Control</div>
            <h3 style={{ fontSize: "clamp(22px, 3vw, 36px)", fontWeight: 800, marginBottom: 14, lineHeight: 1.15, letterSpacing: "-0.02em" }}>
              Fine-tune how the AI behaves
            </h3>
            <p style={{ color: "#999", fontSize: 15, lineHeight: 1.7, marginBottom: 18 }}>
              Switch modes, adjust how often FanBot checks for new messages, and see your current setup at a glance. Everything is one click away from the sidebar.
            </p>
            {["4 reply modes from manual to full auto", "Adjustable refresh interval", "Instant config changes without restart", "Always accessible from the sidebar"].map((item, i) => (
              <div key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ color: "#00c853", fontWeight: 700 }}>✓</span> {item}
              </div>
            ))}
          </div>
          <div style={{ flex: 1, minWidth: 280, display: "flex", justifyContent: "center" }}>
            <ChatControlMockup />
          </div>
        </div>
      </div>

      {/* ── HOW IT WORKS ── */}
      <div id="how-it-works" style={{ background: "#090909", padding: "80px 24px", borderTop: "1px solid #141414", borderBottom: "1px solid #141414" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <div style={pill()}>🛠 Simple Setup</div>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>
            Up and running in <span style={grad}>5 minutes</span>
          </h2>
          <p style={{ color: "#666", fontSize: 16, marginBottom: 52 }}>No tech skills required. Seriously.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 20 }}>
            {[
              { step: "01", e: "🔗", t: "Connect your Fanvue", d: "Click 'Login with Fanvue'. We connect securely using Fanvue's official login. Your password is never shared with us." },
              { step: "02", e: "🎭", t: "Set up your AI persona", d: "Tell FanBot how you talk, your character's backstory, and what you sell. Takes 5 minutes. The AI uses this in every conversation." },
              { step: "03", e: "✅", t: "Turn it on and relax", d: "Switch to Full Auto mode. FanBot starts replying immediately. Check in whenever you like — it never stops working." },
            ].map((s, i) => (
              <div key={i} style={{ background: "#111", border: "1px solid #1a1a1a", borderRadius: 14, padding: "28px 22px", position: "relative" }}>
                <div style={{ color: "#1a1a1a", fontSize: 52, fontWeight: 900, position: "absolute", top: 14, right: 18, lineHeight: 1 }}>{s.step}</div>
                <div style={{ fontSize: 34, marginBottom: 14 }}>{s.e}</div>
                <div style={{ color: "#fff", fontWeight: 700, fontSize: 17, marginBottom: 10 }}>{s.t}</div>
                <div style={{ color: "#666", fontSize: 13, lineHeight: 1.7 }}>{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── QUOTE ── */}
      <div style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <div style={{ fontSize: 44, marginBottom: 18 }}>💬</div>
          <blockquote style={{ fontSize: "clamp(17px, 2.5vw, 24px)", color: "#ddd", fontStyle: "italic", lineHeight: 1.65, marginBottom: 24, fontWeight: 400 }}>
            "I went from spending 4 hours a day replying to fans, to maybe 20 minutes. My earnings actually went <strong style={{ color: "#00c853" }}>up</strong> because fans get faster replies and feel more looked after. Honestly it's insane."
          </blockquote>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: "50%", background: "linear-gradient(135deg,#7c3aed,#00c853)" }} />
            <div style={{ textAlign: "left" }}>
              <div style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>Luna 🌙</div>
              <div style={{ color: "#555", fontSize: 12 }}>Fanvue creator — 1,200+ subscribers</div>
            </div>
          </div>
        </div>
      </div>

      {/* ── PRICING ── */}
      <div id="pricing" style={{ background: "#090909", padding: "80px 24px", borderTop: "1px solid #141414" }}>
        <div style={{ maxWidth: 520, margin: "0 auto", textAlign: "center" }}>
          <div style={pill()}>💳 Pricing</div>
          <h2 style={{ fontSize: "clamp(26px, 4vw, 48px)", fontWeight: 800, letterSpacing: "-0.02em", marginBottom: 12 }}>Simple, honest pricing</h2>
          <p style={{ color: "#666", fontSize: 16, marginBottom: 40 }}>Try it free. Pay only when you're hooked.</p>
          <div style={{ background: "#0d0d0d", border: "2px solid #00c853", borderRadius: 20, padding: "40px 36px", animation: "glow 3s ease-in-out infinite" }}>
            <div style={{ display: "inline-block", background: "#00c853", color: "#000", fontSize: 10, fontWeight: 800, padding: "4px 12px", borderRadius: 20, marginBottom: 20, letterSpacing: "0.08em" }}>MOST POPULAR</div>
            <div style={{ color: "#fff", fontSize: 21, fontWeight: 700, marginBottom: 6 }}>FanBot Pro</div>
            <div style={{ marginBottom: 4 }}>
              <span style={{ fontSize: 52, fontWeight: 900 }}>$29</span>
              <span style={{ color: "#555", fontSize: 16 }}>/month</span>
            </div>
            <div style={{ color: "#00c853", fontSize: 13, fontWeight: 600, marginBottom: 28 }}>✦ Start with 7 days completely free</div>
            <ul style={{ listStyle: "none", padding: 0, margin: "0 0 32px", textAlign: "left" }}>
              {["Unlimited AI replies — no caps", "Full Auto mode (24/7)", "Subscriber memory for every fan", "Smart PPV upsell suggestions", "Media vault integration", "Analytics dashboard", "Creator persona builder", "4 reply modes + chat control", "Priority support"].map((item, i) => (
                <li key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 9, display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#00c853", fontWeight: 700 }}>✓</span> {item}
                </li>
              ))}
            </ul>
            <a href="/login" className="cta" style={{ display: "block", background: "#00c853", color: "#000", fontWeight: 800, fontSize: 16, padding: "16px", borderRadius: 10, textDecoration: "none", textAlign: "center", boxShadow: "0 4px 20px rgba(0,200,83,0.3)" }}>
              Start Free Trial → Login with Fanvue
            </a>
            <p style={{ color: "#444", fontSize: 12, marginTop: 12 }}>No credit card required for your free trial. Cancel any time.</p>
          </div>
        </div>
      </div>

      {/* ── FAQ ── */}
      <div style={{ padding: "80px 24px" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 46 }}>
            <div style={pill()}>❓ FAQ</div>
            <h2 style={{ fontSize: "clamp(24px, 4vw, 44px)", fontWeight: 800, letterSpacing: "-0.02em" }}>Questions? We've got answers.</h2>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {faqs.map((faq, i) => (
              <div key={i} className="faq-row" style={{ borderRadius: 10, border: "1px solid #161616", overflow: "hidden" }} onClick={() => setOpenFaq(openFaq === i ? null : i)}>
                <div style={{ padding: "17px 20px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <span style={{ color: "#fff", fontSize: 14, fontWeight: 600 }}>{faq.q}</span>
                  <span style={{ color: "#444", fontSize: 20, flexShrink: 0, transform: openFaq === i ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>+</span>
                </div>
                {openFaq === i && <div style={{ padding: "0 20px 16px", color: "#777", fontSize: 14, lineHeight: 1.7 }}>{faq.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── FINAL CTA ── */}
      <div style={{ padding: "80px 24px", background: "linear-gradient(180deg,#080808 0%,#0c180c 100%)", borderTop: "1px solid #141414", textAlign: "center" }}>
        <div style={{ maxWidth: 680, margin: "0 auto" }}>
          <div style={{ fontSize: 46, marginBottom: 18 }}>🚀</div>
          <h2 style={{ fontSize: "clamp(28px, 5vw, 56px)", fontWeight: 900, letterSpacing: "-0.03em", marginBottom: 16 }}>
            Ready to let AI do <br /><span style={grad}>the heavy lifting?</span>
          </h2>
          <p style={{ color: "#777", fontSize: 17, maxWidth: 500, margin: "0 auto 40px", lineHeight: 1.6 }}>
            Join Fanvue creators who are earning more and working less. Your 7-day free trial starts the moment you log in.
          </p>
          <a href="/login" className="cta" style={{ display: "inline-block", background: "#00c853", color: "#000", fontWeight: 800, fontSize: 18, padding: "18px 44px", borderRadius: 12, textDecoration: "none", boxShadow: "0 6px 30px rgba(0,200,83,0.4)" }}>
            Login with Fanvue — It's Free →
          </a>
          <p style={{ color: "#333", fontSize: 13, marginTop: 14 }}>No credit card required · Cancel any time · 7-day free trial</p>
        </div>
      </div>

      {/* ── FOOTER ── */}
      <div style={{ borderTop: "1px solid #111", padding: "28px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 14, maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 26, height: 26, borderRadius: 6, background: "linear-gradient(135deg,#00c853,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>🤖</div>
          <span style={{ fontWeight: 800 }}>FanBot</span>
          <span style={{ color: "#333", fontSize: 13 }}>© 2026</span>
        </div>
        <div style={{ display: "flex", gap: 22 }}>
          {["Features", "Pricing", "Privacy", "Terms"].map((l, i) => (
            <a key={i} href="#" style={{ color: "#444", fontSize: 13, textDecoration: "none" }}>{l}</a>
          ))}
        </div>
      </div>
    </div>
  )
}
