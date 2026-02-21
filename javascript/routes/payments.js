const express = require('express');
const crypto = require('crypto');
const router = express.Router();

const { upsertSubscription, getSubscription, isSubscriptionActive, getSubscriptionByPaystackCustomer } = require('../database/subscriptions');
const { getUserByFanvueUuid } = require('../database/users');

// ============================================
// POST /api/subscribe
// Initializes a Paystack checkout session.
// Returns a URL to redirect the user to.
// ============================================
router.post('/api/subscribe', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const email = req.session.userEmail;
  const userId = req.session.userId;

  if (!email) {
    return res.status(400).json({ error: 'No email on session. Please log out and log in again.' });
  }

  const appUrl = process.env.APP_URL || 'http://localhost:3000';
  const callbackUrl = `${appUrl}/subscribe/callback`;

  try {
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        email,
        plan: process.env.PAYSTACK_PLAN_CODE,
        callback_url: callbackUrl,
        metadata: {
          user_id: userId || null,
          fanvue_user_uuid: req.session.fanvueUserUuid || null,
          cancel_action: `${appUrl}/`
        }
      })
    });

    const data = await response.json();

    if (!data.status || !data.data?.authorization_url) {
      console.error('[Paystack] Initialize failed:', data);
      return res.status(500).json({ error: 'Failed to initialize payment', details: data.message });
    }

    console.log('[Paystack] Checkout initialized for:', email, 'ref:', data.data.reference);
    return res.json({ authorization_url: data.data.authorization_url });

  } catch (error) {
    console.error('[Paystack] Subscribe error:', error.message);
    return res.status(500).json({ error: 'Payment system error', details: error.message });
  }
});

// ============================================
// GET /api/subscription
// Returns current subscription status for the logged-in user.
// Safe to call without an active subscription (used by paywall).
// ============================================
router.get('/api/subscription', async (req, res) => {
  if (!req.session.access_token) {
    return res.json({ subscription: { status: 'none' } });
  }

  const userId = req.session.userId;

  if (!userId) {
    return res.json({ subscription: { status: 'none' } });
  }

  // Refresh from DB (don't rely solely on session cache)
  const subscription = await getSubscription(userId);
  if (subscription) {
    req.session.subscription = subscription;
  }

  const sub = subscription || { status: 'none' };
  return res.json({
    subscription: {
      status: sub.status || 'none',
      plan: sub.plan || null,
      isActive: isSubscriptionActive(sub),
      trialEndsAt: sub.trial_ends_at || null,
      currentPeriodEnd: sub.current_period_end || null
    }
  });
});

// ============================================
// GET /subscribe/callback
// Paystack redirects here after payment completes.
// Verifies the transaction and activates the subscription.
// ============================================
router.get('/subscribe/callback', async (req, res) => {
  const reference = req.query.reference;
  const trxref = req.query.trxref; // Paystack sometimes uses this

  const ref = reference || trxref;

  if (!ref) {
    console.error('[Paystack] Callback called without reference');
    return res.redirect('/?payment=error');
  }

  try {
    // Verify the transaction with Paystack
    const verifyRes = await fetch(`https://api.paystack.co/transaction/verify/${ref}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` }
    });

    const verification = await verifyRes.json();

    if (!verification.status || verification.data?.status !== 'success') {
      console.error('[Paystack] Verification failed:', verification.data?.status);
      return res.redirect('/?payment=failed');
    }

    const txData = verification.data;
    console.log('[Paystack] Payment verified:', ref, txData.customer?.email);

    // Get user from session or metadata
    let userId = req.session.userId;

    // If session doesn't have userId, try to get from metadata
    if (!userId && txData.metadata?.user_id) {
      userId = txData.metadata.user_id;
    }

    if (userId) {
      // Activate the subscription immediately
      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);

      await upsertSubscription(userId, {
        status: 'active',
        plan: 'starter',
        email: txData.customer?.email,
        fanvue_user_uuid: txData.metadata?.fanvue_user_uuid || req.session.fanvueUserUuid || null,
        paystack_customer_id: txData.customer?.customer_code || null,
        paystack_authorization_code: txData.authorization?.authorization_code || null,
        current_period_start: new Date().toISOString(),
        current_period_end: periodEnd.toISOString()
      });

      // Update session so the app immediately knows
      req.session.subscription = { status: 'active', plan: 'starter' };
      console.log('[Paystack] Subscription activated for userId:', userId);
    } else {
      console.error('[Paystack] Could not identify user for subscription activation');
    }

    return res.redirect('/?payment=success');

  } catch (error) {
    console.error('[Paystack] Callback error:', error.message);
    return res.redirect('/?payment=error');
  }
});

