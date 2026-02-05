import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Save, Loader2 } from "lucide-react"
import { toast } from "sonner"

interface AISettings {
  systemPrompt: string
  aiMode: string
  maxReplyTokens: number
  replyTemperature: number
  aiModel: string
}

interface AISettingsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AISettingsModal({ open, onOpenChange }: AISettingsModalProps) {
  const [settings, setSettings] = useState<AISettings>({
    systemPrompt: "",
    aiMode: "manual",
    maxReplyTokens: 150,
    replyTemperature: 0.9,
    aiModel: "gpt-4o",
  })
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      loadSettings()
    }
  }, [open])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/ai-settings")
      if (res.ok) {
        const data = await res.json()
        setSettings({
          systemPrompt: data.systemPrompt || "",
          aiMode: data.aiMode || "manual",
          maxReplyTokens: data.maxReplyTokens || 150,
          replyTemperature: data.replyTemperature ?? 0.9,
          aiModel: data.aiModel || "gpt-4o",
        })
      }
    } catch (error) {
      toast.error("Failed to load AI settings")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await fetch("/api/ai-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        toast.success("AI settings saved")
        onOpenChange(false)
      } else {
        toast.error("Failed to save settings")
      }
    } catch (error) {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border" style={{ padding: '10px' }}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            AI Settings
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* AI Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">AI Mode</label>
              <Select
                value={settings.aiMode}
                onValueChange={(value) =>
                  setSettings((s) => ({ ...s, aiMode: value }))
                }
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual - You write all replies</SelectItem>
                  <SelectItem value="assisted">Assisted - AI suggests, you approve</SelectItem>
                  <SelectItem value="full">Full Auto - AI replies automatically</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                Choose how much control AI has over your messages
              </p>
            </div>

            <Separator />

            {/* AI Model */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">AI Model</label>
              <Select
                value={settings.aiModel}
                onValueChange={(value) =>
                  setSettings((s) => ({ ...s, aiModel: value }))
                }
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="gpt-4o">GPT-4o (Recommended)</SelectItem>
                  <SelectItem value="gpt-4o-mini">GPT-4o Mini (Faster)</SelectItem>
                  <SelectItem value="gpt-4-turbo">GPT-4 Turbo</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Max Tokens */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Max Reply Tokens: {settings.maxReplyTokens}
              </label>
              <Input
                type="range"
                min="50"
                max="500"
                value={settings.maxReplyTokens}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, maxReplyTokens: parseInt(e.target.value) }))
                }
                className="bg-secondary"
              />
              <p className="text-xs text-muted-foreground">
                Controls the maximum length of AI responses
              </p>
            </div>

            {/* Temperature */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Creativity (Temperature): {settings.replyTemperature.toFixed(1)}
              </label>
              <Input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={settings.replyTemperature}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, replyTemperature: parseFloat(e.target.value) }))
                }
                className="bg-secondary"
              />
              <p className="text-xs text-muted-foreground">
                Lower = more consistent, Higher = more creative/varied
              </p>
            </div>

            <Separator />

            {/* System Prompt */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">System Prompt</label>
              <Textarea
                placeholder="Enter your custom system prompt for the AI..."
                className="min-h-[200px] bg-secondary border-border resize-none font-mono text-sm"
                value={settings.systemPrompt}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, systemPrompt: e.target.value }))
                }
              />
              <p className="text-xs text-muted-foreground">
                This prompt guides how the AI behaves and responds. Leave empty to use defaults.
              </p>
            </div>

            {/* Save Button */}
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              {saving ? "Saving..." : "Save Settings"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
