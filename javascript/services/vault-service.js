const { supabase } = require('../database');
const { buildAuthHeaders, fanvueRequest } = require('./fanvue-api');

// In-memory cache for creator's media library
let creatorMediaCache = {
  media: [],
  lastFetched: null,
  userId: null
};

/**
 * Load creator's media library from Fanvue API (with pagination)
 * Tries multiple pagination strategies as different API versions may use different params
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Array>} Array of media items
 */
async function loadCreatorMediaLibrary(accessToken) {
  try {
    const headers = buildAuthHeaders(accessToken);
    const allMediaItems = [];
    const seenUuids = new Set();

    // Try different endpoints and pagination strategies
    const endpoints = ['/vault/media', '/media', '/vault/items', '/creator/media'];
    let workingEndpoint = null;
    let paginationType = null; // 'page', 'offset', 'cursor', 'skip', or 'none'

    console.log('[Vault] Starting media load - testing pagination strategies...');

    // First, find a working endpoint and test pagination
    for (const endpoint of endpoints) {
      try {
        // Test with page=1
        let response = await fanvueRequest('get', `${endpoint}?limit=100&page=1`, { headers });

        if (response.status === 200 && response.data?.data?.length > 0) {
          workingEndpoint = endpoint;
          console.log('[Vault] Found working endpoint:', endpoint);

          // Log full response structure to understand pagination
          console.log('[Vault] Response structure keys:', Object.keys(response.data));
          if (response.data.meta) console.log('[Vault] Meta:', response.data.meta);
          if (response.data.pagination) console.log('[Vault] Pagination:', response.data.pagination);
          if (response.data.cursor) console.log('[Vault] Cursor:', response.data.cursor);
          if (response.data.nextCursor) console.log('[Vault] NextCursor:', response.data.nextCursor);
          if (response.data.total) console.log('[Vault] Total:', response.data.total);
          if (response.data.hasMore !== undefined) console.log('[Vault] HasMore:', response.data.hasMore);

          // Determine pagination type from response
          if (response.data.nextCursor || response.data.cursor) {
            paginationType = 'cursor';
          } else if (response.data.meta?.currentPage || response.data.page) {
            paginationType = 'page';
          } else if (response.data.meta?.offset !== undefined) {
            paginationType = 'offset';
          }

          break;
        }
      } catch (e) {
        console.log('[Vault] Endpoint', endpoint, 'failed:', e.message);
      }
    }

    if (!workingEndpoint) {
      console.error('[Vault] No working endpoint found');
      return [];
    }

    // Now paginate through all items
    let page = 1;
    let cursor = null;
    let hasMore = true;
    const maxPages = 50;

    while (hasMore && page <= maxPages) {
      // Request variants/URLs to be included - try common API patterns
      let params = `?limit=100&include=variants&expand=variants,urls&withUrls=true`;

      // Add pagination params based on detected type
      if (paginationType === 'cursor' && cursor) {
        params += `&cursor=${cursor}`;
      } else if (paginationType === 'page') {
        params += `&page=${page}`;
      } else if (paginationType === 'offset') {
        params += `&offset=${(page - 1) * 100}`;
      } else {
        // Try multiple params - API might accept any
        params += `&page=${page}&offset=${(page - 1) * 100}&skip=${(page - 1) * 100}`;
      }

      const response = await fanvueRequest('get', `${workingEndpoint}${params}`, { headers });

      if (response.status !== 200 || !response.data?.data) {
        console.log('[Vault] No more data at page', page);
        break;
      }

      const pageData = response.data.data;

      if (page === 1) {
        console.log('[Vault] Page 1:', pageData.length, 'items');
        if (pageData[0]) {
          console.log('[Vault] First item:', pageData[0].name, '| Created:', pageData[0].createdAt);
          // Debug: Log all keys of first item to see what URLs are available
          console.log('[Vault] First item keys:', Object.keys(pageData[0]));
          // Log any URL-like fields
          const urlFields = ['url', 'previewUrl', 'thumbnailUrl', 'thumbnail', 'preview', 'cdnUrl', 'cdn', 'imageUrl', 'src', 'source', 'media', 'file', 'path'];
          urlFields.forEach(field => {
            if (pageData[0][field]) {
              console.log('[Vault] Found URL field:', field, '=', pageData[0][field]);
            }
          });
          // Debug: Log variants array structure
          if (pageData[0].variants) {
            console.log('[Vault] Variants found:', pageData[0].variants.length, 'variants');
            console.log('[Vault] Variants sample:', JSON.stringify(pageData[0].variants.slice(0, 3), null, 2));
          } else {
            console.log('[Vault] No variants array found on first item');
            // Log entire first item to see full structure
            console.log('[Vault] Full first item structure:', JSON.stringify(pageData[0], null, 2));
          }
        }
        if (pageData[pageData.length - 1]) {
          console.log('[Vault] Last item:', pageData[pageData.length - 1].name, '| Created:', pageData[pageData.length - 1].createdAt);
        }
      }

      // Process items
      let newCount = 0;
      for (const item of pageData) {
        if (!seenUuids.has(item.uuid) && (item.status === 'ready' || !item.status)) {
          seenUuids.add(item.uuid);

          // Extract thumbnail URL from variants array
          // Fanvue returns variants with variantType: "thumbnail_gallery" for thumbnails
          let thumbnailUrl = null;
          let mainUrl = null;

          if (item.variants && Array.isArray(item.variants)) {
            // First try to find thumbnail_gallery variant
            const thumbnailVariant = item.variants.find(v => v.variantType === 'thumbnail_gallery');
            if (thumbnailVariant && thumbnailVariant.url) {
              thumbnailUrl = thumbnailVariant.url;
            }

            // Also get main URL as fallback
            const mainVariant = item.variants.find(v => v.variantType === 'main');
            if (mainVariant && mainVariant.url) {
              mainUrl = mainVariant.url;
            }

            // If no thumbnail, use main as fallback
            if (!thumbnailUrl && mainUrl) {
              thumbnailUrl = mainUrl;
            }
          }

          // Log first item's thumbnail extraction for debugging
          if (allMediaItems.length === 0) {
            console.log('[Vault] First item thumbnail extraction:');
            console.log('[Vault]   - Has variants array:', !!item.variants, item.variants ? `(${item.variants.length} variants)` : '');
            console.log('[Vault]   - Extracted thumbnailUrl:', thumbnailUrl ? thumbnailUrl.substring(0, 80) + '...' : 'NULL');
            console.log('[Vault]   - Extracted mainUrl:', mainUrl ? mainUrl.substring(0, 80) + '...' : 'NULL');
          }

          allMediaItems.push({
            uuid: item.uuid,
            name: item.name || 'Untitled',
            description: item.description || '',
            mediaType: item.mediaType || 'image',
            recommendedPrice: item.recommendedPrice || null,
            createdAt: item.createdAt,
            status: item.status,
            ownerUuid: item.ownerUuid || item.owner?.uuid,
            thumbnailUrl: thumbnailUrl,
            mainUrl: mainUrl
          });
          newCount++;
        }
      }

      console.log('[Vault] Page', page, ':', pageData.length, 'returned,', newCount, 'new (total:', allMediaItems.length, ')');

      // Update cursor if available
      cursor = response.data.nextCursor || response.data.cursor || null;

      // Check if more pages
      if (pageData.length === 0 || newCount === 0) {
        console.log('[Vault] No new items, stopping');
        hasMore = false;
      } else if (response.data.hasMore === false || response.data.meta?.hasMore === false) {
        console.log('[Vault] API indicates no more pages');
        hasMore = false;
      } else {
        page++;
      }
    }

    // Sort oldest first
    allMediaItems.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    console.log('[Vault] Finished: loaded', allMediaItems.length, 'items (oldest-first)');
    if (allMediaItems.length > 0) {
      console.log('[Vault] Oldest:', allMediaItems[0].name, '|', allMediaItems[0].createdAt);
      console.log('[Vault] Newest:', allMediaItems[allMediaItems.length - 1].name, '|', allMediaItems[allMediaItems.length - 1].createdAt);
    }

    return allMediaItems;
  } catch (error) {
    console.error('[Vault] Error loading media library:', error.message);
    return [];
  }
}

