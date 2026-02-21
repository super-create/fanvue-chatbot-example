const { getSubscription, isSubscriptionActive } = require('../database/subscriptions');

/**
 * Middleware: Require an active subscription (or trial).
 * Must be used AFTER requireAuth (needs session.userId).
 * Returns 403 with error code 'subscription_required' if no active subscription.
 */
async function requireSubscription(req, res, next) {
  // Must have a userId in session (set during login)
  const userId = req.session.userId;
  if (!userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // Check cached subscription in session first
  if (req.session.subscription && isSubscriptionActive(req.session.subscription)) {
    return next();
  }

  // Cache miss or expired — check database
  const subscription = await getSubscription(userId);
  req.session.subscription = subscription;

  if (isSubscriptionActive(subscription)) {
    return next();
  }

  return res.status(403).json({
    error: 'subscription_required',
    message: 'An active subscription is required to use this feature.',
    subscription: subscription ? {
      status: subscription.status,
      trial_ends_at: subscription.trial_ends_at,
      current_period_end: subscription.current_period_end
    } : { status: 'none' }
  });
}

module.exports = { requireSubscription };
