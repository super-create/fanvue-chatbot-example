const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');
const session = require('express-session');
const path = require('path');
const crypto = require('crypto');
const OpenAI = require('openai');

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

function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '');
}

const API_BASE_URL = normalizeBaseUrl(process.env.API_BASE_URL || 'https://api.fanvue.com');
const API_FALLBACK_BASE_URL = API_BASE_URL.endsWith('/v1') ? null : `${API_BASE_URL}/v1`;
const API_VERSION = process.env.API_VERSION || '2025-06-26';

const OAUTH_AUTH_URL = `${OAUTH_ISSUER_BASE_URL}/oauth2/auth`;
const OAUTH_TOKEN_URL = `${OAUTH_ISSUER_BASE_URL}/oauth2/token`;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const DEFAULT_SYSTEM_PROMPT = `You are a friendly and engaging chatbot assistant. Keep your responses natural, conversational, and concise. Show personality and be helpful.`;

function buildAuthHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'X-Fanvue-API-Version': API_VERSION,
    'Content-Type': 'application/json'
  };
}

function buildFanvueUrl(baseUrl, path) {
  return `${baseUrl}${path}`;
}

async function fanvueRequest(method, path, options = {}) {
  const baseUrls = [API_BASE_URL];
  if (API_FALLBACK_BASE_URL) {
    baseUrls.push(API_FALLBACK_BASE_URL);
  }

  let lastResponse;
  for (const baseUrl of baseUrls) {
    const url = buildFanvueUrl(baseUrl, path);
    try {
      return await axios({ method, url, ...options });
    } catch (error) {
      if (!error.response) {
        return { status: 500, data: { message: error.message }, headers: {} };
      }
      lastResponse = error.response;
      if (error.response.status !== 404) {
        return error.response;
      }
    }
  }

  return lastResponse;
}

