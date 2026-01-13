const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

const OAUTH_CLIENT_ID = process.env.OAUTH_CLIENT_ID;
const OAUTH_CLIENT_SECRET = process.env.OAUTH_CLIENT_SECRET;
const OAUTH_REDIRECT_URI = process.env.OAUTH_REDIRECT_URI || 'http://localhost:3000/callback';
const DEFAULT_SCOPES = 'openid offline_access offline';
const USER_SCOPES = process.env.OAUTH_SCOPES || 'read:self read:chat write:chat';
const OAUTH_SCOPES = `${DEFAULT_SCOPES} ${USER_SCOPES}`.trim();
const OAUTH_ISSUER_BASE_URL = process.env.OAUTH_ISSUER_BASE_URL || 'https://auth.fanvue.com';
const API_BASE_URL = process.env.API_BASE_URL || 'https://api.fanvue.com';
const API_VERSION = process.env.API_VERSION || '2025-06-26';

const OAUTH_AUTH_URL = `${OAUTH_ISSUER_BASE_URL}/oauth2/auth`;
const OAUTH_TOKEN_URL = `${OAUTH_ISSUER_BASE_URL}/oauth2/token`;

function buildAuthHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'X-Fanvue-API-Version': API_VERSION,
    'Content-Type': 'application/json'
  };
}

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

const HTML_TEMPLATE = `
<!DOCTYPE html>
<html>
<head>
    <title>Fanvue Chatbot</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 50px auto;
            padding: 20px;
            background: #f5f5f5;
        }
        .container {
            background: white;
            border-radius: 8px;
            padding: 30px;
            box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        }
        h1 { color: #333; margin-top: 0; }
        .chat-container {
            border: 1px solid #ddd;
            border-radius: 8px;
            padding: 20px;
            margin: 20px 0;
            min-height: 400px;
            max-height: 500px;
            overflow-y: auto;
            background: #fafafa;
        }
        .message {
            margin: 10px 0;
            padding: 10px;
            border-radius: 6px;
        }
        .message.user {
            background: #007bff;
            color: white;
            text-align: right;
        }
        .message.bot {
            background: #e9ecef;
            color: #333;
        }
        .input-container {
            display: flex;
            gap: 10px;
            margin-top: 20px;
        }
        .toolbar {
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
            margin: 20px 0 10px;
        }
        select {
            flex: 1;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
            background: white;
        }
        .hint {
            color: #666;
            font-size: 13px;
            margin: 8px 0 0;
        }
        input[type="text"] {
            flex: 1;
            padding: 12px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
        }
        button {
            padding: 12px 24px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
        }
        button:hover {
            background: #0056b3;
        }
        button:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .login-prompt {
            text-align: center;
            padding: 40px;
        }
        .login-button {
            display: inline-block;
            padding: 15px 30px;
            background: #007bff;
            color: white;
            text-decoration: none;
            border-radius: 6px;
            font-size: 16px;
        }
        .login-button:hover {
            background: #0056b3;
        }
        .error {
            color: #dc3545;
            padding: 10px;
            background: #f8d7da;
            border-radius: 6px;
            margin: 10px 0;
        }
        .loading {
            color: #666;
            font-style: italic;
        }
        a {
            color: #007bff;
            text-decoration: none;
        }
        a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>
    <div class="container">
        <h1>Fanvue Chatbot</h1>
        {{#if loggedIn}}
        <div id="userInfo">
            <p>Logged in as: <strong>{{username}}</strong></p>
            <p><a href="/logout">Logout</a></p>
        </div>
        <div class="chat-container" id="chatContainer">
            <div class="message bot">
                <strong>Bot:</strong> Hello! I'm your Fanvue chatbot assistant. How can I help you today?
            </div>
        </div>
        <div class="toolbar">
            <select id="conversationSelect" disabled>
                <option value="">Loading conversations...</option>
            </select>
            <button onclick="loadConversations()" id="refreshButton">Refresh</button>
        </div>
        <p class="hint">Tip: start a conversation with a subscriber in Fanvue first, then refresh to see it here.</p>
        <div id="errorContainer"></div>
        <div class="input-container">
            <input type="text" id="messageInput" placeholder="Type your message..." onkeypress="handleKeyPress(event)">
            <button onclick="sendMessage()" id="sendButton">Send</button>
        </div>
        {{else}}
        <div class="login-prompt">
            <p>Please log in with Fanvue to use the chatbot.</p>
            <a href="/login" class="login-button">Login with Fanvue</a>
        </div>
        {{/if}}
    </div>

    <script>
        function handleKeyPress(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }

        async function loadConversations() {
            const select = document.getElementById('conversationSelect');
            const refreshButton = document.getElementById('refreshButton');
            const errorContainer = document.getElementById('errorContainer');

            refreshButton.disabled = true;
            select.disabled = true;
            select.innerHTML = '<option value="">Loading conversations...</option>';

            try {
                const response = await fetch('/api/conversations');
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to load conversations');
                }

                const conversations = data.conversations || [];
                if (conversations.length === 0) {
                    select.innerHTML = '<option value="">No conversations found</option>';
                    errorContainer.innerHTML = '';
                    return;
                }

                select.innerHTML = '';
                conversations.forEach((conversation) => {
                    const option = document.createElement('option');
                    option.value = conversation.uuid;
                    option.textContent = conversation.label || conversation.uuid;
                    select.appendChild(option);
                });
                errorContainer.innerHTML = '';
            } catch (error) {
                select.innerHTML = '<option value="">Unable to load conversations</option>';
                errorContainer.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
            } finally {
                select.disabled = false;
                refreshButton.disabled = false;
            }
        }

        async function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            if (!message) return;

            const chatContainer = document.getElementById('chatContainer');
            const errorContainer = document.getElementById('errorContainer');
            const sendButton = document.getElementById('sendButton');
            const conversationSelect = document.getElementById('conversationSelect');
            const conversationUuid = conversationSelect.value;

            const userMessage = document.createElement('div');
            userMessage.className = 'message user';
            userMessage.innerHTML = '<strong>You:</strong> ' + message;
            chatContainer.appendChild(userMessage);

            input.value = '';
            sendButton.disabled = true;

            const loadingMessage = document.createElement('div');
            loadingMessage.className = 'message bot loading';
            loadingMessage.innerHTML = '<strong>Bot:</strong> Thinking...';
            chatContainer.appendChild(loadingMessage);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            try {
                const response = await fetch('/api/send-message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message: message, conversationUuid: conversationUuid })
                });

                const data = await response.json();
                loadingMessage.remove();

                if (response.ok) {
                    const botMessage = document.createElement('div');
                    botMessage.className = 'message bot';
                    botMessage.innerHTML = '<strong>Bot:</strong> ' + (data.response || 'Message sent successfully!');
                    chatContainer.appendChild(botMessage);
                    errorContainer.innerHTML = '';
                } else {
                    errorContainer.innerHTML = '<div class="error">Error: ' + (data.error || 'Failed to send message') + '</div>';
                }
            } catch (error) {
                loadingMessage.remove();
                errorContainer.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
            } finally {
                sendButton.disabled = false;
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }

        window.addEventListener('load', () => {
            loadConversations();
        });
    </script>
</body>
</html>
`;

