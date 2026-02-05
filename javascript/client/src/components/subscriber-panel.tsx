import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Brain, Zap, Save, User, Loader2 } from "lucide-react"
import {
  getSubscriberProfile,
  generateSubscriberProfile,
  saveSubscriberNotes,
  type SubscriberProfile,
} from "@/lib/api"
import { toast } from "sonner"

interface SubscriberPanelProps {
  conversationUuid: string
}

export function SubscriberPanel({ conversationUuid }: SubscriberPanelProps) {
  const [profile, setProfile] = useState<SubscriberProfile | null>(null)
  const [notes, setNotes] = useState("")
  const [generatingProfile, setGeneratingProfile] = useState(false)
  const [savingNotes, setSavingNotes] = useState(false)

  useEffect(() => {
    if (conversationUuid) {
      loadSubscriberData()
    } else {
      setProfile(null)
      setNotes("")
    }
  }, [conversationUuid])

  const loadSubscriberData = async () => {
    if (!conversationUuid) return
    const profileData = await getSubscriberProfile(conversationUuid)
    setProfile(profileData)
    setNotes(profileData?.manualNotes || "")
  }

  const handleGenerateProfile = async () => {
    if (!conversationUuid) return

    try {
      setGeneratingProfile(true)
      const data = await generateSubscriberProfile(conversationUuid)
      setProfile(data)
      toast.success("Profile generated successfully")
    } catch {
      toast.error("Failed to generate profile")
    } finally {
      setGeneratingProfile(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!conversationUuid) return

    try {
      setSavingNotes(true)
      await saveSubscriberNotes(conversationUuid, notes)
      toast.success("Notes saved")
    } catch {
      toast.error("Failed to save notes")
    } finally {
      setSavingNotes(false)
    }
  }

  return (
    <div className="w-[320px] min-w-[320px] border-l border-[#2a2a2a] bg-[#1a1a1a] flex flex-col">
      {/* Header */}
      <div className="h-14 border-b border-[#2a2a2a] flex items-center gap-3 shrink-0" style={{ padding: '0 10px' }}>
        <div className="h-8 w-8 rounded-full bg-[#2a2a2a] flex items-center justify-center">
          <User className="h-4 w-4 text-[#888]" />
        </div>
        <div className="min-w-0">
          <h2 className="text-sm font-medium text-white truncate">Subscriber</h2>
          <p className="text-xs text-[#666] truncate">
            {conversationUuid ? "Selected" : "None"}
          </p>
        </div>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        <div style={{ padding: '10px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Action Buttons */}
          <div className="flex gap-2">
            <Button
              size="sm"
              className="flex-1 h-9 text-sm bg-[#00c853] hover:bg-[#00a843] text-white rounded-lg shadow-sm"
              onClick={handleGenerateProfile}
              disabled={!conversationUuid || generatingProfile}
            >
              {generatingProfile ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Brain className="h-4 w-4 mr-1.5" />
              )}
              Memory
            </Button>
            <Button
              variant="secondary"
              size="sm"
              className="flex-1 h-9 text-sm bg-[#2a2a2a] hover:bg-[#333] text-[#ccc] rounded-lg shadow-sm"
              onClick={handleGenerateProfile}
              disabled={!conversationUuid || generatingProfile}
            >
              {generatingProfile ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Zap className="h-4 w-4 mr-1.5" />
              )}
              Quick Profile
            </Button>
          </div>

          {/* AI Memory */}
          <div className="rounded-lg bg-[#252525] border border-[#00c853]/30 p-3">
            <div className="flex items-center gap-2 mb-2.5">
              <Brain className="h-4 w-4 text-[#00c853]" />
              <span className="text-xs font-medium text-[#00c853]">AI Memory</span>
            </div>
            {profile ? (
              <div className="space-y-2 text-xs">
                {profile.summary && (
                  <p className="text-[#ccc] leading-relaxed">{profile.summary}</p>
                )}
                {profile.personality && (
                  <p className="text-[#888]">
                    <span className="text-[#aaa]">Personality:</span> {profile.personality}
                  </p>
                )}
                {profile.facts && profile.facts.length > 0 && (
                  <div>
                    <span className="text-[#aaa]">Facts:</span>
                    <ul className="list-disc list-inside text-[#888] mt-1 space-y-0.5">
                      {profile.facts.map((fact, i) => (
                        <li key={i}>{fact}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-xs text-[#666] leading-relaxed">
                Click "Memory" to analyze conversation history.
              </p>
            )}
          </div>

          {/* Quick Profile */}
          <div className="rounded-md bg-[#252525] border border-[#333] p-2.5">
            <div className="flex items-center gap-1.5 mb-2">
              <Zap className="h-3 w-3 text-[#888]" />
              <span className="text-[11px] font-medium text-[#ccc]">Quick Profile</span>
            </div>
            {profile?.interests && profile.interests.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {profile.interests.map((interest, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-[#00c853]/20 text-[#00c853] rounded text-[10px]"
                  >
                    {interest}
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-[#666]">
                Profile summary will appear here.
              </p>
            )}
          </div>

          {/* Manual Notes */}
          <div className="space-y-2">
            <span className="text-xs font-medium text-[#888]">Notes</span>
            <Textarea
              placeholder="Add notes..."
              className="min-h-[80px] bg-[#252525] border-[#333] resize-none text-xs text-[#ccc] placeholder:text-[#555] rounded-lg"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={!conversationUuid}
            />
            <Button
              variant="secondary"
              size="sm"
              className="w-full h-9 text-sm bg-[#00c853] hover:bg-[#00a843] text-white rounded-lg shadow-sm"
              onClick={handleSaveNotes}
              disabled={!conversationUuid || savingNotes}
            >
              {savingNotes ? (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-1.5" />
              )}
              Save Notes
            </Button>
          </div>

          {/* Monetization */}
          <div className="rounded-lg bg-[#00c853]/10 border border-[#00c853]/20 p-3">
            <span className="text-xs font-medium text-[#00c853] block mb-2.5">Monetization</span>
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-[#888]">Revenue:</span>
                <span className="text-[#00c853] font-semibold text-sm">$0.00</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#888]">Purchases:</span>
                <span className="text-[#ccc] font-medium">0</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[#888]">Conversion:</span>
                <span className="text-[#ccc] font-medium">0%</span>
              </div>
            </div>
          </div>
        </div>
      </ScrollArea>
    </div>
  )
}
