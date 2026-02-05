import { useState, useEffect } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import { Loader2, BarChart3, MessageSquare, Bot, Users, TrendingUp, RefreshCw } from "lucide-react"
import { toast } from "sonner"

interface AnalyticsSummary {
  totalMessagesSent: number
  totalMessagesReceived: number
  totalMessages: number
  aiRepliesSent: number
  activeConversations: number
  aiUsagePercent: number
}

interface DayStats {
  date: string
  messagesSent: number
  messagesReceived: number
  aiReplies: number
}

interface ConversationStats {
  uuid: string
  messagesSent: number
  messagesReceived: number
  totalMessages: number
}

interface AnalyticsData {
  summary: AnalyticsSummary
  last7Days: DayStats[]
  topConversations: ConversationStats[]
}

interface AnalyticsModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AnalyticsModal({ open, onOpenChange }: AnalyticsModalProps) {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(false)
  const [resetting, setResetting] = useState(false)

  useEffect(() => {
    if (open) {
      loadAnalytics()
    }
  }, [open])

  const loadAnalytics = async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/analytics")
      if (res.ok) {
        const analyticsData = await res.json()
        setData(analyticsData)
      } else {
        toast.error("Failed to load analytics")
      }
    } catch {
      toast.error("Failed to load analytics")
    } finally {
      setLoading(false)
    }
  }

  const handleReset = async () => {
    if (!confirm("Are you sure you want to reset all analytics data? This cannot be undone.")) {
      return
    }

    try {
      setResetting(true)
      const res = await fetch("/api/analytics/reset", {
        method: "POST",
      })
      if (res.ok) {
        toast.success("Analytics reset successfully")
        await loadAnalytics()
      } else {
        toast.error("Failed to reset analytics")
      }
    } catch {
      toast.error("Failed to reset analytics")
    } finally {
      setResetting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card border-border" style={{ padding: '10px' }}>
        <DialogHeader>
          <DialogTitle className="text-xl font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            Analytics Dashboard
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : data ? (
          <div className="space-y-6 py-4">
            {/* Summary Cards */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-secondary p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-blue-500" />
                  <span className="text-xs text-muted-foreground uppercase font-medium">Messages Sent</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{data.summary.totalMessagesSent}</div>
              </div>

              <div className="bg-secondary p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-green-500" />
                  <span className="text-xs text-muted-foreground uppercase font-medium">Messages Received</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{data.summary.totalMessagesReceived}</div>
              </div>

              <div className="bg-secondary p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Bot className="h-4 w-4 text-primary" />
                  <span className="text-xs text-muted-foreground uppercase font-medium">AI Replies</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{data.summary.aiRepliesSent}</div>
              </div>

              <div className="bg-secondary p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <Users className="h-4 w-4 text-purple-500" />
                  <span className="text-xs text-muted-foreground uppercase font-medium">Active Chats</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{data.summary.activeConversations}</div>
              </div>

              <div className="bg-secondary p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <TrendingUp className="h-4 w-4 text-yellow-500" />
                  <span className="text-xs text-muted-foreground uppercase font-medium">AI Usage</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{data.summary.aiUsagePercent}%</div>
              </div>

              <div className="bg-secondary p-4 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <MessageSquare className="h-4 w-4 text-orange-500" />
                  <span className="text-xs text-muted-foreground uppercase font-medium">Total Messages</span>
                </div>
                <div className="text-2xl font-bold text-foreground">{data.summary.totalMessages}</div>
              </div>
            </div>

            <Separator />

            {/* Last 7 Days */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Last 7 Days Activity</h3>
              <div className="space-y-2">
                {data.last7Days.map((day) => (
                  <div key={day.date} className="bg-secondary p-3 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        {new Date(day.date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {day.messagesSent + day.messagesReceived} total
                      </span>
                    </div>
                    <div className="flex gap-4 text-xs">
                      <span className="text-blue-400">Sent: {day.messagesSent}</span>
                      <span className="text-green-400">Received: {day.messagesReceived}</span>
                      <span className="text-primary">AI: {day.aiReplies}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <Separator />

            {/* Top Conversations */}
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Most Active Conversations</h3>
              {data.topConversations.length > 0 ? (
                <div className="space-y-2">
                  {data.topConversations.map((conv, index) => (
                    <div key={conv.uuid} className="bg-secondary p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-foreground">
                          #{index + 1} - {conv.uuid.substring(0, 8)}...
                        </span>
                        <span className="text-sm font-bold text-primary">{conv.totalMessages} msgs</span>
                      </div>
                      <div className="flex gap-4 text-xs text-muted-foreground">
                        <span>Sent: {conv.messagesSent}</span>
                        <span>Received: {conv.messagesReceived}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-secondary p-6 rounded-lg text-center text-muted-foreground text-sm">
                  No conversation data yet. Start chatting to see analytics!
                </div>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-2">
              <Button
                variant="outline"
                className="flex-1 border-border"
                onClick={loadAnalytics}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                className="flex-1 border-destructive text-destructive hover:bg-destructive/10"
                onClick={handleReset}
                disabled={resetting}
              >
                {resetting ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                {resetting ? "Resetting..." : "Reset Analytics"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            No analytics data available
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
