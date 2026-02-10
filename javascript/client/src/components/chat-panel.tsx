import { useState, useEffect, useRef, useCallback } from "react"
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
import { ScrollArea } from "@/components/ui/scroll-area"
import { RefreshCw, Send, LogOut, Loader2 } from "lucide-react"
import {
  getConversations,
  getMessages,
  sendMessage,
  sendMediaMessage,
  getChatMedia,
  getChatsSettings,
  getAISettings,
  generateAIReply,
  trackAIMessage,
  getCreatorPersona,
  type Conversation,
  type Message,
  type UserSession,
  type CreatorPersona,
  type MediaToSend,
} from "@/lib/api"
import { toast } from "sonner"

interface ChatPanelProps {
  session: UserSession
  selectedConversation: string
  onConversationChange: (uuid: string) => void
  settingsVersion: number
}

// localStorage helpers for message tracking
const saveLastRepliedId = (convUuid: string, msgId: string) => {
  localStorage.setItem('lastReplied_' + convUuid, msgId)
}
const loadLastRepliedId = (convUuid: string): string | null => {
  return localStorage.getItem('lastReplied_' + convUuid)
}

export function ChatPanel({
  session,
  selectedConversation,
  onConversationChange,
  settingsVersion,
}: ChatPanelProps) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState("")
  const [loading, setLoading] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  // --- AI Mode State ---
  const [operationMode, setOperationMode] = useState<string>('manual')
  const [replyDelay, setReplyDelay] = useState<{ min: number; max: number }>({ min: 30, max: 180 })
  const [refreshInterval, setRefreshInterval] = useState<number>(60000)

  // Assisted mode state
  const [aiSuggestion, setAiSuggestion] = useState<string>('')
  const [showSuggestion, setShowSuggestion] = useState(false)
  const [generatingSuggestion, setGeneratingSuggestion] = useState(false)
  const [suggestionMediaToSend, setSuggestionMediaToSend] = useState<MediaToSend | null>(null)

  // Full-auto mode state
  const [autoReplyText, setAutoReplyText] = useState<string>('')
  const [showPreview, setShowPreview] = useState(false)
  const [previewCountdown, setPreviewCountdown] = useState<number>(0)
  const [previewMediaToSend, setPreviewMediaToSend] = useState<MediaToSend | null>(null)
  const [generatingPreview, setGeneratingPreview] = useState(false)

  // Tracking refs (not state - they don't affect rendering)
  const lastSuggestedMessageIdRef = useRef<string | null>(null)
  const lastRepliedMessageIdRef = useRef<string | null>(null)
  const pendingAIReplyRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const autoReplyCancelledRef = useRef(false)
  const autoReplyTextRef = useRef('')

  // Scroll tracking
  const lastMessageUuidRef = useRef<string | null>(null)
  const shouldScrollRef = useRef(false)

  // Cached AI context refs
  const creatorProfileRef = useRef<CreatorPersona | null>(null)
  const systemPromptRef = useRef<string>('')

  // Keep autoReplyText ref in sync with state (for setTimeout reads)
  useEffect(() => { autoReplyTextRef.current = autoReplyText }, [autoReplyText])

  // --- Helper Functions ---

  const cancelPendingReply = useCallback(() => {
    if (pendingAIReplyRef.current) {
      clearTimeout(pendingAIReplyRef.current)
      pendingAIReplyRef.current = null
    }
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current)
      countdownIntervalRef.current = null
    }
    autoReplyCancelledRef.current = false
  }, [])

  const hidePreview = useCallback(() => {
    setShowPreview(false)
    setAutoReplyText('')
    setPreviewMediaToSend(null)
    setPreviewCountdown(0)
    cancelPendingReply()
  }, [cancelPendingReply])

  const isMyMessage = (message: Message): boolean => {
    if (message.isSentByYou !== undefined) return message.isSentByYou
    if (message.sender?.uuid && session.userUuid) {
      return message.sender.uuid === session.userUuid
    }
    return false
  }

  const findLatestSubscriberMessage = (msgs: Message[]): Message | null => {
    for (let i = msgs.length - 1; i >= 0; i--) {
      const msg = msgs[i]
      if (!isMyMessage(msg) && (msg.text || msg.hasMedia || msg.media?.length)) {
        return msg
      }
    }
    return null
  }

  const buildConversationHistory = (msgs: Message[]) => {
    return msgs.slice(-30).map(msg => ({
      uuid: msg.uuid,
      text: msg.text || '',
      isSentByYou: isMyMessage(msg),
      hasMedia: !!(msg.media?.length || msg.attachments?.length || msg.hasMedia),
    }))
  }

  // --- Settings & Context Loading ---

  const loadChatsSettings = async () => {
    const settings = await getChatsSettings()
    setOperationMode(settings.operationMode)
    setReplyDelay(settings.replyDelay)

    let interval: number
    switch (settings.operationMode) {
      case 'full-auto-instant':
        interval = 5000
        break
      case 'full-auto-natural':
        interval = 30000
        break
      default: // manual, assisted
        interval = 60000
    }
    setRefreshInterval(interval)

    // Reset tracking on mode change
    lastSuggestedMessageIdRef.current = null
    lastRepliedMessageIdRef.current = null
    cancelPendingReply()

    if (settings.operationMode === 'manual') {
      setShowSuggestion(false)
      setShowPreview(false)
    }
  }

  const loadAIContext = async () => {
    const [persona, aiSettings] = await Promise.all([
      getCreatorPersona(),
      getAISettings(),
    ])
    creatorProfileRef.current = persona
    systemPromptRef.current = aiSettings.systemPrompt
  }

  // --- Data Loading ---

  const loadConversations = async () => {
    try {
      setLoading(true)
      const data = await getConversations()
      setConversations(data)
      if (data.length > 0 && !selectedConversation) {
        onConversationChange(data[0].uuid)
      }
    } catch {
      toast.error("Failed to load conversations")
    } finally {
      setLoading(false)
    }
  }

  const loadMessages = async (uuid: string, silent = false) => {
    try {
      if (!silent) setLoading(true)
      const data = await getMessages(uuid)
      setMessages(data)
    } catch {
      if (!silent) toast.error("Failed to load messages")
    } finally {
      if (!silent) setLoading(false)
    }
  }

  // --- Message Sending ---

  const handleSend = async () => {
    if (!inputMessage.trim() || !selectedConversation) return
    try {
      setSendingMessage(true)
      await sendMessage(selectedConversation, inputMessage)
      setInputMessage("")
      shouldScrollRef.current = true
      await loadMessages(selectedConversation)
      toast.success("Message sent")
    } catch {
      toast.error("Failed to send message")
    } finally {
      setSendingMessage(false)
    }
  }

  // --- Assisted Mode Functions ---

  const generateSuggestion = async (msgs: Message[], subscriberHandle: string | null, convUuid: string) => {
    setGeneratingSuggestion(true)
    setShowSuggestion(true)
    setAiSuggestion('Generating suggestion...')
    setSuggestionMediaToSend(null)

    try {
      await loadAIContext()
      const chatMedia = await getChatMedia(convUuid)

      const result = await generateAIReply({
        conversationHistory: buildConversationHistory(msgs),
        systemPrompt: systemPromptRef.current,
        userProfile: null,
        creatorProfile: creatorProfileRef.current,
        subscriberMemory: null,
        conversationUuid: convUuid,
        subscriberHandle,
        chatMedia,
      })

      // Only apply if still on the same conversation
      if (convUuid === selectedConversation) {
        setAiSuggestion(result.reply)
        setSuggestionMediaToSend(result.mediaToSend || null)
      }
    } catch {
      if (convUuid === selectedConversation) {
        setAiSuggestion('Failed to generate suggestion.')
      }
    } finally {
      setGeneratingSuggestion(false)
    }
  }

  const handleSendSuggestion = async () => {
    if (!aiSuggestion.trim() || !selectedConversation) return
    try {
      if (suggestionMediaToSend) {
        // Send media + text together via send-media endpoint
        await sendMediaMessage(selectedConversation, suggestionMediaToSend.uuid, aiSuggestion, suggestionMediaToSend.price)
      } else {
        await sendMessage(selectedConversation, aiSuggestion)
      }
      await trackAIMessage(selectedConversation)
      setShowSuggestion(false)
      setAiSuggestion('')
      setSuggestionMediaToSend(null)
      shouldScrollRef.current = true
      await loadMessages(selectedConversation)
      toast.success('AI suggestion sent')
    } catch {
      toast.error('Failed to send suggestion')
    }
  }

  const handleCopyToInput = () => {
    setInputMessage(aiSuggestion)
    setShowSuggestion(false)
    setAiSuggestion('')
    setSuggestionMediaToSend(null)
  }

  const handleDismissSuggestion = () => {
    setShowSuggestion(false)
    setAiSuggestion('')
    setSuggestionMediaToSend(null)
  }

  // --- Full Auto Mode Functions ---

  const startCountdown = (seconds: number) => {
    setPreviewCountdown(seconds)
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)

    countdownIntervalRef.current = setInterval(() => {
      setPreviewCountdown(prev => {
        if (prev <= 1) {
          if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current)
          return 0
        }
        return prev - 1
      })
    }, 1000)
  }

  const sendPreviewedReply = async (convUuid: string, mediaToSend: MediaToSend | null) => {
    try {
      const textToSend = autoReplyTextRef.current
      if (!textToSend.trim()) { hidePreview(); return }

      if (mediaToSend) {
        // Send media + text together via send-media endpoint
        await sendMediaMessage(convUuid, mediaToSend.uuid, textToSend, mediaToSend.price)
      } else {
        await sendMessage(convUuid, textToSend)
      }

      await trackAIMessage(convUuid)
      if (convUuid === selectedConversation) {
        shouldScrollRef.current = true
        await loadMessages(convUuid)
      }
      hidePreview()
    } catch {
      toast.error('Failed to send AI reply')
      hidePreview()
    }
  }

  const generatePreviewAndSend = async (msgs: Message[], subscriberHandle: string | null, delaySeconds: number, convUuid: string) => {
    cancelPendingReply()
    setGeneratingPreview(true)
    setShowPreview(true)
    setAutoReplyText('')
    setPreviewMediaToSend(null)

    try {
      await loadAIContext()
      const chatMedia = await getChatMedia(convUuid)

      const result = await generateAIReply({
        conversationHistory: buildConversationHistory(msgs),
        systemPrompt: systemPromptRef.current,
        userProfile: null,
        creatorProfile: creatorProfileRef.current,
        subscriberMemory: null,
        conversationUuid: convUuid,
        subscriberHandle,
        chatMedia,
      })

      // Only apply if still on the same conversation
      if (convUuid !== selectedConversation) {
        hidePreview()
        return
      }

      setAutoReplyText(result.reply)
      setPreviewMediaToSend(result.mediaToSend || null)
      setGeneratingPreview(false)
      startCountdown(delaySeconds)

      const mediaToSend = result.mediaToSend || null

      pendingAIReplyRef.current = setTimeout(async () => {
        if (autoReplyCancelledRef.current) {
          hidePreview()
          return
        }
        await sendPreviewedReply(convUuid, mediaToSend)
      }, delaySeconds * 1000)

    } catch {
      setGeneratingPreview(false)
      hidePreview()
      toast.error('Failed to generate AI reply')
    }
  }

  const handleSendNow = async () => {
    cancelPendingReply()
    await sendPreviewedReply(selectedConversation, previewMediaToSend)
  }

  const handleCancelAutoReply = () => {
    autoReplyCancelledRef.current = true
    cancelPendingReply()
    hidePreview()
  }

  // --- Core AI Check (called by auto-refresh interval) ---

  const checkForNewMessagesAndReply = async () => {
    if (!selectedConversation) return

    try {
      const msgs = await getMessages(selectedConversation)
      setMessages(msgs)

      const latestSub = findLatestSubscriberMessage(msgs)
      if (!latestSub) return

      if (operationMode === 'assisted') {
        if (latestSub.uuid !== lastSuggestedMessageIdRef.current) {
          lastSuggestedMessageIdRef.current = latestSub.uuid
          await generateSuggestion(msgs, latestSub.sender?.handle || null, selectedConversation)
        }
      } else if (operationMode.startsWith('full-auto')) {
        if (latestSub.uuid !== lastRepliedMessageIdRef.current) {
          lastRepliedMessageIdRef.current = latestSub.uuid
          saveLastRepliedId(selectedConversation, latestSub.uuid)
          autoReplyCancelledRef.current = false

          const delaySeconds = operationMode === 'full-auto-instant'
            ? 2
            : Math.floor(Math.random() * (replyDelay.max - replyDelay.min + 1)) + replyDelay.min

          await generatePreviewAndSend(msgs, latestSub.sender?.handle || null, delaySeconds, selectedConversation)
        }
      }
    } catch (err) {
      console.error('[AI] Error checking messages:', err)
    }
  }

  // --- Effects ---

  // Load conversations and settings on mount
  useEffect(() => {
    loadConversations()
    loadChatsSettings()
  }, [])

  // Reload settings when chats-control-modal saves
  useEffect(() => {
    if (settingsVersion > 0) {
      loadChatsSettings()
    }
  }, [settingsVersion])

  // Handle conversation changes
  useEffect(() => {
    if (selectedConversation) {
      loadMessages(selectedConversation)
      loadAIContext()
      lastRepliedMessageIdRef.current = loadLastRepliedId(selectedConversation)
      lastSuggestedMessageIdRef.current = null
      cancelPendingReply()
      setShowSuggestion(false)
      setShowPreview(false)
    } else {
      setMessages([])
    }
  }, [selectedConversation])

  // Auto-refresh with dynamic interval and AI checking
  useEffect(() => {
    if (!selectedConversation) return

    const interval = setInterval(() => {
      if (operationMode !== 'manual') {
        checkForNewMessagesAndReply()
      } else {
        loadMessages(selectedConversation, true)
      }
    }, refreshInterval)

    return () => clearInterval(interval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedConversation, refreshInterval, operationMode, replyDelay])

  // Auto-scroll on new messages or after sending
  useEffect(() => {
    if (!scrollRef.current || messages.length === 0) return

    const lastMsg = messages[messages.length - 1]
    const isNewMessage = lastMsg && lastMsg.uuid !== lastMessageUuidRef.current
    const shouldForceScroll = shouldScrollRef.current

    if (isNewMessage || shouldForceScroll) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" })
    }

    if (lastMsg) lastMessageUuidRef.current = lastMsg.uuid
    shouldScrollRef.current = false
  }, [messages])

  // Cleanup timers on unmount
  useEffect(() => {
    return () => { cancelPendingReply() }
  }, [cancelPendingReply])

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#1a1a1a] overflow-hidden">
      {/* Header */}
      <div className="h-11 border-b border-[#333] flex items-center justify-between bg-[#1e1e1e] shrink-0" style={{ padding: '0 10px' }}>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[#888]">Logged in as:</span>
          <span className="text-white font-medium">{session.username || "User"}</span>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => (window.location.href = "/logout")}
          className="h-7 px-2 text-[#888] hover:text-red-400 hover:bg-red-400/10"
        >
          <LogOut className="h-3.5 w-3.5 mr-1.5" />
          Logout
        </Button>
      </div>

      {/* Toolbar */}
      <div className="h-12 border-b border-[#333] bg-[#1e1e1e]/50 flex items-center gap-3 shrink-0" style={{ padding: '0 10px' }}>
        <Select value={selectedConversation} onValueChange={onConversationChange}>
          <SelectTrigger className="w-48 h-8 bg-[#2a2a2a] border-[#444] text-sm">
            <SelectValue placeholder="Select conversation..." />
          </SelectTrigger>
          <SelectContent>
            {conversations.map((conv) => (
              <SelectItem key={conv.uuid} value={conv.uuid}>
                {conv.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Button
          size="sm"
          className="h-8 px-3 bg-[#00c853] hover:bg-[#00a843] text-white"
          onClick={() => { loadConversations(); if (selectedConversation) loadMessages(selectedConversation); }}
          disabled={loading}
        >
          <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>

        {/* Mode indicator badge */}
        {operationMode !== 'manual' && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${
            operationMode === 'assisted' ? 'bg-blue-500/20 text-blue-400' :
            'bg-orange-500/20 text-orange-400'
          }`}>
            {operationMode === 'assisted' ? 'AI Assisted' :
             operationMode === 'full-auto-instant' ? 'Full Auto (Instant)' :
             'Full Auto (Natural)'}
          </span>
        )}
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="flex flex-col" style={{ gap: '8px', padding: '16px 10px' }}>
          {!selectedConversation ? (
            <div className="text-center text-[#666] py-12 text-sm">
              Select a conversation to start chatting
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center text-[#666] py-12 text-sm">
              {loading ? "Loading..." : "No messages yet"}
            </div>
          ) : (
            messages.map((message) => {
              const isMine = isMyMessage(message)
              return (
                <div
                  key={message.uuid}
                  className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[250px] rounded-lg overflow-hidden shadow-sm ${
                      isMine
                        ? "bg-[#00c853]"
                        : "bg-[#2a2a2a] border border-[#3a3a3a]"
                    }`}
                  >
                    {/* Media - check multiple possible properties */}
                    {(() => {
                      const mediaItems: { url: string; type: string }[] = []

                      if (message.media?.length) {
                        message.media.forEach(m => {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const media = m as any
                          const mainVariant = media.variants?.find((v: { variantType: string }) => v.variantType === 'main')
                          const url = mainVariant?.url || media.variants?.[0]?.url || m.url || m.thumbnailUrl
                          if (url) mediaItems.push({ url, type: m.type || m.mediaType || 'image' })
                        })
                      }
                      if (message.attachments?.length) {
                        message.attachments.forEach(m => {
                          // eslint-disable-next-line @typescript-eslint/no-explicit-any
                          const media = m as any
                          const mainVariant = media.variants?.find((v: { variantType: string }) => v.variantType === 'main')
                          const url = mainVariant?.url || media.variants?.[0]?.url || m.url || m.thumbnailUrl
                          if (url) mediaItems.push({ url, type: m.type || m.mediaType || 'image' })
                        })
                      }
                      if (message.mediaUrls?.length) {
                        message.mediaUrls.forEach(url => {
                          mediaItems.push({ url, type: 'image' })
                        })
                      }
                      if (message.imageUrl) {
                        mediaItems.push({ url: message.imageUrl, type: 'image' })
                      }
                      if (message.videoUrl) {
                        mediaItems.push({ url: message.videoUrl, type: 'video' })
                      }
                      if (message.thumbnailUrl && !mediaItems.length) {
                        mediaItems.push({ url: message.thumbnailUrl, type: 'image' })
                      }

                      if (mediaItems.length === 0) return null

                      return (
                        <div className="space-y-1">
                          {mediaItems.map((item, idx) => (
                            <div key={idx}>
                              {item.type === 'video' ? (
                                <video
                                  src={item.url}
                                  controls
                                  className="w-full object-contain"
                                />
                              ) : (
                                <a
                                  href={item.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="block cursor-pointer"
                                >
                                  <img
                                    src={item.url}
                                    alt="Media"
                                    className="w-full object-contain hover:opacity-90 transition-opacity"
                                    loading="lazy"
                                  />
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      )
                    })()}
                    {/* Text content and timestamp */}
                    {(message.text || message.createdAt) && (
                      <div className={isMine ? "text-white" : "text-[#e0e0e0]"} style={{ padding: '8px 12px' }}>
                        {message.text && (
                          <p className="text-[14.5px] leading-[1.5] whitespace-pre-wrap">
                            {message.text}
                          </p>
                        )}
                        {message.hasMedia && !message.media?.length && !message.attachments?.length && !message.mediaUrls?.length && !message.imageUrl && !message.videoUrl && (
                          <p className="text-[12px] opacity-60 mt-1">[media attached]</p>
                        )}
                        {message.createdAt && (
                          <p className={`text-[11px] ${message.text ? 'mt-1.5' : ''} ${isMine ? "text-white/50" : "text-[#888]"}`}>
                            {new Date(message.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )
            })
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* AI Suggestion Box (Assisted Mode) */}
      {showSuggestion && (
        <div className="border border-blue-500/30 bg-blue-500/10 rounded-lg space-y-2" style={{ margin: '0 10px 8px', padding: '12px' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-blue-400">
              {suggestionMediaToSend
                ? `AI Suggestion (with ${suggestionMediaToSend.shortId} ${suggestionMediaToSend.type === 'ppv' ? 'PPV $' + suggestionMediaToSend.price : 'media'})`
                : 'AI Suggestion'}
            </span>
            {generatingSuggestion && (
              <Loader2 className="h-3 w-3 animate-spin text-blue-400" />
            )}
          </div>
          <Textarea
            value={aiSuggestion}
            onChange={(e) => setAiSuggestion(e.target.value)}
            className="min-h-[60px] bg-[#2a2a2a] border-blue-500/30 text-white text-sm resize-none"
            disabled={generatingSuggestion}
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              className="h-7 px-3 bg-[#00c853] hover:bg-[#00a843] text-white text-xs"
              onClick={handleSendSuggestion}
              disabled={generatingSuggestion || !aiSuggestion.trim()}
            >
              <Send className="h-3 w-3 mr-1" />
              Send
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-3 text-xs border-[#444] text-[#ccc]"
              onClick={handleCopyToInput}
              disabled={generatingSuggestion}
            >
              Copy to Input
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 px-3 text-xs text-[#888]"
              onClick={handleDismissSuggestion}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Auto-Reply Preview (Full Auto Modes) */}
      {showPreview && (
        <div className="border border-orange-500/30 bg-orange-500/10 rounded-lg space-y-2" style={{ margin: '0 10px 8px', padding: '12px' }}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-orange-400">
              {generatingPreview
                ? 'Generating preview...'
                : previewMediaToSend
                  ? `Preview (with ${previewMediaToSend.shortId} ${previewMediaToSend.type === 'ppv' ? 'PPV $' + previewMediaToSend.price : 'media'}):`
                  : 'Preview:'}
            </span>
            <div className="flex items-center gap-2">
              {previewCountdown > 0 && !generatingPreview && (
                <span className="text-xs font-mono text-orange-300">
                  Sending in {previewCountdown}s
                </span>
              )}
              {generatingPreview && (
                <Loader2 className="h-3 w-3 animate-spin text-orange-400" />
              )}
            </div>
          </div>
          {!generatingPreview && (
            <>
              <Textarea
                value={autoReplyText}
                onChange={(e) => setAutoReplyText(e.target.value)}
                className="min-h-[60px] bg-[#2a2a2a] border-orange-500/30 text-white text-sm resize-none"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 px-3 bg-[#00c853] hover:bg-[#00a843] text-white text-xs"
                  onClick={handleSendNow}
                  disabled={!autoReplyText.trim()}
                >
                  <Send className="h-3 w-3 mr-1" />
                  Send Now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 px-3 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10"
                  onClick={handleCancelAutoReply}
                >
                  Cancel
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-[#333] bg-[#1e1e1e] flex items-center gap-3 shrink-0" style={{ padding: '16px 10px' }}>
        <Input
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSend()}
          placeholder="Type your message..."
          className="flex-1 h-10 bg-[#2a2a2a] border-[#444] text-[14.5px] text-white placeholder:text-[#666] rounded-lg px-4"
          disabled={!selectedConversation || sendingMessage}
        />
        <Button
          onClick={handleSend}
          className="h-10 px-5 bg-[#00c853] hover:bg-[#00a843] text-white rounded-lg shadow-sm"
          disabled={!selectedConversation || sendingMessage || !inputMessage.trim()}
        >
          <Send className="h-4 w-4 mr-1.5" />
          Send
        </Button>
      </div>
    </div>
  )
}