/**
 * Get cached media library (refresh if stale - older than 5 minutes or different user)
 * @param {string} accessToken - OAuth access token
 * @param {boolean} forceRefresh - Force cache refresh
 * @param {string|null} userEmail - User email for cache validation
 * @returns {Promise<Array>} Array of media items
 */
async function getCreatorMediaLibrary(accessToken, forceRefresh = false, userEmail = null) {
  const now = Date.now();
  const cacheAge = creatorMediaCache.lastFetched ? now - creatorMediaCache.lastFetched : Infinity;
  const CACHE_MAX_AGE = 5 * 60 * 1000; // 5 minutes

  // Force refresh if user changed
  const userChanged = userEmail && creatorMediaCache.userId !== userEmail;
  if (userChanged) {
    console.log('[Vault] User changed from', creatorMediaCache.userId, 'to', userEmail, '- refreshing cache');
  }

  if (forceRefresh || userChanged || cacheAge > CACHE_MAX_AGE || creatorMediaCache.media.length === 0) {
    creatorMediaCache.media = await loadCreatorMediaLibrary(accessToken);
    creatorMediaCache.lastFetched = now;
    creatorMediaCache.userId = userEmail;
  }

  return creatorMediaCache.media;
}

/**
 * Fetch thumbnail URLs for specific media items by making individual API calls
 * @param {string} accessToken - OAuth access token
 * @param {Array} mediaUuids - Array of media UUIDs to fetch
 * @returns {Promise<Object>} Map of mediaUuid -> thumbnailUrl
 */