// ============================================
// Paystack Webhook Handler
// NOTE: This is exported separately because it needs
// express.raw() (raw body) for signature verification.
// It is mounted in app.js BEFORE express.json().
// ============================================
async function paystackWebhookHandler(req, res) {
  // Verify webhook signature
  const secret = process.env.PAYSTACK_SECRET_KEY;
  const hash = crypto
    .createHmac('sha512', secret)
    .update(req.body) // req.body is a raw Buffer here
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    console.error('[Paystack Webhook] Invalid signature - rejected');
    return res.status(400).send('Invalid signature');
  }

  let event;
  try {
    event = JSON.parse(req.body.toString());
  } catch (e) {
    return res.status(400).send('Invalid JSON');
  }

  console.log('[Paystack Webhook] Event:', event.event);

  // Always respond 200 first to prevent Paystack retries
  res.sendStatus(200);

  // Process event asynchronously
  try {
    await handlePaystackEvent(event);
  } catch (err) {
    console.error('[Paystack Webhook] Handler error:', err.message);
  }
}

async function handlePaystackEvent(event) {
  const data = event.data;

  switch (event.event) {

    case 'charge.success': {
      // A payment succeeded (initial or recurring)
      const customerCode = data.customer?.customer_code;
      const email = data.customer?.email;
      console.log('[Paystack Webhook] charge.success for:', email);

      // Find user by Paystack customer code or email
      let userId = data.metadata?.user_id || null;

      if (!userId && customerCode) {
        const existingSub = await getSubscriptionByPaystackCustomer(customerCode);
        if (existingSub) userId = existingSub.user_id;
      }

      if (userId) {
        const periodEnd = new Date();
        periodEnd.setMonth(periodEnd.getMonth() + 1);

        await upsertSubscription(userId, {
          status: 'active',
          plan: 'starter',
          email,
          paystack_customer_id: customerCode || null,
          paystack_authorization_code: data.authorization?.authorization_code || null,
          current_period_start: new Date().toISOString(),
          current_period_end: periodEnd.toISOString()
        });
        console.log('[Paystack Webhook] Subscription renewed for userId:', userId);
      }
      break;
    }

    case 'subscription.create': {
      const customerCode = data.customer?.customer_code;
      const subCode = data.subscription_code;
      const email = data.customer?.email;
      console.log('[Paystack Webhook] subscription.create for:', email);

      let userId = null;
      if (customerCode) {
        const existingSub = await getSubscriptionByPaystackCustomer(customerCode);
        if (existingSub) userId = existingSub.user_id;
      }

      if (userId) {
        await upsertSubscription(userId, {
          status: 'active',
          paystack_subscription_code: subCode || null,
          paystack_customer_id: customerCode || null
        });
        console.log('[Paystack Webhook] Subscription code saved for userId:', userId);
      }
      break;
    }

    case 'subscription.disable':
    case 'subscription.not_renew': {
      const customerCode = data.customer?.customer_code;
      console.log('[Paystack Webhook]', event.event, 'for customer:', customerCode);

      if (customerCode) {
        const existingSub = await getSubscriptionByPaystackCustomer(customerCode);
        if (existingSub?.user_id) {
          await upsertSubscription(existingSub.user_id, {
            status: 'cancelled',
            cancelled_at: new Date().toISOString()
          });
          console.log('[Paystack Webhook] Subscription cancelled for userId:', existingSub.user_id);
        }
      }
      break;
    }

    case 'invoice.payment_failed': {
      const customerCode = data.customer?.customer_code;
      console.log('[Paystack Webhook] payment failed for customer:', customerCode);

      if (customerCode) {
        const existingSub = await getSubscriptionByPaystackCustomer(customerCode);
        if (existingSub?.user_id) {
          // Mark as expired — they'll see paywall on next login
          await upsertSubscription(existingSub.user_id, {
            status: 'expired'
          });
          console.log('[Paystack Webhook] Subscription expired for userId:', existingSub.user_id);
        }
      }
      break;
    }

    default:
      console.log('[Paystack Webhook] Unhandled event:', event.event);
  }
}

module.exports = { paymentsRouter: router, paystackWebhookHandler };
