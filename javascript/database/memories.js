const { supabase } = require('./index');

/**
 * Get subscriber memory (specific to creator account)
 * @param {string} conversationUuid - Conversation UUID
 * @param {string} creatorEmail - Creator's email address
 * @returns {Object|null} Memory data or null if not found
 */
async function getSubscriberMemory(conversationUuid, creatorEmail) {
  if (!creatorEmail) {
    console.error('[DB] Cannot get subscriber memory without creator email');
    return null;
  }

  const { data, error} = await supabase
    .from('subscriber_memories')
    .select('*')
    .eq('conversation_uuid', conversationUuid)
    .eq('creator_email', creatorEmail)
    .single();

  if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
    console.error('[DB] Error fetching subscriber memory:', error);
    return null;
  }
  return data;
}

/**
 * Create or update subscriber memory (specific to creator account)
 * @param {string} conversationUuid - Conversation UUID
 * @param {string} creatorEmail - Creator's email address
 * @param {Object} memoryData - Memory data to save
 * @returns {Object|null} Saved memory or null on error
 */
async function saveSubscriberMemory(conversationUuid, creatorEmail, memoryData) {
  if (!creatorEmail) {
    console.error('[DB] Cannot save subscriber memory without creator email');
    return null;
  }

  const { data: existing } = await supabase
    .from('subscriber_memories')
    .select('id')
    .eq('conversation_uuid', conversationUuid)
    .eq('creator_email', creatorEmail)
    .single();

  if (existing) {
    // Update existing
    const { data, error } = await supabase
      .from('subscriber_memories')
      .update({ ...memoryData, updated_at: new Date().toISOString() })
      .eq('conversation_uuid', conversationUuid)
      .eq('creator_email', creatorEmail)
      .select()
      .single();

    if (error) {
      console.error('[DB] Error updating subscriber memory:', error);
      return null;
    }
    return data;
  } else {
    // Insert new
    const { data, error } = await supabase
      .from('subscriber_memories')
      .insert({
        conversation_uuid: conversationUuid,
        creator_email: creatorEmail,
        ...memoryData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[DB] Error creating subscriber memory:', error);
      return null;
    }
    return data;
  }
}

module.exports = {
  getSubscriberMemory,
  saveSubscriberMemory
};