async function fetchMediaThumbnails(accessToken, mediaUuids) {
  const thumbnailMap = {};
  const headers = buildAuthHeaders(accessToken);

  // Limit to prevent too many API calls
  const uuidsToFetch = mediaUuids.slice(0, 20);

  console.log('[Vault] Fetching thumbnails for', uuidsToFetch.length, 'items...');

  // Fetch in parallel with Promise.allSettled to handle individual failures
  let isFirst = true;
  const results = await Promise.allSettled(
    uuidsToFetch.map(async (uuid) => {
      try {
        const response = await fanvueRequest('get', `/media/${uuid}`, { headers });

        // Log first response to debug
        if (isFirst) {
          isFirst = false;
          console.log('[Vault] Individual media API response status:', response.status);
          console.log('[Vault] Individual media API response keys:', response.data ? Object.keys(response.data) : 'no data');
          if (response.data) {
            const mediaData = response.data.data || response.data;
            console.log('[Vault] Media data keys:', Object.keys(mediaData));
            console.log('[Vault] Has variants:', !!mediaData.variants, mediaData.variants?.length || 0);
          }
        }

        if (response.status === 200 && response.data) {
          const mediaData = response.data.data || response.data;

          // Extract thumbnail URL from variants
          if (mediaData.variants && Array.isArray(mediaData.variants)) {
            const thumbVariant = mediaData.variants.find(v => v.variantType === 'thumbnail_gallery');
            const mainVariant = mediaData.variants.find(v => v.variantType === 'main');

            const url = thumbVariant?.url || mainVariant?.url || null;
            if (url) {
              return { uuid, url };
            }
          }
        }
        return { uuid, url: null };
      } catch (e) {
        // Log first error
        if (isFirst) {
          isFirst = false;
          console.log('[Vault] Individual media API error:', e.response?.status, e.message);
        }
        return { uuid, url: null };
      }
    })
  );

  // Build the map from successful results
  let successCount = 0;
  results.forEach((result) => {
    if (result.status === 'fulfilled' && result.value.url) {
      thumbnailMap[result.value.uuid] = result.value.url;
      successCount++;
    }
  });

  console.log('[Vault] Fetched', successCount, 'thumbnail URLs out of', uuidsToFetch.length, 'requested');

  return thumbnailMap;
}

