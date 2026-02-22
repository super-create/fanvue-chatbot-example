const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const session = require('express-session');
const path = require('path');
const OpenAI = require('openai');

dotenv.config();

// Import database modules
const { supabase, initializeDatabase } = require('./database');
const { saveAISettings } = require('./database/ai-settings');
const { getAnalytics, saveAnalytics, resetAnalytics } = require('./database/analytics');
const { getCreatorPersona, saveCreatorPersona } = require('./database/personas');
const { getSubscriberMemory, saveSubscriberMemory } = require('./database/memories');
const {
  getPendingContentRequests,
  saveContentRequest,
  fulfillContentRequest,
  dismissContentRequest
} = require('./database/content-requests');
const { trackAIRequest, checkUsageLimits } = require('./database/usage');

// Import service modules
const {
  buildAuthHeaders,
  fanvueRequest,
  fanvueRequestWithFallbackPaths
} = require('./services/fanvue-api');

const {
  getCreatorMediaLibrary,
  trackMediaSent,
  getMediaSentToSubscriber,
  getAvailableMediaForSubscriber,
  buildVaultContextForAI,
  parseMediaSendCommand,
  getMediaCacheStats
} = require('./services/vault-service');

const {
  generateAIReply,
  detectConversationTone,
  detectMediaRequest,
  getCurrentTimeFormatted,
  DEFAULT_SYSTEM_PROMPT
} = require('./services/ai-service');

// Import route modules
const { createAuthRoutes } = require('./routes/auth');
const { paymentsRouter, paystackWebhookHandler } = require('./routes/payments');

// Import middleware
const { requireAuth } = require('./middleware/require-auth');
const { requireSubscription } = require('./middleware/require-subscription');
const { globalApiLimiter, aiLimiter, authLimiter } = require('./middleware/rate-limit');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy (Railway runs behind a reverse proxy)
app.set('trust proxy', 1);

// *** PAYSTACK WEBHOOK MUST BE BEFORE express.json() ***
// Paystack signature verification requires the raw request body (Buffer).
// express.json() would parse it into an object, destroying the raw bytes.
app.post('/webhook/paystack', express.raw({ type: 'application/json' }), paystackWebhookHandler);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session store: use PostgreSQL if SUPABASE_CONNECTION_STRING is set, else in-memory
const sessionConfig = {
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
  }
};

if (process.env.SUPABASE_CONNECTION_STRING) {
  try {
    const PgSessionStore = require('connect-pg-simple')(session);
    const { Pool } = require('pg');
    const pgPool = new Pool({
      connectionString: process.env.SUPABASE_CONNECTION_STRING,
      ssl: { rejectUnauthorized: false },
      max: 5,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    pgPool.on('error', (err) => console.error('[Session] PG pool error:', err.message));

    const pgStore = new PgSessionStore({
      pool: pgPool,
      tableName: 'app_sessions',
      createTableIfMissing: false,
      errorLog: (err) => console.error('[Session] Store error:', err.message)
    });

    // Wrap store so PG errors never propagate to next(err) — fall back to empty session
    const origGet = pgStore.get.bind(pgStore);
    pgStore.get = (sid, cb) => origGet(sid, (err, session) => {
      if (err) { console.error('[Session] Store get error, using empty session:', err.message); return cb(null, null); }
      cb(null, session);
    });
    const origSet = pgStore.set.bind(pgStore);
    pgStore.set = (sid, sess, cb) => origSet(sid, sess, (err) => {
      if (err) console.error('[Session] Store set error:', err.message);
      if (cb) cb();
    });
    const origDestroy = pgStore.destroy.bind(pgStore);
    pgStore.destroy = (sid, cb) => origDestroy(sid, (err) => {
      if (err) console.error('[Session] Store destroy error:', err.message);
      if (cb) cb();
    });

    sessionConfig.store = pgStore;
    console.log('[Session] Using PostgreSQL session store (Supabase)');
  } catch (err) {
    console.error('[Session] PG store init failed, falling back to memory:', err.message);
  }
} else {
  console.log('[Session] SUPABASE_CONNECTION_STRING not set — using in-memory session store');
}

app.use(session(sessionConfig));

// Rate limiting
app.use('/api/', globalApiLimiter);
app.use('/login', authLimiter);
app.use('/callback', authLimiter);
app.use('/api/ai-generate-reply', aiLimiter);
app.use('/api/generate-user-profile', aiLimiter);
app.use('/api/subscriber-memory', aiLimiter);

// Subscription gate: protect all /api/* routes except public ones
const PUBLIC_API_ROUTES = ['/api/session', '/api/refresh-token', '/api/subscription', '/api/subscribe'];
app.use('/api/', (req, res, next) => {
  if (PUBLIC_API_ROUTES.some(route => req.path === route || req.originalUrl === route)) {
    return next();
  }
  return requireSubscription(req, res, next);
});

// Serve static files from React build (client/dist) - new UI
// index:false so express.static doesn't intercept / and serve index.html directly;
// the auth route handler checks session and decides landing.html vs React app.
app.use(express.static(path.join(__dirname, 'client', 'dist'), { index: false }));
// Serve public assets (landing page, etc.)
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
// Keep old public folder for backwards compatibility (CSS/JS assets)
app.use('/legacy', express.static(path.join(__dirname, 'public')));

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback';
const DEFAULT_SCOPES = 'openid offline_access offline';
const USER_SCOPES = process.env.OAUTH_SCOPES || 'read:self read:chat write:chat';
const OAUTH_SCOPES = `${DEFAULT_SCOPES} ${USER_SCOPES}`.trim();
const OAUTH_ISSUER_BASE_URL = process.env.OAUTH_ISSUER_BASE_URL || 'https://auth.fanvue.com';
const OAUTH_AUTH_URL = `${OAUTH_ISSUER_BASE_URL}/oauth2/auth`;
const OAUTH_TOKEN_URL = `${OAUTH_ISSUER_BASE_URL}/oauth2/token`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// SUPABASE DATABASE FUNCTIONS
// ============================================

// Database initialization now in database/index.js

// Persona functions now in database/personas.js

// Memory functions now in database/memories.js

// AI Settings functions now in database/ai-settings.js

// Generate or update conversation memory using AI
async function generateConversationMemory(conversationUuid, messages, subscriberHandle, existingMemory = null, creatorEmail = null) {
  console.log('[Memory] Generating memory for conversation:', conversationUuid);

  if (!messages || messages.length === 0) {
    console.log('[Memory] No messages to analyze');
    return null;
  }

  // Build context from existing memory if available
  let existingContext = '';
  if (existingMemory) {
    existingContext = `
EXISTING MEMORY (update this with new information):
- Summary: ${existingMemory.summary || 'None'}
- Key Facts: ${existingMemory.key_facts ? existingMemory.key_facts.join(', ') : 'None'}
- Personality: ${existingMemory.personality || 'Unknown'}
- Interests: ${existingMemory.interests ? existingMemory.interests.join(', ') : 'Unknown'}
- Conversation Tone: ${existingMemory.conversation_tone || 'Unknown'}
- Total Messages So Far: ${existingMemory.total_messages || 0}
`;
  }

  // Format messages for analysis
  const messageTexts = messages.map((msg, i) => {
    const sender = msg.isSentByYou ? 'Creator' : 'Subscriber';
    return `${sender}: ${msg.text}`;
  }).join('\n');

  const prompt = `Analyze this conversation and create/update a memory profile for the subscriber.
${existingContext}

RECENT MESSAGES:
${messageTexts}

Create a JSON response with this structure:
{
  "summary": "2-3 sentence overview of the relationship and conversation history. What have you discussed? What's the vibe?",
  "key_facts": ["fact1", "fact2", ...] // Important things the subscriber has shared (name, location, job, life details, preferences)",
  "personality": "Brief description of their communication style and personality",
  "interests": ["interest1", "interest2", ...] // Topics they seem interested in or have discussed,
  "conversation_tone": "flirty/friendly/casual/romantic/playful/etc - the overall tone of the conversation",
  "last_topics": ["topic1", "topic2", "topic3"] // The most recent topics being discussed
}

Focus on information that would help maintain a natural, personalized conversation. Merge with existing memory if provided.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // Use mini for cost efficiency
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing conversations and creating memory profiles. Always respond with valid JSON only, no markdown formatting.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const memoryData = JSON.parse(completion.choices[0]?.message?.content || '{}');

    // Add metadata
    const now = new Date().toISOString();
    const fullMemoryData = {
      subscriber_handle: subscriberHandle,
      summary: memoryData.summary || null,
      key_facts: memoryData.key_facts || [],
      personality: memoryData.personality || null,
      interests: memoryData.interests || [],
      conversation_tone: memoryData.conversation_tone || null,
      last_topics: memoryData.last_topics || [],
      total_messages: messages.length + (existingMemory?.total_messages || 0),
      first_contact: existingMemory?.first_contact || now,
      last_contact: now
    };

    // Save to database
    const saved = await saveSubscriberMemory(conversationUuid, creatorEmail, fullMemoryData);
    console.log('[Memory] Memory saved successfully for:', subscriberHandle);

    return saved;
  } catch (error) {
    console.error('[Memory] Error generating memory:', error);
    return null;
  }
}

// ============================================
// CONVERSATION TONE DETECTION
// ============================================

// Detect conversation tone based on recent messages
// AI helper functions now in services/ai-service.js

// ============================================
// CONVERSATION STATE FUNCTIONS (for continuity)
// ============================================

// Get conversation state for a specific conversation
async function getConversationState(conversationUuid, creatorEmail) {
  if (!creatorEmail) {
    console.error('[State] Cannot get conversation state without creator email');
    return null;
  }

  const { data, error } = await supabase
    .from('conversation_states')
    .select('*')
    .eq('conversation_uuid', conversationUuid)
    .eq('creator_email', creatorEmail)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('[State] Error fetching conversation state:', error);
    return null;
  }
  return data;
}

// Save conversation state (specific to creator account)
async function saveConversationState(conversationUuid, creatorEmail, stateData) {
  if (!creatorEmail) {
    console.error('[State] Cannot save conversation state without creator email');
    return null;
  }

  const { data: existing } = await supabase
    .from('conversation_states')
    .select('id')
    .eq('conversation_uuid', conversationUuid)
    .eq('creator_email', creatorEmail)
    .single();

  const now = new Date().toISOString();

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('conversation_states')
      .update({ ...stateData, updated_at: now })
      .eq('conversation_uuid', conversationUuid)
      .eq('creator_email', creatorEmail)
      .select()
      .single();

    if (error) {
      console.error('[State] Error updating conversation state:', error);
      return null;
    }
    return data;
  } else {
    // Insert new
    const { data, error } = await supabase
      .from('conversation_states')
      .insert({
        conversation_uuid: conversationUuid,
        creator_email: creatorEmail,
        ...stateData,
        created_at: now,
        updated_at: now
      })
      .select()
      .single();

    if (error) {
      console.error('[State] Error creating conversation state:', error);
      return null;
    }
    return data;
  }
}

// Extract conversation state using GPT-4o-mini after each exchange
async function extractConversationState(messages, existingState = null) {
  if (!messages || messages.length < 2) {
    return null;
  }

  // Get the last few messages for analysis
  const recentMessages = messages.slice(-10);
  const lastCreatorMsg = [...recentMessages].reverse().find(m => m.isSentByYou);
  const lastSubscriberMsg = [...recentMessages].reverse().find(m => !m.isSentByYou);

  const messageTexts = recentMessages.map(msg => {
    const sender = msg.isSentByYou ? 'Creator' : 'Subscriber';
    return `${sender}: ${msg.text}`;
  }).join('\n');

  const existingContext = existingState ? `
PREVIOUS STATE:
- Current Thread: ${existingState.current_thread || 'None'}
- Open Loops: ${existingState.open_loops ? existingState.open_loops.join('; ') : 'None'}
- Stage: ${existingState.conversation_stage || 'Unknown'}
` : '';

  const prompt = `Analyze this conversation exchange and extract the current state.
${existingContext}
RECENT MESSAGES:
${messageTexts}

Return a JSON object with:
{
  "current_thread": "What is the conversation currently about? What topic/activity is happening RIGHT NOW? Be specific.",
  "open_loops": ["List any unresolved items: questions asked but not answered, requests made, promises pending, topics started but not finished"],
  "conversation_stage": "One of: greeting, casual, flirting, sexting, cooldown, farewell",
  "relationship_temperature": "One of: cold (new/formal), warm (friendly/comfortable), hot (flirty/intimate)",
  "do_not_break": ["List any active scenarios, names being used, or contexts that should NOT be abandoned mid-conversation"]
}

Be concise but specific. Focus on what's happening NOW, not historical summary.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: 'You extract conversation state for continuity. Always respond with valid JSON only.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      max_tokens: 300,
      temperature: 0.2,
      response_format: { type: "json_object" }
    });

    const stateData = JSON.parse(completion.choices[0]?.message?.content || '{}');

    return {
      current_thread: stateData.current_thread || null,
      open_loops: stateData.open_loops || [],
      conversation_stage: stateData.conversation_stage || 'casual',
      relationship_temperature: stateData.relationship_temperature || 'warm',
      do_not_break: stateData.do_not_break || [],
      last_assistant_message: lastCreatorMsg?.text || null,
      last_user_message: lastSubscriberMsg?.text || null
    };
  } catch (error) {
    console.error('[State] Error extracting conversation state:', error);
    return null;
  }
}

// ============================================
// CONTENT REQUEST NOTIFICATIONS
// ============================================

// Content request functions now in database/content-requests.js

// Detect if a message is requesting media content
// Media request detection now in services/ai-service.js

// ============================================
// MEDIA DESCRIPTION FUNCTIONS (GPT-4o Vision)
// ============================================

// Get cached media description from database
async function getCachedMediaDescription(mediaUuid) {
  const { data, error } = await supabase
    .from('media_descriptions')
    .select('*')
    .eq('media_uuid', mediaUuid)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = not found
    console.error('[Media Desc] Error fetching cached description:', error);
  }
  return data;
}

// Save media description to cache
async function cacheMediaDescription(mediaUuid, description, mediaType, isNsfw = false) {
  const { data, error } = await supabase
    .from('media_descriptions')
    .upsert({
      media_uuid: mediaUuid,
      description: description,
      media_type: mediaType,
      is_nsfw: isNsfw,
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('[Media Desc] Error caching description:', error);
    return null;
  }
  return data;
}

// Describe media using GPT-4o Vision API
async function describeMedia(mediaUrl, mediaType, mediaUuid) {
  // Check cache first
  if (mediaUuid) {
    const cached = await getCachedMediaDescription(mediaUuid);
    if (cached) {
      console.log('[Media Desc] Using cached description for:', mediaUuid);
      return {
        description: cached.description,
        isNsfw: cached.is_nsfw,
        cached: true
      };
    }
  }

  try {
    // For videos, we analyze the thumbnail (passed as mediaUrl)
    // The calling code should pass the thumbnail URL for videos
    const isVideo = mediaType === 'video';

    const prompt = isVideo
      ? `Describe this video thumbnail briefly. What is shown in this image that appears to be from a video? Keep the description to 1-2 sentences, focusing on the subject and setting.`
      : `Describe this image briefly in 1-2 sentences. Focus on what is shown - the subject, setting, and any notable details. Be factual and descriptive.`;

    console.log('[Media Desc] Analyzing media with GPT-4o Vision...');

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: mediaUrl,
                detail: 'low' // Use low detail to reduce cost
              }
            }
          ]
        }
      ],
      max_tokens: 150
    });

    const description = completion.choices[0]?.message?.content || '';
    console.log('[Media Desc] Generated description:', description);

    // Cache the result
    if (mediaUuid && description) {
      await cacheMediaDescription(mediaUuid, description, mediaType, false);
    }

    return {
      description: description,
      isNsfw: false,
      cached: false
    };

  } catch (error) {
    console.error('[Media Desc] GPT-4o Vision error:', error.message);

    // Check if it's a content policy error (NSFW rejection)
    if (error.message?.includes('content policy') ||
        error.message?.includes('safety') ||
        error.code === 'content_policy_violation') {

      const fallbackDesc = mediaType === 'video'
        ? '[Intimate/explicit video content]'
        : '[Intimate/explicit image content]';

      // Cache the NSFW fallback
      if (mediaUuid) {
        await cacheMediaDescription(mediaUuid, fallbackDesc, mediaType, true);
      }

      console.log('[Media Desc] Content flagged as NSFW, using fallback');
      return {
        description: fallbackDesc,
        isNsfw: true,
        cached: false
      };
    }

    // For other errors, return a generic description
    return {
      description: mediaType === 'video' ? '[Video content]' : '[Image content]',
      isNsfw: false,
      error: error.message
    };
  }
}

// Get descriptions for all media in a message batch
async function getMediaDescriptionsForMessages(messages, chatMedia) {
  const mediaDescriptions = {};

  console.log('[Media Desc] Starting getMediaDescriptionsForMessages with', messages.length, 'messages and', chatMedia?.length || 0, 'media items');

  if (!chatMedia || !Array.isArray(chatMedia) || chatMedia.length === 0) {
    console.log('[Media Desc] No media items provided, returning empty');
    return mediaDescriptions;
  }

  // Build a map of message UUID to media items
  const mediaByMessage = {};
  for (const item of chatMedia) {
    const msgId = item.messageUuid || item.message_uuid || item.messageId || item.chatMessageUuid;
    console.log('[Media Desc] Media item msgId:', msgId, 'keys:', Object.keys(item));
    if (msgId) {
      if (!mediaByMessage[msgId]) {
        mediaByMessage[msgId] = [];
      }
      mediaByMessage[msgId].push(item);
    }
  }
  console.log('[Media Desc] Media indexed by message:', Object.keys(mediaByMessage));

  // Log message UUIDs for comparison
  console.log('[Media Desc] Message UUIDs in conversation:', messages.map(m => ({ uuid: m.uuid || m.id, isSentByYou: m.isSentByYou })));

  // Get descriptions for media in subscriber messages (not sent by creator)
  for (const msg of messages) {
    const msgUuid = msg.uuid || msg.id;
    if (!msgUuid || msg.isSentByYou) {
      console.log('[Media Desc] Skipping message:', msgUuid, 'isSentByYou:', msg.isSentByYou);
      continue;
    }

    const msgMedia = mediaByMessage[msgUuid];
    if (!msgMedia || msgMedia.length === 0) {
      console.log('[Media Desc] No media found for subscriber message:', msgUuid);
      continue;
    }

    console.log('[Media Desc] Found', msgMedia.length, 'media items for subscriber message:', msgUuid);

    const descriptions = [];
    for (const media of msgMedia) {
      const mediaType = media.mediaType || media.type || 'image';
      const mediaUuid = media.uuid || media.id;

      // Get URL - prefer thumbnail for videos, main for images
      let urlToAnalyze = null;
      let mainUrl = null;
      let thumbnailUrl = null;

      if (media.variants && Array.isArray(media.variants)) {
        for (const v of media.variants) {
          if (v.variantType === 'main' && v.url) mainUrl = v.url;
          if ((v.variantType === 'thumbnail' || v.variantType === 'thumbnail_gallery') && v.url) {
            thumbnailUrl = v.url;
          }
        }
      }

      // For videos, use thumbnail. For images, use main URL
      urlToAnalyze = mediaType === 'video' ? (thumbnailUrl || mainUrl) : (mainUrl || thumbnailUrl);

      if (!urlToAnalyze) {
        console.log('[Media Desc] No URL found for media:', mediaUuid);
        continue;
      }

      const result = await describeMedia(urlToAnalyze, mediaType, mediaUuid);

      let descText = result.description;
      if (mediaType === 'video' && media.duration) {
        // Add duration info for videos
        const durationSec = Math.round(media.duration);
        descText += ` (${durationSec}s video)`;
      }

      descriptions.push(descText);
    }

    if (descriptions.length > 0) {
      mediaDescriptions[msgUuid] = descriptions;
    }
  }

  return mediaDescriptions;
}

// ============================================
// VAULT AWARENESS & MEDIA LIBRARY FUNCTIONS
// ============================================
/*
  REQUIRED SUPABASE TABLE - Run this SQL in Supabase Dashboard > SQL Editor:

  CREATE TABLE IF NOT EXISTS media_sent_tracking (
    id SERIAL PRIMARY KEY,
    conversation_uuid VARCHAR(255) NOT NULL,
    media_uuid VARCHAR(255) NOT NULL,
    media_type VARCHAR(50) DEFAULT 'direct',
    sent_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(conversation_uuid, media_uuid)
  );

  CREATE INDEX idx_media_sent_conversation ON media_sent_tracking(conversation_uuid);
*/

