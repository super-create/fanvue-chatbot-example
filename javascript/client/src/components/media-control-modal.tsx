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
import { Separator } from "@/components/ui/separator"
import { Save, Loader2, RefreshCw, Image as ImageIcon, DollarSign, Folder } from "lucide-react"
import { toast } from "sonner"

interface VaultSettings {
  vaultAwarenessEnabled: boolean
  tipTrackingEnabled: boolean
  sfwFolderPrefix: string
  ppvFolderPrefix: string
  lastMediaCacheRefresh: string | null
  cachedMediaCount: number
}

interface MediaStats {
  totalItems: number
  sfwCount: number
  ppvCount: number
  uncategorizedCount: number
  lastRefresh: string | null
}

interface MediaControlModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function MediaControlModal({ open, onOpenChange }: MediaControlModalProps) {
  const [settings, setSettings] = useState<VaultSettings>({
    vaultAwarenessEnabled: true,
    tipTrackingEnabled: true,
    sfwFolderPrefix: "",
    ppvFolderPrefix: "",
    lastMediaCacheRefresh: null,
    cachedMediaCount: 0,
  })
  const [stats, setStats] = useState<MediaStats | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (open) {
      loadSettings()
      loadStats()
    }
  }, [open])

  const loadSettings = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/vault-settings")
      if (res.ok) {
        const data = await res.json()
        setSettings({
          vaultAwarenessEnabled: data.vaultAwarenessEnabled ?? true,
          tipTrackingEnabled: data.tipTrackingEnabled ?? true,
          sfwFolderPrefix: data.sfwFolderPrefix || "",
          ppvFolderPrefix: data.ppvFolderPrefix || "",
          lastMediaCacheRefresh: data.lastMediaCacheRefresh,
          cachedMediaCount: data.cachedMediaCount || 0,
        })
      }
    } catch {
      toast.error("Failed to load vault settings")
    } finally {
      setLoading(false)
    }
  }

  const loadStats = async () => {
    try {
      const res = await fetch("/api/media-control/stats")
      if (res.ok) {
        const data = await res.json()
        setStats({
          totalItems: data.totalItems || 0,
          sfwCount: data.sfwCount || 0,
          ppvCount: data.ppvCount || 0,
          uncategorizedCount: data.uncategorizedCount || 0,
          lastRefresh: data.lastRefresh,
        })
      }
    } catch {
      toast.error("Failed to load media stats")
    }
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const res = await fetch("/api/vault-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vaultAwarenessEnabled: settings.vaultAwarenessEnabled,
          tipTrackingEnabled: settings.tipTrackingEnabled,
          sfwFolderPrefix: settings.sfwFolderPrefix,
          ppvFolderPrefix: settings.ppvFolderPrefix,
        }),
      })
      if (res.ok) {
        toast.success("Vault settings saved")
        await loadStats() // Reload stats to reflect new categorization
      } else {
        toast.error("Failed to save settings")
      }
    } catch {
      toast.error("Failed to save settings")
    } finally {
      setSaving(false)
    }
  }

  const handleRefreshVault = async () => {
    try {
      setRefreshing(true)
      const res = await fetch("/api/media-control/refresh-vault", {
        method: "POST",
      })
      if (res.ok) {
        toast.success("Media library refreshed")
        await loadSettings()
        await loadStats()
      } else {
        toast.error("Failed to refresh vault")
      }
    } catch {
      toast.error("Failed to refresh vault")
    } finally {
      setRefreshing(false)
    }
  }

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "Never"
    const date = new Date(dateStr)
    return date.toLocaleString()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto bg-card border-border" style={{ padding: '10px' }}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground">
            Media Control
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-6 py-4">
            {/* Media Library Stats */}
            {stats && (
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-secondary p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <ImageIcon className="h-4 w-4 text-primary" />
                    <span className="text-xs text-muted-foreground uppercase font-medium">Total Media</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stats.totalItems}</div>
                </div>
                <div className="bg-secondary p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Folder className="h-4 w-4 text-green-500" />
                    <span className="text-xs text-muted-foreground uppercase font-medium">SFW (Free)</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stats.sfwCount}</div>
                </div>
                <div className="bg-secondary p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="h-4 w-4 text-yellow-500" />
                    <span className="text-xs text-muted-foreground uppercase font-medium">PPV (Paid)</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stats.ppvCount}</div>
                </div>
                <div className="bg-secondary p-4 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <Folder className="h-4 w-4 text-gray-500" />
                    <span className="text-xs text-muted-foreground uppercase font-medium">Uncategorized</span>
                  </div>
                  <div className="text-2xl font-bold text-foreground">{stats.uncategorizedCount}</div>
                </div>
              </div>
            )}

            {/* Last Refresh */}
            <div className="flex items-center justify-between bg-secondary/50 p-3 rounded-lg">
              <div>
                <div className="text-xs text-muted-foreground">Last Refreshed</div>
                <div className="text-sm font-medium text-foreground">{formatDate(stats?.lastRefresh || null)}</div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefreshVault}
                disabled={refreshing}
                className="border-border"
              >
                {refreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {refreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            <Separator />

            {/* Vault Awareness Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Vault Awareness</label>
                <p className="text-xs text-muted-foreground">
                  Allow AI to send media from your vault
                </p>
              </div>
              <Switch
                checked={settings.vaultAwarenessEnabled}
                onCheckedChange={(checked: boolean) =>
                  setSettings((s) => ({ ...s, vaultAwarenessEnabled: checked }))
                }
              />
            </div>

            {/* Tip Tracking Toggle */}
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <label className="text-sm font-medium text-foreground">Tip Tracking</label>
                <p className="text-xs text-muted-foreground">
                  Track tip requests and responses
                </p>
              </div>
              <Switch
                checked={settings.tipTrackingEnabled}
                onCheckedChange={(checked: boolean) =>
                  setSettings((s) => ({ ...s, tipTrackingEnabled: checked }))
                }
              />
            </div>

            <Separator />

            {/* Folder Prefixes */}
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">SFW Folder Prefix</label>
                <Input
                  placeholder="SFW_"
                  className="bg-secondary border-border"
                  value={settings.sfwFolderPrefix}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, sfwFolderPrefix: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Media files starting with this prefix will be sent for free (e.g., "SFW_image.jpg")
                </p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">PPV Folder Prefix</label>
                <Input
                  placeholder="PPV_"
                  className="bg-secondary border-border"
                  value={settings.ppvFolderPrefix}
                  onChange={(e) =>
                    setSettings((s) => ({ ...s, ppvFolderPrefix: e.target.value }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Media files starting with this prefix will be sent as PPV (e.g., "PPV_exclusive.jpg")
                </p>
              </div>
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
