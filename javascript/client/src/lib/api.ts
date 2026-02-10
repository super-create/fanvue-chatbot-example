// API service for communicating with Express backend

const API_BASE = '' // Same origin

// Types based on existing API responses
export interface Conversation {
  uuid: string
  label: string
}

export interface MediaVariant {
  variantType: string
  url: string
}

export interface MediaAttachment {
  uuid: string
  url?: string
  thumbnailUrl?: string
  type?: string
  mediaType?: string
  messageUuid?: string
  variants?: MediaVariant[]
}

export interface Message {
  uuid: string
  text: string
  isSentByYou: boolean
  createdAt?: string  // For media
  sentAt?: string     // For text messages (Fanvue uses this)
  hasMedia?: boolean
  media?: MediaAttachment[]
  attachments?: MediaAttachment[]
  mediaUrls?: string[]
  imageUrl?: string
  videoUrl?: string
  thumbnailUrl?: string
  sender?: {
    uuid: string
    handle?: string
  }
}

export interface UserSession {
  loggedIn: boolean
  username?: string
  userUuid?: string
}

export interface SubscriberProfile {
  summary?: string
  interests?: string[]
  personality?: string
  facts?: string[]
  manualNotes?: string
  generatedAt?: string
}

export interface CreatorPersona {
  name?: string
  age?: string
  accent?: string
  location?: string
  timezone?: string
  physical?: string
  personality?: string
  vibe?: string
  background?: string
  facts?: string
  other?: string
  system_prompt?: string
}

// API functions

export async function checkSession(): Promise<UserSession> {
  try {
    const res = await fetch(`${API_BASE}/api/session`)
    if (!res.ok) return { loggedIn: false }
    return await res.json()
  } catch {
    return { loggedIn: false }
  }
}

export async function getConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE}/api/conversations`)
  if (res.status === 401) {
    window.location.href = '/login'
    return []
  }
  if (!res.ok) throw new Error('Failed to load conversations')
  const data = await res.json()
  return data.conversations || []
}

export async function getChatMedia(conversationUuid: string): Promise<MediaAttachment[]> {
  try {
    const res = await fetch(`${API_BASE}/api/chat-media/${conversationUuid}`)
    if (!res.ok) return []
    const data = await res.json()
    return data.media || []
  } catch {
    return []
  }
}

export async function getMessages(conversationUuid: string): Promise<Message[]> {
  const res = await fetch(`${API_BASE}/api/messages/${conversationUuid}`)
  if (res.status === 401) {
    window.location.href = '/login'
    return []
  }
  if (!res.ok) throw new Error('Failed to load messages')
  const data = await res.json()
  const messages: Message[] = data.messages || []
  const creatorUuid = data.creatorUuid // UUID of the logged-in creator

  // Fetch media for this chat and map to messages
  const chatMedia = await getChatMedia(conversationUuid)

  // Create a set of existing message UUIDs
  const messageUuids = new Set(messages.map(m => m.uuid))

  // Create a map of message UUID to media items
  const mediaByMessage: Record<string, MediaAttachment[]> = {}
  const mediaOnlyMessages: Message[] = []

  for (const media of chatMedia) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const m = media as any
    const msgUuid = m.messageUuid || m.message?.uuid || m.chatMessageUuid
    if (msgUuid) {
      if (!mediaByMessage[msgUuid]) {
        mediaByMessage[msgUuid] = []
      }
      mediaByMessage[msgUuid].push(media)

      // If this message UUID is NOT in the messages list, create a media-only message
      if (!messageUuids.has(msgUuid) && !mediaOnlyMessages.find(msg => msg.uuid === msgUuid)) {
        // Use sentAt for consistency with text messages (Fanvue uses this for when it was sent)
        // Priority: sentAt > created_at > createdAt > uploadedAt
        let mediaDate = m.sentAt || m.created_at || m.createdAt || m.uploadedAt
        if (mediaDate) {
          const parsed = new Date(mediaDate)
          if (isNaN(parsed.getTime())) {
            mediaDate = new Date().toISOString()
          } else {
            mediaDate = parsed.toISOString()
          }
        } else {
          mediaDate = new Date().toISOString()
        }

        // Determine if this media was sent by the creator (me)
        // If ownerUuid matches creatorUuid, it's mine; otherwise it's from the subscriber
        const isMine = m.isSentByYou !== undefined ? m.isSentByYou :
                       (creatorUuid && m.ownerUuid === creatorUuid) ? true : false

        mediaOnlyMessages.push({
          uuid: msgUuid,
          text: '',
          isSentByYou: isMine,
          sentAt: mediaDate,  // Use sentAt to match text messages
          hasMedia: true,
          media: [media]
        })
      }
    }
  }

  // Attach media to existing messages
  for (const msg of messages) {
    if (mediaByMessage[msg.uuid]) {
      msg.media = mediaByMessage[msg.uuid]
    }
  }

  // Attach remaining media to media-only messages
  for (const msg of mediaOnlyMessages) {
    if (mediaByMessage[msg.uuid]) {
      msg.media = mediaByMessage[msg.uuid]
    }
  }

  // Combine all messages (text messages + media-only messages)
  const allMessages = [...messages, ...mediaOnlyMessages]

  // Sort all messages by timestamp (oldest first for display)
  // Text messages use sentAt, media uses created_at
  allMessages.sort((a, b) => {
    const timeA = new Date(a.sentAt || a.createdAt || 0).getTime()
    const timeB = new Date(b.sentAt || b.createdAt || 0).getTime()

    // Handle invalid dates - put them at the end
    if (isNaN(timeA) && isNaN(timeB)) return 0
    if (isNaN(timeA)) return 1
    if (isNaN(timeB)) return -1

    return timeA - timeB
  })

  // DEBUG: Log final order
  console.log('=== FINAL MESSAGE ORDER (oldest first) ===')
  allMessages.forEach((m, i) => {
    const type = m.text ? 'text' : 'media-only'
    const timestamp = m.sentAt || m.createdAt
    console.log(`  [${i}] ${timestamp} - ${type} - "${m.text?.substring(0, 30) || '[image]'}"`)
  })

  return allMessages
}

export async function sendMessage(conversationUuid: string, content: string): Promise<{ success: boolean; response?: string }> {
  const res = await fetch(`${API_BASE}/api/send-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: content, conversationUuid })
  })
  if (res.status === 401) {
    window.location.href = '/login'
    return { success: false }
  }
  if (!res.ok) throw new Error('Failed to send message')
  const data = await res.json()
  return { success: true, response: data.response }
}

