const { supabase } = require('./index');

/**
 * Get all pending content requests (filtered by creator email)
 * @param {string} creatorEmail - Creator's email address
 * @returns {Array} Array of pending content requests
 */
async function getPendingContentRequests(creatorEmail) {
  if (!creatorEmail) {
    console.error('[Content Requests] Cannot get requests without creator email');
    return [];
  }

  const { data, error } = await supabase
    .from('content_requests')
    .select('*')
    .eq('creator_email', creatorEmail)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[Content Requests] Error fetching requests:', error);
    return [];
  }
  return data || [];
}

/**
 * Save a new content request
 * @param {Object} requestData - Request data object
 * @param {string} creatorEmail - Creator's email address
 * @returns {Object|null} Saved request or null on error
 */
async function saveContentRequest(requestData, creatorEmail) {
  if (!creatorEmail) {
    console.error('[Content Requests] Cannot save request without creator email');
    return null;
  }

  const { data, error } = await supabase
    .from('content_requests')
    .insert({
      conversation_uuid: requestData.conversationUuid,
      subscriber_handle: requestData.subscriberHandle,
      request_type: requestData.requestType, // 'picture', 'voice_note', 'video', 'custom'
      original_message: requestData.originalMessage,
      ai_response: requestData.aiResponse,
      persona_name: requestData.personaName,
      creator_email: creatorEmail,
      status: 'pending',
      created_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    console.error('[Content Requests] Error saving request:', error);
    return null;
  }
  console.log('[Content Requests] Saved request from:', requestData.subscriberHandle, '- Type:', requestData.requestType);
  return data;
}

/**
 * Mark a content request as fulfilled
 * @param {number} requestId - Request ID
 * @param {string} creatorEmail - Creator's email address
 * @returns {Object|null} Updated request or null on error
 */
async function fulfillContentRequest(requestId, creatorEmail) {
  if (!creatorEmail) {
    console.error('[Content Requests] Cannot fulfill request without creator email');
    return null;
  }

  const { data, error } = await supabase
    .from('content_requests')
    .update({
      status: 'fulfilled',
      fulfilled_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .eq('creator_email', creatorEmail) // Security: only update own requests
    .select()
    .single();

  if (error) {
    console.error('[Content Requests] Error fulfilling request:', error);
    return null;
  }
  return data;
}

/**
 * Dismiss/ignore a content request
 * @param {number} requestId - Request ID
 * @param {string} creatorEmail - Creator's email address
 * @returns {Object|null} Updated request or null on error
 */
async function dismissContentRequest(requestId, creatorEmail) {
  if (!creatorEmail) {
    console.error('[Content Requests] Cannot dismiss request without creator email');
    return null;
  }

  const { data, error } = await supabase
    .from('content_requests')
    .update({
      status: 'dismissed',
      dismissed_at: new Date().toISOString()
    })
    .eq('id', requestId)
    .eq('creator_email', creatorEmail) // Security: only update own requests
    .select()
    .single();

  if (error) {
    console.error('[Content Requests] Error dismissing request:', error);
    return null;
  }
  return data;
}

module.exports = {
  getPendingContentRequests,
  saveContentRequest,
  fulfillContentRequest,
  dismissContentRequest
};
