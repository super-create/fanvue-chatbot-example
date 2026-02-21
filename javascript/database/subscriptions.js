const { supabase } = require('./index');

/**
 * Get subscription for a user
 * @param {string} userId - Internal user UUID
 * @returns {Object|null} Subscription record or null
 */
async function getSubscription(userId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB:Subscriptions] Error fetching subscription:', error);
    return null;
  }
  return data;
}

/**
 * Create or update a subscription
 * @param {string} userId - Internal user UUID
 * @param {Object} subData - Subscription fields to set
 * @returns {Object|null} Updated subscription
 */
async function upsertSubscription(userId, subData) {
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('user_id', userId)
    .single();

  if (existing) {
    const { data, error } = await supabase
      .from('subscriptions')
      .update({ ...subData, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
      .select()
      .single();

    if (error) {
      console.error('[DB:Subscriptions] Error updating subscription:', error);
      return null;
    }
    return data;
  } else {
    const { data, error } = await supabase
      .from('subscriptions')
      .insert({
        user_id: userId,
        ...subData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[DB:Subscriptions] Error creating subscription:', error);
      return null;
    }
    return data;
  }
}

/**
 * Activate a subscription (called from Paystack webhook)
 * @param {string} userId
 * @param {Object} paystackData - Paystack event data
 * @returns {Object|null}
 */
async function activateSubscription(userId, paystackData) {
  return upsertSubscription(userId, {
    status: 'active',
    paystack_customer_id: paystackData.customer_id || null,
    paystack_subscription_code: paystackData.subscription_code || null,
    paystack_authorization_code: paystackData.authorization_code || null,
    current_period_start: new Date().toISOString(),
    current_period_end: paystackData.next_payment_date || null
  });
}

/**
 * Start a free trial
 * @param {string} userId
 * @param {number} trialDays - Number of trial days (default 7)
 * @returns {Object|null}
 */
async function startTrial(userId, trialDays = 7) {
  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + trialDays);

  return upsertSubscription(userId, {
    status: 'trialing',
    trial_ends_at: trialEnd.toISOString(),
    current_period_start: new Date().toISOString(),
    current_period_end: trialEnd.toISOString()
  });
}

/**
 * Cancel a subscription
 * @param {string} userId
 * @returns {Object|null}
 */
async function cancelSubscription(userId) {
  return upsertSubscription(userId, {
    status: 'cancelled',
    cancelled_at: new Date().toISOString()
  });
}

/**
 * Check if a subscription is currently active
 * @param {Object} subscription - Subscription record
 * @returns {boolean}
 */
function isSubscriptionActive(subscription) {
  if (!subscription) return false;

  if (subscription.status === 'active') return true;

  if (subscription.status === 'trialing') {
    if (!subscription.trial_ends_at) return false;
    return new Date(subscription.trial_ends_at) > new Date();
  }

  return false;
}

/**
 * Get subscription by Paystack customer ID (for webhook lookups)
 * @param {string} paystackCustomerId
 * @returns {Object|null}
 */
async function getSubscriptionByPaystackCustomer(paystackCustomerId) {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, users(*)')
    .eq('paystack_customer_id', paystackCustomerId)
    .single();

  if (error && error.code !== 'PGRST116') {
    console.error('[DB:Subscriptions] Error fetching by paystack customer:', error);
    return null;
  }
  return data;
}

module.exports = {
  getSubscription,
  upsertSubscription,
  activateSubscription,
  startTrial,
  cancelSubscription,
  isSubscriptionActive,
  getSubscriptionByPaystackCustomer
};