/**
 * Track media sent to a specific subscriber (stored in Supabase)
 * @param {string} conversationUuid - Conversation UUID
 * @param {string} mediaUuid - Media UUID
 * @param {string} mediaType - Media type ('direct', 'ppv', 'free', 'ai_sent', 'ai_ppv')
 * @returns {Promise<boolean>} Success status
 */
async function trackMediaSent(conversationUuid, mediaUuid, mediaType = 'direct') {
  try {
    const { data, error } = await supabase
      .from('media_sent_tracking')
      .insert({
        conversation_uuid: conversationUuid,
        media_uuid: mediaUuid,
        media_type: mediaType,
        sent_at: new Date().toISOString()
      });

    if (error) {
      // Gracefully handle missing table
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[Vault] media_sent_tracking table not found - run the SQL migration');
        return false;
      }
      console.error('[Vault] Error tracking media sent:', error);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[Vault] Error tracking media sent:', error);
    return false;
  }
}

/**
 * Get media already sent to a subscriber
 * @param {string} conversationUuid - Conversation UUID
 * @returns {Promise<Array>} Array of sent media records
 */
async function getMediaSentToSubscriber(conversationUuid) {
  try {
    const { data, error } = await supabase
      .from('media_sent_tracking')
      .select('media_uuid, media_type, sent_at')
      .eq('conversation_uuid', conversationUuid);

    if (error) {
      // Gracefully handle missing table
      if (error.code === '42P01' || error.message?.includes('does not exist')) {
        console.warn('[Vault] media_sent_tracking table not found - run the SQL migration');
        return [];
      }
      console.error('[Vault] Error fetching sent media:', error);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error('[Vault] Error fetching sent media:', error);
    return [];
  }
}

/**
 * Get available (unsent) media for a subscriber
 * @param {string} accessToken - OAuth access token
 * @param {string} conversationUuid - Conversation UUID
 * @param {string|null} userEmail - User email for cache validation
 * @returns {Promise<Array>} Array of available media items
 */
async function getAvailableMediaForSubscriber(accessToken, conversationUuid, userEmail = null) {
  // Pass userEmail to ensure cache is properly validated
  const allMedia = await getCreatorMediaLibrary(accessToken, false, userEmail);
  const sentMedia = await getMediaSentToSubscriber(conversationUuid);
  const sentUuids = new Set(sentMedia.map(m => m.media_uuid));

  console.log('[Vault] getAvailableMediaForSubscriber:', allMedia.length, 'total,', sentUuids.size, 'already sent');
  return allMedia.filter(m => !sentUuids.has(m.uuid));
}

/**
 * Build vault context for AI prompt (tells AI what content is available to tease/send)
 * Implements ordered queue system: oldest unsent items first, separate SFW and PPV queues
 * @param {Array} availableMedia - All media items (already sorted oldest-first)
 * @param {Array} sentMedia - Already sent media records
 * @param {boolean} allowSending - Whether AI can send media
 * @param {Object|null} ppvPricing - PPV pricing info {price, reason, consecutivePurchases}
 * @param {string} sfwFolderPrefix - Prefix for SFW (free) content folders
 * @param {string} ppvFolderPrefix - Prefix for PPV (paid) content folders
 * @returns {Object} {context: string, mediaList: Array}
 */
function buildVaultContextForAI(availableMedia, sentMedia, allowSending = true, ppvPricing = null, sfwFolderPrefix = '', ppvFolderPrefix = '') {
  if (!availableMedia || availableMedia.length === 0) {
    return { context: '', mediaList: [] };
  }

  // Create set of already-sent UUIDs for quick lookup
  const sentUuids = new Set((sentMedia || []).map(m => m.media_uuid));

  // Categorize media into SFW and PPV based on prefixes
  // Media is already sorted oldest-first from loadCreatorMediaLibrary
  const sfwQueue = []; // Unsent SFW items (oldest first)
  const ppvQueue = []; // Unsent PPV items (oldest first)
  const uncategorizedQueue = []; // Unsent uncategorized items

  let sfwSentCount = 0;
  let ppvSentCount = 0;

  availableMedia.forEach(m => {
    const mediaName = (m.name || '').toLowerCase();
    const alreadySent = sentUuids.has(m.uuid);

    if (sfwFolderPrefix && mediaName.startsWith(sfwFolderPrefix.toLowerCase())) {
      if (alreadySent) {
        sfwSentCount++;
      } else {
        sfwQueue.push({ ...m, isSFW: true, isPPV: false });
      }
    } else if (ppvFolderPrefix && mediaName.startsWith(ppvFolderPrefix.toLowerCase())) {
      if (alreadySent) {
        ppvSentCount++;
      } else {
        ppvQueue.push({ ...m, isSFW: false, isPPV: true });
      }
    } else {
      // Uncategorized - only add if not sent
      if (!alreadySent) {
        uncategorizedQueue.push({ ...m, isSFW: false, isPPV: false });
      }
    }
  });

  console.log('[Vault Context] Queues built:', {
    sfwUnsent: sfwQueue.length,
    sfwSent: sfwSentCount,
    ppvUnsent: ppvQueue.length,
    ppvSent: ppvSentCount,
    uncategorized: uncategorizedQueue.length
  });

  // Build media list with separate numbering for SFW and PPV
  // SFW: FREE1, FREE2, FREE3...
  // PPV: PPV1, PPV2, PPV3...
  const mediaList = [];

  sfwQueue.forEach((m, index) => {
    mediaList.push({
      shortId: `FREE${index + 1}`,
      uuid: m.uuid,
      type: m.mediaType,
      description: m.description || m.name,
      isSFW: true,
      isPPV: false,
      createdAt: m.createdAt
    });
  });

  ppvQueue.forEach((m, index) => {
    mediaList.push({
      shortId: `PPV${index + 1}`,
      uuid: m.uuid,
      type: m.mediaType,
      description: m.description || m.name,
      isSFW: false,
      isPPV: true,
      createdAt: m.createdAt
    });
  });

  // Add uncategorized with IMG prefix
  uncategorizedQueue.forEach((m, index) => {
    mediaList.push({
      shortId: `IMG${index + 1}`,
      uuid: m.uuid,
      type: m.mediaType,
      description: m.description || m.name,
      isSFW: false,
      isPPV: false,
      createdAt: m.createdAt
    });
  });

  // Build context string
  let context = `\n\n=== YOUR CONTENT VAULT ===
You have exclusive content available to share with this subscriber.`;

  // Stats
  const totalUnsent = sfwQueue.length + ppvQueue.length + uncategorizedQueue.length;
  const totalSent = sfwSentCount + ppvSentCount;
  context += `\n\n📊 STATUS: ${totalUnsent} items available to send, ${totalSent} already sent to this subscriber.`;

  if (allowSending) {
    // Instructions with queue-based system
    context += `\n\n=== HOW TO SEND MEDIA ===`;

    // Free media instructions
    if (sfwQueue.length > 0) {
      context += `\n\n🟢 TO SEND FREE CONTENT: Include [SEND_MEDIA:FREE1] at the END of your message.
IMPORTANT: Always use FREE1 (the oldest unsent free item). This ensures fair rotation through your content.
Example: "Here's a little preview for you 😘 [SEND_MEDIA:FREE1]"`;
    }

    // PPV instructions
    if (ppvQueue.length > 0) {
      const price = ppvPricing?.price || 5;
      context += `\n\n💰 TO SEND PPV CONTENT: Include [SEND_PPV:PPV1] at the END of your message.
Current PPV price: $${price}
IMPORTANT: Always use PPV1 (the oldest unsent PPV item). Never resend PPV to this subscriber.
Example: "I have something extra special for you... $${price} to unlock 😈 [SEND_PPV:PPV1]"`;

      if (ppvPricing?.reason === 'escalating') {
        context += `\n(They bought ${ppvPricing.consecutivePurchases} PPV(s) in a row! Price escalated to $${price})`;
      }
    }

    // Uncategorized
    if (uncategorizedQueue.length > 0 && sfwQueue.length === 0 && ppvQueue.length === 0) {
      context += `\n\n⚪ TO SEND MEDIA: Include [SEND_MEDIA:IMG1] (free) or [SEND_PPV:IMG1] (paid) at the END.`;
    }

    context += `\n\nRULES:
- Send ONE media per message only
- Media attaches automatically when you include the command
- FREE content: Use when building rapport or rewarding engagement
- PPV content: Use when conversation is flirty/sexual and they're engaged`;
  }

  // Display queues
  const sfwList = mediaList.filter(m => m.isSFW);
  const ppvList = mediaList.filter(m => m.isPPV);
  const uncatList = mediaList.filter(m => !m.isSFW && !m.isPPV);

  context += `\n\n=== CONTENT QUEUES (Oldest First) ===`;

  // Show SFW queue
  if (sfwList.length > 0) {
    context += `\n\n🟢 FREE QUEUE (${sfwList.length} unsent):`;
    context += `\n→ NEXT UP: ${sfwList[0].shortId}`;
    const sfwSamples = sfwList.slice(0, 3);
    sfwSamples.forEach((m, i) => {
      const shortDesc = m.description.length > 40 ? m.description.substring(0, 40) + '...' : m.description;
      const marker = i === 0 ? '★' : '-';
      context += `\n${marker} ${m.shortId}: ${shortDesc}`;
    });
    if (sfwList.length > 3) {
      context += `\n  ... and ${sfwList.length - 3} more in queue`;
    }
  } else if (sfwSentCount > 0) {
    context += `\n\n🟢 FREE QUEUE: Empty (all ${sfwSentCount} items already sent to this subscriber)`;
  }

  // Show PPV queue
  if (ppvList.length > 0) {
    context += `\n\n💰 PPV QUEUE (${ppvList.length} unsent):`;
    context += `\n→ NEXT UP: ${ppvList[0].shortId}`;
    const ppvSamples = ppvList.slice(0, 3);
    ppvSamples.forEach((m, i) => {
      const shortDesc = m.description.length > 40 ? m.description.substring(0, 40) + '...' : m.description;
      const marker = i === 0 ? '★' : '-';
      context += `\n${marker} ${m.shortId}: ${shortDesc}`;
    });
    if (ppvList.length > 3) {
      context += `\n  ... and ${ppvList.length - 3} more in queue`;
    }
  } else if (ppvSentCount > 0) {
    context += `\n\n💰 PPV QUEUE: Empty (all ${ppvSentCount} items already sent - NEVER resend PPV)`;
  }

  // Show uncategorized if no prefix-based categorization
  if (uncatList.length > 0) {
    if (sfwFolderPrefix || ppvFolderPrefix) {
      context += `\n\n⚪ UNCATEGORIZED (${uncatList.length} items - need SFW_ or PPV_ prefix):`;
    } else {
      context += `\n\n📁 ALL MEDIA (${uncatList.length} items):`;
    }
    const uncatSamples = uncatList.slice(0, 4);
    uncatSamples.forEach(m => {
      const shortDesc = m.description.length > 40 ? m.description.substring(0, 40) + '...' : m.description;
      context += `\n- ${m.shortId}: ${shortDesc}`;
    });
    if (uncatList.length > 4) {
      context += `\n  ... and ${uncatList.length - 4} more`;
    }
  }

  context += `\n\nWHEN TO USE PPV vs FREE:
- 💰 Send PPV when: flirty/sexual conversation, they're engaged, they just tipped/unlocked
- 🟢 Send FREE when: casual chat, building rapport, showing appreciation
- Match the content to the conversation mood and tone
- Don't spam - space it out naturally`;

  if (sentMedia && sentMedia.length > 0) {
    context += `\n\n(Already sent ${sentMedia.length} pieces to this subscriber - avoid repeating)`;
  }

  return { context, mediaList };
}

/**
 * Parse AI response for media send commands and extract them
 * Supports formats: [SEND_MEDIA:FREE1], [SEND_PPV:PPV1], [SEND_MEDIA:IMG1], [SEND_PPV:IMG1]
 * @param {string} aiResponse - AI's response text
 * @param {Array} mediaList - List of available media with shortIds
 * @returns {Object} {text: string, mediaToSend: Object|null, isPPV: boolean}
 */
function parseMediaSendCommand(aiResponse, mediaList) {
  // Check for PPV first (paid content)
  // Matches: [SEND_PPV:PPV1], [SEND_PPV:IMG1], etc.
  const ppvMatch = aiResponse.match(/\[SEND_PPV:(PPV\d+|IMG\d+|FREE\d+)\]/i);
  if (ppvMatch) {
    const shortId = ppvMatch[1].toUpperCase();
    const mediaItem = mediaList.find(m => m.shortId === shortId);

    if (!mediaItem) {
      console.log('[AI Media] PPV Media ID not found:', shortId, '| Available:', mediaList.map(m => m.shortId).join(', '));
      return { text: aiResponse.replace(ppvMatch[0], '').trim(), mediaToSend: null, isPPV: false };
    }

    console.log('[AI Media] PPV command detected:', shortId, '→ UUID:', mediaItem.uuid);
    const cleanText = aiResponse.replace(ppvMatch[0], '').trim();
    return {
      text: cleanText,
      mediaToSend: {
        uuid: mediaItem.uuid,
        shortId: shortId,
        type: mediaItem.type
      },
      isPPV: true
    };
  }

  // Check for free media
  // Matches: [SEND_MEDIA:FREE1], [SEND_MEDIA:IMG1], etc.
  const freeMatch = aiResponse.match(/\[SEND_MEDIA:(FREE\d+|IMG\d+|PPV\d+)\]/i);
  if (freeMatch) {
    const shortId = freeMatch[1].toUpperCase();
    const mediaItem = mediaList.find(m => m.shortId === shortId);

    if (!mediaItem) {
      console.log('[AI Media] Free Media ID not found:', shortId, '| Available:', mediaList.map(m => m.shortId).join(', '));
      return { text: aiResponse.replace(freeMatch[0], '').trim(), mediaToSend: null, isPPV: false };
    }

    console.log('[AI Media] FREE command detected:', shortId, '→ UUID:', mediaItem.uuid);
    const cleanText = aiResponse.replace(freeMatch[0], '').trim();
    return {
      text: cleanText,
      mediaToSend: {
        uuid: mediaItem.uuid,
        shortId: shortId,
        type: mediaItem.type
      },
      isPPV: false
    };
  }

  // No media commands found
  return { text: aiResponse, mediaToSend: null, isPPV: false };
}

/**
 * Clear media cache (useful when changing users or forcing refresh)
 */
function clearMediaCache() {
  creatorMediaCache = {
    media: [],
    lastFetched: null,
    userId: null
  };
}

/**
 * Get cache stats for debugging
 * @returns {Object} Cache statistics
 */
function getMediaCacheStats() {
  return {
    lastFetched: creatorMediaCache.lastFetched,
    mediaCount: creatorMediaCache.media.length,
    userId: creatorMediaCache.userId
  };
}

module.exports = {
  loadCreatorMediaLibrary,
  getCreatorMediaLibrary,
  fetchMediaThumbnails,
  trackMediaSent,
  getMediaSentToSubscriber,
  getAvailableMediaForSubscriber,
  buildVaultContextForAI,
  parseMediaSendCommand,
  clearMediaCache,
  getMediaCacheStats
};
