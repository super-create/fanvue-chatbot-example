const { getSubscription, isSubscriptionActive } = require('../database/subscriptions');
const axios = require('axios');

const FANVUE_APP_UUID = process.env.FANVUE_APP_UUID || '2f83bd4f-bcdc-40af-ab9e-4eb942bf34c5';
const API_VERSION = process.env.API_VERSION || '2025-06-26';
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.fanvue.com';

async function checkFanvueSubscription(accessToken) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/apps/${FANVUE_APP_UUID}/subscription/me`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'X-Fanvue-API-Version': API_VERSION,
        },
        timeout: 5000,
      }
    );
    return response.data?.hasActiveSubscription === true;
  } catch (err) {
    if (err.response?.status === 404) {
      // No subscription record — not subscribed
      return false;
    }
    console.error('[Subscription] Fanvue API check failed:', err.message);
    return null; // null = inconclusive, fall through to DB check
  }
}

/**
 * Middleware: Require an active subscription.
 * Checks Fanvue's API first, falls back to Supabase for legacy Paystack subscribers.
 */
async function requireSubscription(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // 1. Check Fanvue subscription API
  if (req.session.access_token) {
    const fanvueActive = await checkFanvueSubscription(req.session.access_token);
    if (fanvueActive === true) {
      return next();
    }
  }

  // 2. Fall back to Supabase (legacy Paystack subscribers)
  if (req.session.subscription && isSubscriptionActive(req.session.subscription)) {
    return next();
  }

  const subscription = await getSubscription(req.session.userId);
  req.session.subscription = subscription;

  if (isSubscriptionActive(subscription)) {
    return next();
  }

  return res.status(403).json({
    error: 'subscription_required',
    message: 'An active subscription is required to use this feature.',
    subscription: subscription
      ? { status: subscription.status }
      : { status: 'none' },
  });
}

module.exports = { requireSubscription };