// In-memory cache for creator's media library (refreshed on demand)
// Vault/media management functions now in services/vault-service.js

// ============================================
// END VAULT AWARENESS FUNCTIONS
// ============================================

// ============================================
// TIP/GIFT REQUEST TRACKING SYSTEM
// ============================================
/*
  REQUIRED SUPABASE TABLE - Run this SQL in Supabase Dashboard > SQL Editor:

  CREATE TABLE IF NOT EXISTS tip_request_tracking (
    id SERIAL PRIMARY KEY,
    conversation_uuid VARCHAR(255) NOT NULL UNIQUE,
    last_tip_request TIMESTAMP,
    last_tip_received TIMESTAMP,
    total_tips_received DECIMAL(10,2) DEFAULT 0,
    tip_request_count INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
  );

  CREATE INDEX idx_tip_tracking_conversation ON tip_request_tracking(conversation_uuid);
*/

// Get tip tracking data for a subscriber
async function getTipTracking(conversationUuid) {
  try {
    const { data, error } = await supabase
      .from('tip_request_tracking')
      .select('*')
      .eq('conversation_uuid', conversationUuid)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No record found - return default
        return {
          conversation_uuid: conversationUuid,
          last_tip_request: null,
          last_tip_received: null,
          total_tips_received: 0,
          tip_request_count: 0
        };
      }
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[Tips] tip_request_tracking table not found - run the SQL migration');
        return null;
      }
      console.error('[Tips] Error fetching tip tracking:', error);
      return null;
    }
    return data;
  } catch (error) {
    console.error('[Tips] Error fetching tip tracking:', error);
    return null;
  }
}

// Track when a tip request was made
async function trackTipRequest(conversationUuid) {
  try {
    const now = new Date().toISOString();

    // Upsert - insert or update
    const { data, error } = await supabase
      .from('tip_request_tracking')
      .upsert({
        conversation_uuid: conversationUuid,
        last_tip_request: now,
        updated_at: now
      }, {
        onConflict: 'conversation_uuid'
      })
      .select()
      .single();

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[Tips] tip_request_tracking table not found - run the SQL migration');
        return false;
      }
      console.error('[Tips] Error tracking tip request:', error);
      return false;
    }

    // Increment the counter separately
    await supabase.rpc('increment_tip_request_count', { conv_uuid: conversationUuid });

    console.log('[Tips] Tracked tip request for:', conversationUuid);
    return true;
  } catch (error) {
    console.error('[Tips] Error tracking tip request:', error);
    return false;
  }
}

// Track when a tip is received (called from webhook or manual entry)
async function trackTipReceived(conversationUuid, amount) {
  try {
    const now = new Date().toISOString();

    // First get existing total
    const existing = await getTipTracking(conversationUuid);
    const newTotal = (existing?.total_tips_received || 0) + parseFloat(amount);

    const { data, error } = await supabase
      .from('tip_request_tracking')
      .upsert({
        conversation_uuid: conversationUuid,
        last_tip_received: now,
        total_tips_received: newTotal,
        updated_at: now
      }, {
        onConflict: 'conversation_uuid'
      });

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[Tips] tip_request_tracking table not found - run the SQL migration');
        return false;
      }
      console.error('[Tips] Error tracking tip received:', error);
      return false;
    }

    console.log('[Tips] Tracked tip received:', amount, 'for:', conversationUuid);
    return true;
  } catch (error) {
    console.error('[Tips] Error tracking tip received:', error);
    return false;
  }
}

// Calculate days since last tip request
function daysSinceLastTipRequest(tipTracking) {
  if (!tipTracking?.last_tip_request) return Infinity;

  const lastRequest = new Date(tipTracking.last_tip_request);
  const now = new Date();
  const diffMs = now - lastRequest;
  const diffDays = diffMs / (1000 * 60 * 60 * 24);

  return diffDays;
}

// Build tip context for AI prompt
function buildTipContextForAI(tipTracking) {
  if (!tipTracking) return '';

  const daysSinceRequest = daysSinceLastTipRequest(tipTracking);
  const canRequestTip = daysSinceRequest >= 4;

  let context = `\n\n=== TIP/GIFT AWARENESS ===`;

  if (tipTracking.total_tips_received > 0) {
    context += `\nThis subscriber has tipped you $${tipTracking.total_tips_received.toFixed(2)} total.`;
  }

  if (canRequestTip) {
    if (daysSinceRequest === Infinity) {
      context += `\nYou have NEVER asked this subscriber for a tip. It's appropriate to mention it.`;
    } else {
      context += `\nIt's been ${Math.floor(daysSinceRequest)} days since you last asked for a tip. You can mention tips naturally.`;
    }

    context += `\n\nHOW TO REQUEST TIPS NATURALLY:
- Mention you're saving for something (trip, outfit, bills, etc.)
- Say something like "Any tips today would really help me out babe 💕"
- After sharing good content: "If you enjoyed that, a tip would make my day..."
- Frame it as appreciation: "Tips let me know you're enjoying our chats"
- DON'T be pushy or repetitive
- DON'T ask for specific amounts
- Make it feel natural, not transactional`;
  } else {
    const daysRemaining = Math.ceil(4 - daysSinceRequest);
    context += `\nYou asked for a tip ${Math.floor(daysSinceRequest)} days ago. Wait ${daysRemaining} more day(s) before asking again.`;
    context += `\nDO NOT mention tips or gifts until the cooldown is over.`;
  }

  return context;
}

// ============================================
// END TIP TRACKING SYSTEM
// ============================================

// ============================================
// PPV (PAY-PER-VIEW) PUSH SYSTEM
// ============================================
/*
  REQUIRED SUPABASE TABLE - Run this SQL in Supabase Dashboard > SQL Editor:

  CREATE TABLE IF NOT EXISTS ppv_tracking (
    id SERIAL PRIMARY KEY,
    conversation_uuid VARCHAR(255) NOT NULL,
    media_uuid VARCHAR(255) NOT NULL,
    price DECIMAL(10,2) NOT NULL,
    status VARCHAR(50) DEFAULT 'sent',  -- 'sent', 'purchased', 'expired'
    sent_at TIMESTAMP DEFAULT NOW(),
    purchased_at TIMESTAMP,
    UNIQUE(conversation_uuid, media_uuid)
  );

  CREATE INDEX idx_ppv_conversation ON ppv_tracking(conversation_uuid);
  CREATE INDEX idx_ppv_status ON ppv_tracking(status);
*/

// Track PPV content sent to a subscriber
async function trackPPVSent(conversationUuid, mediaUuid, price) {
  try {
    const { data, error } = await supabase
      .from('ppv_tracking')
      .upsert({
        conversation_uuid: conversationUuid,
        media_uuid: mediaUuid,
        price: parseFloat(price),
        status: 'sent',
        sent_at: new Date().toISOString()
      }, {
        onConflict: 'conversation_uuid,media_uuid'
      });

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[PPV] ppv_tracking table not found - run the SQL migration');
        return false;
      }
      console.error('[PPV] Error tracking PPV sent:', error);
      return false;
    }

    console.log('[PPV] Tracked PPV sent:', mediaUuid, 'price:', price);
    return true;
  } catch (error) {
    console.error('[PPV] Error tracking PPV sent:', error);
    return false;
  }
}

// Track PPV purchase (called from webhook or manual)
async function trackPPVPurchased(conversationUuid, mediaUuid) {
  try {
    const { data, error } = await supabase
      .from('ppv_tracking')
      .update({
        status: 'purchased',
        purchased_at: new Date().toISOString()
      })
      .eq('conversation_uuid', conversationUuid)
      .eq('media_uuid', mediaUuid);

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[PPV] ppv_tracking table not found - run the SQL migration');
        return false;
      }
      console.error('[PPV] Error tracking PPV purchase:', error);
      return false;
    }

    console.log('[PPV] Tracked PPV purchase:', mediaUuid);
    return true;
  } catch (error) {
    console.error('[PPV] Error tracking PPV purchase:', error);
    return false;
  }
}

// Get PPV stats for a subscriber
async function getPPVStats(conversationUuid) {
  try {
    const { data, error } = await supabase
      .from('ppv_tracking')
      .select('*')
      .eq('conversation_uuid', conversationUuid);

    if (error) {
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[PPV] ppv_tracking table not found - run the SQL migration');
        return { sent: [], purchased: [], totalSent: 0, totalPurchased: 0, totalRevenue: 0 };
      }
      console.error('[PPV] Error fetching PPV stats:', error);
      return { sent: [], purchased: [], totalSent: 0, totalPurchased: 0, totalRevenue: 0 };
    }

    const ppvItems = data || [];
    const sent = ppvItems.filter(p => p.status === 'sent');
    const purchased = ppvItems.filter(p => p.status === 'purchased');
    const totalRevenue = purchased.reduce((sum, p) => sum + parseFloat(p.price || 0), 0);

    return {
      sent,
      purchased,
      totalSent: sent.length,
      totalPurchased: purchased.length,
      totalRevenue
    };
  } catch (error) {
    console.error('[PPV] Error fetching PPV stats:', error);
    return { sent: [], purchased: [], totalSent: 0, totalPurchased: 0, totalRevenue: 0 };
  }
}

// Calculate the next PPV price based on purchase history
// Pricing tiers (escalates every 2 purchases):
// - Purchases 0-1: $5
// - Purchases 2-3: $6
// - Purchases 4-5: $7
// - ... up to max $15
// If last PPV was NOT purchased, reset to $5
async function calculateNextPPVPrice(conversationUuid) {
  const BASE_PRICE = 5;  // Starting price in dollars
  const MAX_PRICE = 15;  // Maximum PPV price cap
  const PURCHASES_PER_TIER = 2; // Escalate price every 2 purchases

  try {
    // Get all PPV records for this subscriber, ordered by sent_at
    const { data, error } = await supabase
      .from('ppv_tracking')
      .select('*')
      .eq('conversation_uuid', conversationUuid)
      .order('sent_at', { ascending: false });

    if (error) {
      console.warn('[PPV Price] Error fetching history:', error.message);
      return { price: BASE_PRICE, reason: 'default' };
    }

    if (!data || data.length === 0) {
      // No PPV history - start at base price
      return { price: BASE_PRICE, reason: 'first_ppv' };
    }

    // Check the most recent PPV
    const lastPPV = data[0];

    if (lastPPV.status !== 'purchased') {
      // Last PPV was NOT purchased - reset to base price
      return {
        price: BASE_PRICE,
        reason: 'last_not_purchased',
        lastPPVPrice: parseFloat(lastPPV.price)
      };
    }

    // Last PPV was purchased - count consecutive purchases from most recent
    let consecutivePurchases = 0;
    for (const ppv of data) {
      if (ppv.status === 'purchased') {
        consecutivePurchases++;
      } else {
        break; // Stop counting when we hit a non-purchased one
      }
    }

    // Calculate new price: escalate by $1 every 2 purchases, cap at MAX_PRICE
    // Tier 0 (0-1 purchases): $5
    // Tier 1 (2-3 purchases): $6
    // Tier 2 (4-5 purchases): $7
    // etc.
    const tier = Math.floor(consecutivePurchases / PURCHASES_PER_TIER);
    const calculatedPrice = BASE_PRICE + tier;
    const newPrice = Math.min(calculatedPrice, MAX_PRICE);

    console.log('[PPV Price] Calculated: $' + newPrice, '| Tier:', tier, '| Consecutive purchases:', consecutivePurchases);

    return {
      price: newPrice,
      reason: consecutivePurchases >= PURCHASES_PER_TIER ? 'escalating' : 'first_ppv',
      consecutivePurchases,
      tier,
      lastPPVPrice: parseFloat(lastPPV.price)
    };
  } catch (error) {
    console.error('[PPV Price] Error calculating price:', error);
    return { price: BASE_PRICE, reason: 'error' };
  }
}

// Build PPV context for AI prompt
function buildPPVContextForAI(ppvStats, availableMedia) {
  if (!availableMedia || availableMedia.length === 0) return '';

  let context = `\n\n=== PPV AWARENESS ===`;

  if (ppvStats.totalPurchased > 0) {
    context += `\nThis subscriber has purchased ${ppvStats.totalPurchased} PPV items from you ($${ppvStats.totalRevenue.toFixed(2)} total).`;
    context += `\nThey're a buyer! You can offer more PPV when the moment feels right.`;
  } else if (ppvStats.totalSent > 0) {
    context += `\nYou've sent ${ppvStats.totalSent} PPV offers but they haven't purchased yet.`;
    context += `\nDon't push too hard - focus on building desire first.`;
  } else {
    context += `\nYou haven't sent any PPV to this subscriber yet.`;
    context += `\nWhen they're engaged and excited, consider offering something special.`;
  }

  // Count available PPV-ready content (items with recommended prices)
  const ppvReady = availableMedia.filter(m => m.recommendedPrice && m.recommendedPrice > 0);
  if (ppvReady.length > 0) {
    context += `\n\nYou have ${ppvReady.length} items ready to sell as PPV.`;
  }

  context += `\n\nGOOD MOMENTS TO OFFER PPV:
- After flirty/sexual conversation buildup
- When they specifically ask for more content
- After you've teased content successfully
- When they're being generous (tipping, complimenting)

BAD MOMENTS TO OFFER PPV:
- Right after they subscribed
- After they declined a previous offer
- When conversation is casual/non-sexual
- Multiple times in the same conversation`;

  return context;
}

// ============================================
// END PPV SYSTEM
// ============================================

// ============================================
// END SUPABASE DATABASE FUNCTIONS
// ============================================

