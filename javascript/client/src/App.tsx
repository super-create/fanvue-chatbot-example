import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { ChatPanel } from "@/components/chat-panel"
import { SubscriberPanel } from "@/components/subscriber-panel"
import { CreatorPanel } from "@/components/creator-panel"
import { AISettingsModal } from "@/components/ai-settings-modal"
import { MediaControlModal } from "@/components/media-control-modal"
import { AnalyticsModal } from "@/components/analytics-modal"
import { ChatsControlModal } from "@/components/chats-control-modal"
import { PaywallPage } from "@/components/paywall-page"
import { LandingPage } from "@/components/landing-page"
import { Toaster } from "@/components/ui/sonner"
import { Dialog, DialogContent } from "@/components/ui/dialog"
import { checkSession, type UserSession } from "@/lib/api"
import { Loader2 } from "lucide-react"

export type ModalType = "ai-mode" | "configure" | "media" | "analytics" | "chats" | null

function App() {
  const [session, setSession] = useState<UserSession | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [settingsVersion, setSettingsVersion] = useState(0)
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)

  useEffect(() => {
    checkSession()
      .then(setSession)
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Breakpoints: hide creator panel below 1200px, subscriber panel below 900px
  const showSubscriberPanel = windowWidth >= 900
  const showCreatorPanel = windowWidth >= 1200

  // Show loading spinner while checking session
  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#121212]">
        <div className="text-center">
          <Loader2 className="h-6 w-6 animate-spin text-[#00c853] mx-auto" />
          <p className="mt-2 text-[#888] text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  // Show landing page if not authenticated
  if (!session?.loggedIn) {
    return <LandingPage />
  }

  // Show paywall if logged in but no active subscription
  const subStatus = session.subscription?.status
  const hasActiveSubscription = subStatus === 'active' || subStatus === 'trialing'

  if (!hasActiveSubscription) {
    return (
      <>
        <PaywallPage username={session.username} />
        <Toaster />
      </>
    )
  }

  return (
    <>
      <div className="flex h-screen w-full bg-[#121212]">
        {/* Column 1: Narrow Icon Sidebar */}
        <AppSidebar onOpenModal={setActiveModal} />

        {/* Column 2: Main Chat Area */}
        <ChatPanel
          session={session}
          selectedConversation={selectedConversation}
          onConversationChange={setSelectedConversation}
          settingsVersion={settingsVersion}
        />

        {/* Column 3: Subscriber Profile Panel — hidden below 900px */}
        {showSubscriberPanel && <SubscriberPanel conversationUuid={selectedConversation} />}

        {/* Column 4: Creator Persona Panel — hidden below 1200px */}
        {showCreatorPanel && <CreatorPanel />}
      </div>

      {/* Modals */}
      <ChatsControlModal
        open={activeModal === "chats"}
        onOpenChange={(open) => setActiveModal(open ? "chats" : null)}
        onSaved={() => setSettingsVersion(v => v + 1)}
      />

      <AISettingsModal
        open={activeModal === "ai-mode"}
        onOpenChange={(open) => setActiveModal(open ? "ai-mode" : null)}
      />

      {/* Configure AI → Creator Persona (accessible when panel is hidden on small screens) */}
      <Dialog
        open={activeModal === "configure"}
        onOpenChange={(open) => setActiveModal(open ? "configure" : null)}
      >
        <DialogContent className="p-0 bg-[#1a1a1a] border-[#2a2a2a]" style={{ padding: 0, width: '320px', maxWidth: '95vw', height: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <CreatorPanel />
        </DialogContent>
      </Dialog>

      <MediaControlModal
        open={activeModal === "media"}
        onOpenChange={(open) => setActiveModal(open ? "media" : null)}
      />

      <AnalyticsModal
        open={activeModal === "analytics"}
        onOpenChange={(open) => setActiveModal(open ? "analytics" : null)}
      />

      <Toaster />
    </>
  )
}

export default App
