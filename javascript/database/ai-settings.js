const { supabase } = require('./index');

/**
 * Get AI settings for a user
 * @param {string} userEmail - User's email address
 * @returns {Object|null} AI settings or null if not found
 */
async function getAISettings(userEmail) {
  const { data, error } = await supabase
    .from('ai_settings')
    .select('*')
    .eq('user_email', userEmail)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error fetching AI settings:', error);
    return null;
  }
  return data;
}

/**
 * Save AI settings for a user
 * @param {string} userEmail - User's email address
 * @param {Object} settings - Settings object to save
 * @returns {Object|null} Saved settings or null on error
 */
async function saveAISettings(userEmail, settings) {
  const { data: existing } = await supabase
    .from('ai_settings')
    .select('id')
    .eq('user_email', userEmail)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('ai_settings')
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq('user_email', userEmail)
      .select()
      .single();

    if (error) {
      console.error('[DB] Error updating AI settings:', error);
      return null;
    }
    return data;
  } else {
    const { data, error } = await supabase
      .from('ai_settings')
      .insert({ user_email: userEmail, ...settings })
      .select()
      .single();

    if (error) {
      console.error('[DB] Error creating AI settings:', error);
      return null;
    }
    return data;
  }
}

module.exports = {
  getAISettings,
  saveAISettings
};