// Fanvue API functions now in services/fanvue-api.js
// Auth helper functions (base64url, generatePkce) now in routes/auth.js

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <title>Fanvue Chatbot</title>
    <link rel="stylesheet" href="/styles.css">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body>
    {{#if loggedIn}}
    <div class="app-layout">
        <!-- Left Sidebar - Icon Navigation -->
        <nav class="sidebar-nav">
            <div class="creator-avatar" id="creatorAvatarNav" title="{{username}}">
                {{usernameInitial}}
            </div>

            <div class="nav-item" id="navNotifications" onclick="toggleNotifications()" style="display: none;">
                <span>🔔</span>
                <span class="tooltip">Notifications</span>
                <span class="notification-badge" id="navNotificationBadge" style="position: absolute; top: -2px; right: -2px; display: none;">0</span>
            </div>

            <div class="nav-item active" id="navChat" onclick="showChatView()">
                <span>💬</span>
                <span class="tooltip">Chats</span>
            </div>

            <div class="nav-item" id="navAIMode" onclick="document.getElementById('systemPromptButton').click()">
                <span>🤖</span>
                <span class="tooltip">AI Settings</span>
            </div>

            <div class="nav-item" id="navMedia" onclick="document.getElementById('mediaControlBtn').click()">
                <span>📷</span>
                <span class="tooltip">Media Control</span>
            </div>

            <div class="nav-item" id="navAnalytics" onclick="document.getElementById('analyticsBtn').click()">
                <span>📊</span>
                <span class="tooltip">Analytics</span>
            </div>

            <div class="nav-item" id="navSubscriber" onclick="document.getElementById('profileToggleBtn').click()">
                <span>👤</span>
                <span class="tooltip">Subscriber</span>
            </div>

            <div class="nav-item" id="navPersona" onclick="document.getElementById('creatorToggleBtn').click()">
                <span>✨</span>
                <span class="tooltip">My Persona</span>
            </div>

            <div class="nav-spacer"></div>

            <div class="nav-item logout" onclick="window.location.href='/logout'">
                <span>🚪</span>
                <span class="tooltip">Logout</span>
            </div>
        </nav>

        <!-- Center Panel - Chat Area -->
        <main class="center-panel">
            <!-- Notification Panel (Hidden by default) -->
            <div class="notification-panel" id="notificationPanel" style="display: none;">
                <div class="notification-header">
                    <span>Content Requests</span>
                    <span class="notification-badge" id="notificationBadge">0</span>
                </div>
                <div class="notification-list" id="notificationList">
                    <div class="notification-empty">No pending requests</div>
                </div>
            </div>

            <!-- Hidden legacy elements for JS compatibility -->
            <button class="notification-toggle" id="notificationToggle" style="display: none !important;">
                Content Requests <span class="count" id="notificationCount">0</span>
            </button>
            <div id="userInfo" style="display: none;">
                <p>Logged in as: <strong>{{username}}</strong></p>
            </div>

            <!-- Conversation Toolbar -->
            <div class="toolbar">
                <select id="conversationSelect" disabled>
                    <option value="">Loading conversations...</option>
                </select>
                <button id="refreshButton">↻ Refresh</button>
                <input type="text" id="messageSearch" placeholder="🔍 Search messages...">
            </div>

            <!-- AI Mode Controls -->
            <div class="ai-controls">
                <div style="display: flex; align-items: center; gap: 10px; flex: 1;">
                    <label style="font-weight: 600;">AI Mode:</label>
                    <select id="aiModeSelect">
                        <option value="manual">Manual (No AI)</option>
                        <option value="assisted">AI Assisted (Suggest Only)</option>
                        <option value="full">Full AI (Auto-Reply)</option>
                    </select>
                    <span id="aiModeDescription" style="font-size: 12px; opacity: 0.7;">You chat manually</span>
                </div>
                <div class="ai-toggle-container" id="fastModeContainer" style="display: none;">
                    <label class="toggle-switch">
                        <input type="checkbox" id="fastModeToggle" checked>
                        <span class="toggle-slider"></span>
                    </label>
                    <span id="fastModeLabel">Fast Mode: ON</span>
                </div>
                <button id="systemPromptButton">⚙️ Configure AI</button>
            </div>

            <!-- Chat Messages Container -->
            <div class="chat-container" id="chatContainer">
                <div class="message bot">
                    <strong>Welcome!</strong> Select a conversation to start chatting.
                </div>
            </div>

        <div id="delayIndicator" style="display: none; padding: 15px; background: #fff3cd; border: 2px solid #ffc107; border-radius: 8px; margin: 10px 0;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <span id="delayMessage" style="font-weight: 600; color: #856404;">
                    <span id="delayStatus">Generating preview...</span>
                    <span id="delayCountdownWrapper" style="display: none;"> Sending in <strong id="delayCountdown" style="font-size: 1.2em; color: #d63384;">0</strong>s</span>
                </span>
                <button id="cancelAutoReplyBtn" style="padding: 6px 14px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600; font-size: 12px;">Cancel</button>
            </div>
            <div id="previewContainer" style="display: none;">
                <textarea id="autoReplyPreview" style="width: 100%; min-height: 80px; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; resize: vertical; font-family: inherit; background: white;"></textarea>
                <div style="display: flex; gap: 10px; margin-top: 10px; align-items: center;">
                    <button id="sendNowBtn" style="padding: 8px 16px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: 600;">Send Now</button>
                    <span style="color: #666; font-size: 12px;">Edit the message above if needed</span>
                </div>
            </div>
        </div>

        <div id="aiSuggestionBox" style="display: none; margin: 15px 0; padding: 15px; background: #e8f4fd; border: 2px solid #007bff; border-radius: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <strong style="color: #007bff;">AI Suggested Response:</strong>
                <button id="regenerateSuggestionBtn" style="padding: 5px 10px; font-size: 12px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">Regenerate</button>
            </div>
            <textarea id="aiSuggestionText" style="width: 100%; min-height: 80px; padding: 10px; border: 1px solid #ddd; border-radius: 6px; font-size: 14px; resize: vertical; font-family: inherit;"></textarea>
            <div style="display: flex; gap: 10px; margin-top: 10px;">
                <button id="useSuggestionBtn" style="flex: 1; padding: 10px; background: #28a745; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Send This Message</button>
                <button id="editSuggestionBtn" style="flex: 1; padding: 10px; background: #007bff; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">Copy to Input</button>
                <button id="dismissSuggestionBtn" style="padding: 10px 20px; background: #dc3545; color: white; border: none; border-radius: 6px; cursor: pointer;">Dismiss</button>
            </div>
        </div>

        <div id="systemPromptContainer" style="display: none;">
            <label for="systemPromptInput"><strong>System Prompt:</strong></label>
            <textarea id="systemPromptInput" placeholder="Enter AI system prompt..." rows="4"></textarea>

            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #ddd;">
                <h4 style="margin-top: 0; color: #333;">Advanced Settings (Token Limits)</h4>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Reply Length (Max Tokens):</label>
                    <input type="number" id="maxReplyTokens" min="50" max="2000" step="50" style="width: 100px; padding: 6px; border: 1px solid #ddd; border-radius: 4px;" oninput="updateReplyTokensDisplay()">
                    <span style="font-size: 12px; color: #666; margin-left: 10px;">Current: <strong id="replyTokensDisplay">150</strong> (~<span id="replyWordsDisplay">100-120</span> words)</span>
                    <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        • 150 tokens = ~100-120 words (default, short responses)<br>
                        • 300 tokens = ~200-250 words (medium responses)<br>
                        • 500 tokens = ~350-400 words (longer responses)<br>
                        • 1000 tokens = ~700-800 words (very long responses)
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Profile Analysis (Max Tokens):</label>
                    <input type="number" id="maxProfileTokens" min="200" max="1500" step="100" style="width: 100px; padding: 6px; border: 1px solid #ddd; border-radius: 4px;" oninput="updateProfileTokensDisplay()">
                    <span style="font-size: 12px; color: #666; margin-left: 10px;">Current: <strong id="profileTokensDisplay">500</strong></span>
                    <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        Tokens for analyzing subscriber personality (500 is recommended)
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Creativity (Temperature): <strong id="temperatureDisplay">0.9</strong></label>
                    <input type="range" id="replyTemperature" min="0" max="1" step="0.1" value="0.9" style="width: 100%;" oninput="updateTemperatureDisplay()">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #999;">
                        <span>0.0 (Focused & Predictable)</span>
                        <span>1.0 (Creative & Random)</span>
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">AI Model for Chat Replies:</label>
                    <select id="aiModel" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                        <option value="gpt-4o">GPT-4o (Best - Recommended)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo (Previous Generation)</option>
                        <option value="gpt-4">GPT-4 (Legacy)</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Budget)</option>
                    </select>
                    <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        Use GPT-4o for best results, GPT-4o Mini for cost savings, GPT-3.5 for budget subscribers
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">AI Model for Profile Analysis:</label>
                    <select id="profileModel" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                        <option value="gpt-4o">GPT-4o (Best - Recommended)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo (Previous Generation)</option>
                        <option value="gpt-4">GPT-4 (Legacy)</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Budget)</option>
                    </select>
                    <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        Profile analysis only runs once per subscriber, so using GPT-4o is recommended
                    </div>
                </div>
            </div>

            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #ddd;">
                <h4 style="margin-top: 0; color: #333;">💰 Monetization Features</h4>

                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <input type="checkbox" id="vaultAwarenessEnabled" checked style="width: 18px; height: 18px;">
                        <span style="font-weight: 600;">Vault Awareness</span>
                    </label>
                    <div style="font-size: 11px; color: #999; margin-top: 5px; margin-left: 28px;">
                        AI knows what content you have available and can tease it naturally in conversations.
                        Helps build anticipation before sending PPV or asking for tips.
                    </div>
                </div>

                <div id="vaultStats" style="background: #f8f9fa; padding: 10px; border-radius: 6px; font-size: 12px; display: none;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Media Library:</span>
                        <strong id="vaultMediaCount">0 items</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Last Refreshed:</span>
                        <strong id="vaultLastRefresh">Never</strong>
                    </div>
                    <button id="refreshVaultBtn" style="margin-top: 10px; padding: 5px 10px; font-size: 11px; background: #6c757d; color: white; border: none; border-radius: 4px; cursor: pointer;">
                        Refresh Media Library
                    </button>
                </div>

                <div style="margin-top: 15px; padding: 15px; background: #f0f8ff; border-radius: 6px;">
                    <h5 style="margin: 0 0 10px 0; font-size: 13px; font-weight: 600; color: #333;">📁 Folder Filtering</h5>
                    <div style="font-size: 11px; color: #666; margin-bottom: 10px;">
                        Filter media by folder name/prefix. AI will send FREE images from SFW folder and PAID images from PPV folder.
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 5px; font-size: 12px; font-weight: 600;">SFW Folder (Free Content):</label>
                        <input type="text" id="sfwFolderPrefix" placeholder="e.g., sfw, casual, free" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                        <div style="font-size: 10px; color: #999; margin-top: 3px;">
                            Images with names starting with this will be sent for free
                        </div>
                    </div>

                    <div style="margin-bottom: 10px;">
                        <label style="display: block; margin-bottom: 5px; font-size: 12px; font-weight: 600;">PPV Folder (Paid Content):</label>
                        <input type="text" id="ppvFolderPrefix" placeholder="e.g., ppv, nsfw, paid" style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 12px;">
                        <div style="font-size: 10px; color: #999; margin-top: 3px;">
                            Images with names starting with this will be sent as PPV
                        </div>
                    </div>

                    <button id="saveFolderSettingsBtn" style="width: 100%; padding: 8px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600;">
                        Save Folder Settings
                    </button>
                </div>

                <div style="margin-top: 15px; margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <input type="checkbox" id="tipTrackingEnabled" checked style="width: 18px; height: 18px;">
                        <span style="font-weight: 600;">Tip Request Tracking</span>
                    </label>
                    <div style="font-size: 11px; color: #999; margin-top: 5px; margin-left: 28px;">
                        AI tracks when you last asked for tips per subscriber (4+ day cooldown).
                        Naturally suggests tip requests when appropriate.
                    </div>
                </div>

                <div id="tipStats" style="background: #fff3cd; padding: 10px; border-radius: 6px; font-size: 12px; border: 1px solid #ffc107; display: none;">
                    <div style="font-weight: 600; margin-bottom: 8px;">Current Conversation Tips</div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Total Tips Received:</span>
                        <strong id="totalTipsReceived">$0.00</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>Days Since Last Request:</span>
                        <strong id="daysSinceTipRequest">Never asked</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>Can Ask for Tip:</span>
                        <strong id="canRequestTip" style="color: #28a745;">Yes</strong>
                    </div>
                    <div style="margin-top: 10px; display: flex; gap: 8px;">
                        <button id="markTipRequestBtn" style="flex: 1; padding: 5px 10px; font-size: 11px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Mark Tip Requested
                        </button>
                        <button id="recordTipBtn" style="flex: 1; padding: 5px 10px; font-size: 11px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Record Tip Received
                        </button>
                    </div>
                </div>

                <div style="margin-top: 15px; margin-bottom: 15px;">
                    <label style="display: flex; align-items: center; gap: 10px; cursor: pointer;">
                        <input type="checkbox" id="ppvAwarenessEnabled" checked style="width: 18px; height: 18px;">
                        <span style="font-weight: 600;">PPV Awareness</span>
                    </label>
                    <div style="font-size: 11px; color: #999; margin-top: 5px; margin-left: 28px;">
                        AI understands PPV dynamics and suggests good moments to offer paid content.
                        Tracks purchase history per subscriber.
                    </div>
                </div>

                <div id="ppvStats" style="background: #d4edda; padding: 10px; border-radius: 6px; font-size: 12px; border: 1px solid #28a745; display: none;">
                    <div style="font-weight: 600; margin-bottom: 8px;">Current Conversation PPV</div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>PPV Offers Sent:</span>
                        <strong id="ppvOffersSent">0</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; margin-bottom: 5px;">
                        <span>PPV Purchased:</span>
                        <strong id="ppvPurchased">0</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between;">
                        <span>PPV Revenue:</span>
                        <strong id="ppvRevenue" style="color: #28a745;">$0.00</strong>
                    </div>
                    <div style="margin-top: 10px; display: flex; gap: 8px;">
                        <button id="recordPPVSentBtn" style="flex: 1; padding: 5px 10px; font-size: 11px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Record PPV Sent
                        </button>
                        <button id="recordPPVPurchasedBtn" style="flex: 1; padding: 5px 10px; font-size: 11px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">
                            Record PPV Purchased
                        </button>
                    </div>
                    <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #ccc;">
                        <div style="font-weight: 600; margin-bottom: 8px;">📸 Send Media</div>
                        <select id="ppvMediaSelect" style="width: 100%; padding: 6px; margin-bottom: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;">
                            <option value="">Select media to send...</option>
                        </select>
                        <div style="display: flex; gap: 8px; margin-bottom: 8px;">
                            <input type="number" id="ppvPriceInput" placeholder="Price $ (0=free)" value="0" min="0" step="0.5" style="flex: 1; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px;">
                            <button id="sendFreeMediaBtn" style="padding: 6px 12px; font-size: 11px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                                Send Free
                            </button>
                            <button id="sendPPVBtn" style="padding: 6px 12px; font-size: 11px; background: #dc3545; color: white; border: none; border-radius: 4px; cursor: pointer; font-weight: bold;">
                                Send PPV $3
                            </button>
                        </div>
                        <input type="text" id="ppvMessageInput" placeholder="Optional message with media..." style="width: 100%; padding: 6px; border: 1px solid #ddd; border-radius: 4px; font-size: 11px; box-sizing: border-box;">
                        <div style="font-size: 10px; color: #666; margin-top: 4px;">
                            PPV minimum: $3 (300 cents). Set price to 0 and use "Send Free" for free media.
                        </div>
                    </div>
                </div>
            </div>

            <button id="savePromptButton">Save All Settings</button>
        </div>

            <!-- Error Container -->
            <div id="errorContainer"></div>

            <!-- Message Input Area -->
            <div class="input-container">
                <input type="text" id="messageInput" placeholder="Type your message...">
                <button id="sendButton">➤ Send</button>
            </div>
        </main>

        <!-- Hidden floating buttons (kept for JS compatibility, navigation is now in sidebar) -->
        <button class="profile-toggle-btn" id="profileToggleBtn" style="display: none;">Subscriber Profile</button>
        <button class="creator-profile-btn" id="creatorToggleBtn" style="display: none;">My Persona</button>
        <button class="analytics-btn" id="analyticsBtn" style="display: none;">Analytics</button>
        <button class="media-control-btn" id="mediaControlBtn" style="display: none;">📷 Media Control</button>

        <div class="user-profile-sidebar" id="profileSidebar">
            <div class="profile-header">
                <h3>Subscriber Profile</h3>
                <button class="close-sidebar" id="profileCloseBtnSidebar">&times;</button>
            </div>

            <div style="display: flex; gap: 10px; margin-bottom: 10px;">
                <button class="generate-profile-btn" id="generateMemoryBtn" style="flex: 1; background: #007bff;">
                    Generate Memory
                </button>
                <button class="generate-profile-btn" id="generateProfileBtn" style="flex: 1; background: #6c757d;">
                    Quick Profile
                </button>
            </div>

            <div id="memoryContent" style="margin-bottom: 20px; padding: 15px; background: #e8f4fd; border-radius: 8px; border: 2px solid #007bff; display: none;">
                <h4 style="margin-top: 0; color: #007bff;">AI Memory</h4>
                <div id="memorySummary" style="margin-bottom: 10px;"></div>
                <div id="memoryFacts" style="margin-bottom: 10px;"></div>
                <div id="memoryDetails" style="font-size: 12px; color: #666;"></div>
            </div>

            <div id="profileContent" style="margin-top: 10px;">
                <p style="color: #999; text-align: center;">Select a conversation to load subscriber profile</p>
            </div>

            <div class="notes-section">
                <h4 style="margin-top: 0;">Manual Notes</h4>
                <textarea id="subscriberNotes" class="profile-textarea" placeholder="Add custom notes about this subscriber..."></textarea>
                <button class="add-note-btn" id="saveNotesBtn">Save Notes</button>
            </div>

            <div id="monetizationSection" style="margin-top: 20px; padding: 15px; background: linear-gradient(135deg, #f8f9fa, #e8f5e9); border-radius: 8px; border: 2px solid #28a745; display: none;">
                <h4 style="margin-top: 0; color: #28a745; display: flex; align-items: center; gap: 8px;">
                    💰 Monetization Summary
                </h4>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 15px;">
                    <div style="background: white; padding: 10px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 20px; font-weight: bold; color: #28a745;" id="totalRevenue">$0.00</div>
                        <div style="font-size: 11px; color: #666;">Total Revenue</div>
                    </div>
                    <div style="background: white; padding: 10px; border-radius: 6px; text-align: center;">
                        <div style="font-size: 20px; font-weight: bold; color: #007bff;" id="totalPurchases">0</div>
                        <div style="font-size: 11px; color: #666;">Total Purchases</div>
                    </div>
                </div>
                <div style="font-size: 12px;">
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #ddd;">
                        <span>Tips Received:</span>
                        <strong id="moneyTips">$0.00</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #ddd;">
                        <span>PPV Purchases:</span>
                        <strong id="moneyPPV">$0.00</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 5px 0; border-bottom: 1px solid #ddd;">
                        <span>PPV Conversion Rate:</span>
                        <strong id="ppvConversion">0%</strong>
                    </div>
                    <div style="display: flex; justify-content: space-between; padding: 5px 0;">
                        <span>Days Since Last Tip Request:</span>
                        <strong id="moneyDaysSinceTip">Never</strong>
                    </div>
                </div>
                <div id="monetizationAdvice" style="margin-top: 10px; padding: 8px; background: #fff3cd; border-radius: 4px; font-size: 11px; display: none;">
                    <!-- AI-generated monetization advice appears here -->
                </div>
            </div>
        </div>

        <div class="user-profile-sidebar" id="creatorSidebar">
            <div class="profile-header">
                <h3>My Persona</h3>
                <button class="close-sidebar" id="creatorCloseBtnSidebar">&times;</button>
            </div>

            <div style="margin-top: 10px;">
                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Name</label>
                <input type="text" id="creatorName" class="profile-input" placeholder="e.g., Jessica">

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Age</label>
                <input type="text" id="creatorAge" class="profile-input" placeholder="e.g., 25">

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Accent/Language Style</label>
                <input type="text" id="creatorAccent" class="profile-input" placeholder="e.g., British, Southern, etc.">

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Location</label>
                <input type="text" id="creatorLocation" class="profile-input" placeholder="e.g., Miami, Florida or London, UK">

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Timezone</label>
                <select id="creatorTimezone" class="profile-input" style="padding: 10px;">
                    <option value="">Select timezone...</option>
                    <option value="America/New_York">Eastern Time (US/Canada)</option>
                    <option value="America/Chicago">Central Time (US/Canada)</option>
                    <option value="America/Denver">Mountain Time (US/Canada)</option>
                    <option value="America/Los_Angeles">Pacific Time (US/Canada)</option>
                    <option value="America/Phoenix">Arizona</option>
                    <option value="America/Anchorage">Alaska</option>
                    <option value="Pacific/Honolulu">Hawaii</option>
                    <option value="Europe/London">London (UK)</option>
                    <option value="Europe/Paris">Paris/Berlin/Rome</option>
                    <option value="Europe/Athens">Athens/Helsinki</option>
                    <option value="Asia/Dubai">Dubai</option>
                    <option value="Asia/Kolkata">India</option>
                    <option value="Asia/Bangkok">Bangkok</option>
                    <option value="Asia/Singapore">Singapore</option>
                    <option value="Asia/Tokyo">Tokyo</option>
                    <option value="Australia/Sydney">Sydney</option>
                    <option value="Australia/Melbourne">Melbourne</option>
                    <option value="Pacific/Auckland">New Zealand</option>
                </select>

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Physical Attributes</label>
                <textarea id="creatorPhysical" class="profile-textarea" placeholder="e.g., Long blonde hair, athletic build, 5'7&quot;"></textarea>

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Personality/Vibe</label>
                <textarea id="creatorVibe" class="profile-textarea" placeholder="e.g., Flirty, playful, intelligent, witty"></textarea>

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Interesting Facts</label>
                <textarea id="creatorFacts" class="profile-textarea" placeholder="e.g., Love yoga, work as a nurse, from California"></textarea>

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Other Important Info</label>
                <textarea id="creatorOther" class="profile-textarea" placeholder="Any other context the AI should know..."></textarea>

                <button class="save-profile-btn" id="savePersonaBtn">Save Persona</button>
            </div>
        </div>

        <div class="analytics-dashboard" id="analyticsDashboard">
            <div class="analytics-content">
                <div class="analytics-header">
                    <h2>Analytics Dashboard</h2>
                    <button class="close-sidebar" id="analyticsCloseBtn">&times;</button>
                </div>

                <div class="stats-grid" id="statsGrid">
                    <div class="stat-card">
                        <div class="stat-label">Total Messages</div>
                        <div class="stat-value" id="totalMessages">0</div>
                    </div>
                    <div class="stat-card green">
                        <div class="stat-label">Messages Sent</div>
                        <div class="stat-value" id="messagesSent">0</div>
                    </div>
                    <div class="stat-card orange">
                        <div class="stat-label">AI Replies</div>
                        <div class="stat-value" id="aiReplies">0</div>
                    </div>
                    <div class="stat-card blue">
                        <div class="stat-label">Active Chats</div>
                        <div class="stat-value" id="activeChats">0</div>
                    </div>
                </div>

                <div class="chart-section">
                    <h3>Last 7 Days Activity</h3>
                    <div class="bar-chart" id="barChart"></div>
                </div>

                <div class="chart-section">
                    <h3>Most Active Conversations</h3>
                    <div class="top-conversations" id="topConversations">
                        <div style="padding: 20px; text-align: center; color: #999;">
                            No conversation data yet
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <!-- Media Control Panel Sidebar -->
        <div class="media-control-panel" id="mediaControlPanel" style="display: none; position: fixed; top: 0; right: 0; width: 480px; height: 100vh; background: #1e1e1e; box-shadow: -4px 0 20px rgba(0,0,0,0.5); z-index: 1001; overflow-y: auto;">
            <div style="padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #9c27b0;">
                    <h2 style="margin: 0; color: #ba68c8; display: flex; align-items: center; gap: 10px;">
                        📷 Media Control Panel
                    </h2>
                    <button id="mediaControlClose" style="background: #2a2a2a; border: none; font-size: 24px; cursor: pointer; color: #b3b3b3; border-radius: 8px; width: 36px; height: 36px;">&times;</button>
                </div>

                <!-- Vault Stats Section -->
                <div style="margin-bottom: 25px;">
                    <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">📊 Vault Overview</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px;">
                        <div style="background: linear-gradient(135deg, #2a2a2a, #333); padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #ba68c8;" id="vaultTotalItems">-</div>
                            <div style="font-size: 11px; color: #808080;">Total Items</div>
                        </div>
                        <div style="background: linear-gradient(135deg, rgba(0,200,83,0.1), rgba(0,200,83,0.2)); padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #00c853;" id="vaultSFWCount">-</div>
                            <div style="font-size: 11px; color: #808080;">Free (SFW)</div>
                        </div>
                        <div style="background: linear-gradient(135deg, rgba(255,152,0,0.1), rgba(255,152,0,0.2)); padding: 15px; border-radius: 8px; text-align: center;">
                            <div style="font-size: 24px; font-weight: bold; color: #ff9800;" id="vaultPPVCount">-</div>
                            <div style="font-size: 11px; color: #808080;">Paid (PPV)</div>
                        </div>
                    </div>
                    <div style="margin-top: 10px; display: flex; gap: 10px;">
                        <button id="refreshVaultBtn" style="flex: 1; padding: 8px; background: #9c27b0; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 12px;">🔄 Refresh Vault</button>
                    </div>
                </div>

                <!-- Current Subscriber Section -->
                <div style="margin-bottom: 25px;">
                    <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">👤 Current Subscriber</h3>
                    <div id="mediaControlSubscriberInfo" style="padding: 15px; background: #2a2a2a; border-radius: 8px;">
                        <p style="margin: 0; color: #808080; text-align: center;">Select a conversation to view media queue</p>
                    </div>
                </div>

                <!-- Media Queue Preview -->
                <div style="margin-bottom: 25px;">
                    <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">📋 Next Up in Queue</h3>

                    <!-- Free Queue -->
                    <div style="margin-bottom: 15px;">
                        <h4 style="margin: 0 0 10px 0; color: #00c853; font-size: 14px;">🆓 Free Content Queue</h4>
                        <div id="freeQueueList" style="background: rgba(0,200,83,0.1); border-radius: 8px; padding: 10px; max-height: 280px; overflow-y: auto;">
                            <p style="margin: 0; color: #808080; text-align: center; font-size: 12px;">Loading...</p>
                        </div>
                    </div>

                    <!-- PPV Queue -->
                    <div>
                        <h4 style="margin: 0 0 10px 0; color: #ff9800; font-size: 14px;">💰 PPV Content Queue</h4>
                        <div id="ppvQueueList" style="background: rgba(255,152,0,0.1); border-radius: 8px; padding: 10px; max-height: 280px; overflow-y: auto;">
                            <p style="margin: 0; color: #808080; text-align: center; font-size: 12px;">Loading...</p>
                        </div>
                    </div>
                </div>

                <!-- PPV Pricing Info -->
                <div style="margin-bottom: 25px;">
                    <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">💵 PPV Pricing</h3>
                    <div style="background: linear-gradient(135deg, rgba(255,152,0,0.1), rgba(255,152,0,0.2)); padding: 15px; border-radius: 8px; border: 1px solid rgba(255,152,0,0.3);">
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <span style="font-size: 13px; color: #b3b3b3;">Current Price:</span>
                            <strong style="color: #ff9800; font-size: 16px;" id="currentPPVPrice">$5</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                            <span style="font-size: 13px; color: #b3b3b3;">Purchases Made:</span>
                            <strong style="color: #fff;" id="ppvPurchaseCount">0</strong>
                        </div>
                        <div style="display: flex; justify-content: space-between;">
                            <span style="font-size: 13px; color: #b3b3b3;">Pricing Tier:</span>
                            <strong style="color: #fff;" id="ppvPricingTier">Base</strong>
                        </div>
                        <div style="margin-top: 10px; padding: 8px; background: rgba(0,0,0,0.2); border-radius: 4px; font-size: 11px; color: #808080;">
                            Tier system: $5 → $6 → $7... up to $15 max (increases every 2 purchases)
                        </div>
                    </div>
                </div>

                <!-- Sent Media History -->
                <div style="margin-bottom: 25px;">
                    <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">📤 Sent to This Subscriber</h3>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px;">
                        <div style="background: rgba(0,200,83,0.15); padding: 10px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 18px; font-weight: bold; color: #00c853;" id="sentFreeCount">0</div>
                            <div style="font-size: 11px; color: #808080;">Free Sent</div>
                        </div>
                        <div style="background: rgba(255,152,0,0.15); padding: 10px; border-radius: 6px; text-align: center;">
                            <div style="font-size: 18px; font-weight: bold; color: #ff9800;" id="sentPPVCount">0</div>
                            <div style="font-size: 11px; color: #808080;">PPV Sent</div>
                        </div>
                    </div>
                    <div id="sentMediaList" style="background: #2a2a2a; border-radius: 8px; padding: 10px; max-height: 120px; overflow-y: auto;">
                        <p style="margin: 0; color: #808080; text-align: center; font-size: 12px;">No media sent yet</p>
                    </div>
                </div>

                <!-- Actions -->
                <div style="margin-bottom: 20px;">
                    <h3 style="margin: 0 0 15px 0; color: #fff; font-size: 16px;">⚙️ Actions</h3>
                    <div style="display: flex; flex-direction: column; gap: 10px;">
                        <button id="resetTrackingBtn" style="padding: 12px; background: linear-gradient(135deg, #f44336, #d32f2f); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            🔄 Reset Tracking for This Subscriber
                        </button>
                        <button id="resetAllTrackingBtn" style="padding: 12px; background: linear-gradient(135deg, #424242, #616161); color: white; border: none; border-radius: 8px; cursor: pointer; font-weight: 600;">
                            ⚠️ Reset ALL Tracking (Dangerous)
                        </button>
                    </div>
                </div>

            </div>
        </div>

    </div>
    {{#else}}
    <!-- Login Page -->
    <div class="login-page">
        <div class="login-container">
            <h1>Fanvue Chatbot</h1>
            <p>AI-powered messaging for Fanvue creators</p>
            <a href="/login" class="login-button">Login with Fanvue</a>
        </div>
    </div>
    {{/if}}

    <script src="/app-client.js"></script>
</body>
</html>
`;

function renderTemplate(template, data) {
  let rendered = template;

  if (data.loggedIn) {
    // When logged in: remove the {{#if loggedIn}} tag, keep content until {{#else}}, remove {{#else}}...{{/if}} block
    rendered = rendered.replace(/\{\{#if loggedIn\}\}/g, '');
    rendered = rendered.replace(/\{\{#else\}\}[\s\S]*?\{\{\/if\}\}/g, ''); // Remove else block and closing tag
    rendered = rendered.replace(/\{\{username\}\}/g, data.username || 'User');
    // Get first letter of username for avatar
    const initial = (data.username || 'U').charAt(0).toUpperCase();
    rendered = rendered.replace(/\{\{usernameInitial\}\}/g, initial);
  } else {
    // When not logged in: remove {{#if loggedIn}}...{{#else}} and keep content after {{#else}} until {{/if}}
    rendered = rendered.replace(/\{\{#if loggedIn\}\}[\s\S]*?\{\{#else\}\}/g, '');
    rendered = rendered.replace(/\{\{\/if\}\}/g, '');
  }

  return rendered;
}

// Auth routes (/, /login, /callback, /logout) now in routes/auth.js

app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    let eventType = 'unknown';
    
    if (data.message && data.sender) {
      eventType = 'message.received';
      const messageData = data.message || {};
      const messageUuid = data.messageUuid || messageData.uuid;
      const messageText = messageData.text || '';
      const sender = data.sender || {};
      const senderUuid = sender.uuid;
      const senderHandle = sender.handle || '';
      const senderDisplayName = sender.displayName || '';
      const recipientUuid = data.recipientUuid;
      const timestamp = data.timestamp;
      const hasMedia = messageData.hasMedia || false;
      
      console.log('Message Received webhook:');
      console.log(`  Message UUID: ${messageUuid}`);
      console.log(`  From: ${senderDisplayName} (@${senderHandle})`);
      console.log(`  To: ${recipientUuid}`);
      console.log(`  Text: ${messageText}`);
      console.log(`  Has Media: ${hasMedia}`);
      console.log(`  Timestamp: ${timestamp}`);
      
    } else if (data.follower || data.followerUuid) {
      eventType = 'follower.new';
      const followerData = data.follower || {};
      const followerUuid = data.followerUuid || followerData.uuid;
      const creatorUuid = data.creatorUuid || data.recipientUuid;
      
      console.log('New Follower webhook:');
      console.log(`  Follower UUID: ${followerUuid}`);
      console.log(`  Creator UUID: ${creatorUuid}`);
      
    } else if (data.subscriber || data.subscriberUuid) {
      eventType = 'subscriber.new';
      const subscriberData = data.subscriber || {};
      const subscriberUuid = data.subscriberUuid || subscriberData.uuid;
      const creatorUuid = data.creatorUuid || data.recipientUuid;
      
      console.log('New Subscriber webhook:');
      console.log(`  Subscriber UUID: ${subscriberUuid}`);
      console.log(`  Creator UUID: ${creatorUuid}`);
      
    } else if (data.purchase || data.purchaseUuid) {
      eventType = 'purchase.received';
      const purchaseData = data.purchase || {};
      const purchaseUuid = data.purchaseUuid || purchaseData.uuid;
      const creatorUuid = data.creatorUuid || data.recipientUuid;
      
      console.log('Purchase Received webhook:');
      console.log(`  Purchase UUID: ${purchaseUuid}`);
      console.log(`  Creator UUID: ${creatorUuid}`);
      
    } else if (data.tip || data.tipUuid) {
      eventType = 'tip.received';
      const tipData = data.tip || {};
      const tipUuid = data.tipUuid || tipData.uuid;
      const creatorUuid = data.creatorUuid || data.recipientUuid;
      const amount = tipData.amount || data.amount;
      
      console.log('Tip Received webhook:');
      console.log(`  Tip UUID: ${tipUuid}`);
      console.log(`  Creator UUID: ${creatorUuid}`);
      console.log(`  Amount: ${amount}`);
      
    } else {
      console.log('Unknown webhook event type. Data:', JSON.stringify(data, null, 2));
    }
    
    return res.json({ status: 'received' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// GET /api/session - Check if user is logged in (for React app)
// Uses cached session data — no external API call on every page load
app.get('/api/session', (req, res) => {
  if (!req.session.access_token) {
    return res.json({ loggedIn: false });
  }

  try {
    // All data needed was cached during OAuth login — return instantly
    const rawUsername = req.session.userEmail || 'User';
    const username = rawUsername.includes('@') ? rawUsername.split('@')[0] : rawUsername;
    const subscription = req.session.subscription || { status: 'none' };

    return res.json({
      loggedIn: true,
      username,
      userUuid: req.session.fanvueUserUuid || null,
      userId: req.session.userId || null,
      subscription: {
        status: subscription.status || 'none',
        plan: subscription.plan || null,
        trialEndsAt: subscription.trial_ends_at || null,
        currentPeriodEnd: subscription.current_period_end || null
      }
    });
  } catch (error) {
    console.error('[Session] Error reading session:', error.message);
    return res.json({ loggedIn: false });
  }
});

app.post('/api/refresh-token', async (req, res) => {
  const refreshToken = req.session.refresh_token;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token available' });
  }

  try {
    const authHeader = Buffer.from(
      `${OAUTH_CLIENT_ID}:${OAUTH_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await axios.post(
      OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: OAUTH_CLIENT_ID
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`
        }
      }
    );

    req.session.access_token = tokenResponse.data.access_token;
    if (tokenResponse.data.refresh_token) {
      req.session.refresh_token = tokenResponse.data.refresh_token;
    }

    return res.json({
      access_token: tokenResponse.data.access_token,
      expires_in: tokenResponse.data.expires_in,
      token_type: tokenResponse.data.token_type || 'Bearer'
    });
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response?.status || 500).json({
      error: 'Failed to refresh token',
      details: errorText
    });
  }
});

function handleRateLimit(response) {
  if (response?.status === 429) {
    const retryAfter = response.headers['retry-after'] || response.headers['Retry-After'] || '60';
    const rateLimitLimit = response.headers['x-ratelimit-limit'] || response.headers['X-RateLimit-Limit'] || '100';
    const rateLimitRemaining = response.headers['x-ratelimit-remaining'] || response.headers['X-RateLimit-Remaining'] || '0';
    const rateLimitReset = response.headers['x-ratelimit-reset'] || response.headers['X-RateLimit-Reset'] || '';
    
    let retrySeconds = 60;
    try {
      retrySeconds = parseInt(retryAfter, 10);
    } catch (e) {
      retrySeconds = 60;
    }
    
    return {
      error: 'Rate limit exceeded',
      message: `Too many requests. Please wait ${retrySeconds} seconds before trying again.`,
      retry_after: retrySeconds,
      rate_limit_limit: rateLimitLimit,
      rate_limit_remaining: rateLimitRemaining,
      rate_limit_reset: rateLimitReset
    };
  }
  return null;
}

async function refreshAccessTokenIfNeeded(req) {
  if (!req.session.refresh_token) {
    return false;
  }

  try {
    const authHeader = Buffer.from(
      `${OAUTH_CLIENT_ID}:${OAUTH_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await axios.post(
      OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: req.session.refresh_token,
        client_id: OAUTH_CLIENT_ID
      }).toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Authorization': `Basic ${authHeader}`
        }
      }
    );

    req.session.access_token = tokenResponse.data.access_token;
    if (tokenResponse.data.refresh_token) {
      req.session.refresh_token = tokenResponse.data.refresh_token;
    }
    return true;
  } catch (error) {
    return false;
  }
}