async function fanvueRequestWithFallbackPaths(method, paths, options = {}) {
  let lastResponse;
  for (const path of paths) {
    const response = await fanvueRequest(method, path, options);
    lastResponse = response;
    if (response?.status !== 404) {
      return response;
    }
  }

  return lastResponse;
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
        .chat-media {
            max-width: 300px;
            max-height: 300px;
            border-radius: 8px;
            margin-top: 8px;
            cursor: pointer;
            display: block;
        }
        .chat-media:hover {
            opacity: 0.9;
        }
        .message.user .chat-media {
            margin-left: auto;
        }
        video.chat-media {
            cursor: default;
        }
        .ai-controls {
            display: flex;
            align-items: center;
            gap: 15px;
            margin: 15px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 6px;
        }
        .ai-toggle-container {
            display: flex;
            align-items: center;
            gap: 10px;
        }
        .toggle-switch {
            position: relative;
            display: inline-block;
            width: 50px;
            height: 24px;
        }
        .toggle-switch input {
            opacity: 0;
            width: 0;
            height: 0;
        }
        .toggle-slider {
            position: absolute;
            cursor: pointer;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background-color: #ccc;
            transition: .4s;
            border-radius: 24px;
        }
        .toggle-slider:before {
            position: absolute;
            content: "";
            height: 18px;
            width: 18px;
            left: 3px;
            bottom: 3px;
            background-color: white;
            transition: .4s;
            border-radius: 50%;
        }
        input:checked + .toggle-slider {
            background-color: #28a745;
        }
        input:checked + .toggle-slider:before {
            transform: translateX(26px);
        }
        #aiModeLabel {
            font-weight: 600;
            color: #333;
        }
        #systemPromptContainer {
            margin: 15px 0;
            padding: 15px;
            background: #f8f9fa;
            border-radius: 6px;
        }
        #systemPromptContainer label {
            display: block;
            margin-bottom: 8px;
            color: #333;
        }
        #systemPromptInput {
            width: 100%;
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-family: inherit;
            font-size: 14px;
            resize: vertical;
        }
        #savePromptButton {
            margin-top: 10px;
        }
        .user-profile-sidebar {
            position: fixed;
            right: 0;
            top: 0;
            width: 350px;
            height: 100vh;
            background: #fff;
            border-left: 1px solid #ddd;
            padding: 20px;
            overflow-y: auto;
            transform: translateX(100%);
            transition: transform 0.3s ease;
            z-index: 1000;
            box-shadow: -2px 0 10px rgba(0,0,0,0.1);
        }
        .user-profile-sidebar.open {
            transform: translateX(0);
        }
        .profile-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 20px;
        }
        .profile-header h3 {
            margin: 0;
        }
        .close-sidebar {
            background: none;
            border: none;
            font-size: 24px;
            cursor: pointer;
            color: #666;
        }
        .profile-section {
            margin-bottom: 20px;
            padding-bottom: 20px;
            border-bottom: 1px solid #eee;
        }
        .profile-section h4 {
            margin: 0 0 10px 0;
            color: #333;
            font-size: 14px;
            text-transform: uppercase;
        }
        .profile-summary {
            color: #666;
            line-height: 1.6;
            font-size: 14px;
        }
        .interest-tag {
            display: inline-block;
            background: #e3f2fd;
            color: #1976d2;
            padding: 4px 12px;
            border-radius: 16px;
            margin: 4px 4px 4px 0;
            font-size: 12px;
        }
        .fact-item {
            background: #f5f5f5;
            padding: 8px 12px;
            border-radius: 6px;
            margin-bottom: 8px;
            font-size: 13px;
            color: #555;
        }
        .generate-profile-btn {
            width: 100%;
            padding: 12px;
            background: #007bff;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
        }
        .generate-profile-btn:hover {
            background: #0056b3;
        }
        .generate-profile-btn:disabled {
            background: #ccc;
            cursor: not-allowed;
        }
        .profile-toggle-btn {
            position: fixed;
            right: 20px;
            top: 20px;
            background: #007bff;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            z-index: 999;
        }
        .creator-profile-btn {
            position: fixed;
            right: 20px;
            top: 70px;
            background: #28a745;
            color: white;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            z-index: 999;
        }
        .profile-input {
            width: 100%;
            padding: 8px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
        }
        .profile-textarea {
            width: 100%;
            padding: 8px;
            margin-bottom: 10px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 13px;
            resize: vertical;
            min-height: 80px;
        }
        .save-profile-btn {
            width: 100%;
            padding: 10px;
            background: #28a745;
            color: white;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            font-weight: 600;
            margin-top: 10px;
        }
        .save-profile-btn:hover {
            background: #218838;
        }
        .notes-section {
            margin-top: 20px;
            padding-top: 20px;
            border-top: 2px solid #007bff;
        }
        .add-note-btn {
            width: 100%;
            padding: 8px;
            background: #6c757d;
            color: white;
            border: none;
            border-radius: 4px;
            cursor: pointer;
            font-size: 12px;
            margin-top: 10px;
        }
        .add-note-btn:hover {
            background: #5a6268;
        }
        .analytics-btn {
            position: fixed;
            right: 20px;
            top: 120px;
            background: #ffc107;
            color: #333;
            border: none;
            padding: 10px 16px;
            border-radius: 6px;
            cursor: pointer;
            font-size: 14px;
            z-index: 999;
            font-weight: 600;
        }
        .analytics-btn:hover {
            background: #ffb300;
        }
        .analytics-dashboard {
            position: fixed;
            left: 0;
            top: 0;
            width: 100%;
            height: 100vh;
            background: rgba(0,0,0,0.7);
            display: none;
            align-items: center;
            justify-content: center;
            z-index: 2000;
        }
        .analytics-dashboard.open {
            display: flex;
        }
        .analytics-content {
            background: white;
            border-radius: 12px;
            padding: 30px;
            max-width: 900px;
            max-height: 90vh;
            overflow-y: auto;
            box-shadow: 0 10px 40px rgba(0,0,0,0.3);
            width: 90%;
        }
        .analytics-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 25px;
            padding-bottom: 15px;
            border-bottom: 2px solid #f0f0f0;
        }
        .analytics-header h2 {
            margin: 0;
            color: #333;
        }
        .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-bottom: 30px;
        }
        .stat-card {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 20px;
            border-radius: 10px;
            color: white;
        }
        .stat-card.green {
            background: linear-gradient(135deg, #11998e 0%, #38ef7d 100%);
        }
        .stat-card.orange {
            background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
        }
        .stat-card.blue {
            background: linear-gradient(135deg, #4facfe 0%, #00f2fe 100%);
        }
        .stat-label {
            font-size: 12px;
            opacity: 0.9;
            margin-bottom: 8px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        .stat-value {
            font-size: 32px;
            font-weight: bold;
            margin: 0;
        }
        .chart-section {
            background: #f8f9fa;
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 20px;
        }
        .chart-section h3 {
            margin-top: 0;
            color: #333;
            font-size: 18px;
        }
        .bar-chart {
            display: flex;
            align-items: flex-end;
            gap: 10px;
            height: 200px;
            padding: 10px 0;
        }
        .bar-container {
            flex: 1;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 5px;
        }
        .bar {
            width: 100%;
            background: linear-gradient(to top, #667eea, #764ba2);
            border-radius: 4px 4px 0 0;
            position: relative;
            min-height: 5px;
            transition: all 0.3s ease;
        }
        .bar:hover {
            opacity: 0.8;
        }
        .bar-label {
            font-size: 11px;
            color: #666;
            text-align: center;
        }
        .bar-value {
            font-size: 12px;
            font-weight: 600;
            color: #333;
        }
        .top-conversations {
            background: white;
            border: 1px solid #e0e0e0;
            border-radius: 8px;
            overflow: hidden;
        }
        .conversation-row {
            padding: 15px;
            border-bottom: 1px solid #f0f0f0;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        .conversation-row:last-child {
            border-bottom: none;
        }
        .conversation-row:hover {
            background: #f8f9fa;
        }
        .conversation-info {
            flex: 1;
        }
        .conversation-uuid {
            font-size: 13px;
            color: #666;
            font-family: monospace;
        }
        .conversation-stats {
            display: flex;
            gap: 20px;
            font-size: 13px;
            color: #666;
        }
        .stat-item {
            display: flex;
            flex-direction: column;
            align-items: center;
        }
        .stat-item-label {
            font-size: 11px;
            color: #999;
        }
        .stat-item-value {
            font-weight: 600;
            color: #333;
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
                <strong>Welcome!</strong> Select a conversation from the dropdown above to view and send messages.
            </div>
        </div>
        <div class="toolbar">
            <select id="conversationSelect" disabled>
                <option value="">Loading conversations...</option>
            </select>
            <button id="refreshButton">Refresh</button>
            <input type="text" id="messageSearch" placeholder="Search messages..." style="margin-left: 10px; padding: 8px; border: 1px solid #ddd; border-radius: 4px; flex: 1;">
        </div>
        <p class="hint">Tip: start a conversation with a subscriber in Fanvue first, then refresh to see it here.</p>

        <div class="ai-controls">
            <div class="ai-toggle-container">
                <label class="toggle-switch">
                    <input type="checkbox" id="aiToggle">
                    <span class="toggle-slider"></span>
                </label>
                <span id="aiModeLabel">AI Auto-Chat: OFF</span>
            </div>
            <div class="ai-toggle-container">
                <label class="toggle-switch">
                    <input type="checkbox" id="fastModeToggle" checked>
                    <span class="toggle-slider"></span>
                </label>
                <span id="fastModeLabel">Fast Mode (Testing): ON</span>
            </div>
            <button id="systemPromptButton">Configure AI</button>
        </div>

        <div id="delayIndicator" style="display: none; padding: 10px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 6px; margin: 10px 0; text-align: center;">
            <span id="delayMessage">AI will reply in <strong id="delayCountdown">0</strong> seconds...</span>
        </div>

        <div id="systemPromptContainer" style="display: none;">
            <label for="systemPromptInput"><strong>System Prompt:</strong></label>
            <textarea id="systemPromptInput" placeholder="Enter AI system prompt..." rows="4"></textarea>

            <div style="margin-top: 20px; padding-top: 20px; border-top: 2px solid #ddd;">
                <h4 style="margin-top: 0; color: #333;">Advanced Settings (Token Limits)</h4>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Reply Length (Max Tokens):</label>
                    <input type="number" id="maxReplyTokens" min="50" max="2000" step="50" style="width: 100px; padding: 6px; border: 1px solid #ddd; border-radius: 4px;" oninput="updateReplyTokensDisplay()">
                    <span style="font-size: 12px; color: #666; margin-left: 10px;">Current: <strong id="replyTokensDisplay">150</strong> (~<span id="replyWordsDisplay">100-120</span> words)</span>
                    <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        • 150 tokens = ~100-120 words (default, short responses)<br>
                        • 300 tokens = ~200-250 words (medium responses)<br>
                        • 500 tokens = ~350-400 words (longer responses)<br>
                        • 1000 tokens = ~700-800 words (very long responses)
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Profile Analysis (Max Tokens):</label>
                    <input type="number" id="maxProfileTokens" min="200" max="1500" step="100" style="width: 100px; padding: 6px; border: 1px solid #ddd; border-radius: 4px;" oninput="updateProfileTokensDisplay()">
                    <span style="font-size: 12px; color: #666; margin-left: 10px;">Current: <strong id="profileTokensDisplay">500</strong></span>
                    <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        Tokens for analyzing subscriber personality (500 is recommended)
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">Creativity (Temperature): <strong id="temperatureDisplay">0.9</strong></label>
                    <input type="range" id="replyTemperature" min="0" max="1" step="0.1" value="0.9" style="width: 100%;" oninput="updateTemperatureDisplay()">
                    <div style="display: flex; justify-content: space-between; font-size: 11px; color: #999;">
                        <span>0.0 (Focused & Predictable)</span>
                        <span>1.0 (Creative & Random)</span>
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">AI Model for Chat Replies:</label>
                    <select id="aiModel" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                        <option value="gpt-4o">GPT-4o (Best - Recommended)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo (Previous Generation)</option>
                        <option value="gpt-4">GPT-4 (Legacy)</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Budget)</option>
                    </select>
                    <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        Use GPT-4o for best results, GPT-4o Mini for cost savings, GPT-3.5 for budget subscribers
                    </div>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: 600;">AI Model for Profile Analysis:</label>
                    <select id="profileModel" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 13px;">
                        <option value="gpt-4o">GPT-4o (Best - Recommended)</option>
                        <option value="gpt-4o-mini">GPT-4o Mini (Fast & Cheap)</option>
                        <option value="gpt-4-turbo">GPT-4 Turbo (Previous Generation)</option>
                        <option value="gpt-4">GPT-4 (Legacy)</option>
                        <option value="gpt-3.5-turbo">GPT-3.5 Turbo (Budget)</option>
                    </select>
                    <div style="font-size: 11px; color: #999; margin-top: 5px;">
                        Profile analysis only runs once per subscriber, so using GPT-4o is recommended
                    </div>
                </div>
            </div>

            <button id="savePromptButton">Save All Settings</button>
        </div>

        <div id="errorContainer"></div>
        <div class="input-container">
            <input type="text" id="messageInput" placeholder="Type your message...">
            <button id="sendButton">Send</button>
        </div>

        <button class="profile-toggle-btn" id="profileToggleBtn">Subscriber Profile</button>
        <button class="creator-profile-btn" id="creatorToggleBtn">My Persona</button>
        <button class="analytics-btn" id="analyticsBtn">Analytics</button>

        <div class="user-profile-sidebar" id="profileSidebar">
            <div class="profile-header">
                <h3>Subscriber Profile</h3>
                <button class="close-sidebar" id="profileCloseBtnSidebar">&times;</button>
            </div>

            <button class="generate-profile-btn" id="generateProfileBtn">
                Regenerate Profile
            </button>

            <div id="profileContent" style="margin-top: 20px;">
                <p style="color: #999; text-align: center;">Select a conversation to load subscriber profile</p>
            </div>

            <div class="notes-section">
                <h4 style="margin-top: 0;">Manual Notes</h4>
                <textarea id="subscriberNotes" class="profile-textarea" placeholder="Add custom notes about this subscriber..."></textarea>
                <button class="add-note-btn" id="saveNotesBtn">Save Notes</button>
            </div>
        </div>

        <div class="user-profile-sidebar" id="creatorSidebar">
            <div class="profile-header">
                <h3>My Persona</h3>
                <button class="close-sidebar" id="creatorCloseBtnSidebar">&times;</button>
            </div>

            <div style="margin-top: 10px;">
                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Name</label>
                <input type="text" id="creatorName" class="profile-input" placeholder="e.g., Jessica">

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Age</label>
                <input type="text" id="creatorAge" class="profile-input" placeholder="e.g., 25">

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Accent/Language Style</label>
                <input type="text" id="creatorAccent" class="profile-input" placeholder="e.g., British, Southern, etc.">

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Physical Attributes</label>
                <textarea id="creatorPhysical" class="profile-textarea" placeholder="e.g., Long blonde hair, athletic build, 5'7&quot;"></textarea>

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Personality/Vibe</label>
                <textarea id="creatorVibe" class="profile-textarea" placeholder="e.g., Flirty, playful, intelligent, witty"></textarea>

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Interesting Facts</label>
                <textarea id="creatorFacts" class="profile-textarea" placeholder="e.g., Love yoga, work as a nurse, from California"></textarea>

                <label style="font-size: 12px; color: #666; display: block; margin-bottom: 5px;">Other Important Info</label>
                <textarea id="creatorOther" class="profile-textarea" placeholder="Any other context the AI should know..."></textarea>

                <button class="save-profile-btn" id="savePersonaBtn">Save Persona</button>
            </div>
        </div>

        <div class="analytics-dashboard" id="analyticsDashboard">
            <div class="analytics-content">
                <div class="analytics-header">
                    <h2>Analytics Dashboard</h2>
                    <button class="close-sidebar" id="analyticsCloseBtn">&times;</button>
                </div>

                <div class="stats-grid" id="statsGrid">
                    <div class="stat-card">
                        <div class="stat-label">Total Messages</div>
                        <div class="stat-value" id="totalMessages">0</div>
                    </div>
                    <div class="stat-card green">
                        <div class="stat-label">Messages Sent</div>
                        <div class="stat-value" id="messagesSent">0</div>
                    </div>
                    <div class="stat-card orange">
                        <div class="stat-label">AI Replies</div>
                        <div class="stat-value" id="aiReplies">0</div>
                    </div>
                    <div class="stat-card blue">
                        <div class="stat-label">Active Chats</div>
                        <div class="stat-value" id="activeChats">0</div>
                    </div>
                </div>

                <div class="chart-section">
                    <h3>Last 7 Days Activity</h3>
                    <div class="bar-chart" id="barChart"></div>
                </div>

                <div class="chart-section">
                    <h3>Most Active Conversations</h3>
                    <div class="top-conversations" id="topConversations">
                        <div style="padding: 20px; text-align: center; color: #999;">
                            No conversation data yet
                        </div>
                    </div>
                </div>
            </div>
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

                select.innerHTML = '<option value="">Select a conversation...</option>';
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

        async function loadMessages(userUuid) {
            const chatContainer = document.getElementById('chatContainer');
            const errorContainer = document.getElementById('errorContainer');

            currentConversationUuid = userUuid;
            loadLastRepliedId(); // Load persisted last replied ID for this conversation
            loadUserProfile(); // Load user profile if exists

            const wasScrolledToBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
            const hadMessages = chatContainer.children.length > 0;

            if (!hadMessages) {
                chatContainer.innerHTML = '<div class="message bot loading"><strong>Loading messages...</strong></div>';
            }

            try {
                const response = await fetch('/api/messages/' + userUuid);
                const data = await response.json();

                if (!response.ok) {
                    throw new Error(data.error || 'Failed to load messages');
                }

                const messages = data.messages || [];
                allMessagesCache = messages; // Cache for filtering
                chatContainer.innerHTML = '';

                if (messages.length === 0) {
                    chatContainer.innerHTML = '<div class="message bot"><strong>No messages yet.</strong> Start the conversation by sending a message below!</div>';
                    lastMessageCount = 0;
                    return;
                }

                // Only update lastMessageCount if AI is not enabled (to prevent interference with AI detection)
                // When AI is enabled, checkForNewMessagesAndReply handles the count
                if (!aiAutoReplyEnabled) {
                    lastMessageCount = messages.length;
                }

                renderMessages(messages);

                if (wasScrolledToBottom || !hadMessages) {
                    chatContainer.scrollTop = chatContainer.scrollHeight;
                }
                errorContainer.innerHTML = '';
            } catch (error) {
                if (!hadMessages) {
                    chatContainer.innerHTML = '<div class="message bot error"><strong>Error loading messages:</strong> ' + error.message + '</div>';
                }
                errorContainer.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
            }
        }

        function renderMessages(messages) {
            const chatContainer = document.getElementById('chatContainer');
            chatContainer.innerHTML = '';

            messages.slice().reverse().forEach((msg) => {
                const messageDiv = document.createElement('div');
                const isSentByYou = msg.sender?.uuid === myUserUuid;
                messageDiv.className = isSentByYou ? 'message user' : 'message bot';

                const senderName = isSentByYou ? 'You' : (msg.sender?.username || msg.sender?.handle || 'Subscriber');
                const messageText = msg.text || '[Media message]';
                const timestamp = msg.sentAt ? new Date(msg.sentAt).toLocaleString() : '';

                messageDiv.innerHTML = '<strong>' + senderName + ':</strong> ' + messageText +
                    (timestamp ? '<br><small style="color: #666;">' + timestamp + '</small>' : '');
                chatContainer.appendChild(messageDiv);
            });
        }

        function filterMessages() {
            const searchTerm = document.getElementById('messageSearch').value.toLowerCase();

            if (!searchTerm) {
                renderMessages(allMessagesCache);
                return;
            }

            const filtered = allMessagesCache.filter(msg => {
                const messageText = (msg.text || '').toLowerCase();
                const senderName = (msg.sender?.username || msg.sender?.handle || '').toLowerCase();
                return messageText.includes(searchTerm) || senderName.includes(searchTerm);
            });

            renderMessages(filtered);

            if (filtered.length === 0) {
                const chatContainer = document.getElementById('chatContainer');
                chatContainer.innerHTML = '<div class="message bot"><strong>No messages found</strong> matching "' + searchTerm + '"</div>';
            }
        }

        async function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            if (!message) return;

            const errorContainer = document.getElementById('errorContainer');
            const sendButton = document.getElementById('sendButton');
            const conversationSelect = document.getElementById('conversationSelect');
            const conversationUuid = conversationSelect.value;

            if (!conversationUuid) {
                errorContainer.innerHTML = '<div class="error">Please select a conversation first.</div>';
                return;
            }

            input.value = '';
            sendButton.disabled = true;

            try {
                const response = await fetch('/api/send-message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message: message, conversationUuid: conversationUuid })
                });

                const data = await response.json();

                if (response.ok) {
                    errorContainer.innerHTML = '';
                    await loadMessages(conversationUuid);
                } else {
                    errorContainer.innerHTML = '<div class="error">Error: ' + (data.error || 'Failed to send message') + '</div>';
                }
            } catch (error) {
                errorContainer.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
            } finally {
                sendButton.disabled = false;
            }
        }

        let currentConversationUuid = null;
        let autoRefreshInterval = null;
        let myUserUuid = null;
        let aiAutoReplyEnabled = false;
        let systemPrompt = '';
        let lastMessageCount = 0;
        let allMessagesCache = []; // Store all messages for filtering
        let fastResponseMode = true; // Default to fast for testing
        let pendingAIReply = null; // Track pending delayed reply
        let delayCountdownInterval = null;

        async function getMyUserUuid() {
            if (myUserUuid) return myUserUuid;
            try {
                const response = await fetch('/api/profile');
                const data = await response.json();
                if (response.ok && data.profile) {
                    myUserUuid = data.profile.uuid;
                }
                return myUserUuid;
            } catch (error) {
                console.error('Failed to get user UUID:', error);
                return null;
            }
        }

        async function loadAISettings() {
            try {
                const response = await fetch('/api/ai-settings');
                const data = await response.json();
                if (response.ok) {
                    systemPrompt = data.systemPrompt;
                    aiAutoReplyEnabled = data.autoReplyEnabled;
                    fastResponseMode = data.fastResponseMode !== undefined ? data.fastResponseMode : true;

                    document.getElementById('systemPromptInput').value = systemPrompt;
                    document.getElementById('aiToggle').checked = aiAutoReplyEnabled;
                    document.getElementById('aiModeLabel').textContent = aiAutoReplyEnabled ? 'AI Auto-Chat: ON' : 'AI Auto-Chat: OFF';

                    document.getElementById('fastModeToggle').checked = fastResponseMode;
                    document.getElementById('fastModeLabel').textContent = fastResponseMode ? 'Fast Mode (Testing): ON' : 'Natural Delay (1-3 min): ON';

                    // Load advanced settings
                    const maxReplyTokens = data.maxReplyTokens || 150;
                    const maxProfileTokens = data.maxProfileTokens || 500;
                    const replyTemperature = data.replyTemperature !== undefined ? data.replyTemperature : 0.9;
                    const aiModel = data.aiModel || 'gpt-4o';
                    const profileModel = data.profileModel || 'gpt-4o';

                    document.getElementById('maxReplyTokens').value = maxReplyTokens;
                    document.getElementById('replyTokensDisplay').textContent = maxReplyTokens;
                    updateReplyWordsDisplay(maxReplyTokens);

                    document.getElementById('maxProfileTokens').value = maxProfileTokens;
                    document.getElementById('profileTokensDisplay').textContent = maxProfileTokens;

                    document.getElementById('replyTemperature').value = replyTemperature;
                    document.getElementById('temperatureDisplay').textContent = replyTemperature.toFixed(1);

                    document.getElementById('aiModel').value = aiModel;
                    document.getElementById('profileModel').value = profileModel;
                }
            } catch (error) {
                console.error('Failed to load AI settings:', error);
            }
        }

        function updateReplyWordsDisplay(tokens) {
            const minWords = Math.floor(tokens * 0.65);
            const maxWords = Math.floor(tokens * 0.80);
            document.getElementById('replyWordsDisplay').textContent = minWords + '-' + maxWords;
        }

        function updateReplyTokensDisplay() {
            const tokens = parseInt(document.getElementById('maxReplyTokens').value);
            document.getElementById('replyTokensDisplay').textContent = tokens;
            updateReplyWordsDisplay(tokens);
        }

        function updateProfileTokensDisplay() {
            const tokens = parseInt(document.getElementById('maxProfileTokens').value);
            document.getElementById('profileTokensDisplay').textContent = tokens;
        }

        function updateTemperatureDisplay() {
            const temperatureInput = document.getElementById('replyTemperature');
            const temperatureDisplay = document.getElementById('temperatureDisplay');
            temperatureDisplay.textContent = parseFloat(temperatureInput.value).toFixed(1);
        }

        async function saveAdvancedSettings() {
            const systemPrompt = document.getElementById('systemPromptInput').value;
            const maxReplyTokens = parseInt(document.getElementById('maxReplyTokens').value);
            const maxProfileTokens = parseInt(document.getElementById('maxProfileTokens').value);
            const replyTemperature = parseFloat(document.getElementById('replyTemperature').value);
            const aiModel = document.getElementById('aiModel').value;
            const profileModel = document.getElementById('profileModel').value;

            try {
                const response = await fetch('/api/ai-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        systemPrompt,
                        maxReplyTokens,
                        maxProfileTokens,
                        replyTemperature,
                        aiModel,
                        profileModel
                    })
                });

                if (response.ok) {
                    alert('Advanced settings saved successfully!');
                    // Update displays
                    document.getElementById('replyTokensDisplay').textContent = maxReplyTokens;
                    updateReplyWordsDisplay(maxReplyTokens);
                    document.getElementById('profileTokensDisplay').textContent = maxProfileTokens;
                } else {
                    alert('Failed to save settings');
                }
            } catch (error) {
                console.error('Failed to save advanced settings:', error);
                alert('Error saving settings: ' + error.message);
            }
        }

        async function toggleFastMode() {
            const checkbox = document.getElementById('fastModeToggle');
            fastResponseMode = checkbox.checked;
            document.getElementById('fastModeLabel').textContent = fastResponseMode ? 'Fast Mode (Testing): ON' : 'Natural Delay (1-3 min): ON';

            try {
                await fetch('/api/ai-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ fastResponseMode: fastResponseMode })
                });

                console.log('Fast response mode:', fastResponseMode ? 'ENABLED (instant, 5s checks)' : 'DISABLED (1-3 min delay, 30s checks)');

                // Restart auto-refresh with new interval
                startAutoRefresh();
            } catch (error) {
                console.error('Failed to update fast mode:', error);
            }
        }

        async function toggleAIMode() {
            const checkbox = document.getElementById('aiToggle');
            aiAutoReplyEnabled = checkbox.checked;
            document.getElementById('aiModeLabel').textContent = aiAutoReplyEnabled ? 'AI Auto-Chat: ON' : 'AI Auto-Chat: OFF';

            try {
                await fetch('/api/ai-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ autoReplyEnabled: aiAutoReplyEnabled })
                });

                // If AI was just turned ON, set the lastRepliedMessageId to the current latest subscriber message
                // This prevents the AI from replying to old messages
                if (aiAutoReplyEnabled && currentConversationUuid) {
                    console.log('AI MODE ENABLED - Setting baseline to current messages...');

                    const response = await fetch('/api/messages/' + currentConversationUuid);
                    const data = await response.json();

                    if (response.ok) {
                        const messages = data.messages || [];

                        // Find the latest subscriber message (search from beginning since API returns newest first)
                        for (let i = 0; i < messages.length; i++) {
                            const msg = messages[i];
                            const isSentByMe = msg.sender?.uuid === myUserUuid;
                            if (!isSentByMe && msg.text) {
                                lastRepliedMessageId = msg.uuid;
                                saveLastRepliedId(); // Persist to localStorage
                                console.log('Set baseline to message ID:', lastRepliedMessageId);
                                console.log('AI will only reply to NEW messages from now on');
                                break;
                            }
                        }
                    }
                }

                // If AI was turned OFF, reset the lastRepliedMessageId
                if (!aiAutoReplyEnabled) {
                    lastRepliedMessageId = null;
                    console.log('AI MODE DISABLED - Reset message tracking');
                }
            } catch (error) {
                console.error('Failed to update AI mode:', error);
            }
        }

        function toggleSystemPrompt() {
            const container = document.getElementById('systemPromptContainer');
            container.style.display = container.style.display === 'none' ? 'block' : 'none';
        }

        async function saveSystemPrompt() {
            const newPrompt = document.getElementById('systemPromptInput').value;
            systemPrompt = newPrompt;

            try {
                const response = await fetch('/api/ai-settings', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ systemPrompt: newPrompt })
                });

                if (response.ok) {
                    alert('System prompt saved successfully!');
                } else {
                    alert('Failed to save system prompt.');
                }
            } catch (error) {
                console.error('Failed to save system prompt:', error);
                alert('Failed to save system prompt.');
            }
        }

        let lastRepliedMessageId = null;

        // Load last replied message ID from localStorage
        function loadLastRepliedId() {
            if (currentConversationUuid) {
                const stored = localStorage.getItem('lastReplied_' + currentConversationUuid);
                if (stored) {
                    lastRepliedMessageId = stored;
                    console.log('[Session] Restored last replied ID:', lastRepliedMessageId);
                }
            }
        }

        // Save last replied message ID to localStorage
        function saveLastRepliedId() {
            if (currentConversationUuid && lastRepliedMessageId) {
                localStorage.setItem('lastReplied_' + currentConversationUuid, lastRepliedMessageId);
                console.log('[Session] Saved last replied ID:', lastRepliedMessageId);
            }
        }

        async function checkForNewMessagesAndReply() {
            if (!aiAutoReplyEnabled || !currentConversationUuid) {
                return;
            }

            console.log('[AI] Auto-reply triggered - fetching latest messages...');

            try {
                const response = await fetch('/api/messages/' + currentConversationUuid);
                const data = await response.json();

                if (!response.ok) {
                    console.error('[AI] Failed to fetch messages');
                    return;
                }

                const messages = data.messages || [];

                if (messages.length === 0) {
                    console.log('[AI] No messages in conversation');
                    return;
                }

                // DEBUG: Log the order of messages to understand the API response
                console.log('[AI] DEBUG - Message order from API:');
                messages.slice(-5).forEach((msg, idx) => {
                    const senderName = msg.sender?.handle || 'unknown';
                    const messageText = msg.text ? msg.text.substring(0, 50) : '[no text]';
                    console.log('  [' + idx + '] ' + senderName + ': ' + messageText + '... (ID: ' + msg.uuid + ')');
                });

                // Find the latest message from the SUBSCRIBER (not from me)
                // Search from the BEGINNING forwards to find the most recent subscriber message
                // (API returns newest first)
                let latestSubscriberMessage = null;
                for (let i = 0; i < messages.length; i++) {
                    const msg = messages[i];
                    const isSentByMe = msg.sender?.uuid === myUserUuid;
                    if (!isSentByMe && msg.text) {
                        latestSubscriberMessage = msg;
                        break;
                    }
                }

                if (!latestSubscriberMessage) {
                    console.log('[AI] No subscriber messages found');
                    return;
                }

                const senderHandle = latestSubscriberMessage.sender?.handle || latestSubscriberMessage.sender?.username;

                console.log('[AI] Latest SUBSCRIBER message from:', senderHandle);
                console.log('[AI] Message text:', latestSubscriberMessage.text);
                console.log('[AI] Message ID:', latestSubscriberMessage.uuid);
                console.log('[AI] Last replied ID:', lastRepliedMessageId);

                // Only reply if we haven't already replied to this message
                if (latestSubscriberMessage.uuid !== lastRepliedMessageId) {
                    console.log('[AI] This is a new subscriber message - preparing reply...');
                    lastRepliedMessageId = latestSubscriberMessage.uuid;
                    saveLastRepliedId(); // Persist to localStorage

                    // Get conversation context: last 30 messages leading up to this one (increased for better memory)
                    const latestMessageIndex = messages.indexOf(latestSubscriberMessage);
                    const contextWindowSize = 30;
                    const startIndex = Math.max(0, latestMessageIndex - contextWindowSize + 1);
                    const conversationContext = messages.slice(startIndex, latestMessageIndex + 1);

                    console.log('[AI] Including ' + conversationContext.length + ' messages as context');

                    // Check if we should delay the response
                    if (fastResponseMode) {
                        // Fast mode: reply immediately
                        console.log('[AI] Fast mode - replying immediately');
                        await generateAndSendAIReply(conversationContext, messages);
                    } else {
                        // Natural mode: add random 1-3 minute delay
                        const delayMinutes = Math.random() * 2 + 1; // Random between 1 and 3 minutes
                        const delaySeconds = Math.floor(delayMinutes * 60);

                        console.log('[AI] Natural mode - delaying reply by ' + Math.floor(delayMinutes * 10) / 10 + ' minutes (' + delaySeconds + ' seconds)');

                        // Show delay indicator
                        showDelayCountdown(delaySeconds);

                        // Cancel any existing pending reply
                        if (pendingAIReply) {
                            clearTimeout(pendingAIReply);
                        }

                        // Schedule the reply
                        pendingAIReply = setTimeout(async () => {
                            hideDelayCountdown();
                            console.log('[AI] Delay complete - generating reply now');
                            await generateAndSendAIReply(conversationContext, messages);
                            pendingAIReply = null;
                        }, delaySeconds * 1000);
                    }
                } else {
                    console.log('[AI] Skipping - already replied to this message');
                }
            } catch (error) {
                console.error('[AI] Error in auto-reply:', error);
            }
        }

        async function generateAndSendAIReply(conversationContext, allMessages) {
            try {
                // conversationContext contains the last N messages for context
                const latestMessage = conversationContext[conversationContext.length - 1];

                console.log('[AI] Generating reply to this message:', latestMessage.text);
                console.log('[AI] Context window:', conversationContext.length, 'messages');

                // Build conversation history for OpenAI
                const conversationHistory = conversationContext.map(msg => {
                    const isSentByYou = msg.sender?.uuid === myUserUuid;
                    return {
                        text: msg.text,
                        isSentByYou: isSentByYou
                    };
                });

                const response = await fetch('/api/ai-generate-reply', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationHistory: conversationHistory,
                        systemPrompt: systemPrompt,
                        userProfile: currentUserProfile, // Include subscriber profile if available
                        creatorProfile: creatorProfile // Include creator persona
                    })
                });

                const data = await response.json();
                console.log('[AI] Generated response:', data);

                if (response.ok && data.reply) {
                    console.log('[AI] Sending reply:', data.reply);
                    await fetch('/api/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: data.reply,
                            conversationUuid: currentConversationUuid
                        })
                    });

                    console.log('[AI] Reply sent successfully!');

                    // Track AI message sent
                    await trackAIMessage(currentConversationUuid);

                    await loadMessages(currentConversationUuid);

                    // Update subscriber profile after conversation to learn new facts
                    console.log('[AI] Updating subscriber profile with new conversation data...');
                    await generateUserProfile(true); // Silent regeneration to capture new info
                } else {
                    console.error('[AI] Generation failed:', data);
                }
            } catch (error) {
                console.error('[AI] Error generating AI reply:', error);
            }
        }

        function startAutoRefresh() {
            if (autoRefreshInterval) {
                clearInterval(autoRefreshInterval);
            }

            // Use 30 seconds for natural delay mode (saves tokens), 5 seconds for fast mode
            const refreshInterval = fastResponseMode ? 5000 : 30000;
            console.log('[Refresh] Setting auto-refresh interval to', refreshInterval / 1000, 'seconds');

            autoRefreshInterval = setInterval(async () => {
                if (currentConversationUuid) {
                    if (aiAutoReplyEnabled) {
                        await checkForNewMessagesAndReply();
                    }
                    await loadMessages(currentConversationUuid);
                }
            }, refreshInterval);
        }

        let currentUserProfile = null;

        function toggleProfileSidebar() {
            const sidebar = document.getElementById('profileSidebar');
            sidebar.classList.toggle('open');
        }

        async function generateUserProfile(silentMode = false) {
            if (!currentConversationUuid) {
                if (!silentMode) alert('Please select a conversation first');
                return;
            }

            const btn = document.getElementById('generateProfileBtn');
            if (!silentMode) {
                btn.disabled = true;
                btn.textContent = 'Analyzing...';
            }

            try {
                const response = await fetch('/api/generate-user-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conversationUuid: currentConversationUuid })
                });

                const data = await response.json();

                if (response.ok && data.profile) {
                    currentUserProfile = data.profile;
                    displayUserProfile(data.profile);
                    if (silentMode) {
                        console.log('[Profile] Auto-generated profile for subscriber');
                    }
                } else {
                    if (!silentMode) {
                        alert('Failed to generate profile: ' + (data.error || 'Unknown error'));
                    }
                }
            } catch (error) {
                console.error('Error generating profile:', error);
                if (!silentMode) {
                    alert('Error generating profile: ' + error.message);
                }
            } finally {
                if (!silentMode) {
                    btn.disabled = false;
                    btn.textContent = 'Regenerate Profile';
                }
            }
        }

        function displayUserProfile(profile) {
            const content = document.getElementById('profileContent');

            const html = '<div class="profile-section"><h4>Summary</h4><p class="profile-summary">' + (profile.summary || 'No summary available') + '</p></div>' +
                '<div class="profile-section"><h4>Interests</h4><div>' +
                (profile.interests && profile.interests.length > 0
                    ? profile.interests.map(i => '<span class="interest-tag">' + i + '</span>').join('')
                    : '<p style="color: #999;">No interests identified</p>') +
                '</div></div>' +
                '<div class="profile-section"><h4>Personality</h4><p class="profile-summary">' + (profile.personality || 'Not yet determined') + '</p></div>' +
                '<div class="profile-section"><h4>Key Facts</h4><div>' +
                (profile.facts && profile.facts.length > 0
                    ? profile.facts.map(f => '<div class="fact-item">' + f + '</div>').join('')
                    : '<p style="color: #999;">No facts recorded</p>') +
                '</div></div>' +
                '<div style="margin-top: 10px; font-size: 12px; color: #999;">Generated: ' + new Date(profile.generatedAt).toLocaleString() + '<br>Based on ' + profile.messageCount + ' messages</div>';

            content.innerHTML = html;
        }

        async function loadUserProfile() {
            if (!currentConversationUuid) return;

            try {
                const response = await fetch('/api/user-profile/' + currentConversationUuid);
                const data = await response.json();

                if (data.profile) {
                    currentUserProfile = data.profile;
                    displayUserProfile(data.profile);

                    // Only update notes if the textarea is not focused (user is not actively typing)
                    const notesTextarea = document.getElementById('subscriberNotes');
                    if (document.activeElement !== notesTextarea) {
                        notesTextarea.value = data.profile.manualNotes || '';
                    }
                } else {
                    // Auto-generate profile if it doesn't exist
                    await generateUserProfile(true); // Pass true for silent mode
                }
            } catch (error) {
                console.error('Error loading user profile:', error);
            }
        }

        function toggleCreatorSidebar() {
            const sidebar = document.getElementById('creatorSidebar');
            sidebar.classList.toggle('open');
        }

        let creatorProfile = null;

        async function loadCreatorProfile() {
            try {
                const response = await fetch('/api/creator-profile');
                const data = await response.json();

                if (data.profile) {
                    creatorProfile = data.profile;
                    document.getElementById('creatorName').value = data.profile.name || '';
                    document.getElementById('creatorAge').value = data.profile.age || '';

                    // Extract accent/vibe info
                    const vibeText = data.profile.vibe || '';
                    document.getElementById('creatorAccent').value = vibeText.split(',')[0] || '';

                    document.getElementById('creatorPhysical').value = data.profile.physical || '';
                    document.getElementById('creatorVibe').value = data.profile.personality || '';

                    // Convert interests array and background to facts
                    let factsText = data.profile.background || '';
                    if (data.profile.interests && Array.isArray(data.profile.interests)) {
                        factsText += '\\nInterests: ' + data.profile.interests.join(', ');
                    }
                    document.getElementById('creatorFacts').value = factsText;

                    document.getElementById('creatorOther').value = data.profile.other || '';
                }
            } catch (error) {
                console.error('Error loading creator profile:', error);
            }
        }

        async function saveCreatorProfile() {
            const name = document.getElementById('creatorName').value;
            const age = document.getElementById('creatorAge').value;
            const accent = document.getElementById('creatorAccent').value;
            const physical = document.getElementById('creatorPhysical').value;
            const personalityVibe = document.getElementById('creatorVibe').value;
            const facts = document.getElementById('creatorFacts').value;
            const other = document.getElementById('creatorOther').value;

            try {
                const response = await fetch('/api/creator-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: name,
                        age: parseInt(age) || age,
                        physical: physical,
                        personality: personalityVibe,
                        vibe: accent + ', ' + personalityVibe,
                        background: facts,
                        other: other
                    })
                });

                if (response.ok) {
                    alert('Persona saved successfully! Changes will apply to new AI replies.');
                } else {
                    alert('Failed to save persona');
                }
            } catch (error) {
                console.error('Error saving creator profile:', error);
                alert('Error saving persona');
            }
        }

        async function saveSubscriberNotes() {
            if (!currentConversationUuid) {
                alert('Please select a conversation first');
                return;
            }

            const notes = document.getElementById('subscriberNotes').value;

            try {
                const response = await fetch('/api/user-profile-notes', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversationUuid: currentConversationUuid,
                        notes: notes
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    if (data.profile) {
                        currentUserProfile = data.profile;
                    }
                    alert('Notes saved successfully!');
                } else {
                    alert('Failed to save notes');
                }
            } catch (error) {
                console.error('Error saving notes:', error);
                alert('Error saving notes');
            }
        }

        // Analytics functions
        function toggleAnalytics() {
            const dashboard = document.getElementById('analyticsDashboard');
            const isOpen = dashboard.classList.contains('open');

            if (isOpen) {
                dashboard.classList.remove('open');
            } else {
                dashboard.classList.add('open');
                loadAnalytics();
            }
        }

        async function loadAnalytics() {
            try {
                const response = await fetch('/api/analytics');
                const data = await response.json();

                // Update summary stats
                document.getElementById('totalMessages').textContent = data.summary.totalMessages;
                document.getElementById('messagesSent').textContent = data.summary.totalMessagesSent;
                document.getElementById('aiReplies').textContent = data.summary.aiRepliesSent;
                document.getElementById('activeChats').textContent = data.summary.activeConversations;

                // Render 7-day chart
                renderBarChart(data.last7Days);

                // Render top conversations
                renderTopConversations(data.topConversations);
            } catch (error) {
                console.error('Error loading analytics:', error);
            }
        }

        function renderBarChart(data) {
            const chartContainer = document.getElementById('barChart');
            chartContainer.innerHTML = '';

            if (!data || data.length === 0) {
                chartContainer.innerHTML = '<div style="text-align: center; color: #999;">No data yet</div>';
                return;
            }

            const maxValue = Math.max(...data.map(d => (d.messagesSent || 0) + (d.messagesReceived || 0)), 1);

            data.forEach(day => {
                const total = (day.messagesSent || 0) + (day.messagesReceived || 0);
                const heightPercent = (total / maxValue) * 100;
                const date = new Date(day.date);
                const dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

                const barContainer = document.createElement('div');
                barContainer.className = 'bar-container';

                const barValue = document.createElement('div');
                barValue.className = 'bar-value';
                barValue.textContent = total;

                const bar = document.createElement('div');
                bar.className = 'bar';
                bar.style.height = heightPercent + '%';
                bar.title = total + ' messages on ' + day.date;

                const label = document.createElement('div');
                label.className = 'bar-label';
                label.textContent = dayLabel;

                barContainer.appendChild(barValue);
                barContainer.appendChild(bar);
                barContainer.appendChild(label);
                chartContainer.appendChild(barContainer);
            });
        }

        function renderTopConversations(conversations) {
            const container = document.getElementById('topConversations');

            if (!conversations || conversations.length === 0) {
                container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No conversation data yet</div>';
                return;
            }

            container.innerHTML = '';
            conversations.forEach((conv, index) => {
                const row = document.createElement('div');
                row.className = 'conversation-row';

                const info = document.createElement('div');
                info.className = 'conversation-info';

                const uuid = document.createElement('div');
                uuid.className = 'conversation-uuid';
                uuid.textContent = '#' + (index + 1) + ' - ' + conv.uuid.substring(0, 16) + '...';

                const stats = document.createElement('div');
                stats.className = 'conversation-stats';

                const sent = document.createElement('div');
                sent.className = 'stat-item';
                sent.innerHTML = '<div class="stat-item-label">Sent</div><div class="stat-item-value">' + conv.messagesSent + '</div>';

                const received = document.createElement('div');
                received.className = 'stat-item';
                received.innerHTML = '<div class="stat-item-label">Received</div><div class="stat-item-value">' + conv.messagesReceived + '</div>';

                const ai = document.createElement('div');
                ai.className = 'stat-item';
                ai.innerHTML = '<div class="stat-item-label">AI</div><div class="stat-item-value">' + conv.aiReplies + '</div>';

                stats.appendChild(sent);
                stats.appendChild(received);
                stats.appendChild(ai);

                info.appendChild(uuid);
                row.appendChild(info);
                row.appendChild(stats);
                container.appendChild(row);
            });
        }

        // Track AI messages sent
        async function trackAIMessage(conversationUuid) {
            try {
                await fetch('/api/analytics/track-ai-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ conversationUuid })
                });
            } catch (error) {
                console.error('Error tracking AI message:', error);
            }
        }

        // Delay countdown functions
        function showDelayCountdown(seconds) {
            const indicator = document.getElementById('delayIndicator');
            const countdown = document.getElementById('delayCountdown');

            indicator.style.display = 'block';
            let remaining = seconds;

            // Update immediately
            updateCountdownDisplay(remaining);

            // Clear any existing countdown
            if (delayCountdownInterval) {
                clearInterval(delayCountdownInterval);
            }

            // Update every second
            delayCountdownInterval = setInterval(() => {
                remaining--;
                if (remaining <= 0) {
                    clearInterval(delayCountdownInterval);
                    delayCountdownInterval = null;
                } else {
                    updateCountdownDisplay(remaining);
                }
            }, 1000);
        }

        function updateCountdownDisplay(seconds) {
            const countdown = document.getElementById('delayCountdown');
            const minutes = Math.floor(seconds / 60);
            const secs = seconds % 60;

            if (minutes > 0) {
                countdown.textContent = minutes + 'm ' + secs + 's';
            } else {
                countdown.textContent = secs + 's';
            }
        }

        function hideDelayCountdown() {
            const indicator = document.getElementById('delayIndicator');
            indicator.style.display = 'none';

            if (delayCountdownInterval) {
                clearInterval(delayCountdownInterval);
                delayCountdownInterval = null;
            }
        }

        window.addEventListener('load', async () => {
            // Attach all event listeners
            document.getElementById('refreshButton')?.addEventListener('click', loadConversations);
            document.getElementById('conversationSelect')?.addEventListener('change', function() {
                if (this.value) {
                    loadMessages(this.value);
                }
            });
            document.getElementById('messageSearch')?.addEventListener('input', filterMessages);
            document.getElementById('aiToggle')?.addEventListener('change', toggleAIMode);
            document.getElementById('fastModeToggle')?.addEventListener('change', toggleFastMode);
            document.getElementById('systemPromptButton')?.addEventListener('click', toggleSystemPrompt);
            document.getElementById('savePromptButton')?.addEventListener('click', saveAdvancedSettings);
            document.getElementById('messageInput')?.addEventListener('keypress', handleKeyPress);
            document.getElementById('sendButton')?.addEventListener('click', sendMessage);
            document.getElementById('profileToggleBtn')?.addEventListener('click', toggleProfileSidebar);
            document.getElementById('creatorToggleBtn')?.addEventListener('click', toggleCreatorSidebar);
            document.getElementById('analyticsBtn')?.addEventListener('click', toggleAnalytics);
            document.getElementById('profileCloseBtnSidebar')?.addEventListener('click', toggleProfileSidebar);
            document.getElementById('generateProfileBtn')?.addEventListener('click', generateUserProfile);
            document.getElementById('saveNotesBtn')?.addEventListener('click', saveSubscriberNotes);
            document.getElementById('creatorCloseBtnSidebar')?.addEventListener('click', toggleCreatorSidebar);
            document.getElementById('savePersonaBtn')?.addEventListener('click', saveCreatorProfile);
            document.getElementById('analyticsCloseBtn')?.addEventListener('click', toggleAnalytics);

            await getMyUserUuid();
            await loadAISettings();
            await loadCreatorProfile();
            loadConversations();
            startAutoRefresh();
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

  const profileResponse = await fanvueRequest('get', '/users/me', {
    headers: {
      'Authorization': `Bearer ${req.session.access_token}`,
      'X-Fanvue-API-Version': API_VERSION
    }
  });

  if (profileResponse?.status === 200) {
    const userInfo = profileResponse.data;
    const username = userInfo.username || userInfo.email || 'User';
    
    return res.send(renderTemplate(HTML_TEMPLATE, {
      loggedIn: true,
      username: username
    }));
  }

  return res.send(renderTemplate(HTML_TEMPLATE, {
    loggedIn: true,
    username: 'User'
  }));
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
  let userResponse = await fanvueRequest('get', '/users/me', { headers });

  const rateLimitError = handleRateLimit(userResponse);
  if (rateLimitError) {
    return { error: rateLimitError };
  }

  if (userResponse.status === 401) {
    if (await refreshAccessTokenIfNeeded(req)) {
      headers['Authorization'] = `Bearer ${req.session.access_token}`;
      userResponse = await fanvueRequest('get', '/users/me', { headers });
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

app.get('/api/profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);
    const userResult = await fetchUserInfo(req, headers);
    if (userResult.error) {
      return res.status(userResult.error.status || 429).json(userResult.error);
    }

    return res.json({ profile: userResult.data });
  } catch (error) {
    console.error('Error loading profile:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

app.get('/api/creator-profile', async (req, res) => {
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
    const creatorPaths = [
      '/creators/me',
      '/creator/me',
      userUuid ? `/creators/${userUuid}` : null
    ].filter(Boolean);

    const creatorResponse = await fanvueRequestWithFallbackPaths(
      'get',
      creatorPaths,
      { headers }
    );

    const creatorRateLimitError = handleRateLimit(creatorResponse);
    if (creatorRateLimitError) {
      return res.status(429).json(creatorRateLimitError);
    }

    if (creatorResponse.status !== 200) {
      return res.status(creatorResponse.status).json({
        error: 'Failed to load creator profile',
        details: {
          response: creatorResponse.data || null,
          tried: creatorPaths
        }
      });
    }

    return res.json({ creator: creatorResponse.data });
  } catch (error) {
    console.error('Error loading creator profile:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

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

    const conversationsResponse = await fanvueRequest(
      'get',
      '/chats',
      { headers }
    );

    const conversationsRateLimitError = handleRateLimit(conversationsResponse);
    if (conversationsRateLimitError) {
      return res.status(429).json(conversationsRateLimitError);
    }

    if (conversationsResponse.status !== 200) {
      return res.status(conversationsResponse.status).json({
        error: 'Failed to load conversations',
        details: {
          response: conversationsResponse.data || null
        }
      });
    }

    const conversations = conversationsResponse.data?.data || conversationsResponse.data || [];
    const formatted = Array.isArray(conversations)
      ? conversations.map((chat) => ({
          uuid: chat.user?.uuid || chat.uuid,
          label: chat.user?.username || chat.user?.handle || chat.title || chat.name || chat.uuid
        }))
      : [];

    return res.json({ conversations: formatted });
  } catch (error) {
    console.error('Error loading conversations:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

app.get('/api/messages/:userUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const userUuid = req.params.userUuid;
  if (!userUuid) {
    return res.status(400).json({ error: 'User UUID is required' });
  }

  try {
    let headers = buildAuthHeaders(req.session.access_token);

    const messagesResponse = await fanvueRequest(
      'get',
      `/chats/${userUuid}/messages`,
      { headers }
    );

    const messagesRateLimitError = handleRateLimit(messagesResponse);
    if (messagesRateLimitError) {
      return res.status(429).json(messagesRateLimitError);
    }

    if (messagesResponse.status !== 200) {
      return res.status(messagesResponse.status).json({
        error: 'Failed to load messages',
        details: {
          response: messagesResponse.data || null
        }
      });
    }

    const messages = messagesResponse.data?.data || messagesResponse.data || [];
    return res.json({ messages: messages });
  } catch (error) {
    console.error('Error loading messages:', error.response?.data || error.message);
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

    const recipientUuid = req.body.conversationUuid;
    if (!recipientUuid) {
      return res.status(400).json({
        error: 'Please select a conversation before sending a message.'
      });
    }

    const sendResponse = await fanvueRequest(
      'post',
      `/chats/${recipientUuid}/message`,
      { data: { text: message }, headers }
    );

    const sendRateLimitError = handleRateLimit(sendResponse);
    if (sendRateLimitError) {
      return res.status(429).json(sendRateLimitError);
    }

    if (sendResponse.status === 200 || sendResponse.status === 201) {
      // Track message sent (not AI)
      trackMessageSent(req.session, recipientUuid, false);

      return res.json({
        response: `Message sent successfully! Your message: "${message}"`
      });
    }

    // Track message sent (not AI)
    trackMessageSent(req.session, recipientUuid, false);

    return res.json({
      response: `Your message: "${message}" was received.`
    });

  } catch (error) {
    console.error('Error sending message:', error.response?.data || error.message);
    return res.status(500).json({ error: error.response?.data?.message || error.message });
  }
});

app.post('/api/ai-generate-reply', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationHistory, systemPrompt, userProfile, creatorProfile } = req.body;

  if (!conversationHistory || !Array.isArray(conversationHistory)) {
    return res.status(400).json({ error: 'Conversation history is required' });
  }

  try {
    // Build enhanced system prompt with creator persona and user profile
    let enhancedSystemPrompt = systemPrompt || DEFAULT_SYSTEM_PROMPT;

    // Add creator persona information
    if (creatorProfile && (creatorProfile.name || creatorProfile.vibe)) {
      enhancedSystemPrompt += `\n\n--- YOUR PERSONA ---
You are roleplaying as ${creatorProfile.name || 'a content creator'}.`;

      if (creatorProfile.age) {
        enhancedSystemPrompt += `\nAge: ${creatorProfile.age}`;
      }
      if (creatorProfile.physical) {
        enhancedSystemPrompt += `\nPhysical Description: ${creatorProfile.physical}`;
      }
      if (creatorProfile.vibe) {
        enhancedSystemPrompt += `\nPersonality/Vibe: ${creatorProfile.vibe}`;
      }
      if (creatorProfile.accent) {
        enhancedSystemPrompt += `\nLanguage Style/Accent: ${creatorProfile.accent}`;
      }
      if (creatorProfile.facts) {
        enhancedSystemPrompt += `\nBackground/Facts: ${creatorProfile.facts}`;
      }
      if (creatorProfile.other) {
        enhancedSystemPrompt += `\nAdditional Context: ${creatorProfile.other}`;
      }

      enhancedSystemPrompt += `\n\nStay in character and respond naturally as this person would. Use their personality, speaking style, and background in your responses.`;
    }

    // Add subscriber profile information
    if (userProfile) {
      enhancedSystemPrompt += `\n\n--- SUBSCRIBER PROFILE ---
You are chatting with someone who has the following characteristics:
- Summary: ${userProfile.summary}
- Personality: ${userProfile.personality}
- Interests: ${userProfile.interests?.join(', ') || 'Not yet identified'}
- Key Facts: ${userProfile.facts?.join('; ') || 'None recorded'}`;

      if (userProfile.manualNotes) {
        enhancedSystemPrompt += `\n- Important Notes: ${userProfile.manualNotes}`;
      }

      enhancedSystemPrompt += `\n\nUse this information to personalize your responses and show that you remember details about them. Reference their interests and facts naturally when relevant.`;
    }

    // Focus on the last 3-5 messages for crafting the reply, but keep profile context
    // This makes the AI respond to the current conversation flow rather than getting lost in history
    const recentMessageCount = 5;
    const recentMessages = conversationHistory.slice(-recentMessageCount);

    // If there are older messages, summarize them briefly as context
    let contextSummary = '';
    if (conversationHistory.length > recentMessageCount) {
      const olderMessages = conversationHistory.slice(0, -recentMessageCount);
      contextSummary = `\n\n--- EARLIER CONVERSATION CONTEXT ---
Earlier in the conversation (${olderMessages.length} messages), you discussed various topics. Focus your reply on the most recent ${recentMessages.length} messages below.`;
    }

    const messages = [
      {
        role: 'system',
        content: enhancedSystemPrompt + contextSummary
      },
      ...recentMessages.map(msg => ({
        role: msg.isSentByYou ? 'assistant' : 'user',
        content: msg.text
      }))
    ];

    // Use configurable token limits, temperature, and model
    const maxTokens = req.session.maxReplyTokens || 150;
    const temperature = req.session.replyTemperature !== undefined ? req.session.replyTemperature : 0.9;
    const aiModel = req.session.aiModel || 'gpt-4o';

    const completion = await openai.chat.completions.create({
      model: aiModel,
      messages: messages,
      max_tokens: maxTokens,
      temperature: temperature,
    });

    const reply = completion.choices[0]?.message?.content || '';

    return res.json({ reply: reply });
  } catch (error) {
    console.error('OpenAI API error:', error);
    return res.status(500).json({
      error: 'Failed to generate AI reply',
      details: error.message
    });
  }
});

app.get('/api/ai-settings', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({
    systemPrompt: req.session.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    autoReplyEnabled: req.session.autoReplyEnabled || false,
    fastResponseMode: req.session.fastResponseMode !== undefined ? req.session.fastResponseMode : true, // Default to fast for testing
    maxReplyTokens: req.session.maxReplyTokens || 150, // Default: 150 tokens (~100-120 words)
    maxProfileTokens: req.session.maxProfileTokens || 500, // Default: 500 tokens for profile analysis
    replyTemperature: req.session.replyTemperature !== undefined ? req.session.replyTemperature : 0.9, // Default: 0.9 for creative responses
    aiModel: req.session.aiModel || 'gpt-4o', // Default to GPT-4o for chat replies
    profileModel: req.session.profileModel || 'gpt-4o' // Default to GPT-4o for profile analysis
  });
});

app.post('/api/ai-settings', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { systemPrompt, autoReplyEnabled, fastResponseMode, maxReplyTokens, maxProfileTokens, replyTemperature, aiModel, profileModel } = req.body;

  if (systemPrompt !== undefined) {
    req.session.systemPrompt = systemPrompt;
  }
  if (autoReplyEnabled !== undefined) {
    req.session.autoReplyEnabled = autoReplyEnabled;
  }
  if (fastResponseMode !== undefined) {
    req.session.fastResponseMode = fastResponseMode;
  }
  if (maxReplyTokens !== undefined) {
    req.session.maxReplyTokens = parseInt(maxReplyTokens);
  }
  if (maxProfileTokens !== undefined) {
    req.session.maxProfileTokens = parseInt(maxProfileTokens);
  }
  if (replyTemperature !== undefined) {
    req.session.replyTemperature = parseFloat(replyTemperature);
  }
  if (aiModel !== undefined) {
    req.session.aiModel = aiModel;
  }
  if (profileModel !== undefined) {
    req.session.profileModel = profileModel;
  }

  return res.json({
    success: true,
    systemPrompt: req.session.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    autoReplyEnabled: req.session.autoReplyEnabled || false,
    fastResponseMode: req.session.fastResponseMode !== undefined ? req.session.fastResponseMode : true,
    maxReplyTokens: req.session.maxReplyTokens || 150,
    maxProfileTokens: req.session.maxProfileTokens || 500,
    replyTemperature: req.session.replyTemperature !== undefined ? req.session.replyTemperature : 0.9,
    aiModel: req.session.aiModel || 'gpt-4o',
    profileModel: req.session.profileModel || 'gpt-4o'
  });
});

// Get creator profile
app.get('/api/creator-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({
    profile: req.session.creatorProfile || null
  });
});

// Save creator profile
app.post('/api/creator-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  req.session.creatorProfile = req.body;

  return res.json({
    success: true,
    profile: req.session.creatorProfile
  });
});

// Generate user profile summary using AI
app.post('/api/generate-user-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.body;

  if (!conversationUuid) {
    return res.status(400).json({ error: 'Conversation UUID is required' });
  }

  try {
    const headers = buildAuthHeaders(req.session.access_token);

    // Fetch messages for this conversation
    const messagesResponse = await fanvueRequest(
      'get',
      `/chats/${conversationUuid}/messages`,
      { headers }
    );

    if (messagesResponse.status !== 200) {
      return res.status(messagesResponse.status).json({
        error: 'Failed to load messages for profile generation'
      });
    }

    const allMessages = messagesResponse.data?.data || messagesResponse.data || [];
    console.log('[Profile Gen] Total messages fetched:', allMessages.length);

    // Get user profile
    const userResult = await fanvueRequest('get', '/users/me', { headers });
    const myUserUuid = userResult.data?.uuid;
    console.log('[Profile Gen] My UUID:', myUserUuid);

    // Filter to get only subscriber messages (not creator's messages)
    const subscriberMessages = allMessages
      .filter(msg => {
        const isNotMe = msg.sender?.uuid !== myUserUuid;
        const hasText = !!msg.text;
        console.log('[Profile Gen] Message from', msg.sender?.handle, '- isNotMe:', isNotMe, 'hasText:', hasText);
        return isNotMe && hasText;
      })
      .slice(0, 30); // Last 30 subscriber messages

    console.log('[Profile Gen] Filtered subscriber messages:', subscriberMessages.length);

    if (subscriberMessages.length === 0) {
      return res.json({
        profile: {
          summary: 'No messages yet to analyze.',
          interests: [],
          personality: 'Unknown',
          facts: []
        }
      });
    }

    // Build prompt for AI to analyze the user
    const analysisPrompt = `Analyze these messages from a subscriber and create a profile summary. Focus on:
1. Their interests and topics they talk about
2. Their personality traits and communication style
3. Important facts they've shared about themselves
4. Preferences or recurring themes

Messages:
${subscriberMessages.map((msg, i) => `${i + 1}. "${msg.text}"`).join('\n')}

Provide a JSON response with this structure:
{
  "summary": "2-3 sentence overview of this person",
  "interests": ["interest1", "interest2", ...],
  "personality": "brief personality description",
  "facts": ["fact1", "fact2", ...]
}`;

    console.log('[Profile Gen] Calling OpenAI API to analyze messages...');

    // Use configurable token limit and model for profile generation
    const maxProfileTokens = req.session.maxProfileTokens || 500;
    const profileModel = req.session.profileModel || 'gpt-4o';

    const completion = await openai.chat.completions.create({
      model: profileModel,
      messages: [
        {
          role: 'system',
          content: 'You are an expert at analyzing conversations and creating accurate personality profiles. Always respond with valid JSON.'
        },
        {
          role: 'user',
          content: analysisPrompt
        }
      ],
      max_tokens: maxProfileTokens,
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    console.log('[Profile Gen] OpenAI API call successful');

    const profileData = JSON.parse(completion.choices[0]?.message?.content || '{}');

    // Store in session (per-conversation)
    if (!req.session.userProfiles) {
      req.session.userProfiles = {};
    }
    req.session.userProfiles[conversationUuid] = {
      ...profileData,
      generatedAt: new Date().toISOString(),
      messageCount: subscriberMessages.length
    };

    return res.json({ profile: req.session.userProfiles[conversationUuid] });

  } catch (error) {
    console.error('[Profile Gen] Full error:', error);
    console.error('[Profile Gen] Error stack:', error.stack);
    return res.status(500).json({
      error: 'Failed to generate user profile',
      details: error.message
    });
  }
});

// Get stored user profile
app.get('/api/user-profile/:conversationUuid', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.params;

  if (!req.session.userProfiles || !req.session.userProfiles[conversationUuid]) {
    return res.json({ profile: null });
  }

  return res.json({ profile: req.session.userProfiles[conversationUuid] });
});

// Save manual notes to user profile
app.post('/api/user-profile-notes', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid, notes } = req.body;

  if (!conversationUuid) {
    return res.status(400).json({ error: 'Conversation UUID is required' });
  }

  if (!req.session.userProfiles) {
    req.session.userProfiles = {};
  }

  if (!req.session.userProfiles[conversationUuid]) {
    req.session.userProfiles[conversationUuid] = {
      summary: '',
      interests: [],
      personality: '',
      facts: [],
      manualNotes: notes
    };
  } else {
    req.session.userProfiles[conversationUuid].manualNotes = notes;
  }

  return res.json({
    success: true,
    profile: req.session.userProfiles[conversationUuid]
  });
});

