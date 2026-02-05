import { useState, useEffect } from "react"
import { AppSidebar } from "@/components/app-sidebar"
import { ChatPanel } from "@/components/chat-panel"
import { SubscriberPanel } from "@/components/subscriber-panel"
import { CreatorPanel } from "@/components/creator-panel"
import { AISettingsModal } from "@/components/ai-settings-modal"
import { MediaControlModal } from "@/components/media-control-modal"
import { AnalyticsModal } from "@/components/analytics-modal"
import { ChatsControlModal } from "@/components/chats-control-modal"
import { Toaster } from "@/components/ui/sonner"
import { Button } from "@/components/ui/button"
import { checkSession, type UserSession } from "@/lib/api"
import { LogIn, Loader2 } from "lucide-react"

export type ModalType = "ai-mode" | "configure" | "media" | "analytics" | "chats" | null

function App() {
  const [session, setSession] = useState<UserSession | null>(null)
  const [selectedConversation, setSelectedConversation] = useState<string>("")
  const [loading, setLoading] = useState(true)
  const [activeModal, setActiveModal] = useState<ModalType>(null)
  const [settingsVersion, setSettingsVersion] = useState(0)

  useEffect(() => {
    checkSession()
      .then(setSession)
      .finally(() => setLoading(false))
  }, [])

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

  // Show login screen if not authenticated
  if (!session?.loggedIn) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[#121212]">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold text-white">Fanvue Chatbot</h1>
          <p className="text-[#888] text-sm">Please log in to continue</p>
          <Button
            onClick={() => window.location.href = '/login'}
            className="bg-[#00c853] hover:bg-[#00a843] text-white h-9 px-4"
          >
            <LogIn className="h-4 w-4 mr-2" />
            Login with Fanvue
          </Button>
        </div>
      </div>
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

        {/* Column 3: Subscriber Profile Panel */}
        <SubscriberPanel conversationUuid={selectedConversation} />

        {/* Column 4: Creator Persona Panel */}
        <CreatorPanel />
      </div>

      {/* Modals */}
      <ChatsControlModal
        open={activeModal === "chats"}
        onOpenChange={(open) => setActiveModal(open ? "chats" : null)}
        onSaved={() => setSettingsVersion(v => v + 1)}
      />

      <AISettingsModal
        open={activeModal === "ai-mode" || activeModal === "configure"}
        onOpenChange={(open) => setActiveModal(open ? activeModal : null)}
      />

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