async function fetchUserInfo(req, headers) {
  let userResponse = await fanvueRequest('get', '/users/me', { headers });

  const rateLimitError = handleRateLimit(userResponse);
  if (rateLimitError) {
    return { error: rateLimitError };
  }

  if (userResponse.status === 401) {
    if (await refreshAccessTokenIfNeeded(req)) {
      headers['Authorization'] = `Bearer ${req.session.access_token}`;
      userResponse = await fanvueRequest('get', '/users/me', { headers });
      const retryRateLimitError = handleRateLimit(userResponse);
      if (retryRateLimitError) {
        return { error: retryRateLimitError };
      }
    } else {
      return { error: { status: 401, error: 'Failed to get user info. Please log in again.' } };
    }
  }

  if (userResponse.status !== 200) {
    return { error: { status: userResponse.status, error: 'Failed to get user info' } };
  }

  return { data: userResponse.data };
}

app.get('/api/profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);
    const userResult = await fetchUserInfo(req, headers);
    if (userResult.error) {
      return res.status(userResult.error.status || 429).json(userResult.error);
    }

    return res.json({ profile: userResult.data });
  } catch (error) {
    console.error('Error loading profile:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

app.get('/api/creator-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);
    const userResult = await fetchUserInfo(req, headers);
    if (userResult.error) {
      return res.status(userResult.error.status || 429).json(userResult.error);
    }

    const userUuid = userResult.data.uuid;
    const creatorPaths = [
      '/creators/me',
      '/creator/me',
      userUuid ? `/creators/${userUuid}` : null
    ].filter(Boolean);

    const creatorResponse = await fanvueRequestWithFallbackPaths(
      'get',
      creatorPaths,
      { headers }
    );

    const creatorRateLimitError = handleRateLimit(creatorResponse);
    if (creatorRateLimitError) {
      return res.status(429).json(creatorRateLimitError);
    }

    if (creatorResponse.status !== 200) {
      return res.status(creatorResponse.status).json({
        error: 'Failed to load creator profile',
        details: {
          response: creatorResponse.data || null,
          tried: creatorPaths
        }
      });
    }

    return res.json({ creator: creatorResponse.data });
  } catch (error) {
    console.error('Error loading creator profile:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

app.get('/api/conversations', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);
    const userResult = await fetchUserInfo(req, headers);
    if (userResult.error) {
      return res.status(userResult.error.status || 429).json(userResult.error);
    }

    const userUuid = userResult.data.uuid;
    if (!userUuid) {
      return res.status(400).json({ error: 'User UUID not found' });
    }

    const conversationsResponse = await fanvueRequest(
      'get',
      '/chats',
      { headers }
    );

    const conversationsRateLimitError = handleRateLimit(conversationsResponse);
    if (conversationsRateLimitError) {
      return res.status(429).json(conversationsRateLimitError);
    }

    if (conversationsResponse.status !== 200) {
      return res.status(conversationsResponse.status).json({
        error: 'Failed to load conversations',
        details: {
          response: conversationsResponse.data || null
        }
      });
    }

    const conversations = conversationsResponse.data?.data || conversationsResponse.data || [];
    const formatted = Array.isArray(conversations)
      ? conversations.map((chat) => ({
          uuid: chat.user?.uuid || chat.uuid,
          label: chat.user?.username || chat.user?.handle || chat.title || chat.name || chat.uuid
        }))
      : [];

    return res.json({ conversations: formatted });
  } catch (error) {
    console.error('Error loading conversations:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

app.get('/api/messages/:userUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userUuid = req.params.userUuid;
  if (!userUuid) {
    return res.status(400).json({ error: 'User UUID is required' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);

    const messagesResponse = await fanvueRequest(
      'get',
      `/chats/${userUuid}/messages`,
      { headers }
    );

    const messagesRateLimitError = handleRateLimit(messagesResponse);
    if (messagesRateLimitError) {
      return res.status(429).json(messagesRateLimitError);
    }

    if (messagesResponse.status !== 200) {
      return res.status(messagesResponse.status).json({
        error: 'Failed to load messages',
        details: {
          response: messagesResponse.data || null
        }
      });
    }

    let messages = messagesResponse.data?.data || messagesResponse.data || [];

    // DEBUG: Log raw message with all fields to find correct timestamp field
    console.log('[Messages] Raw messages count:', messages.length);
    if (Array.isArray(messages) && messages.length > 0) {
      console.log('[Messages] FIRST MESSAGE - ALL FIELDS:');
      console.log(JSON.stringify(messages[0], null, 2));
    }

    // Sort messages by sentAt timestamp (oldest first) for consistent ordering
    // Fanvue uses "sentAt" for messages, not "createdAt"
    if (Array.isArray(messages)) {
      messages = messages.sort((a, b) => {
        const timeA = new Date(a.sentAt || a.createdAt || a.created_at || 0).getTime();
        const timeB = new Date(b.sentAt || b.createdAt || b.created_at || 0).getTime();
        return timeA - timeB;
      });
      console.log('[Messages] After sorting - first message:', messages[0]?.text?.substring(0, 40), messages[0]?.sentAt);
      console.log('[Messages] After sorting - last message:', messages[messages.length - 1]?.text?.substring(0, 40), messages[messages.length - 1]?.sentAt);
    }

    // Get creator UUID (the logged-in user) to help frontend determine who sent media
    let creatorUuid = null;
    if (req.session.userUuid) {
      creatorUuid = req.session.userUuid;
    } else {
      // Fetch from /users/me endpoint
      try {
        const userResult = await fetchUserInfo(req, headers);
        if (!userResult.error && userResult.data?.uuid) {
          creatorUuid = userResult.data.uuid;
          req.session.userUuid = creatorUuid; // Cache for future requests
        }
      } catch (err) {
        console.error('[Messages] Could not fetch creator UUID:', err.message);
      }
    }

    console.log('[Messages] Creator UUID:', creatorUuid);
    return res.json({ messages: messages, creatorUuid: creatorUuid });
  } catch (error) {
    console.error('Error loading messages:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

// Get media from a chat conversation
app.get('/api/chat-media/:chatId', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const chatId = req.params.chatId;
  if (!chatId) {
    return res.status(400).json({ error: 'Chat ID is required' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);

    const mediaResponse = await fanvueRequest(
      'get',
      `/chats/${chatId}/media`,
      { headers }
    );

    const mediaRateLimitError = handleRateLimit(mediaResponse);
    if (mediaRateLimitError) {
      return res.status(429).json(mediaRateLimitError);
    }

    if (mediaResponse.status !== 200) {
      console.log('[Chat Media] API response:', mediaResponse.status, mediaResponse.data);
      return res.status(mediaResponse.status).json({
        error: 'Failed to load chat media',
        details: {
          response: mediaResponse.data || null
        }
      });
    }

    let media = mediaResponse.data?.data || mediaResponse.data || [];

    // DEBUG: Log raw media timestamps
    console.log('[Chat Media] Raw media count:', media.length);
    if (Array.isArray(media) && media.length > 0) {
      console.log('[Chat Media] Sample media timestamps:');
      media.slice(0, 5).forEach((m, i) => {
        console.log(`  [${i}] created_at: ${m.created_at}, sentAt: ${m.sentAt}, name: "${m.name}"`);
      });
    }

    // Sort media by createdAt timestamp (oldest first) for consistent ordering
    if (Array.isArray(media)) {
      media = media.sort((a, b) => {
        const timeA = new Date(a.created_at || a.createdAt || a.sentAt || 0).getTime();
        const timeB = new Date(b.created_at || b.createdAt || b.sentAt || 0).getTime();
        return timeA - timeB;
      });
      console.log('[Chat Media] After sorting - first media:', media[0]?.name, media[0]?.created_at);
      console.log('[Chat Media] After sorting - last media:', media[media.length - 1]?.name, media[media.length - 1]?.created_at);
    }

    console.log('[Chat Media] Loaded', Array.isArray(media) ? media.length : 0, 'media items for chat:', chatId);
    // Log first media item structure to understand the data
    if (Array.isArray(media) && media.length > 0) {
      console.log('[Chat Media] Sample media item structure:', JSON.stringify(media[0], null, 2));
    }
    return res.json({ media: media });
  } catch (error) {
    console.error('Error loading chat media:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const message = req.body.message;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);
    const userResult = await fetchUserInfo(req, headers);
    if (userResult.error) {
      return res.status(userResult.error.status || 429).json(userResult.error);
    }

    const userUuid = userResult.data.uuid;

    if (!userUuid) {
      return res.status(400).json({ error: 'User UUID not found' });
    }

    const recipientUuid = req.body.conversationUuid;
    if (!recipientUuid) {
      return res.status(400).json({
        error: 'Please select a conversation before sending a message.'
      });
    }

    const sendResponse = await fanvueRequest(
      'post',
      `/chats/${recipientUuid}/message`,
      { data: { text: message }, headers }
    );

    const sendRateLimitError = handleRateLimit(sendResponse);
    if (sendRateLimitError) {
      return res.status(429).json(sendRateLimitError);
    }

    if (sendResponse.status === 200 || sendResponse.status === 201) {
      // Track message sent (not AI)
      trackMessageSent(req.session, recipientUuid, false);

      return res.json({
        response: `Message sent successfully! Your message: "${message}"`
      });
    }

    // Track message sent (not AI)
    trackMessageSent(req.session, recipientUuid, false);

    return res.json({
      response: `Your message: "${message}" was received.`
    });

  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

// Send PPV media message (image/video with price)
// Send media (free or PPV)
app.post('/api/send-media', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid, mediaUuid, price, message } = req.body;

  if (!conversationUuid) {
    return res.status(400).json({ error: 'conversationUuid is required' });
  }
  if (!mediaUuid) {
    return res.status(400).json({ error: 'mediaUuid is required' });
  }

  const priceInDollars = parseFloat(price) || 0;
  const priceInCents = Math.round(priceInDollars * 100); // Convert to cents
  const isFree = priceInCents === 0;

  try {
    let headers = buildAuthHeaders(req.session.access_token);

    // Build payload - different for free vs PPV
    let payload;
    if (isFree) {
      // Free media - just attach the media
      payload = {
        text: message || '',
        mediaUuids: [mediaUuid]
      };
      console.log('[Media Send] Sending FREE media:', mediaUuid);
    } else {
      // PPV media - include price in cents
      payload = {
        text: message || '',
        mediaUuids: [mediaUuid],
        price: priceInCents // Price in cents (e.g., $3 = 300)
      };
      console.log('[Media Send] Sending PPV media:', mediaUuid, 'at', priceInCents, 'cents ($' + priceInDollars + ')');
    }

    console.log('[Media Send] Payload:', JSON.stringify(payload, null, 2));

    const sendResponse = await fanvueRequest(
      'post',
      `/chats/${conversationUuid}/message`,
      { data: payload, headers }
    );

    console.log('[Media Send] Response status:', sendResponse.status);
    console.log('[Media Send] Response data:', JSON.stringify(sendResponse.data, null, 2));

    if (sendResponse.status === 200 || sendResponse.status === 201) {
      // Track the media sent
      if (isFree) {
        await trackMediaSent(conversationUuid, mediaUuid, 'free');
      } else {
        await trackPPVSent(conversationUuid, mediaUuid, priceInDollars);
        await trackMediaSent(conversationUuid, mediaUuid, 'ppv');
      }

      return res.json({
        success: true,
        message: isFree ? 'Media sent successfully!' : 'PPV sent successfully!',
        response: sendResponse.data
      });
    }

    // If failed, return the error for debugging
    return res.status(sendResponse.status || 400).json({
      error: isFree ? 'Failed to send media' : 'Failed to send PPV',
      details: sendResponse.data,
      attemptedPayload: payload,
      hint: 'Check the Fanvue API documentation for the correct format.'
    });

  } catch (error) {
    console.error('[Media Send] Error:', error.response?.data || error.message);
    return res.status(500).json({
      error: error.response?.data?.message || error.message,
      details: error.response?.data
    });
  }
});

// Legacy endpoint - redirect to send-media
app.post('/api/send-ppv', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid, mediaUuid, price, message } = req.body;

  if (!conversationUuid) {
    return res.status(400).json({ error: 'conversationUuid is required' });
  }
  if (!mediaUuid) {
    return res.status(400).json({ error: 'mediaUuid is required' });
  }
  if (!price || isNaN(parseFloat(price))) {
    return res.status(400).json({ error: 'Valid price is required' });
  }

  const priceInDollars = parseFloat(price);
  const priceInCents = Math.round(priceInDollars * 100); // Convert to cents

  try {
    let headers = buildAuthHeaders(req.session.access_token);

    // PPV payload with price in cents
    const payload = {
      text: message || '',
      mediaUuids: [mediaUuid],
      price: priceInCents // Price in cents (e.g., $3 = 300)
    };

    console.log('[PPV Send] Sending PPV:', mediaUuid, 'at', priceInCents, 'cents ($' + priceInDollars + ')');
    console.log('[PPV Send] Payload:', JSON.stringify(payload, null, 2));

    const sendResponse = await fanvueRequest(
      'post',
      `/chats/${conversationUuid}/message`,
      { data: payload, headers }
    );

    console.log('[PPV Send] Response status:', sendResponse.status);
    console.log('[PPV Send] Response data:', JSON.stringify(sendResponse.data, null, 2));

    if (sendResponse.status === 200 || sendResponse.status === 201) {
      // Track the PPV sent
      await trackPPVSent(conversationUuid, mediaUuid, priceInDollars);
      await trackMediaSent(conversationUuid, mediaUuid, 'ppv');

      return res.json({
        success: true,
        message: 'PPV sent successfully!',
        response: sendResponse.data
      });
    }

    // If failed, return the error for debugging
    return res.status(sendResponse.status || 400).json({
      error: 'Failed to send PPV',
      details: sendResponse.data,
      attemptedPayload: payload,
      hint: 'Price must be in cents (min 300 = $3). Media UUID must be valid.'
    });

  } catch (error) {
    console.error('[PPV Send] Error:', error.response?.data || error.message);
    return res.status(500).json({
      error: error.response?.data?.message || error.message,
      details: error.response?.data
    });
  }
});

// Explore API endpoint for testing PPV format
app.post('/api/explore-send', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid, payload } = req.body;

  if (!conversationUuid || !payload) {
    return res.status(400).json({ error: 'conversationUuid and payload are required' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);

    console.log('[Explore Send] Testing payload:', JSON.stringify(payload, null, 2));

    const sendResponse = await fanvueRequest(
      'post',
      `/chats/${conversationUuid}/message`,
      { data: payload, headers }
    );

    console.log('[Explore Send] Response status:', sendResponse.status);
    console.log('[Explore Send] Response data:', JSON.stringify(sendResponse.data, null, 2));

    return res.json({
      status: sendResponse.status,
      data: sendResponse.data
    });

  } catch (error) {
    console.error('[Explore Send] Error:', error.response?.data || error.message);
    return res.status(500).json({
      error: error.message,
      details: error.response?.data
    });
  }
});

app.post('/api/ai-generate-reply', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationHistory, systemPrompt, userProfile, creatorProfile, subscriberMemory, conversationUuid, subscriberHandle, chatMedia, preview } = req.body;

  if (!conversationHistory || !Array.isArray(conversationHistory)) {
    return res.status(400).json({ error: 'Conversation history is required' });
  }

  // Check usage limits before making expensive AI call
  if (req.session.userId) {
    const plan = req.session.subscription?.plan || 'starter';
    const { allowed, usage, limits } = await checkUsageLimits(req.session.userId, plan);
    if (!allowed) {
      return res.status(429).json({
        error: 'Monthly AI request limit reached',
        usage,
        limits,
        message: `You've used ${usage.ai_requests}/${limits.ai_requests} AI requests this month.`
      });
    }
  }

  try {
    // Get media descriptions for subscriber messages (if media was provided)
    let mediaDescriptions = {};
    if (chatMedia && Array.isArray(chatMedia) && chatMedia.length > 0) {
      console.log('[AI Reply] Processing media descriptions for', chatMedia.length, 'media items...');
      mediaDescriptions = await getMediaDescriptionsForMessages(conversationHistory, chatMedia);
      console.log('[AI Reply] Got descriptions for', Object.keys(mediaDescriptions).length, 'messages with media');
    }

    // Detect if the latest subscriber message is requesting media content
    const latestSubscriberMsg = [...conversationHistory].reverse().find(m => !m.isSentByYou);
    const mediaRequest = latestSubscriberMsg ? detectMediaRequest(latestSubscriberMsg.text || '') : { detected: false };

    // Load conversation state if we have a conversation UUID
    let conversationState = null;
    if (conversationUuid && req.session.userEmail) {
      conversationState = await getConversationState(conversationUuid, req.session.userEmail);
      if (conversationState) {
        console.log('[AI Reply] Loaded conversation state for:', conversationUuid);
      }
    }

    // Load vault awareness context (available media for teasing and sending)
    let vaultContext = '';
    let vaultMediaList = [];
    let currentPPVPricing = null;
    console.log('[AI Reply] Vault awareness check:', { conversationUuid, vaultEnabled: req.session.vaultAwarenessEnabled });
    if (conversationUuid && req.session.vaultAwarenessEnabled !== false) {
      try {
        console.log('[AI Reply] Loading vault context for userEmail:', req.session.userEmail);
        // Get ALL media from vault (not just unsent) - AI can re-send free content
        const allMedia = await getCreatorMediaLibrary(req.session.access_token, false, req.session.userEmail);
        const sentMedia = await getMediaSentToSubscriber(conversationUuid);
        console.log('[AI Reply] Vault media check:', allMedia.length, 'total in vault,', sentMedia.length, 'already sent to this subscriber');

        // Calculate dynamic PPV pricing for this subscriber
        currentPPVPricing = await calculateNextPPVPrice(conversationUuid);
        console.log('[AI Reply] PPV pricing calculated:', currentPPVPricing);

        // Get folder prefixes from session
        const sfwPrefix = req.session.sfwFolderPrefix || '';
        const ppvPrefix = req.session.ppvFolderPrefix || '';

        // Pass ALL media to context builder - it will mark sent items appropriately
        const vaultData = buildVaultContextForAI(allMedia, sentMedia, true, currentPPVPricing, sfwPrefix, ppvPrefix);
        vaultContext = vaultData.context;
        vaultMediaList = vaultData.mediaList;
        if (vaultContext) {
          console.log('[AI Reply] Vault context loaded:', allMedia.length, 'total,', sentMedia.length, 'sent,', vaultMediaList.length, 'in AI list');
          if (sfwPrefix || ppvPrefix) {
            console.log('[AI Reply] Folder filtering active - SFW:', sfwPrefix || 'none', 'PPV:', ppvPrefix || 'none');
          }
        } else {
          console.log('[AI Reply] Vault context EMPTY - allMedia:', allMedia.length, 'items');
        }
      } catch (vaultError) {
        console.error('[AI Reply] Failed to load vault context:', vaultError.message);
      }
    }

    // Load tip tracking context
    let tipContext = '';
    if (conversationUuid && req.session.tipTrackingEnabled !== false) {
      try {
        const tipTracking = await getTipTracking(conversationUuid);
        tipContext = buildTipContextForAI(tipTracking);
        if (tipContext) {
          const daysSince = daysSinceLastTipRequest(tipTracking);
          console.log('[AI Reply] Tip context loaded:', daysSince.toFixed(1), 'days since last request');
        }
      } catch (tipError) {
        console.error('[AI Reply] Failed to load tip context:', tipError.message);
      }
    }

    // Load PPV awareness context
    let ppvContext = '';
    if (conversationUuid && req.session.ppvAwarenessEnabled !== false) {
      try {
        const ppvStats = await getPPVStats(conversationUuid);
        const availableMedia = await getCreatorMediaLibrary(req.session.access_token);
        ppvContext = buildPPVContextForAI(ppvStats, availableMedia);
        if (ppvContext) {
          console.log('[AI Reply] PPV context loaded:', ppvStats.totalSent, 'sent,', ppvStats.totalPurchased, 'purchased');
        }
      } catch (ppvError) {
        console.error('[AI Reply] Failed to load PPV context:', ppvError.message);
      }
    }

    // Build enhanced system prompt with creator persona and user profile
    let enhancedSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

    // Add creator persona information
    if (creatorProfile && (creatorProfile.name || creatorProfile.vibe)) {
      enhancedSystemPrompt += `\n\n=== YOUR PERSONA ===
You are roleplaying as ${creatorProfile.name || 'a content creator'}.`;

      if (creatorProfile.age) {
        enhancedSystemPrompt += `\nAge: ${creatorProfile.age}`;
      }
      if (creatorProfile.physical) {
        enhancedSystemPrompt += `\nPhysical Description: ${creatorProfile.physical}`;
      }
      if (creatorProfile.vibe) {
        enhancedSystemPrompt += `\nPersonality/Vibe: ${creatorProfile.vibe}`;
      }
      if (creatorProfile.accent) {
        enhancedSystemPrompt += `\nLanguage Style/Accent: ${creatorProfile.accent}`;
      }
      if (creatorProfile.facts) {
        enhancedSystemPrompt += `\nBackground/Facts: ${creatorProfile.facts}`;
      }
      if (creatorProfile.other) {
        enhancedSystemPrompt += `\nAdditional Context: ${creatorProfile.other}`;
      }

      // Add current time/location awareness
      if (creatorProfile.timezone) {
        const timeInfo = getCurrentTimeFormatted(creatorProfile.timezone, creatorProfile.location);
        if (timeInfo) {
          enhancedSystemPrompt += `\n\n=== TIME & LOCATION ===\n${timeInfo}`;
        }
      }

      enhancedSystemPrompt += `\n\nStay in character and respond naturally as this person would.`;
    }

    // === CONTINUITY RULES (CRITICAL) ===
    const hasHistory = subscriberMemory || conversationState || conversationHistory.length > 2;
    if (hasHistory) {
      enhancedSystemPrompt += `\n\n=== CONTINUITY RULES (CRITICAL) ===
This is an ONGOING conversation. You have been talking to this person.
- NEVER treat this as first contact
- NEVER introduce yourself or say "nice to meet you"
- NEVER use generic greetings like "Hey there!" or "Hi! How are you?" unless they greeted first
- Continue the conversation naturally from where it left off
- Reference the current topic/thread directly
- If there are open loops (pending questions/topics), address them`;
    }

    // === SUBSCRIBER FACTS (stable long-term memory) ===
    if (subscriberMemory) {
      enhancedSystemPrompt += `\n\n=== SUBSCRIBER FACTS (Who they are - stable) ===`;

      if (subscriberMemory.summary) {
        enhancedSystemPrompt += `\nRelationship: ${subscriberMemory.summary}`;
      }
      if (subscriberMemory.key_facts && subscriberMemory.key_facts.length > 0) {
        enhancedSystemPrompt += `\nKey Facts: ${subscriberMemory.key_facts.join('; ')}`;
      }
      if (subscriberMemory.personality) {
        enhancedSystemPrompt += `\nTheir Personality: ${subscriberMemory.personality}`;
      }
      if (subscriberMemory.interests && subscriberMemory.interests.length > 0) {
        enhancedSystemPrompt += `\nTheir Interests: ${subscriberMemory.interests.join(', ')}`;
      }
      if (subscriberMemory.total_messages) {
        enhancedSystemPrompt += `\nMessages Exchanged: ${subscriberMemory.total_messages}`;
      }
    }

    // === CONVERSATION STATE (dynamic - what's happening NOW) ===
    if (conversationState) {
      enhancedSystemPrompt += `\n\n=== CONVERSATION STATE (What's happening NOW - dynamic) ===`;

      if (conversationState.current_thread) {
        enhancedSystemPrompt += `\nCurrent Thread: ${conversationState.current_thread}`;
      }
      if (conversationState.open_loops && conversationState.open_loops.length > 0) {
        enhancedSystemPrompt += `\nOpen Loops (address these): ${conversationState.open_loops.join('; ')}`;
      }
      if (conversationState.conversation_stage) {
        enhancedSystemPrompt += `\nConversation Stage: ${conversationState.conversation_stage}`;
      }
      if (conversationState.relationship_temperature) {
        enhancedSystemPrompt += `\nRelationship Temperature: ${conversationState.relationship_temperature}`;
      }
      if (conversationState.do_not_break && conversationState.do_not_break.length > 0) {
        enhancedSystemPrompt += `\nDo Not Break (maintain these): ${conversationState.do_not_break.join('; ')}`;
      }
      if (conversationState.last_assistant_message) {
        enhancedSystemPrompt += `\nYour Last Message Was: "${conversationState.last_assistant_message}"`;
      }
      if (conversationState.last_user_message) {
        enhancedSystemPrompt += `\nTheir Last Message Was: "${conversationState.last_user_message}"`;
      }
    }

    // Add subscriber profile information (fallback if no memory)
    if (userProfile && !subscriberMemory) {
      enhancedSystemPrompt += `\n\n=== SUBSCRIBER PROFILE ===
- Summary: ${userProfile.summary}
- Personality: ${userProfile.personality}
- Interests: ${userProfile.interests?.join(', ') || 'Not yet identified'}
- Key Facts: ${userProfile.facts?.join('; ') || 'None recorded'}`;

      if (userProfile.manualNotes) {
        enhancedSystemPrompt += `\n- Important Notes: ${userProfile.manualNotes}`;
      }
    }

    // Detect conversation tone to help AI decide PPV vs free
    const conversationTone = detectConversationTone(conversationHistory);
    let toneGuidance = '';

    if (conversationTone === 'sexual') {
      toneGuidance = '\n\n=== CONVERSATION TONE: SEXUAL ===\nThis conversation is HOT and sexual. Perfect time to send PPV content! They\'re in the mood.';
    } else if (conversationTone === 'flirty_sexual') {
      toneGuidance = '\n\n=== CONVERSATION TONE: FLIRTY/SEXUAL ===\nThings are getting spicy. Good opportunity for PPV if you want to escalate.';
    } else if (conversationTone === 'flirty') {
      toneGuidance = '\n\n=== CONVERSATION TONE: FLIRTY ===\nPlayful and flirty vibes. You could send a free teaser or hint at PPV content.';
    } else if (conversationTone === 'casual') {
      toneGuidance = '\n\n=== CONVERSATION TONE: CASUAL ===\nJust chatting. Perfect for FREE content to build rapport. Save PPV for when things heat up.';
    } else if (conversationTone === 'warm') {
      toneGuidance = '\n\n=== CONVERSATION TONE: WARM ===\nFriendly and warm. Free content works well here.';
    }

    if (toneGuidance) {
      enhancedSystemPrompt += toneGuidance;
    }

    // Add vault awareness context (available content for teasing)
    if (vaultContext) {
      enhancedSystemPrompt += vaultContext;
    }

    // Add tip tracking context
    if (tipContext) {
      enhancedSystemPrompt += tipContext;
    }

    // Add PPV awareness context
    if (ppvContext) {
      enhancedSystemPrompt += ppvContext;
    }

    // When we have memory/state, we can use fewer recent messages
    const recentMessageCount = (subscriberMemory || conversationState) ? 4 : 7;
    const recentMessages = conversationHistory.slice(-recentMessageCount);

    // Build the instruction block
    const creatorName = creatorProfile?.name || 'the content creator';
    let instruction = `\n\n=== INSTRUCTION ===
You are ${creatorName}. `;

    if (conversationState?.current_thread) {
      instruction += `Continue the current thread about "${conversationState.current_thread}". `;
    } else if (subscriberMemory) {
      instruction += `You have history with this subscriber. `;
    }

    instruction += `Respond naturally to their latest message. Be concise and in character.`;

    const messages = [
      {
        role: 'system',
        content: enhancedSystemPrompt + instruction
      },
      ...recentMessages.map(msg => {
        const msgUuid = msg.uuid || msg.id;
        let content = msg.text || '';

        // Add media descriptions for subscriber messages
        if (!msg.isSentByYou && msgUuid && mediaDescriptions[msgUuid]) {
          const descs = mediaDescriptions[msgUuid];
          if (descs.length > 0) {
            const mediaText = descs.length === 1
              ? `[Sent media: ${descs[0]}]`
              : `[Sent ${descs.length} media items: ${descs.join(' | ')}]`;

            // Prepend media description to message content
            content = content ? `${mediaText}\n${content}` : mediaText;
          }
        }

        // Also note if creator sent media (simpler notation)
        if (msg.isSentByYou && msg.hasMedia) {
          const mediaNote = '[You sent media]';
          content = content ? `${mediaNote}\n${content}` : mediaNote;
        }

        return {
          role: msg.isSentByYou ? 'assistant' : 'user',
          content: content
        };
      })
    ];

    // Use configurable token limits, temperature, and model
    const maxTokens = req.session.maxReplyTokens || 150;
    const temperature = req.session.replyTemperature !== undefined ? req.session.replyTemperature : 0.9;
    const aiModel = req.session.aiModel || 'gpt-4o';

    // Log what we're sending to AI
    console.log('[AI Reply] Sending to OpenAI:', {
      model: aiModel,
      maxTokens,
      hasVaultContext: !!vaultContext,
      vaultMediaListCount: vaultMediaList.length,
      systemPromptLength: (enhancedSystemPrompt + instruction).length,
      includesMediaInstructions: (enhancedSystemPrompt + instruction).includes('[SEND_MEDIA:')
    });

    const completion = await openai.chat.completions.create({
      model: aiModel,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
    });

    let reply = completion.choices[0]?.message?.content || '';

    // Track AI usage for billing/limits
    if (req.session.userId) {
      const tokensUsed = (completion.usage?.total_tokens) || 0;
      trackAIRequest(req.session.userId, tokensUsed).catch(err =>
        console.error('[Usage] Failed to track AI request:', err.message)
      );
    }

    // Check if AI wants to send media (free or PPV)
    let mediaSent = null;
    if (vaultMediaList.length > 0 && (reply.includes('[SEND_MEDIA:') || reply.includes('[SEND_PPV:'))) {
      const parsed = parseMediaSendCommand(reply, vaultMediaList);
      reply = parsed.text; // Clean text without the command

      if (parsed.mediaToSend && conversationUuid) {
        const mediaUuid = parsed.mediaToSend.uuid;
        const headers = buildAuthHeaders(req.session.access_token);

        if (parsed.isPPV) {
          // Send as PPV with dynamic pricing
          const ppvPrice = currentPPVPricing?.price || 3;
          const priceInCents = Math.round(ppvPrice * 100);

          console.log('[AI Reply] AI wants to send PPV:', parsed.mediaToSend.shortId, 'at $' + ppvPrice, '(' + priceInCents + ' cents)');

          // Preview mode: don't send, just return what would be sent
          if (preview) {
            console.log('[AI Reply] Preview mode - NOT sending PPV, returning mediaToSend');
            return res.json({
              reply: reply,
              mediaRequestDetected: mediaRequest.detected,
              mediaRequestType: mediaRequest.type,
              mediaToSend: { uuid: mediaUuid, shortId: parsed.mediaToSend.shortId, type: 'ppv', price: ppvPrice },
              note: 'Preview mode - PPV not sent yet'
            });
          }

          fanvueRequest('post', `/chats/${conversationUuid}/message`, {
            data: {
              text: reply || 'Here you go 😘',
              mediaUuids: [mediaUuid],
              price: priceInCents
            },
            headers
          }).then(async (sendResponse) => {
            if (sendResponse.status === 200 || sendResponse.status === 201) {
              console.log('[AI Reply] PPV sent successfully:', mediaUuid, 'at $' + ppvPrice);
              await trackPPVSent(conversationUuid, mediaUuid, ppvPrice);
              await trackMediaSent(conversationUuid, mediaUuid, 'ai_ppv');
              mediaSent = { uuid: mediaUuid, shortId: parsed.mediaToSend.shortId, type: 'ppv', price: ppvPrice };
            } else {
              console.error('[AI Reply] Failed to send PPV:', sendResponse.data);
            }
          }).catch(err => {
            console.error('[AI Reply] Error sending PPV:', err.message);
          });

          // Return early with PPV info
          return res.json({
            reply: reply,
            mediaRequestDetected: mediaRequest.detected,
            mediaRequestType: mediaRequest.type,
            mediaSent: { uuid: mediaUuid, shortId: parsed.mediaToSend.shortId, type: 'ppv', price: ppvPrice },
            note: 'AI is sending PPV at $' + ppvPrice
          });
        } else {
          // Send as free media
          console.log('[AI Reply] AI wants to send FREE media:', parsed.mediaToSend.shortId, parsed.mediaToSend.uuid);

          // Preview mode: don't send, just return what would be sent
          if (preview) {
            console.log('[AI Reply] Preview mode - NOT sending free media, returning mediaToSend');
            return res.json({
              reply: reply,
              mediaRequestDetected: mediaRequest.detected,
              mediaRequestType: mediaRequest.type,
              mediaToSend: { uuid: mediaUuid, shortId: parsed.mediaToSend.shortId, type: 'free' },
              note: 'Preview mode - free media not sent yet'
            });
          }

          fanvueRequest('post', `/chats/${conversationUuid}/message`, {
            data: {
              text: reply || 'Here you go 😘',
              mediaUuids: [mediaUuid]
            },
            headers
          }).then(async (sendResponse) => {
            if (sendResponse.status === 200 || sendResponse.status === 201) {
              console.log('[AI Reply] Free media sent successfully:', mediaUuid);
              await trackMediaSent(conversationUuid, mediaUuid, 'ai_sent');
              mediaSent = { uuid: mediaUuid, shortId: parsed.mediaToSend.shortId, type: 'free' };
            } else {
              console.error('[AI Reply] Failed to send media:', sendResponse.data);
            }
          }).catch(err => {
            console.error('[AI Reply] Error sending media:', err.message);
          });

          // Return early with media info
          return res.json({
            reply: reply,
            mediaRequestDetected: mediaRequest.detected,
            mediaRequestType: mediaRequest.type,
            mediaSent: { uuid: mediaUuid, shortId: parsed.mediaToSend.shortId, type: 'free' },
            note: 'AI is sending free media with this message'
          });
        }
      }
    }

    // After generating reply, extract and save new conversation state
    // This runs asynchronously - we don't wait for it
    if (conversationUuid && reply && req.session.userEmail) {
      // Add the new reply to conversation history for state extraction
      const updatedHistory = [...conversationHistory, { isSentByYou: true, text: reply }];
      const creatorEmail = req.session.userEmail; // Capture for promise chain

      // Extract state in background (don't await - fire and forget)
      extractConversationState(updatedHistory, conversationState)
        .then(newState => {
          if (newState) {
            saveConversationState(conversationUuid, creatorEmail, newState)
              .then(() => console.log('[AI Reply] Conversation state updated for:', conversationUuid))
              .catch(err => console.error('[AI Reply] Failed to save state:', err));
          }
        })
        .catch(err => console.error('[AI Reply] Failed to extract state:', err));
    }

    // If a media request was detected, save it to the notification queue
    if (mediaRequest.detected && conversationUuid && req.session.userEmail) {
      const handle = subscriberHandle || subscriberMemory?.subscriber_handle || 'unknown';
      saveContentRequest({
        conversationUuid: conversationUuid,
        subscriberHandle: handle,
        requestType: mediaRequest.type,
        originalMessage: latestSubscriberMsg?.text || '',
        aiResponse: reply,
        personaName: creatorProfile?.name || 'Unknown'
      }, req.session.userEmail).then(() => {
        console.log('[AI Reply] Media request logged:', mediaRequest.type, 'from', handle);
      }).catch(err => {
        console.error('[AI Reply] Failed to save content request:', err);
      });
    }

    return res.json({ reply: reply, mediaRequestDetected: mediaRequest.detected, mediaRequestType: mediaRequest.type });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return res.status(500).json({
      error: 'Failed to generate AI reply',
      details: error.message
    });
  }
});
// ============================================
// CHATS CONTROL SETTINGS API ENDPOINTS
// ============================================

// Get chats control settings
app.get('/api/chats-settings', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({
    operationMode: req.session.operationMode || 'manual',
    feedRefreshInterval: req.session.feedRefreshInterval || 30,
    autoCheckMessages: req.session.autoCheckMessages !== false,
    replyDelay: req.session.replyDelay || { min: 30, max: 180 }
  });
});

// Update chats control settings
app.post('/api/chats-settings', async (req, res) => {
  if (!req.session.access_token || !req.session.userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { operationMode, feedRefreshInterval, autoCheckMessages, replyDelay } = req.body;

  // Update session
  if (operationMode !== undefined) {
    req.session.operationMode = operationMode;
  }
  if (feedRefreshInterval !== undefined) {
    req.session.feedRefreshInterval = feedRefreshInterval;
  }
  if (autoCheckMessages !== undefined) {
    req.session.autoCheckMessages = autoCheckMessages;
  }
  if (replyDelay !== undefined) {
    req.session.replyDelay = replyDelay;
  }

  // Save to database
  const settingsToSave = {};
  if (operationMode !== undefined) settingsToSave.operation_mode = operationMode;
  if (feedRefreshInterval !== undefined) settingsToSave.feed_refresh_interval = feedRefreshInterval;
  if (autoCheckMessages !== undefined) settingsToSave.auto_check_messages = autoCheckMessages;
  if (replyDelay !== undefined) settingsToSave.reply_delay = replyDelay;

  if (Object.keys(settingsToSave).length > 0) {
    await saveAISettings(req.session.userEmail, settingsToSave);
  }

  return res.json({
    success: true,
    operationMode: req.session.operationMode || 'manual',
    feedRefreshInterval: req.session.feedRefreshInterval || 30,
    autoCheckMessages: req.session.autoCheckMessages !== false,
    replyDelay: req.session.replyDelay || { min: 30, max: 180 }
  });
});

// ============================================
// AI SETTINGS API ENDPOINTS
// ============================================

// Get AI settings
app.get('/api/ai-settings', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({
    systemPrompt: req.session.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    aiMode: req.session.aiMode || 'manual', // 'manual', 'assisted', 'full'
    fastResponseMode: req.session.fastResponseMode !== undefined ? req.session.fastResponseMode : true,
    maxReplyTokens: req.session.maxReplyTokens || 150,
    maxProfileTokens: req.session.maxProfileTokens || 500,
    replyTemperature: req.session.replyTemperature !== undefined ? req.session.replyTemperature : 0.9,
    aiModel: req.session.aiModel || 'gpt-4o',
    profileModel: req.session.profileModel || 'gpt-4o'
  });
});

app.post('/api/ai-settings', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { systemPrompt, aiMode, fastResponseMode, maxReplyTokens, maxProfileTokens, replyTemperature, aiModel, profileModel } = req.body;

  if (systemPrompt !== undefined) {
    req.session.systemPrompt = systemPrompt;
  }
  if (aiMode !== undefined) {
    req.session.aiMode = aiMode;
  }
  if (fastResponseMode !== undefined) {
    req.session.fastResponseMode = fastResponseMode;
  }
  if (maxReplyTokens !== undefined) {
    req.session.maxReplyTokens = parseInt(maxReplyTokens);
  }
  if (maxProfileTokens !== undefined) {
    req.session.maxProfileTokens = parseInt(maxProfileTokens);
  }
  if (replyTemperature !== undefined) {
    req.session.replyTemperature = parseFloat(replyTemperature);
  }
  if (aiModel !== undefined) {
    req.session.aiModel = aiModel;
  }
  if (profileModel !== undefined) {
    req.session.profileModel = profileModel;
  }

  // Save to database if we have a user email
  if (req.session.userEmail) {
    const dbSettings = {
      system_prompt: req.session.systemPrompt,
      ai_mode: req.session.aiMode,
      max_reply_tokens: req.session.maxReplyTokens,
      max_profile_tokens: req.session.maxProfileTokens,
      reply_temperature: req.session.replyTemperature,
      ai_model: req.session.aiModel,
      profile_model: req.session.profileModel,
      fast_response_mode: req.session.fastResponseMode,
      active_persona_key: req.session.activePersonaKey
    };
    await saveAISettings(req.session.userEmail, dbSettings);
    console.log('[AI Settings] Saved to database for user:', req.session.userEmail);
  }

  return res.json({
    success: true,
    systemPrompt: req.session.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    aiMode: req.session.aiMode || 'manual',
    fastResponseMode: req.session.fastResponseMode !== undefined ? req.session.fastResponseMode : true,
    maxReplyTokens: req.session.maxReplyTokens || 150,
    maxProfileTokens: req.session.maxProfileTokens || 500,
    replyTemperature: req.session.replyTemperature !== undefined ? req.session.replyTemperature : 0.9,
    aiModel: req.session.aiModel || 'gpt-4o',
    profileModel: req.session.profileModel || 'gpt-4o'
  });
});

// ============================================
// PERSONA API ENDPOINTS (from Supabase)
// ============================================

// Get all personas from database
// Get the creator's persona (one persona per account)
app.get('/api/persona', async (req, res) => {
  if (!req.session.access_token || !req.session.userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const persona = await getCreatorPersona(req.session.userEmail);
  return res.json({
    persona: persona // Will be null if not yet created
  });
});

// Save/update the creator's persona
app.post('/api/persona', async (req, res) => {
  if (!req.session.access_token || !req.session.userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const personaData = req.body;
  const saved = await saveCreatorPersona(req.session.userEmail, personaData);

  if (!saved) {
    return res.status(500).json({ error: 'Failed to save persona' });
  }

  // Update session with new persona
  req.session.creatorProfile = saved;

  // Also set the persona's system prompt as the active system prompt
  if (saved.system_prompt) {
    req.session.systemPrompt = saved.system_prompt;
    console.log('[Persona] Updated system prompt for:', req.session.userEmail);
  }

  return res.json({
    success: true,
    persona: saved
  });
});

// ============================================
// SUBSCRIBER MEMORY API ENDPOINTS
// ============================================

// Get subscriber memory for a conversation
app.get('/api/subscriber-memory/:conversationUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.params;
  const memory = await getSubscriberMemory(conversationUuid, req.session.userEmail);

  return res.json({
    memory: memory || null
  });
});

// Save/update subscriber memory
app.post('/api/subscriber-memory/:conversationUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.params;
  const memoryData = req.body;

  const saved = await saveSubscriberMemory(conversationUuid, req.session.userEmail, memoryData);

  if (!saved) {
    return res.status(500).json({ error: 'Failed to save memory' });
  }

  return res.json({
    success: true,
    memory: saved
  });
});

// Generate/update memory using AI analysis
app.post('/api/subscriber-memory/:conversationUuid/generate', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.params;
  const headers = buildAuthHeaders(req.session.access_token);

  try {
    // Fetch messages for this conversation
    const messagesResponse = await fanvueRequest(
      'get',
      `/chats/${conversationUuid}/messages`,
      { headers }
    );

    if (messagesResponse.status !== 200) {
      return res.status(messagesResponse.status).json({
        error: 'Failed to load messages for memory generation'
      });
    }

    const allMessages = messagesResponse.data?.data || messagesResponse.data || [];
    console.log('[Memory API] Total messages fetched:', allMessages.length);

    // Get user profile to identify subscriber messages
    const userResult = await fanvueRequest('get', '/users/me', { headers });
    const myUserUuid = userResult.data?.uuid;

    // Format messages with sender identification
    const formattedMessages = allMessages.map(msg => ({
      text: msg.text,
      isSentByYou: msg.sender?.uuid === myUserUuid,
      handle: msg.sender?.handle
    })).filter(msg => msg.text); // Only messages with text

    // Get subscriber handle from the first subscriber message
    const subscriberMsg = formattedMessages.find(m => !m.isSentByYou);
    const subscriberHandle = subscriberMsg?.handle || 'unknown';

    // Get existing memory to update it
    const existingMemory = await getSubscriberMemory(conversationUuid, req.session.userEmail);

    // Generate new memory
    const memory = await generateConversationMemory(
      conversationUuid,
      formattedMessages,
      subscriberHandle,
      existingMemory,
      req.session.userEmail
    );

    if (!memory) {
      return res.status(500).json({ error: 'Failed to generate memory' });
    }

    return res.json({
      success: true,
      memory: memory
    });

  } catch (error) {
    console.error('[Memory API] Error:', error);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================
// CONTENT REQUEST NOTIFICATION ENDPOINTS
// ============================================

// Get all pending content requests
app.get('/api/content-requests', async (req, res) => {
  if (!req.session.access_token || !req.session.userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const requests = await getPendingContentRequests(req.session.userEmail);
  return res.json({ requests });
});

// Mark a content request as fulfilled
app.post('/api/content-requests/:id/fulfill', async (req, res) => {
  if (!req.session.access_token || !req.session.userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;
  const fulfilled = await fulfillContentRequest(parseInt(id), req.session.userEmail);

  if (!fulfilled) {
    return res.status(500).json({ error: 'Failed to fulfill request' });
  }

  return res.json({ success: true, request: fulfilled });
});

// Dismiss a content request
app.post('/api/content-requests/:id/dismiss', async (req, res) => {
  if (!req.session.access_token || !req.session.userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { id } = req.params;
  const dismissed = await dismissContentRequest(parseInt(id), req.session.userEmail);

  if (!dismissed) {
    return res.status(500).json({ error: 'Failed to dismiss request' });
  }

  return res.json({ success: true, request: dismissed });
});

// ============================================
// END DATABASE API ENDPOINTS
// ============================================

// Get creator profile
app.get('/api/creator-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({
    profile: req.session.creatorProfile || null,
    activePersonaKey: req.session.activePersonaKey || null
  });
});

// Save creator profile (and update database if a persona is active)
app.post('/api/creator-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  req.session.creatorProfile = req.body;

  // Also update session system prompt if provided
  if (req.body.system_prompt) {
    req.session.systemPrompt = req.body.system_prompt;
  }

  // If there's an active persona, update it in the database
  if (req.session.activePersonaKey) {
    const updates = {
      name: req.body.name,
      age: req.body.age,
      physical: req.body.physical,
      personality: req.body.personality,
      vibe: req.body.vibe,
      background: req.body.background,
      other: req.body.other,
      system_prompt: req.body.system_prompt
    };

    const updated = await updatePersona(req.session.activePersonaKey, updates);
    if (updated) {
      console.log('[Persona] Updated persona in database:', req.session.activePersonaKey);
    }
  }

  return res.json({
    success: true,
    profile: req.session.creatorProfile,
    savedToDatabase: !!req.session.activePersonaKey
  });
});

// Generate user profile summary using AI
app.post('/api/generate-user-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.body;

  if (!conversationUuid) {
    return res.status(400).json({ error: 'Conversation UUID is required' });
  }

  try {
    const headers = buildAuthHeaders(req.session.access_token);

    // Fetch messages for this conversation
    const messagesResponse = await fanvueRequest(
      'get',
      `/chats/${conversationUuid}/messages`,
      { headers }
    );

    if (messagesResponse.status !== 200) {
      return res.status(messagesResponse.status).json({
        error: 'Failed to load messages for profile generation'
      });
    }

    const allMessages = messagesResponse.data?.data || messagesResponse.data || [];
    console.log('[Profile Gen] Total messages fetched:', allMessages.length);

    // Get user profile
    const userResult = await fanvueRequest('get', '/users/me', { headers });
    const myUserUuid = userResult.data?.uuid;
    console.log('[Profile Gen] My UUID:', myUserUuid);

    // Filter to get only subscriber messages (not creator's messages)
    const subscriberMessages = allMessages
      .filter(msg => {
        const isNotMe = msg.sender?.uuid !== myUserUuid;
        const hasText = !!msg.text;
        console.log('[Profile Gen] Message from', msg.sender?.handle, '- isNotMe:', isNotMe, 'hasText:', hasText);
        return isNotMe && hasText;
      })
      .slice(0, 30); // Last 30 subscriber messages

    console.log('[Profile Gen] Filtered subscriber messages:', subscriberMessages.length);

    if (subscriberMessages.length === 0) {
      return res.json({
        profile: {
          summary: 'No messages yet to analyze.',
          interests: [],
          personality: 'Unknown',
          facts: []
        }
      });
    }

    // Build prompt for AI to analyze the user
    const analysisPrompt = `Analyze these messages from a subscriber and create a profile summary. Focus on:
1. Their interests and topics they talk about
2. Their personality traits and communication style
3. Important facts they've shared about themselves
4. Preferences or recurring themes

Messages:
${subscriberMessages.map((msg, i) => `${i + 1}. "${msg.text}"`).join('\n')}

Provide a JSON response with this structure:
{
  "summary": "2-3 sentence overview of this person",
  "interests": ["interest1", "interest2", ...],
  "personality": "brief personality description",
  "facts": ["fact1", "fact2", ...]
}`;

    console.log('[Profile Gen] Calling OpenAI API to analyze messages...');

    // Use configurable token limit and model for profile generation
    const maxProfileTokens = req.session.maxProfileTokens || 500;
    const profileModel = req.session.profileModel || 'gpt-4o';

    const completion = await openai.chat.completions.create({
      model: profileModel,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing conversations and creating accurate personality profiles. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      max_tokens: maxProfileTokens,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    console.log('[Profile Gen] OpenAI API call successful');

    const profileData = JSON.parse(completion.choices[0]?.message?.content || '{}');

    // Store in session (per-conversation)
    if (!req.session.userProfiles) {
      req.session.userProfiles = {};
    }
    req.session.userProfiles[conversationUuid] = {
      ...profileData,
      generatedAt: new Date().toISOString(),
      messageCount: subscriberMessages.length
    };

    return res.json({ profile: req.session.userProfiles[conversationUuid] });

  } catch (error) {
    console.error('[Profile Gen] Full error:', error);
    console.error('[Profile Gen] Error stack:', error.stack);
    return res.status(500).json({
      error: 'Failed to generate user profile',
      details: error.message
    });
  }
});

// Get stored user profile
app.get('/api/user-profile/:conversationUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.params;

  if (!req.session.userProfiles || !req.session.userProfiles[conversationUuid]) {
    return res.json({ profile: null });
  }

  return res.json({ profile: req.session.userProfiles[conversationUuid] });
});

// Save manual notes to user profile
app.post('/api/user-profile-notes', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid, notes } = req.body;

  if (!conversationUuid) {
    return res.status(400).json({ error: 'Conversation UUID is required' });
  }

  if (!req.session.userProfiles) {
    req.session.userProfiles = {};
  }

  if (!req.session.userProfiles[conversationUuid]) {
    req.session.userProfiles[conversationUuid] = {
      summary: '',
      interests: [],
      personality: '',
      facts: [],
      manualNotes: notes
    };
  } else {
    req.session.userProfiles[conversationUuid].manualNotes = notes;
  }

  return res.json({
    success: true,
    profile: req.session.userProfiles[conversationUuid]
  });
});

// Get creator profile
app.get('/api/creator-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({
    profile: req.session.creatorProfile || null
  });
});