// Get creator profile
app.get('/api/creator-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  return res.json({
    profile: req.session.creatorProfile || null
  });
});

// Save creator profile
app.post('/api/creator-profile', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { profile } = req.body;

  if (!profile) {
    return res.status(400).json({ error: 'Profile data is required' });
  }

  req.session.creatorProfile = profile;

  return res.json({
    success: true,
    profile: req.session.creatorProfile
  });
});

// Track AI message sent
app.post('/api/analytics/track-ai-message', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { conversationUuid } = req.body;
  if (conversationUuid) {
    trackMessageSent(req.session, conversationUuid, true);
  }

  return res.json({ success: true });
});

// Analytics tracking functions
function trackMessageSent(session, conversationUuid, isAI = false) {
  if (!session.analytics) {
    session.analytics = {
      messagesSent: 0,
      messagesReceived: 0,
      aiRepliesSent: 0,
      conversationStats: {},
      dailyStats: {}
    };
  }

  session.analytics.messagesSent++;
  if (isAI) {
    session.analytics.aiRepliesSent++;
  }

  // Track per-conversation
  if (!session.analytics.conversationStats[conversationUuid]) {
    session.analytics.conversationStats[conversationUuid] = {
      messagesSent: 0,
      messagesReceived: 0,
      aiReplies: 0,
      lastActivity: new Date().toISOString()
    };
  }
  session.analytics.conversationStats[conversationUuid].messagesSent++;
  if (isAI) {
    session.analytics.conversationStats[conversationUuid].aiReplies++;
  }
  session.analytics.conversationStats[conversationUuid].lastActivity = new Date().toISOString();

  // Track daily stats
  const today = new Date().toISOString().split('T')[0];
  if (!session.analytics.dailyStats[today]) {
    session.analytics.dailyStats[today] = {
      messagesSent: 0,
      messagesReceived: 0,
      aiReplies: 0
    };
  }
  session.analytics.dailyStats[today].messagesSent++;
  if (isAI) {
    session.analytics.dailyStats[today].aiReplies++;
  }
}

