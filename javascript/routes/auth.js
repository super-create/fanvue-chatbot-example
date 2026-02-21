const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const path = require('path');
const router = express.Router();

const { fanvueRequest } = require('../services/fanvue-api');
const { getAISettings } = require('../database/ai-settings');
const { getCreatorPersona } = require('../database/personas');
const { upsertUser } = require('../database/users');
const { getSubscription, isSubscriptionActive, upsertSubscription } = require('../database/subscriptions');

// PKCE helpers
function base64url(input) {
  return input
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function generatePkce() {
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(
    crypto.createHash('sha256').update(verifier).digest()
  );
  return { verifier, challenge };
}

/**
 * Initialize auth routes
 * @param {Object} config - Configuration object
 * @param {string} config.OAUTH_CLIENT_ID - OAuth client ID
 * @param {string} config.OAUTH_CLIENT_SECRET - OAuth client secret
 * @param {string} config.OAUTH_REDIRECT_URI - OAuth redirect URI
 * @param {string} config.OAUTH_SCOPES - OAuth scopes
 * @param {string} config.OAUTH_AUTH_URL - OAuth authorization URL
 * @param {string} config.OAUTH_TOKEN_URL - OAuth token URL
 * @param {string} config.API_BASE_URL - Fanvue API base URL
 * @param {string} config.API_VERSION - API version
 * @param {Function} config.renderTemplate - Template rendering function
 * @param {string} config.HTML_TEMPLATE - HTML template string
 * @returns {Router} Express router
 */
function createAuthRoutes(config) {
  const {
    OAUTH_CLIENT_ID,
    OAUTH_CLIENT_SECRET,
    OAUTH_REDIRECT_URI,
    OAUTH_SCOPES,
    OAUTH_AUTH_URL,
    OAUTH_TOKEN_URL,
    API_BASE_URL,
    API_VERSION,
    renderTemplate,
    HTML_TEMPLATE
  } = config;

  // GET / - Home page
  router.get('/', async (req, res) => {
    // Not logged in → serve static landing page instantly (no React bundle overhead)
    if (!req.session.access_token) {
      const landingPath = path.join(__dirname, '..', 'public', 'landing.html');
      return res.sendFile(landingPath);
    }

    // Logged in → serve React app
    const reactIndexPath = path.join(__dirname, '..', 'client', 'dist', 'index.html');
    res.sendFile(reactIndexPath);

    // Load settings into session in background (non-blocking)
    // This will be available for subsequent API calls
    if (req.session.access_token && !req.session.settingsLoaded) {
      setImmediate(async () => {
        try {
          const profileResponse = await fanvueRequest('get', '/users/me', {
            headers: {
              'Authorization': `Bearer ${req.session.access_token}`,
              'X-Fanvue-API-Version': API_VERSION
            }
          });

          if (profileResponse?.status === 200) {
            const userInfo = profileResponse.data;
            const userEmail = userInfo.email || userInfo.username || 'unknown';
            req.session.userEmail = userEmail;

            // Load saved AI settings from database
            const savedSettings = await getAISettings(userEmail);
            if (savedSettings) {
              req.session.systemPrompt = savedSettings.system_prompt || req.session.systemPrompt;
              req.session.aiMode = savedSettings.ai_mode || req.session.aiMode;
              req.session.maxReplyTokens = savedSettings.max_reply_tokens || req.session.maxReplyTokens;
              req.session.maxProfileTokens = savedSettings.max_profile_tokens || req.session.maxProfileTokens;
              req.session.replyTemperature = savedSettings.reply_temperature ?? req.session.replyTemperature;
              req.session.aiModel = savedSettings.ai_model || req.session.aiModel;
              req.session.profileModel = savedSettings.profile_model || req.session.profileModel;
              req.session.fastResponseMode = savedSettings.fast_response_mode ?? req.session.fastResponseMode;
              console.log('[Settings] Loaded saved settings from database for:', userEmail);
            }
            req.session.settingsLoaded = true;
          }
        } catch (error) {
          console.error('[Settings] Error loading settings in background:', error.message);
        }
      });
    }
  });

  // GET /login - Initiate OAuth flow
  router.get('/login', (req, res) => {
    const { verifier, challenge } = generatePkce();
    const state = crypto.randomBytes(32).toString('hex');

    req.session.codeVerifier = verifier;
    req.session.state = state;

    const params = new URLSearchParams({
      client_id: OAUTH_CLIENT_ID,
      redirect_uri: OAUTH_REDIRECT_URI,
      response_type: 'code',
      scope: OAUTH_SCOPES,
      state: state,
      code_challenge: challenge,
      code_challenge_method: 'S256'
    });

    const authUrl = `${OAUTH_AUTH_URL}?${params.toString()}`;
    res.redirect(authUrl);
  });

  // GET /callback - OAuth callback handler
  router.get('/callback', async (req, res) => {
    const code = req.query.code;
    const state = req.query.state;

    if (!code) {
      return res.redirect('/');
    }

    if (state !== req.session.state) {
      return res.status(400).send('Error: Invalid state parameter');
    }

    const codeVerifier = req.session.codeVerifier;
    if (!codeVerifier) {
      return res.status(400).send('Error: Missing code verifier. Please try logging in again.');
    }

    try {
      const authHeader = Buffer.from(
        `${OAUTH_CLIENT_ID}:${OAUTH_CLIENT_SECRET}`
      ).toString('base64');

      const tokenResponse = await axios.post(
        OAUTH_TOKEN_URL,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: OAUTH_REDIRECT_URI,
          client_id: OAUTH_CLIENT_ID,
          code_verifier: codeVerifier
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': `Basic ${authHeader}`
          }
        }
      );

      req.session.access_token = tokenResponse.data.access_token;
      if (tokenResponse.data.refresh_token) {
        req.session.refresh_token = tokenResponse.data.refresh_token;
      }

      req.session.codeVerifier = null;
      req.session.state = null;

      // Fetch user profile to get email and identity
      try {
        const profileResponse = await axios.get(`${API_BASE_URL}/users/me`, {
          headers: {
            'Authorization': `Bearer ${req.session.access_token}`,
            'X-API-Version': API_VERSION
          }
        });

        const userEmail = profileResponse.data.email;
        const fanvueUserUuid = profileResponse.data.uuid;
        const fanvueHandle = profileResponse.data.username || profileResponse.data.handle;
        req.session.userEmail = userEmail;
        req.session.fanvueUserUuid = fanvueUserUuid;
        console.log('[Auth] User logged in:', userEmail);

        // Upsert user record in our database
        const user = await upsertUser({
          fanvueUserUuid,
          email: userEmail,
          handle: fanvueHandle
        });

        if (user) {
          req.session.userId = user.id;
          console.log('[Auth] User record:', user.id);

          // Load subscription status — auto-start trial for brand new users
          let subscription = await getSubscription(user.id);
          if (!subscription) {
            console.log('[Auth] New user — starting 7-day free trial for:', userEmail);
            const trialEnd = new Date();
            trialEnd.setDate(trialEnd.getDate() + 7);
            subscription = await upsertSubscription(user.id, {
              fanvue_user_uuid: fanvueUserUuid,
              status: 'trialing',
              plan: 'trial',
              trial_ends_at: trialEnd.toISOString(),
              current_period_start: new Date().toISOString(),
              current_period_end: trialEnd.toISOString()
            });
          }
          req.session.subscription = subscription || { status: 'none' };
          console.log('[Auth] Subscription status:', subscription?.status || 'none');
        }

        // Load user's persona (if they have one)
        const persona = await getCreatorPersona(userEmail);
        if (persona) {
          req.session.creatorProfile = persona;
          if (persona.system_prompt) {
            req.session.systemPrompt = persona.system_prompt;
          }
          console.log('[Auth] Loaded persona for:', userEmail);
        } else {
          console.log('[Auth] No persona found for:', userEmail, '- user will need to create one');
        }

        // Load user's AI settings
        const aiSettings = await getAISettings(userEmail);
        if (aiSettings) {
          req.session.systemPrompt = aiSettings.system_prompt || req.session.systemPrompt;
          req.session.aiMode = aiSettings.ai_mode || 'manual';
          req.session.maxReplyTokens = aiSettings.max_reply_tokens;
          req.session.maxProfileTokens = aiSettings.max_profile_tokens;
          req.session.replyTemperature = aiSettings.reply_temperature;
          req.session.aiModel = aiSettings.ai_model;
          req.session.profileModel = aiSettings.profile_model;
          req.session.fastResponseMode = aiSettings.fast_response_mode;
          req.session.vaultAwarenessEnabled = aiSettings.vault_awareness_enabled;
          req.session.tipTrackingEnabled = aiSettings.tip_tracking_enabled;
          req.session.ppvAwarenessEnabled = aiSettings.ppv_awareness_enabled;
          req.session.sfwFolderPrefix = aiSettings.sfw_folder_prefix;
          req.session.ppvFolderPrefix = aiSettings.ppv_folder_prefix;
          console.log('[Auth] Loaded AI settings for:', userEmail);
        }
      } catch (profileError) {
        console.error('[Auth] Error loading user profile/settings:', profileError.message);
        // Continue anyway - user can still use the app
      }

      res.redirect('/');
    } catch (error) {
      console.error('Token exchange error:', error.response?.data || error.message);
      const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
      res.status(500).send(`Error: Failed to get access token. ${errorText}`);
    }
  });

  // GET /logout - Destroy session and logout
  router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
      if (err) {
        console.error('Session destroy error:', err);
      }
      res.redirect('/');
    });
  });

  return router;
}

module.exports = { createAuthRoutes };