// Save creator profile
app.post('/api/creator-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { profile } = req.body;

  if (!profile) {
    return res.status(400).json({ error: 'Profile data is required' });
  }

  req.session.creatorProfile = profile;

  return res.json({
    success: true,
    profile: req.session.creatorProfile
  });
});

// Track AI message sent
app.post('/api/analytics/track-ai-message', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.body;
  if (conversationUuid) {
    trackMessageSent(req.session, conversationUuid, true);
  }

  return res.json({ success: true });
});

// Analytics tracking functions
async function trackMessageSent(session, conversationUuid, isAI = false) {
  if (!session.analytics) {
    session.analytics = {
      messagesSent: 0,
      messagesReceived: 0,
      aiRepliesSent: 0,
      conversationStats: {},
      dailyStats: {}
    };
  }

  session.analytics.messagesSent++;
  if (isAI) {
    session.analytics.aiRepliesSent++;
  }

  // Track per-conversation
  if (!session.analytics.conversationStats[conversationUuid]) {
    session.analytics.conversationStats[conversationUuid] = {
      messagesSent: 0,
      messagesReceived: 0,
      aiReplies: 0,
      lastActivity: new Date().toISOString()
    };
  }
  session.analytics.conversationStats[conversationUuid].messagesSent++;
  if (isAI) {
    session.analytics.conversationStats[conversationUuid].aiReplies++;
  }
  session.analytics.conversationStats[conversationUuid].lastActivity = new Date().toISOString();

  // Track daily stats
  const today = new Date().toISOString().split('T')[0];
  if (!session.analytics.dailyStats[today]) {
    session.analytics.dailyStats[today] = {
      messagesSent: 0,
      messagesReceived: 0,
      aiReplies: 0
    };
  }
  session.analytics.dailyStats[today].messagesSent++;
  if (isAI) {
    session.analytics.dailyStats[today].aiReplies++;
  }

  // Save to database
  if (session.userEmail) {
    await saveAnalytics(session.userEmail, session.analytics);
  }
}

