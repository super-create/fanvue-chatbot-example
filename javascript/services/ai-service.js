const OpenAI = require('openai');
const dotenv = require('dotenv');

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_SYSTEM_PROMPT = `You are a friendly and engaging chatbot assistant. Keep your responses natural, conversational, and concise. Show personality and be helpful.`;

/**
 * Detect conversation tone from recent messages
 * @param {Array} messages - Array of message objects
 * @returns {string} Tone: 'sexual', 'flirty_sexual', 'flirty', 'casual', 'warm', 'neutral'
 */
function detectConversationTone(messages) {
  if (!messages || messages.length === 0) {
    return 'neutral';
  }

  // Get last 5 messages for context
  const recentMessages = messages.slice(-5);
  const allText = recentMessages.map(m => (m.text || '').toLowerCase()).join(' ');

  // Sexual/flirty keywords
  const sexualKeywords = ['sexy', 'hot', 'naughty', 'dirty', 'horny', 'pic', 'pics', 'picture', 'pictures', 'show', 'naked', 'nude', 'ass', 'tits', 'pussy', 'dick', 'cock', 'fuck'];
  const flirtyKeywords = ['beautiful', 'gorgeous', 'babe', 'baby', 'cutie', 'love', 'kiss', 'cuddle'];
  const casualKeywords = ['how are you', 'how was', 'doing', 'day', 'work', 'weekend', 'lol'];

  // Count matches
  let sexualCount = sexualKeywords.filter(kw => allText.includes(kw)).length;
  let flirtyCount = flirtyKeywords.filter(kw => allText.includes(kw)).length;
  let casualCount = casualKeywords.filter(kw => allText.includes(kw)).length;

  // Determine tone
  if (sexualCount >= 2) return 'sexual';
  if (sexualCount >= 1 && flirtyCount >= 1) return 'flirty_sexual';
  if (flirtyCount >= 2) return 'flirty';
  if (casualCount >= 2) return 'casual';
  if (sexualCount >= 1 || flirtyCount >= 1) return 'warm';

  return 'neutral';
}

/**
 * Detect if a message is requesting media content
 * @param {string} message - Message text
 * @returns {Object} {detected: boolean, type: string|null, pattern: string|null}
 */
function detectMediaRequest(message) {
  const lowerMessage = message.toLowerCase();

  // Picture/photo requests
  const picturePatterns = [
    'send me a pic', 'send a pic', 'send pic', 'send me a photo', 'send a photo',
    'can i see', 'can you send', 'show me', 'i want to see', 'wanna see',
    'send me something', 'pic of you', 'photo of you', 'picture of you',
    'selfie', 'nude', 'nudes', 'naked pic', 'sexy pic', 'hot pic',
    'send something spicy', 'something naughty', 'tease me with a pic',
    'can i get a pic', 'could you send a pic', 'would you send me',
    'let me see you', 'i wanna see you', 'show yourself'
  ];

  // Voice note requests
  const voicePatterns = [
    'voice note', 'voice message', 'voicenote', 'audio', 'hear your voice',
    'send me a voice', 'say my name', 'moan for me', 'talk to me',
    'can i hear you', 'want to hear you', 'record something', 'voice clip'
  ];

  // Video requests
  const videoPatterns = [
    'video', 'vid', 'clip of you', 'record yourself', 'film yourself',
    'video call', 'facetime', 'cam', 'webcam', 'live'
  ];

  // Check for picture requests
  for (const pattern of picturePatterns) {
    if (lowerMessage.includes(pattern)) {
      return { detected: true, type: 'picture', pattern };
    }
  }

  // Check for voice requests
  for (const pattern of voicePatterns) {
    if (lowerMessage.includes(pattern)) {
      return { detected: true, type: 'voice_note', pattern };
    }
  }

  // Check for video requests
  for (const pattern of videoPatterns) {
    if (lowerMessage.includes(pattern)) {
      return { detected: true, type: 'video', pattern };
    }
  }

  return { detected: false, type: null, pattern: null };
}

