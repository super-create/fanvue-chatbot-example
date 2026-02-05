const { supabase } = require('./index');

/**
 * Get analytics data for a user
 * @param {string} userEmail - User's email address
 * @returns {Object} Analytics data
 */
async function getAnalytics(userEmail) {
  const { data, error } = await supabase
    .from('ai_settings')
    .select('analytics_data')
    .eq('user_email', userEmail)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB] Error fetching analytics:', error);
    return getDefaultAnalytics();
  }

  return data?.analytics_data || getDefaultAnalytics();
}

/**
 * Save analytics data for a user
 * @param {string} userEmail - User's email address
 * @param {Object} analyticsData - Analytics data to save
 */
async function saveAnalytics(userEmail, analyticsData) {
  // Check if user exists in ai_settings
  const { data: existing } = await supabase
    .from('ai_settings')
    .select('id')
    .eq('user_email', userEmail)
    .single();

  if (existing) {
    // Update existing record
    const { error } = await supabase
      .from('ai_settings')
      .update({
        analytics_data: analyticsData,
        updated_at: new Date().toISOString()
      })
      .eq('user_email', userEmail);

    if (error) {
      console.error('[DB] Error updating analytics:', error);
    }
  } else {
    // Insert new record
    const { error } = await supabase
      .from('ai_settings')
      .insert({
        user_email: userEmail,
        analytics_data: analyticsData
      });

    if (error) {
      console.error('[DB] Error creating analytics:', error);
    }
  }
}

/**
 * Reset analytics data for a user
 * @param {string} userEmail - User's email address
 */
async function resetAnalytics(userEmail) {
  const { error } = await supabase
    .from('ai_settings')
    .update({
      analytics_data: getDefaultAnalytics(),
      updated_at: new Date().toISOString()
    })
    .eq('user_email', userEmail);

  if (error) {
    console.error('[DB] Error resetting analytics:', error);
  }
}

/**
 * Get default analytics structure
 */
function getDefaultAnalytics() {
  return {
    messagesSent: 0,
    messagesReceived: 0,
    aiRepliesSent: 0,
    conversationStats: {},
    dailyStats: {}
  };
}

module.exports = {
  getAnalytics,
  saveAnalytics,
  resetAnalytics,
  getDefaultAnalytics
};