async function trackMessageReceived(session, conversationUuid) {
  if (!session.analytics) {
    session.analytics = {
      messagesSent: 0,
      messagesReceived: 0,
      aiRepliesSent: 0,
      conversationStats: {},
      dailyStats: {}
    };
  }

  session.analytics.messagesReceived++;

  // Track per-conversation
  if (!session.analytics.conversationStats[conversationUuid]) {
    session.analytics.conversationStats[conversationUuid] = {
      messagesSent: 0,
      messagesReceived: 0,
      aiReplies: 0,
      lastActivity: new Date().toISOString()
    };
  }
  session.analytics.conversationStats[conversationUuid].messagesReceived++;
  session.analytics.conversationStats[conversationUuid].lastActivity = new Date().toISOString();

  // Track daily stats
  const today = new Date().toISOString().split('T')[0];
  if (!session.analytics.dailyStats[today]) {
    session.analytics.dailyStats[today] = {
      messagesSent: 0,
      messagesReceived: 0,
      aiReplies: 0
    };
  }
  session.analytics.dailyStats[today].messagesReceived++;

  // Save to database
  if (session.userEmail) {
    await saveAnalytics(session.userEmail, session.analytics);
  }
}

// Get analytics data
app.get('/api/analytics', async (req, res) => {
  if (!req.session.access_token || !req.session.userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Load analytics from database
  const analytics = await getAnalytics(req.session.userEmail);

  // Also update session cache
  req.session.analytics = analytics;

  // Calculate additional metrics
  const totalMessages = analytics.messagesSent + analytics.messagesReceived;
  const activeConversations = Object.keys(analytics.conversationStats).length;

  // Get last 7 days of data
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayStats = analytics.dailyStats[dateStr] || { messagesSent: 0, messagesReceived: 0, aiReplies: 0 };
    last7Days.push({
      date: dateStr,
      ...dayStats
    });
  }

  // Find most active conversations
  const conversationArray = Object.entries(analytics.conversationStats).map(([uuid, stats]) => ({
    uuid,
    ...stats,
    totalMessages: stats.messagesSent + stats.messagesReceived
  }));
  conversationArray.sort((a, b) => b.totalMessages - a.totalMessages);
  const topConversations = conversationArray.slice(0, 5);

  return res.json({
    summary: {
      totalMessagesSent: analytics.messagesSent,
      totalMessagesReceived: analytics.messagesReceived,
      totalMessages,
      aiRepliesSent: analytics.aiRepliesSent,
      activeConversations,
      aiUsagePercent: analytics.messagesSent > 0 ? Math.round((analytics.aiRepliesSent / analytics.messagesSent) * 100) : 0
    },
    last7Days,
    topConversations
  });
});