function trackMessageReceived(session, conversationUuid) {
  if (!session.analytics) {
    session.analytics = {
      messagesSent: 0,
      messagesReceived: 0,
      aiRepliesSent: 0,
      conversationStats: {},
      dailyStats: {}
    };
  }

  session.analytics.messagesReceived++;

  // Track per-conversation
  if (!session.analytics.conversationStats[conversationUuid]) {
    session.analytics.conversationStats[conversationUuid] = {
      messagesSent: 0,
      messagesReceived: 0,
      aiReplies: 0,
      lastActivity: new Date().toISOString()
    };
  }
  session.analytics.conversationStats[conversationUuid].messagesReceived++;
  session.analytics.conversationStats[conversationUuid].lastActivity = new Date().toISOString();

  // Track daily stats
  const today = new Date().toISOString().split('T')[0];
  if (!session.analytics.dailyStats[today]) {
    session.analytics.dailyStats[today] = {
      messagesSent: 0,
      messagesReceived: 0,
      aiReplies: 0
    };
  }
  session.analytics.dailyStats[today].messagesReceived++;
}

// Get analytics data
app.get('/api/analytics', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const analytics = req.session.analytics || {
    messagesSent: 0,
    messagesReceived: 0,
    aiRepliesSent: 0,
    conversationStats: {},
    dailyStats: {}
  };

  // Calculate additional metrics
  const totalMessages = analytics.messagesSent + analytics.messagesReceived;
  const activeConversations = Object.keys(analytics.conversationStats).length;

  // Get last 7 days of data
  const last7Days = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split('T')[0];
    const dayStats = analytics.dailyStats[dateStr] || { messagesSent: 0, messagesReceived: 0, aiReplies: 0 };
    last7Days.push({
      date: dateStr,
      ...dayStats
    });
  }

  // Find most active conversations
  const conversationArray = Object.entries(analytics.conversationStats).map(([uuid, stats]) => ({
    uuid,
    ...stats,
    totalMessages: stats.messagesSent + stats.messagesReceived
  }));
  conversationArray.sort((a, b) => b.totalMessages - a.totalMessages);
  const topConversations = conversationArray.slice(0, 5);

  return res.json({
    summary: {
      totalMessagesSent: analytics.messagesSent,
      totalMessagesReceived: analytics.messagesReceived,
      totalMessages,
      aiRepliesSent: analytics.aiRepliesSent,
      activeConversations,
      aiUsagePercent: analytics.messagesSent > 0 ? Math.round((analytics.aiRepliesSent / analytics.messagesSent) * 100) : 0
    },
    last7Days,
    topConversations
  });
});

// Reset analytics (for testing)
app.post('/api/analytics/reset', async (req, res) => {
  if (!req.session.access_token) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  req.session.analytics = {
    messagesSent: 0,
    messagesReceived: 0,
    aiRepliesSent: 0,
    conversationStats: {},
    dailyStats: {}
  };

  return res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Fanvue Chatbot running at http://localhost:${PORT}`);
  console.log('Press Ctrl+C to stop the server');
});
