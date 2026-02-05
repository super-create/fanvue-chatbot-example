import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { Save, Loader2, MessageSquare, Zap, Clock } from "lucide-react"
import { toast } from "sonner"

interface ChatsSettings {
  operationMode: string
  feedRefreshInterval: number
  autoCheckMessages: boolean
  replyDelay: {
    min: number
    max: number
  }
}

interface ChatsControlModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}

export function ChatsControlModal({ open, onOpenChange, onSaved }: ChatsControlModalProps) {
  const [settings, setSettings] = useState<ChatsSettings>({
    operationMode: "manual",
    feedRefreshInterval: 30,
    autoCheckMessages: false,
    replyDelay: {
      min: 30,
      max: 180
    }
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
      const res = await fetch("/api/chats-settings")
      if (res.ok) {
        const data = await res.json()
        setSettings({
          operationMode: data.operationMode || "manual",
          feedRefreshInterval: data.feedRefreshInterval || 30,
          autoCheckMessages: data.autoCheckMessages ?? false,
          replyDelay: data.replyDelay || { min: 30, max: 180 }
        })
      }
    } catch {
      // Use defaults if endpoint doesn't exist yet
      console.log("Using default settings")
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await fetch("/api/chats-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      })
      if (res.ok) {
        toast.success("Chat settings saved")
        onSaved?.()
        onOpenChange(false)
      } else {
        toast.error("Failed to save settings")
      }
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const getModeDescription = (mode: string) => {
    switch (mode) {
      case "manual":
        return "You write all messages manually. AI provides no assistance."
      case "assisted":
        return "AI suggests replies that you must review and approve before sending."
      case "full-auto-instant":
        return "AI replies automatically with instant responses (debug mode for testing)."
      case "full-auto-natural":
        return "AI replies automatically with natural human-like delays (realistic mode)."
      default:
        return ""
    }
  }

  const showDelaySettings = settings.operationMode === "full-auto-natural"
  const showAutoCheck = settings.operationMode.startsWith("full-auto")

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border" style={{ padding: '10px' }}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Chat Control Settings
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Operation Mode */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">Operation Mode</label>
              <Select
                value={settings.operationMode}
                onValueChange={(value) =>
                  setSettings((s) => ({ ...s, operationMode: value }))
                }
              >
                <SelectTrigger className="bg-secondary border-border">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">
                    <div className="flex items-center gap-2">
                      <span>Manual</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="assisted">
                    <div className="flex items-center gap-2">
                      <span>Assisted</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="full-auto-instant">
                    <div className="flex items-center gap-2">
                      <Zap className="h-3 w-3" />
                      <span>Full Auto - Instant (Debug)</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="full-auto-natural">
                    <div className="flex items-center gap-2">
                      <Clock className="h-3 w-3" />
                      <span>Full Auto - Natural Delays</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {getModeDescription(settings.operationMode)}
              </p>
            </div>

            <Separator />

            {/* Feed Refresh Interval */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Feed Refresh Interval: {settings.feedRefreshInterval} seconds
              </label>
              <Input
                type="range"
                min="10"
                max="300"
                step="10"
                value={settings.feedRefreshInterval}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, feedRefreshInterval: parseInt(e.target.value) }))
                }
                className="bg-secondary"
              />
              <p className="text-xs text-muted-foreground">
                How often to check for new messages (10-300 seconds)
              </p>
            </div>

            {/* Auto Check Messages Toggle */}
            {showAutoCheck && (
              <>
                <Separator />
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <label className="text-sm font-medium text-foreground">Auto-Check Messages</label>
                    <p className="text-xs text-muted-foreground">
                      Automatically check for new messages at the refresh interval
                    </p>
                  </div>
                  <Switch
                    checked={settings.autoCheckMessages}
                    onCheckedChange={(checked: boolean) =>
                      setSettings((s) => ({ ...s, autoCheckMessages: checked }))
                    }
                  />
                </div>
              </>
            )}

            {/* Reply Delay Settings (Natural Mode Only) */}
            {showDelaySettings && (
              <>
                <Separator />
                <div className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground block mb-2">
                      Reply Delay Range (Natural Mode)
                    </label>
                    <p className="text-xs text-muted-foreground mb-4">
                      AI will wait a random time within this range before replying to simulate natural human behavior
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground uppercase font-medium">
                        Min Delay (seconds)
                      </label>
                      <Input
                        type="number"
                        min="5"
                        max="600"
                        value={settings.replyDelay.min}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            replyDelay: { ...s.replyDelay, min: parseInt(e.target.value) || 5 }
                          }))
                        }
                        className="bg-secondary border-border"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs text-muted-foreground uppercase font-medium">
                        Max Delay (seconds)
                      </label>
                      <Input
                        type="number"
                        min="5"
                        max="600"
                        value={settings.replyDelay.max}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            replyDelay: { ...s.replyDelay, max: parseInt(e.target.value) || 180 }
                          }))
                        }
                        className="bg-secondary border-border"
                      />
                    </div>
                  </div>

                  {settings.replyDelay.min > settings.replyDelay.max && (
                    <p className="text-xs text-destructive">
                      Warning: Minimum delay should be less than maximum delay
                    </p>
                  )}
                </div>
              </>
            )}

            <Separator />

            {/* Current Status Info */}
            <div className="bg-secondary/50 p-4 rounded-lg space-y-2">
              <h4 className="text-sm font-medium text-foreground">Current Configuration</h4>
              <div className="text-xs text-muted-foreground space-y-1">
                <div>• Mode: <span className="text-foreground font-medium">{settings.operationMode}</span></div>
                <div>• Refresh: <span className="text-foreground font-medium">{settings.feedRefreshInterval}s</span></div>
                {showAutoCheck && (
                  <div>• Auto-check: <span className="text-foreground font-medium">{settings.autoCheckMessages ? 'Enabled' : 'Disabled'}</span></div>
                )}
                {showDelaySettings && (
                  <div>• Reply delay: <span className="text-foreground font-medium">{settings.replyDelay.min}s - {settings.replyDelay.max}s</span></div>
                )}
              </div>
            </div>

            {/* Save Button */}
            <Button
              className="w-full bg-primary hover:bg-primary/90"
              onClick={handleSave}
              disabled={saving || (settings.replyDelay.min > settings.replyDelay.max)}
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
