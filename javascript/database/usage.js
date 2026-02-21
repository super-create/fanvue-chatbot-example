const { supabase } = require('./index');

/**
 * Get the current month key (e.g., '2026-02')
 * @returns {string}
 */
function getCurrentMonth() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get usage for a user for the current month
 * @param {string} userId - Internal user UUID
 * @returns {Object} Usage data (with defaults if no record exists)
 */
async function getUsage(userId) {
  const month = getCurrentMonth();

  const { data, error } = await supabase
    .from('usage_tracking')
    .select('*')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB:Usage] Error fetching usage:', error);
  }

  return data || {
    user_id: userId,
    month,
    ai_requests: 0,
    ai_tokens_used: 0,
    media_descriptions: 0
  };
}

/**
 * Increment AI request count and token usage
 * @param {string} userId
 * @param {number} tokensUsed - Tokens from this request
 * @returns {Object|null}
 */
async function trackAIRequest(userId, tokensUsed = 0) {
  const month = getCurrentMonth();

  // Try to increment existing record
  const { data: existing } = await supabase
    .from('usage_tracking')
    .select('id, ai_requests, ai_tokens_used')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('usage_tracking')
      .update({
        ai_requests: existing.ai_requests + 1,
        ai_tokens_used: existing.ai_tokens_used + tokensUsed,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('[DB:Usage] Error updating usage:', error);
      return null;
    }
    return data;
  } else {
    const { data, error } = await supabase
      .from('usage_tracking')
      .insert({
        user_id: userId,
        month,
        ai_requests: 1,
        ai_tokens_used: tokensUsed,
        media_descriptions: 0
      })
      .select()
      .single();

    if (error) {
      console.error('[DB:Usage] Error creating usage record:', error);
      return null;
    }
    return data;
  }
}

/**
 * Increment media description count
 * @param {string} userId
 * @returns {Object|null}
 */
async function trackMediaDescription(userId) {
  const month = getCurrentMonth();

  const { data: existing } = await supabase
    .from('usage_tracking')
    .select('id, media_descriptions')
    .eq('user_id', userId)
    .eq('month', month)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('usage_tracking')
      .update({
        media_descriptions: existing.media_descriptions + 1,
        updated_at: new Date().toISOString()
      })
      .eq('id', existing.id)
      .select()
      .single();

    if (error) {
      console.error('[DB:Usage] Error updating media desc count:', error);
      return null;
    }
    return data;
  } else {
    const { data, error } = await supabase
      .from('usage_tracking')
      .insert({
        user_id: userId,
        month,
        ai_requests: 0,
        ai_tokens_used: 0,
        media_descriptions: 1
      })
      .select()
      .single();

    if (error) {
      console.error('[DB:Usage] Error creating usage record:', error);
      return null;
    }
    return data;
  }
}

// Monthly limits per plan
const PLAN_LIMITS = {
  starter: {
    ai_requests: 5000,
    ai_tokens: 5000000,
    media_descriptions: 500
  }
};

/**
 * Check if user is within their plan limits
 * @param {string} userId
 * @param {string} plan - Plan name (default 'starter')
 * @returns {Object} { allowed: boolean, usage: Object, limits: Object }
 */
async function checkUsageLimits(userId, plan = 'starter') {
  const usage = await getUsage(userId);
  const limits = PLAN_LIMITS[plan] || PLAN_LIMITS.starter;

  return {
    allowed: usage.ai_requests < limits.ai_requests,
    usage: {
      ai_requests: usage.ai_requests,
      ai_tokens_used: usage.ai_tokens_used,
      media_descriptions: usage.media_descriptions
    },
    limits
  };
}

module.exports = {
  getUsage,
  trackAIRequest,
  trackMediaDescription,
  checkUsageLimits,
  PLAN_LIMITS
};
