const { supabase } = require('./index');

/**
 * Find or create a user from Fanvue OAuth data.
 * Called on every login to ensure user record exists.
 * @param {Object} params
 * @param {string} params.fanvueUserUuid - Fanvue user UUID
 * @param {string} params.email - User email
 * @param {string} params.handle - Fanvue handle/username
 * @returns {Object|null} User record
 */
async function upsertUser({ fanvueUserUuid, email, handle }) {
  if (!fanvueUserUuid) {
    console.error('[DB:Users] Cannot upsert without fanvue_user_uuid');
    return null;
  }

  const { data, error } = await supabase
    .from('users')
    .upsert(
      {
        fanvue_user_uuid: fanvueUserUuid,
        email: email || null,
        fanvue_handle: handle || null,
        last_login_at: new Date().toISOString()
      },
      { onConflict: 'fanvue_user_uuid' }
    )
    .select()
    .single();

  if (error) {
    console.error('[DB:Users] Error upserting user:', error);
    return null;
  }

  console.log('[DB:Users] User upserted:', data.id, email || handle);
  return data;
}

/**
 * Get user by internal ID
 * @param {string} userId - Internal UUID
 * @returns {Object|null}
 */
async function getUserById(userId) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB:Users] Error fetching user:', error);
    return null;
  }
  return data;
}

/**
 * Get user by Fanvue UUID
 * @param {string} fanvueUserUuid
 * @returns {Object|null}
 */
async function getUserByFanvueUuid(fanvueUserUuid) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('fanvue_user_uuid', fanvueUserUuid)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB:Users] Error fetching user by fanvue uuid:', error);
    return null;
  }
  return data;
}

module.exports = {
  upsertUser,
  getUserById,
  getUserByFanvueUuid
};