function renderTemplate(template, data) {
  let rendered = template;
  
  if (data.loggedIn) {
    rendered = rendered.replace(/\{\{#if loggedIn\}\}/g, '');
    rendered = rendered.replace(/\{\{\/if\}\}/g, '');
    rendered = rendered.replace(/\{\{#else\}\}/g, '');
    rendered = rendered.replace(/\{\{username\}\}/g, data.username || 'User');
  } else {
    rendered = rendered.replace(/\{\{#if loggedIn\}\}[\s\S]*?\{\{#else\}\}/g, '');
    rendered = rendered.replace(/\{\{\/if\}\}/g, '');
  }
  
  return rendered;
}

app.get('/', async (req, res) => {
  if (!req.session.access_token) {
    return res.send(renderTemplate(HTML_TEMPLATE, { loggedIn: false }));
  }

  try {
    const profileResponse = await axios.get(`${API_BASE_URL}/users/me`, {
      headers: {
        'Authorization': `Bearer ${req.session.access_token}`,
        'X-Fanvue-API-Version': API_VERSION
      }
    });

    const userInfo = profileResponse.data;
    const username = userInfo.username || userInfo.email || 'User';
    
    return res.send(renderTemplate(HTML_TEMPLATE, {
      loggedIn: true,
      username: username
    }));
  } catch (error) {
    return res.send(renderTemplate(HTML_TEMPLATE, {
      loggedIn: true,
      username: 'User'
    }));
  }
});

app.get('/login', (req, res) => {
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

app.get('/callback', async (req, res) => {
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
    
    res.redirect('/');
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    res.status(500).send(`Error: Failed to get access token. ${errorText}`);
  }
});

app.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Session destroy error:', err);
    }
    res.redirect('/');
  });
});

app.post('/webhook', async (req, res) => {
  try {
    const data = req.body;
    
    if (!data) {
      return res.status(400).json({ error: 'Invalid payload' });
    }
    
    let eventType = 'unknown';
    
    if (data.message && data.sender) {
      eventType = 'message.received';
      const messageData = data.message || {};
      const messageUuid = data.messageUuid || messageData.uuid;
      const messageText = messageData.text || '';
      const sender = data.sender || {};
      const senderUuid = sender.uuid;
      const senderHandle = sender.handle || '';
      const senderDisplayName = sender.displayName || '';
      const recipientUuid = data.recipientUuid;
      const timestamp = data.timestamp;
      const hasMedia = messageData.hasMedia || false;
      
      console.log('Message Received webhook:');
      console.log(`  Message UUID: ${messageUuid}`);
      console.log(`  From: ${senderDisplayName} (@${senderHandle})`);
      console.log(`  To: ${recipientUuid}`);
      console.log(`  Text: ${messageText}`);
      console.log(`  Has Media: ${hasMedia}`);
      console.log(`  Timestamp: ${timestamp}`);
      
    } else if (data.follower || data.followerUuid) {
      eventType = 'follower.new';
      const followerData = data.follower || {};
      const followerUuid = data.followerUuid || followerData.uuid;
      const creatorUuid = data.creatorUuid || data.recipientUuid;
      
      console.log('New Follower webhook:');
      console.log(`  Follower UUID: ${followerUuid}`);
      console.log(`  Creator UUID: ${creatorUuid}`);
      
    } else if (data.subscriber || data.subscriberUuid) {
      eventType = 'subscriber.new';
      const subscriberData = data.subscriber || {};
      const subscriberUuid = data.subscriberUuid || subscriberData.uuid;
      const creatorUuid = data.creatorUuid || data.recipientUuid;
      
      console.log('New Subscriber webhook:');
      console.log(`  Subscriber UUID: ${subscriberUuid}`);
      console.log(`  Creator UUID: ${creatorUuid}`);
      
    } else if (data.purchase || data.purchaseUuid) {
      eventType = 'purchase.received';
      const purchaseData = data.purchase || {};
      const purchaseUuid = data.purchaseUuid || purchaseData.uuid;
      const creatorUuid = data.creatorUuid || data.recipientUuid;
      
      console.log('Purchase Received webhook:');
      console.log(`  Purchase UUID: ${purchaseUuid}`);
      console.log(`  Creator UUID: ${creatorUuid}`);
      
    } else if (data.tip || data.tipUuid) {
      eventType = 'tip.received';
      const tipData = data.tip || {};
      const tipUuid = data.tipUuid || tipData.uuid;
      const creatorUuid = data.creatorUuid || data.recipientUuid;
      const amount = tipData.amount || data.amount;
      
      console.log('Tip Received webhook:');
      console.log(`  Tip UUID: ${tipUuid}`);
      console.log(`  Creator UUID: ${creatorUuid}`);
      console.log(`  Amount: ${amount}`);
      
    } else {
      console.log('Unknown webhook event type. Data:', JSON.stringify(data, null, 2));
    }
    
    return res.json({ status: 'received' });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: error.message });
  }
});

app.post('/api/refresh-token', async (req, res) => {
  const refreshToken = req.session.refresh_token;
  
  if (!refreshToken) {
    return res.status(401).json({ error: 'No refresh token available' });
  }

  try {
    const authHeader = Buffer.from(
      `${OAUTH_CLIENT_ID}:${OAUTH_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await axios.post(
      OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken,
        client_id: OAUTH_CLIENT_ID
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

    return res.json({
      access_token: tokenResponse.data.access_token,
      expires_in: tokenResponse.data.expires_in,
      token_type: tokenResponse.data.token_type || 'Bearer'
    });
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    const errorText = error.response?.data ? JSON.stringify(error.response.data) : error.message;
    return res.status(error.response?.status || 500).json({
      error: 'Failed to refresh token',
      details: errorText
    });
  }
});

function handleRateLimit(response) {
  if (response?.status === 429) {
    const retryAfter = response.headers['retry-after'] || response.headers['Retry-After'] || '60';
    const rateLimitLimit = response.headers['x-ratelimit-limit'] || response.headers['X-RateLimit-Limit'] || '100';
    const rateLimitRemaining = response.headers['x-ratelimit-remaining'] || response.headers['X-RateLimit-Remaining'] || '0';
    const rateLimitReset = response.headers['x-ratelimit-reset'] || response.headers['X-RateLimit-Reset'] || '';
    
    let retrySeconds = 60;
    try {
      retrySeconds = parseInt(retryAfter, 10);
    } catch (e) {
      retrySeconds = 60;
    }
    
    return {
      error: 'Rate limit exceeded',
      message: `Too many requests. Please wait ${retrySeconds} seconds before trying again.`,
      retry_after: retrySeconds,
      rate_limit_limit: rateLimitLimit,
      rate_limit_remaining: rateLimitRemaining,
      rate_limit_reset: rateLimitReset
    };
  }
  return null;
}

async function refreshAccessTokenIfNeeded(req) {
  if (!req.session.refresh_token) {
    return false;
  }

  try {
    const authHeader = Buffer.from(
      `${OAUTH_CLIENT_ID}:${OAUTH_CLIENT_SECRET}`
    ).toString('base64');

    const tokenResponse = await axios.post(
      OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: req.session.refresh_token,
        client_id: OAUTH_CLIENT_ID
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
    return true;
  } catch (error) {
    return false;
  }
}

async function fetchUserInfo(req, headers) {
  let userResponse;
  try {
    userResponse = await axios.get(`${API_BASE_URL}/users/me`, { headers });
  } catch (error) {
    userResponse = error.response;
  }

  const rateLimitError = handleRateLimit(userResponse);
  if (rateLimitError) {
    return { error: rateLimitError };
  }

  if (userResponse.status === 401) {
    if (await refreshAccessTokenIfNeeded(req)) {
      headers['Authorization'] = `Bearer ${req.session.access_token}`;
      try {
        userResponse = await axios.get(`${API_BASE_URL}/users/me`, { headers });
      } catch (error) {
        userResponse = error.response;
      }
      const retryRateLimitError = handleRateLimit(userResponse);
      if (retryRateLimitError) {
        return { error: retryRateLimitError };
      }
    } else {
      return { error: { status: 401, error: 'Failed to get user info. Please log in again.' } };
    }
  }

  if (userResponse.status !== 200) {
    return { error: { status: userResponse.status, error: 'Failed to get user info' } };
  }

  return { data: userResponse.data };
}

app.get('/api/conversations', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);
    const userResult = await fetchUserInfo(req, headers);
    if (userResult.error) {
      return res.status(userResult.error.status || 429).json(userResult.error);
    }

    const userUuid = userResult.data.uuid;
    if (!userUuid) {
      return res.status(400).json({ error: 'User UUID not found' });
    }

    let conversationsResponse;
    try {
      conversationsResponse = await axios.get(
        `${API_BASE_URL}/users/${userUuid}/conversations`,
        { headers }
      );
    } catch (error) {
      conversationsResponse = error.response;
    }

    const conversationsRateLimitError = handleRateLimit(conversationsResponse);
    if (conversationsRateLimitError) {
      return res.status(429).json(conversationsRateLimitError);
    }

    if (conversationsResponse.status !== 200) {
      return res.status(conversationsResponse.status).json({ error: 'Failed to load conversations' });
    }

    const conversations = conversationsResponse.data?.data || conversationsResponse.data || [];
    const formatted = Array.isArray(conversations)
      ? conversations.map((conversation) => ({
          uuid: conversation.uuid,
          label: conversation.title || conversation.name || conversation.uuid
        }))
      : [];

    return res.json({ conversations: formatted });
  } catch (error) {
    console.error('Error loading conversations:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

app.post('/api/send-message', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const message = req.body.message;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);
    const userResult = await fetchUserInfo(req, headers);
    if (userResult.error) {
      return res.status(userResult.error.status || 429).json(userResult.error);
    }

    const userUuid = userResult.data.uuid;

    if (!userUuid) {
      return res.status(400).json({ error: 'User UUID not found' });
    }

    const conversationUuid = req.body.conversationUuid;
    if (!conversationUuid) {
      return res.status(400).json({
        error: 'Please select a conversation before sending a message.'
      });
    }

    try {
      let sendResponse;
      try {
        sendResponse = await axios.post(
          `${API_BASE_URL}/conversations/${conversationUuid}/messages`,
          { text: message },
          { headers }
        );
      } catch (error) {
        sendResponse = error.response;
      }

      const sendRateLimitError = handleRateLimit(sendResponse);
      if (sendRateLimitError) {
        return res.status(429).json(sendRateLimitError);
      }

      if (sendResponse.status === 200 || sendResponse.status === 201) {
        return res.json({
          response: `Message sent successfully! Your message: "${message}"`
        });
      }
    } catch (error) {
      console.log('Message send error:', error.response?.data || error.message);
      return res.json({
        response: `Your message: "${message}" was received. API response: ${error.response?.status || 'error'}`
      });
    }

    return res.json({
      response: `Your message: "${message}" was received.`
    });

  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Fanvue Chatbot running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop the server');
});