/**
 * Format current time in a specific timezone
 * @param {string} timezone - IANA timezone (e.g., 'America/New_York')
 * @param {string|null} location - Location name
 * @returns {string|null} Formatted time string
 */
function getCurrentTimeFormatted(timezone, location) {
  if (!timezone) {
    return null;
  }

  try {
    const now = new Date();

    // Get formatted date/time in the timezone
    const dateFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });

    const timeFormatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZoneName: 'short'
    });

    const dateStr = dateFormatter.format(now);
    const timeStr = timeFormatter.format(now);

    let result = '';
    if (location) {
      result += `Location: ${location}\n`;
    }
    result += `Current local time: ${timeStr}, ${dateStr}`;

    return result;
  } catch (error) {
    console.error('[Time] Error formatting time:', error);
    return null;
  }
}

/**
 * Build enhanced system prompt with persona, memory, and context
 * @param {Object} params - Prompt building parameters
 * @returns {string} Complete system prompt
 */
function buildEnhancedSystemPrompt(params) {
  const {
    systemPrompt,
    creatorProfile,
    subscriberMemory,
    conversationState,
    conversationHistory,
    userProfile,
    vaultContext,
    tipContext,
    ppvContext,
    toneGuidance
  } = params;

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

  // Add tone guidance
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

  return enhancedSystemPrompt;
}

/**
 * Build conversation tone guidance text
 * @param {string} tone - Detected conversation tone
 * @returns {string} Tone guidance text
 */
function buildToneGuidance(tone) {
  if (tone === 'sexual') {
    return '\n\n=== CONVERSATION TONE: SEXUAL ===\nThis conversation is HOT and sexual. Perfect time to send PPV content! They\'re in the mood.';
  } else if (tone === 'flirty_sexual') {
    return '\n\n=== CONVERSATION TONE: FLIRTY/SEXUAL ===\nThings are getting spicy. Good opportunity for PPV if you want to escalate.';
  } else if (tone === 'flirty') {
    return '\n\n=== CONVERSATION TONE: FLIRTY ===\nPlayful and flirty vibes. You could send a free teaser or hint at PPV content.';
  } else if (tone === 'casual') {
    return '\n\n=== CONVERSATION TONE: CASUAL ===\nJust chatting. Perfect for FREE content to build rapport. Save PPV for when things heat up.';
  } else if (tone === 'warm') {
    return '\n\n=== CONVERSATION TONE: WARM ===\nFriendly and warm. Free content works well here.';
  }
  return '';
}

/**
 * Generate AI reply using OpenAI API
 * @param {Object} params - Generation parameters
 * @returns {Promise<string>} AI-generated reply
 */
async function generateAIReply(params) {
  const {
    conversationHistory,
    systemPrompt,
    creatorProfile,
    subscriberMemory,
    conversationState,
    userProfile,
    mediaDescriptions,
    vaultContext,
    tipContext,
    ppvContext,
    maxTokens = 150,
    temperature = 0.9,
    aiModel = 'gpt-4o'
  } = params;

  // Detect conversation tone to help AI decide PPV vs free
  const conversationTone = detectConversationTone(conversationHistory);
  const toneGuidance = buildToneGuidance(conversationTone);

  // Build enhanced system prompt
  const enhancedSystemPrompt = buildEnhancedSystemPrompt({
    systemPrompt,
    creatorProfile,
    subscriberMemory,
    conversationState,
    conversationHistory,
    userProfile,
    vaultContext,
    tipContext,
    ppvContext,
    toneGuidance
  });

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
      if (!msg.isSentByYou && msgUuid && mediaDescriptions && mediaDescriptions[msgUuid]) {
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

  const completion = await openai.chat.completions.create({
    model: aiModel,
    messages: messages,
    max_tokens: maxTokens,
    temperature: temperature,
  });

  const reply = completion.choices[0]?.message?.content || '';
  return reply;
}

module.exports = {
  generateAIReply,
  buildEnhancedSystemPrompt,
  detectConversationTone,
  detectMediaRequest,
  getCurrentTimeFormatted,
  buildToneGuidance,
  DEFAULT_SYSTEM_PROMPT
};