export async function getSubscriberProfile(conversationUuid: string): Promise<SubscriberProfile | null> {
  try {
    const res = await fetch(`${API_BASE}/api/user-profile/${conversationUuid}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.profile || null
  } catch {
    return null
  }
}

export async function generateSubscriberProfile(conversationUuid: string): Promise<SubscriberProfile | null> {
  const res = await fetch(`${API_BASE}/api/generate-user-profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationUuid })
  })
  if (!res.ok) throw new Error('Failed to generate profile')
  const data = await res.json()
  return data.profile || null
}

export async function saveSubscriberNotes(conversationUuid: string, notes: string): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/user-profile-notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationUuid, notes })
  })
  if (!res.ok) throw new Error('Failed to save notes')
  return { success: true }
}

export async function getCreatorPersona(): Promise<CreatorPersona | null> {
  try {
    const res = await fetch(`${API_BASE}/api/persona`)
    if (!res.ok) return null
    const data = await res.json()
    return data.persona || null
  } catch {
    return null
  }
}

export async function saveCreatorPersona(persona: CreatorPersona): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/persona`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(persona)
  })
  if (!res.ok) throw new Error('Failed to save persona')
  return { success: true }
}

// --- AI Operation Mode Types & Functions ---

export interface ChatsSettings {
  operationMode: 'manual' | 'assisted' | 'full-auto-instant' | 'full-auto-natural'
  feedRefreshInterval: number
  autoCheckMessages: boolean
  replyDelay: { min: number; max: number }
}

export interface AISettings {
  systemPrompt: string
  aiMode: string
  maxReplyTokens: number
  replyTemperature: number
  aiModel: string
}

export interface MediaToSend {
  uuid: string
  shortId: string
  type: string
  price?: number
}

export interface AIGenerateReplyResponse {
  reply: string
  mediaSent?: MediaToSend | null
  mediaToSend?: MediaToSend | null
  mediaRequestDetected: boolean
  mediaRequestType?: string
}

export async function getChatsSettings(): Promise<ChatsSettings> {
  try {
    const res = await fetch(`${API_BASE}/api/chats-settings`)
    if (!res.ok) return { operationMode: 'manual', feedRefreshInterval: 30, autoCheckMessages: false, replyDelay: { min: 30, max: 180 } }
    return await res.json()
  } catch {
    return { operationMode: 'manual', feedRefreshInterval: 30, autoCheckMessages: false, replyDelay: { min: 30, max: 180 } }
  }
}

export async function getAISettings(): Promise<AISettings> {
  try {
    const res = await fetch(`${API_BASE}/api/ai-settings`)
    if (!res.ok) return { systemPrompt: '', aiMode: 'manual', maxReplyTokens: 150, replyTemperature: 0.9, aiModel: 'gpt-4o' }
    return await res.json()
  } catch {
    return { systemPrompt: '', aiMode: 'manual', maxReplyTokens: 150, replyTemperature: 0.9, aiModel: 'gpt-4o' }
  }
}

export async function generateAIReply(payload: {
  conversationHistory: { uuid: string; text: string; isSentByYou: boolean; hasMedia: boolean }[]
  systemPrompt: string
  userProfile: SubscriberProfile | null
  creatorProfile: CreatorPersona | null
  subscriberMemory: unknown
  conversationUuid: string
  subscriberHandle: string | null
  chatMedia: MediaAttachment[]
  preview?: boolean
}): Promise<AIGenerateReplyResponse> {
  const res = await fetch(`${API_BASE}/api/ai-generate-reply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...payload, preview: true })
  })
  if (!res.ok) throw new Error('Failed to generate AI reply')
  return await res.json()
}

export async function sendMediaMessage(conversationUuid: string, mediaUuid: string, message: string, price?: number): Promise<{ success: boolean }> {
  const res = await fetch(`${API_BASE}/api/send-media`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      conversationUuid,
      mediaUuid,
      message,
      price: price || 0,
    })
  })
  if (res.status === 401) {
    window.location.href = '/login'
    return { success: false }
  }
  if (!res.ok) throw new Error('Failed to send media')
  return { success: true }
}

export async function trackAIMessage(conversationUuid: string): Promise<void> {
  await fetch(`${API_BASE}/api/analytics/track-ai-message`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ conversationUuid })
  }).catch(() => {})
}