// Reset analytics (for testing)
app.post('/api/analytics/reset', async (req, res) => {
  if (!req.session.access_token || !req.session.userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Reset in database
  await resetAnalytics(req.session.userEmail);

  // Reset session cache
  req.session.analytics = {
    messagesSent: 0,
    messagesReceived: 0,
    aiRepliesSent: 0,
    conversationStats: {},
    dailyStats: {}
  };

  return res.json({ success: true });
});

// ============================================
// VAULT & MONETIZATION API ENDPOINTS
// ============================================

// Get vault awareness settings
app.get('/api/vault-settings', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const cacheStats = getMediaCacheStats();
  return res.json({
    vaultAwarenessEnabled: req.session.vaultAwarenessEnabled !== false,
    tipTrackingEnabled: req.session.tipTrackingEnabled !== false,
    sfwFolderPrefix: req.session.sfwFolderPrefix || '',
    ppvFolderPrefix: req.session.ppvFolderPrefix || '',
    lastMediaCacheRefresh: cacheStats.lastFetched ? new Date(cacheStats.lastFetched).toISOString() : null,
    cachedMediaCount: cacheStats.mediaCount
  });
});

// Update vault awareness settings
app.post('/api/vault-settings', async (req, res) => {
  if (!req.session.access_token || !req.session.userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { vaultAwarenessEnabled, tipTrackingEnabled, sfwFolderPrefix, ppvFolderPrefix } = req.body;

  // Update session
  if (vaultAwarenessEnabled !== undefined) {
    req.session.vaultAwarenessEnabled = vaultAwarenessEnabled;
  }
  if (tipTrackingEnabled !== undefined) {
    req.session.tipTrackingEnabled = tipTrackingEnabled;
  }
  if (sfwFolderPrefix !== undefined) {
    req.session.sfwFolderPrefix = sfwFolderPrefix;
  }
  if (ppvFolderPrefix !== undefined) {
    req.session.ppvFolderPrefix = ppvFolderPrefix;
  }

  // Save to database
  const settingsToSave = {};
  if (vaultAwarenessEnabled !== undefined) settingsToSave.vault_awareness_enabled = vaultAwarenessEnabled;
  if (tipTrackingEnabled !== undefined) settingsToSave.tip_tracking_enabled = tipTrackingEnabled;
  if (sfwFolderPrefix !== undefined) settingsToSave.sfw_folder_prefix = sfwFolderPrefix;
  if (ppvFolderPrefix !== undefined) settingsToSave.ppv_folder_prefix = ppvFolderPrefix;

  if (Object.keys(settingsToSave).length > 0) {
    await saveAISettings(req.session.userEmail, settingsToSave);
  }

  return res.json({
    success: true,
    vaultAwarenessEnabled: req.session.vaultAwarenessEnabled !== false,
    tipTrackingEnabled: req.session.tipTrackingEnabled !== false,
    sfwFolderPrefix: req.session.sfwFolderPrefix || '',
    ppvFolderPrefix: req.session.ppvFolderPrefix || ''
  });
});

// ============================================
// MEDIA CONTROL PANEL API ENDPOINTS
// ============================================

// Get media control panel stats (vault overview)
app.get('/api/media-control/stats', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const mediaItems = await getCreatorMediaLibrary(req.session.access_token, false, req.session.userEmail);
    const sfwPrefix = (req.session.sfwFolderPrefix || '').toLowerCase();
    const ppvPrefix = (req.session.ppvFolderPrefix || '').toLowerCase();

    let sfwCount = 0;
    let ppvCount = 0;
    let uncategorizedCount = 0;

    mediaItems.forEach(item => {
      const itemName = (item.name || '').toLowerCase();
      if (sfwPrefix && itemName.startsWith(sfwPrefix)) {
        sfwCount++;
      } else if (ppvPrefix && itemName.startsWith(ppvPrefix)) {
        ppvCount++;
      } else {
        uncategorizedCount++;
      }
    });

    const cacheStats = getMediaCacheStats();

    return res.json({
      success: true,
      totalItems: mediaItems.length,
      sfwCount,
      ppvCount,
      uncategorizedCount,
      lastRefresh: cacheStats.lastFetched ? new Date(cacheStats.lastFetched).toISOString() : null,
      settings: {
        sfwPrefix: req.session.sfwFolderPrefix || '',
        ppvPrefix: req.session.ppvFolderPrefix || ''
      }
    });
  } catch (error) {
    console.error('[Media Control] Stats error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get queue preview for a specific subscriber
app.get('/api/media-control/queue/:conversationUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.params;

  try {
    // Get all media and what's been sent (includes skipped)
    const allMedia = await getCreatorMediaLibrary(req.session.access_token, false, req.session.userEmail);
    const sentMedia = await getMediaSentToSubscriber(conversationUuid);

    // Create maps to track sent and skipped items
    // Skipped items have media_type='skipped'
    const sentUuids = new Set();
    const skippedUuids = new Set();
    sentMedia.forEach(m => {
      if (m.media_type === 'skipped') {
        skippedUuids.add(m.media_uuid);
      } else {
        sentUuids.add(m.media_uuid);
      }
    });

    const sfwPrefix = (req.session.sfwFolderPrefix || '').toLowerCase();
    const ppvPrefix = (req.session.ppvFolderPrefix || '').toLowerCase();

    // Categorize media
    const freeQueue = [];
    const ppvQueue = [];
    const sentFree = [];
    const sentPPV = [];
    const skippedItems = [];

    allMedia.forEach(item => {
      const itemName = (item.name || '').toLowerCase();
      const wasSent = sentUuids.has(item.uuid);
      const wasSkipped = skippedUuids.has(item.uuid);

      let category = 'uncategorized';
      if (sfwPrefix && itemName.startsWith(sfwPrefix)) {
        category = 'free';
      } else if (ppvPrefix && itemName.startsWith(ppvPrefix)) {
        category = 'ppv';
      }

      const itemData = {
        uuid: item.uuid,
        name: item.name,
        mediaType: item.mediaType,
        createdAt: item.createdAt,
        thumbnailUrl: item.thumbnailUrl || null,
        category: category
      };

      if (wasSkipped) {
        skippedItems.push(itemData);
      } else if (category === 'free') {
        if (wasSent) {
          sentFree.push(itemData);
        } else {
          freeQueue.push(itemData);
        }
      } else if (category === 'ppv') {
        if (wasSent) {
          sentPPV.push(itemData);
        } else {
          ppvQueue.push(itemData);
        }
      }
    });

    // Get PPV pricing for this subscriber
    const ppvPricing = await calculateNextPPVPrice(conversationUuid);

    return res.json({
      success: true,
      conversationUuid,
      freeQueue: freeQueue.slice(0, 10),
      ppvQueue: ppvQueue.slice(0, 10),
      sentFree,
      sentPPV,
      skippedItems,
      stats: {
        freeRemaining: freeQueue.length,
        ppvRemaining: ppvQueue.length,
        freeSent: sentFree.length,
        ppvSent: sentPPV.length,
        skipped: skippedItems.length
      },
      ppvPricing: {
        currentPrice: ppvPricing.price,
        purchaseCount: ppvPricing.consecutivePurchases,
        tier: ppvPricing.tier,
        reason: ppvPricing.reason
      }
    });
  } catch (error) {
    console.error('[Media Control] Queue error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Reset tracking for a specific subscriber
app.post('/api/media-control/reset/:conversationUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.params;
  const { resetType } = req.body; // 'all', 'free', 'ppv'

  console.log('[Media Control] Resetting tracking for conversation:', conversationUuid, 'type:', resetType || 'all');

  try {
    let query;
    if (resetType === 'free') {
      query = supabase.from('media_sent_tracking')
        .delete()
        .eq('conversation_uuid', conversationUuid)
        .eq('is_ppv', false);
    } else if (resetType === 'ppv') {
      query = supabase.from('media_sent_tracking')
        .delete()
        .eq('conversation_uuid', conversationUuid)
        .eq('is_ppv', true);
    } else {
      // Reset all
      query = supabase.from('media_sent_tracking')
        .delete()
        .eq('conversation_uuid', conversationUuid);
    }

    const { error } = await query;
    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    // Also reset PPV tracking if resetting all or ppv
    if (resetType !== 'free') {
      const { error: ppvError } = await supabase.from('ppv_tracking')
        .delete()
        .eq('conversation_uuid', conversationUuid);
      if (ppvError) {
        console.warn('[Media Control] PPV tracking reset warning:', ppvError.message);
      }
    }

    console.log('[Media Control] Successfully reset tracking for:', conversationUuid);
    return res.json({
      success: true,
      message: `Reset ${resetType || 'all'} tracking for subscriber`
    });
  } catch (error) {
    console.error('[Media Control] Reset error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Skip/dismiss a media item for a specific subscriber
app.post('/api/media-control/skip/:conversationUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.params;
  const { mediaUuid } = req.body;

  if (!mediaUuid) {
    return res.status(400).json({ error: 'mediaUuid is required' });
  }

  console.log('[Media Control] Skipping media for conversation:', conversationUuid, '| Media:', mediaUuid);

  try {
    // Insert a record marking this media as skipped using media_type='skipped'
    // This uses the existing table columns without requiring schema changes
    const { error } = await supabase.from('media_sent_tracking').insert({
      conversation_uuid: conversationUuid,
      media_uuid: mediaUuid,
      media_type: 'skipped', // Use media_type to mark as skipped
      sent_at: new Date().toISOString()
    });

    if (error) {
      // If duplicate, that's fine - it's already tracked
      if (error.code === '23505') {
        // Update existing record to skipped
        const { error: updateError } = await supabase.from('media_sent_tracking')
          .update({ media_type: 'skipped' })
          .eq('conversation_uuid', conversationUuid)
          .eq('media_uuid', mediaUuid);

        if (updateError) {
          throw new Error(`Database error: ${updateError.message}`);
        }
      } else {
        throw new Error(`Database error: ${error.message}`);
      }
    }

    console.log('[Media Control] Successfully skipped media:', mediaUuid);
    return res.json({
      success: true,
      message: 'Media skipped for this subscriber'
    });
  } catch (error) {
    console.error('[Media Control] Skip error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Unskip a media item (restore to queue)
app.post('/api/media-control/unskip/:conversationUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.params;
  const { mediaUuid } = req.body;

  if (!mediaUuid) {
    return res.status(400).json({ error: 'mediaUuid is required' });
  }

  console.log('[Media Control] Unskipping media for conversation:', conversationUuid, '| Media:', mediaUuid);

  try {
    // Delete the skip record to restore to queue (skipped items have media_type='skipped')
    const { error } = await supabase.from('media_sent_tracking')
      .delete()
      .eq('conversation_uuid', conversationUuid)
      .eq('media_uuid', mediaUuid)
      .eq('media_type', 'skipped');

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    console.log('[Media Control] Successfully unskipped media:', mediaUuid);
    return res.json({
      success: true,
      message: 'Media restored to queue'
    });
  } catch (error) {
    console.error('[Media Control] Unskip error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Reset ALL tracking (dangerous - resets for all subscribers)
app.post('/api/media-control/reset-all', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { confirmReset } = req.body;

  if (confirmReset !== 'CONFIRM_RESET_ALL') {
    return res.status(400).json({ error: 'Must provide confirmReset: "CONFIRM_RESET_ALL" to proceed' });
  }

  console.log('[Media Control] WARNING: Resetting ALL tracking data!');

  try {
    // Delete all media sent tracking for this creator
    const { error: mediaError } = await supabase.from('media_sent_tracking')
      .delete()
      .eq('creator_email', req.session.userEmail);

    if (mediaError) {
      throw new Error(`Media tracking reset error: ${mediaError.message}`);
    }

    // Delete all PPV tracking for this creator
    const { error: ppvError } = await supabase.from('ppv_tracking')
      .delete()
      .eq('creator_email', req.session.userEmail);

    if (ppvError) {
      console.warn('[Media Control] PPV tracking reset warning:', ppvError.message);
    }

    console.log('[Media Control] Successfully reset ALL tracking for creator:', req.session.userEmail);
    return res.json({
      success: true,
      message: 'All tracking data has been reset'
    });
  } catch (error) {
    console.error('[Media Control] Reset all error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Force refresh vault cache
app.post('/api/media-control/refresh-vault', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  console.log('[Media Control] Force refreshing vault cache...');

  try {
    const mediaItems = await getCreatorMediaLibrary(req.session.access_token, true, req.session.userEmail);
    const cacheStats = getMediaCacheStats();

    return res.json({
      success: true,
      itemsLoaded: mediaItems.length,
      refreshedAt: cacheStats.lastFetched ? new Date(cacheStats.lastFetched).toISOString() : null
    });
  } catch (error) {
    console.error('[Media Control] Refresh error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================
// DEBUG: Vault Media Library Inspection
// ============================================
app.get('/api/debug/vault', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  console.log('[Debug Vault] Starting vault inspection...');

  try {
    // Force refresh the media library from Fanvue API
    const mediaItems = await getCreatorMediaLibrary(req.session.access_token, true, req.session.userEmail);

    // Get current folder prefixes
    const sfwPrefix = (req.session.sfwFolderPrefix || '').toLowerCase();
    const ppvPrefix = (req.session.ppvFolderPrefix || '').toLowerCase();

    // Categorize media
    const categorized = {
      sfw: [],
      ppv: [],
      uncategorized: []
    };

    mediaItems.forEach(item => {
      const itemName = (item.name || '').toLowerCase();

      if (sfwPrefix && itemName.startsWith(sfwPrefix)) {
        categorized.sfw.push(item);
      } else if (ppvPrefix && itemName.startsWith(ppvPrefix)) {
        categorized.ppv.push(item);
      } else {
        categorized.uncategorized.push(item);
      }
    });

    // Build response with detailed info
    const response = {
      success: true,
      timestamp: new Date().toISOString(),
      settings: {
        sfwFolderPrefix: req.session.sfwFolderPrefix || '(not set)',
        ppvFolderPrefix: req.session.ppvFolderPrefix || '(not set)',
        vaultAwarenessEnabled: req.session.vaultAwarenessEnabled !== false
      },
      summary: {
        totalMediaItems: mediaItems.length,
        sfwCount: categorized.sfw.length,
        ppvCount: categorized.ppv.length,
        uncategorizedCount: categorized.uncategorized.length
      },
      // Show first 10 items from each category with their names
      samples: {
        sfw: categorized.sfw.slice(0, 10).map(m => ({
          uuid: m.uuid,
          name: m.name,
          mediaType: m.mediaType,
          description: m.description
        })),
        ppv: categorized.ppv.slice(0, 10).map(m => ({
          uuid: m.uuid,
          name: m.name,
          mediaType: m.mediaType,
          description: m.description
        })),
        uncategorized: categorized.uncategorized.slice(0, 10).map(m => ({
          uuid: m.uuid,
          name: m.name,
          mediaType: m.mediaType,
          description: m.description
        }))
      },
      // All unique name prefixes found (helps identify folder structure)
      uniquePrefixes: [...new Set(mediaItems.map(m => {
        const name = m.name || '';
        const underscoreIdx = name.indexOf('_');
        return underscoreIdx > 0 ? name.substring(0, underscoreIdx + 1) : name.split(' ')[0];
      }))].sort()
    };

    console.log('[Debug Vault] Found', mediaItems.length, 'total items');
    console.log('[Debug Vault] SFW:', categorized.sfw.length, 'PPV:', categorized.ppv.length, 'Other:', categorized.uncategorized.length);
    console.log('[Debug Vault] Unique prefixes:', response.uniquePrefixes);

    return res.json(response);

  } catch (error) {
    console.error('[Debug Vault] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// DEBUG: Show what AI context would look like for a conversation
app.get('/api/debug/ai-context/:conversationUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.params;
  console.log('[Debug AI Context] Building context for conversation:', conversationUuid);

  try {
    // Get available media for this subscriber (pass userEmail for cache validation)
    const availableMedia = await getAvailableMediaForSubscriber(req.session.access_token, conversationUuid, req.session.userEmail);
    const sentMedia = await getMediaSentToSubscriber(conversationUuid);

    // Get folder prefixes
    const sfwPrefix = req.session.sfwFolderPrefix || '';
    const ppvPrefix = req.session.ppvFolderPrefix || '';

    // Build the vault context exactly as it would be sent to AI
    const vaultData = buildVaultContextForAI(
      availableMedia,
      sentMedia,
      true, // allowSending
      { price: 5, reason: 'test', consecutivePurchases: 0 }, // Mock PPV pricing
      sfwPrefix,
      ppvPrefix
    );

    return res.json({
      success: true,
      conversationUuid,
      settings: {
        vaultAwarenessEnabled: req.session.vaultAwarenessEnabled !== false,
        sfwFolderPrefix: sfwPrefix || '(not set)',
        ppvFolderPrefix: ppvPrefix || '(not set)'
      },
      mediaStats: {
        availableForThisSubscriber: availableMedia.length,
        alreadySentToThisSubscriber: sentMedia.length,
        mediaListForAI: vaultData.mediaList.length
      },
      // The actual media list the AI sees (with short IDs like IMG1, IMG2)
      mediaListForAI: vaultData.mediaList,
      // The actual context string that gets added to the AI prompt
      vaultContextForAI: vaultData.context,
      // Instructions summary
      aiInstructions: {
        toSendFreeMedia: 'Include [SEND_MEDIA:IMG1] at end of message',
        toSendPPVMedia: 'Include [SEND_PPV:IMG1] at end of message',
        example: 'Here\'s a little preview for you 😘 [SEND_MEDIA:IMG3]'
      }
    });

  } catch (error) {
    console.error('[Debug AI Context] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// DEBUG: Test parsing of AI response for media commands
app.post('/api/debug/parse-media-command', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { aiResponse, conversationUuid } = req.body;

  if (!aiResponse) {
    return res.status(400).json({ error: 'aiResponse is required in body' });
  }

  console.log('[Debug Parse] Testing parse for:', aiResponse);

  try {
    // Get media list for this conversation (or use a mock one)
    let mediaList = [];
    if (conversationUuid) {
      const availableMedia = await getAvailableMediaForSubscriber(req.session.access_token, conversationUuid, req.session.userEmail);
      const sentMedia = await getMediaSentToSubscriber(conversationUuid);
      const sfwPrefix = req.session.sfwFolderPrefix || '';
      const ppvPrefix = req.session.ppvFolderPrefix || '';
      const vaultData = buildVaultContextForAI(availableMedia, sentMedia, true, null, sfwPrefix, ppvPrefix);
      mediaList = vaultData.mediaList;
    } else {
      // Mock media list for testing without conversation
      mediaList = [
        { shortId: 'IMG1', uuid: 'test-uuid-1', type: 'image', isSFW: true, isPPV: false },
        { shortId: 'IMG2', uuid: 'test-uuid-2', type: 'image', isSFW: true, isPPV: false },
        { shortId: 'IMG3', uuid: 'test-uuid-3', type: 'image', isSFW: false, isPPV: true },
      ];
    }

    // Parse the AI response
    const parseResult = parseMediaSendCommand(aiResponse, mediaList);

    return res.json({
      success: true,
      input: {
        aiResponse,
        mediaListCount: mediaList.length
      },
      parseResult: {
        cleanedText: parseResult.text,
        mediaToSend: parseResult.mediaToSend,
        isPPV: parseResult.isPPV,
        commandDetected: !!parseResult.mediaToSend
      },
      explanation: parseResult.mediaToSend
        ? `Detected ${parseResult.isPPV ? 'PPV' : 'FREE'} media command. Will send media UUID: ${parseResult.mediaToSend.uuid}`
        : 'No media command detected in response'
    });

  } catch (error) {
    console.error('[Debug Parse] Error:', error.message);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get tip tracking for a conversation
app.get('/api/conversation/:conversationUuid/tips', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { conversationUuid } = req.params;
    const tipTracking = await getTipTracking(conversationUuid);

    if (!tipTracking) {
      return res.json({
        last_tip_request: null,
        last_tip_received: null,
        total_tips_received: 0,
        tip_request_count: 0,
        days_since_request: null,
        can_request_tip: true
      });
    }

    const daysSinceRequest = daysSinceLastTipRequest(tipTracking);

    return res.json({
      ...tipTracking,
      days_since_request: daysSinceRequest === Infinity ? null : daysSinceRequest,
      can_request_tip: daysSinceRequest >= 4
    });
  } catch (error) {
    console.error('[Tips API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Record a tip request was made (manual trigger)
app.post('/api/conversation/:conversationUuid/tip-request', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { conversationUuid } = req.params;
    const success = await trackTipRequest(conversationUuid);

    return res.json({ success });
  } catch (error) {
    console.error('[Tips API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Record a tip was received (manual or webhook)
app.post('/api/conversation/:conversationUuid/tip-received', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { conversationUuid } = req.params;
    const { amount } = req.body;

    if (!amount || isNaN(parseFloat(amount))) {
      return res.status(400).json({ error: 'Valid amount is required' });
    }

    const success = await trackTipReceived(conversationUuid, amount);

    return res.json({ success });
  } catch (error) {
    console.error('[Tips API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// ============================================
// PPV API ENDPOINTS
// ============================================

// Get PPV stats for a conversation
app.get('/api/conversation/:conversationUuid/ppv', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { conversationUuid } = req.params;
    const ppvStats = await getPPVStats(conversationUuid);

    return res.json(ppvStats);
  } catch (error) {
    console.error('[PPV API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Track PPV sent to a conversation
app.post('/api/conversation/:conversationUuid/ppv-sent', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { conversationUuid } = req.params;
    const { mediaUuid, price } = req.body;

    if (!mediaUuid) {
      return res.status(400).json({ error: 'mediaUuid is required' });
    }
    if (!price || isNaN(parseFloat(price))) {
      return res.status(400).json({ error: 'Valid price is required' });
    }

    const success = await trackPPVSent(conversationUuid, mediaUuid, price);

    // Also track in the general media sent tracking
    await trackMediaSent(conversationUuid, mediaUuid, 'ppv');

    return res.json({ success });
  } catch (error) {
    console.error('[PPV API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Track PPV purchased (manual or webhook)
app.post('/api/conversation/:conversationUuid/ppv-purchased', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { conversationUuid } = req.params;
    const { mediaUuid } = req.body;

    if (!mediaUuid) {
      return res.status(400).json({ error: 'mediaUuid is required' });
    }

    const success = await trackPPVPurchased(conversationUuid, mediaUuid);

    return res.json({ success });
  } catch (error) {
    console.error('[PPV API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get PPV settings
app.get('/api/ppv-settings', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({
    ppvAwarenessEnabled: req.session.ppvAwarenessEnabled !== false
  });
});

// Update PPV settings
app.post('/api/ppv-settings', async (req, res) => {
  if (!req.session.access_token || !req.session.userEmail) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { ppvAwarenessEnabled } = req.body;

  if (ppvAwarenessEnabled !== undefined) {
    req.session.ppvAwarenessEnabled = ppvAwarenessEnabled;

    // Save to database
    await saveAISettings(req.session.userEmail, {
      ppv_awareness_enabled: ppvAwarenessEnabled
    });
  }

  return res.json({
    success: true,
    ppvAwarenessEnabled: req.session.ppvAwarenessEnabled !== false
  });
});

// Get monetization summary for a conversation
app.get('/api/conversation/:conversationUuid/monetization', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { conversationUuid } = req.params;

    // Get tip tracking data
    const tipTracking = await getTipTracking(conversationUuid);

    // Get PPV stats
    const ppvStats = await getPPVStats(conversationUuid);

    // Calculate totals
    const tipsRevenue = tipTracking?.total_tips_received || 0;
    const ppvRevenue = ppvStats.totalRevenue || 0;
    const totalRevenue = tipsRevenue + ppvRevenue;
    const totalPurchases = ppvStats.totalPurchased || 0;

    // Calculate PPV conversion rate
    const ppvConversion = ppvStats.totalSent > 0
      ? Math.round((ppvStats.totalPurchased / ppvStats.totalSent) * 100)
      : 0;

    // Days since last tip request
    const daysSinceTip = daysSinceLastTipRequest(tipTracking);
    const canRequestTip = daysSinceTip >= 4;

    // Generate advice based on monetization data
    let advice = '';
    if (totalRevenue === 0) {
      advice = "This subscriber hasn't spent yet. Focus on building rapport and desire before monetizing.";
    } else if (ppvStats.totalPurchased > 0 && canRequestTip) {
      advice = "They're a buyer! Good time to mention tips or offer new PPV.";
    } else if (ppvStats.totalSent > 0 && ppvStats.totalPurchased === 0) {
      advice = "PPV sent but not purchased. Try different content types or build more anticipation.";
    } else if (tipsRevenue > 0 && ppvStats.totalSent === 0) {
      advice = "They tip! Consider offering exclusive PPV content.";
    }

    return res.json({
      tips: {
        total: tipsRevenue,
        lastRequest: tipTracking?.last_tip_request,
        lastReceived: tipTracking?.last_tip_received,
        daysSinceRequest: daysSinceTip === Infinity ? null : daysSinceTip,
        canRequestTip: canRequestTip,
        requestCount: tipTracking?.tip_request_count || 0
      },
      ppv: {
        totalRevenue: ppvRevenue,
        totalSent: ppvStats.totalSent,
        totalPurchased: ppvStats.totalPurchased,
        conversionRate: ppvConversion
      },
      summary: {
        totalRevenue: totalRevenue,
        totalPurchases: totalPurchases + (tipsRevenue > 0 ? 1 : 0), // Count tips as a "purchase" for engagement
        isSpender: totalRevenue > 0,
        spenderTier: totalRevenue >= 100 ? 'whale' : totalRevenue >= 50 ? 'high' : totalRevenue >= 10 ? 'medium' : totalRevenue > 0 ? 'low' : 'none'
      },
      advice: advice
    });
  } catch (error) {
    console.error('[Monetization API] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Debug endpoint to explore Fanvue API
app.get('/api/debug/explore-api', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const endpoint = req.query.endpoint || '/media';
  const headers = buildAuthHeaders(req.session.access_token);

  try {
    const response = await fanvueRequest('get', endpoint, { headers });
    console.log('[Debug API] Endpoint:', endpoint, 'Status:', response.status);
    return res.json({
      endpoint: endpoint,
      status: response.status,
      data: response.data
    });
  } catch (error) {
    return res.status(500).json({ error: error.message, details: error.response?.data });
  }
});

// Get creator's media library (cached)
app.get('/api/media-library', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const forceRefresh = req.query.refresh === 'true';
    const userEmail = req.session.userEmail || 'unknown';
    const media = await getCreatorMediaLibrary(req.session.access_token, forceRefresh, userEmail);
    const cacheStats = getMediaCacheStats();

    return res.json({
      media: media,
      count: media.length,
      lastRefresh: cacheStats.lastFetched ? new Date(cacheStats.lastFetched).toISOString() : null
    });
  } catch (error) {
    console.error('[Media Library] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get available (unsent) media for a specific conversation
app.get('/api/conversation/:conversationUuid/available-media', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { conversationUuid } = req.params;
    const availableMedia = await getAvailableMediaForSubscriber(req.session.access_token, conversationUuid, req.session.userEmail);
    const sentMedia = await getMediaSentToSubscriber(conversationUuid);

    return res.json({
      available: availableMedia,
      availableCount: availableMedia.length,
      sent: sentMedia,
      sentCount: sentMedia.length
    });
  } catch (error) {
    console.error('[Available Media] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Track media sent to a conversation
app.post('/api/conversation/:conversationUuid/track-media-sent', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    const { conversationUuid } = req.params;
    const { mediaUuid, mediaType } = req.body;

    if (!mediaUuid) {
      return res.status(400).json({ error: 'mediaUuid is required' });
    }

    const success = await trackMediaSent(conversationUuid, mediaUuid, mediaType || 'direct');

    return res.json({ success });
  } catch (error) {
    console.error('[Track Media] Error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get vault folders (creator's media library)
app.get('/api/vault', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);

    const vaultResponse = await fanvueRequest('get', '/vault/folders', { headers });

    console.log('[Vault] Response status:', vaultResponse.status);
    console.log('[Vault] Response data:', JSON.stringify(vaultResponse.data, null, 2));

    if (vaultResponse.status !== 200) {
      return res.status(vaultResponse.status).json({
        error: 'Failed to load vault',
        details: vaultResponse.data
      });
    }

    return res.json({ vault: vaultResponse.data });
  } catch (error) {
    console.error('[Vault] Error:', error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get media in a vault folder
app.get('/api/vault/:folderId/media', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);
    const folderId = req.params.folderId;

    const mediaResponse = await fanvueRequest('get', `/vault/folders/${folderId}/media`, { headers });

    console.log('[Vault Media] Response status:', mediaResponse.status);
    if (mediaResponse.data?.data?.[0]) {
      console.log('[Vault Media] Sample item:', JSON.stringify(mediaResponse.data.data[0], null, 2));
    }

    if (mediaResponse.status !== 200) {
      return res.status(mediaResponse.status).json({
        error: 'Failed to load vault media',
        details: mediaResponse.data
      });
    }

    return res.json({ media: mediaResponse.data });
  } catch (error) {
    console.error('[Vault Media] Error:', error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get all creator's media
app.get('/api/my-media', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);

    const mediaResponse = await fanvueRequest('get', '/media', { headers });

    console.log('[My Media] Response status:', mediaResponse.status);
    if (mediaResponse.data?.data?.[0]) {
      console.log('[My Media] Sample item:', JSON.stringify(mediaResponse.data.data[0], null, 2));
    }

    if (mediaResponse.status !== 200) {
      return res.status(mediaResponse.status).json({
        error: 'Failed to load media',
        details: mediaResponse.data
      });
    }

    return res.json({ media: mediaResponse.data });
  } catch (error) {
    console.error('[My Media] Error:', error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get earnings data
app.get('/api/earnings', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);

    const earningsResponse = await fanvueRequest('get', '/earnings', { headers });

    console.log('[Earnings] Response status:', earningsResponse.status);
    console.log('[Earnings] Response data:', JSON.stringify(earningsResponse.data, null, 2));

    if (earningsResponse.status !== 200) {
      return res.status(earningsResponse.status).json({
        error: 'Failed to load earnings',
        details: earningsResponse.data
      });
    }

    return res.json({ earnings: earningsResponse.data });
  } catch (error) {
    console.error('[Earnings] Error:', error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get top spending fans
app.get('/api/top-fans', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);

    // Try different possible endpoint paths
    const paths = ['/fans/top', '/top-fans', '/insights/top-fans', '/subscribers/top'];

    for (const path of paths) {
      const response = await fanvueRequest('get', path, { headers });
      console.log('[Top Fans] Trying', path, '- Status:', response.status);

      if (response.status === 200) {
        console.log('[Top Fans] Found working endpoint:', path);
        console.log('[Top Fans] Response data:', JSON.stringify(response.data, null, 2));
        return res.json({ topFans: response.data, endpoint: path });
      }
    }

    return res.status(404).json({ error: 'Top fans endpoint not found', triedPaths: paths });
  } catch (error) {
    console.error('[Top Fans] Error:', error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Get subscriber/fan details
app.get('/api/fan/:fanUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);
    const fanUuid = req.params.fanUuid;

    // Try different possible endpoint paths
    const paths = [
      `/fans/${fanUuid}`,
      `/subscribers/${fanUuid}`,
      `/users/${fanUuid}`,
      `/chats/${fanUuid}/subscriber`
    ];

    for (const path of paths) {
      const response = await fanvueRequest('get', path, { headers });
      console.log('[Fan Details] Trying', path, '- Status:', response.status);

      if (response.status === 200) {
        console.log('[Fan Details] Found working endpoint:', path);
        console.log('[Fan Details] Response data:', JSON.stringify(response.data, null, 2));
        return res.json({ fan: response.data, endpoint: path });
      }
    }

    return res.status(404).json({ error: 'Fan details endpoint not found', triedPaths: paths });
  } catch (error) {
    console.error('[Fan Details] Error:', error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  }
});

// Explore API - test any endpoint
app.get('/api/explore/*', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);
    const path = '/' + req.params[0];

    console.log('[API Explore] Testing endpoint:', path);
    const response = await fanvueRequest('get', path, { headers });

    console.log('[API Explore] Response status:', response.status);
    console.log('[API Explore] Response data:', JSON.stringify(response.data, null, 2));

    return res.json({
      status: response.status,
      path: path,
      data: response.data
    });
  } catch (error) {
    console.error('[API Explore] Error:', error.response?.data || error.message);
    return res.status(500).json({ error: error.message, path: '/' + req.params[0] });
  }
});

// ============================================
// MOUNT ROUTES
// ============================================

// Mount auth routes (/, /login, /callback, /logout)
const authRoutes = createAuthRoutes({
  OAUTH_CLIENT_ID,
  OAUTH_CLIENT_SECRET,
  OAUTH_REDIRECT_URI,
  OAUTH_SCOPES,
  OAUTH_AUTH_URL,
  OAUTH_TOKEN_URL,
  API_BASE_URL: process.env.API_BASE_URL || 'https://api.fanvue.com',
  API_VERSION: process.env.API_VERSION || '2025-06-26',
  renderTemplate,
  HTML_TEMPLATE
});
app.use('/', authRoutes);

// Mount payment routes (/api/subscribe, /api/subscription, /subscribe/callback)
app.use('/', paymentsRouter);

// ============================================
// SERVE REACT BUILD (Production)
// ============================================

// Serve React static assets from client/dist
const clientBuildPath = path.join(__dirname, 'client', 'dist');
app.use(express.static(clientBuildPath));

// Catch-all: serve React app for any non-API routes (client-side routing)
app.get('*', (req, res, next) => {
  // Skip API routes and auth routes
  if (req.path.startsWith('/api/') || req.path.startsWith('/webhook') ||
      req.path === '/login' || req.path === '/logout' || req.path === '/callback' ||
      req.path === '/subscribe/callback') {
    return next();
  }
  // Serve React app
  const indexPath = path.join(clientBuildPath, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      // Fallback to old public folder if React build doesn't exist
      next();
    }
  });
});

// Global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
  console.error('[CRASH PREVENTED] Uncaught Exception:', err.message);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[CRASH PREVENTED] Unhandled Rejection at:', promise);
  console.error('Reason:', reason);
});

app.listen(PORT, async () => {
  console.log(`Fanvue Chatbot running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop the server');

  // Initialize database with default personas on startup
  await initializeDatabase();
});
