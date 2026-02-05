const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();

// Normalize base URL by removing trailing slashes
function normalizeBaseUrl(url) {
  return url.replace(/\/+$/, '');
}

const API_BASE_URL = normalizeBaseUrl(process.env.API_BASE_URL || 'https://api.fanvue.com');
const API_FALLBACK_BASE_URL = API_BASE_URL.endsWith('/v1') ? null : `${API_BASE_URL}/v1`;
const API_VERSION = process.env.API_VERSION || '2025-06-26';

/**
 * Build authorization headers for Fanvue API requests
 * @param {string} accessToken - OAuth access token
 * @returns {Object} Headers object
 */
function buildAuthHeaders(accessToken) {
  return {
    'Authorization': `Bearer ${accessToken}`,
    'X-Fanvue-API-Version': API_VERSION,
    'Content-Type': 'application/json'
  };
}

/**
 * Build full Fanvue API URL
 * @param {string} baseUrl - Base URL
 * @param {string} path - API path
 * @returns {string} Full URL
 */
function buildFanvueUrl(baseUrl, path) {
  return `${baseUrl}${path}`;
}

/**
 * Make a request to Fanvue API with automatic fallback to alternative base URL
 * @param {string} method - HTTP method (get, post, put, delete)
 * @param {string} path - API path
 * @param {Object} options - Axios options (headers, data, etc.)
 * @returns {Promise<Object>} Axios response object
 */
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

/**
 * Try multiple API paths with fallback
 * @param {string} method - HTTP method
 * @param {string[]} paths - Array of paths to try
 * @param {Object} options - Axios options
 * @returns {Promise<Object>} Axios response object
 */
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

/**
 * Get creator's own profile information
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Object>} Profile data
 */
async function getCreatorProfile(accessToken) {
  const headers = buildAuthHeaders(accessToken);
  const response = await fanvueRequest('get', '/me', { headers });

  if (response.status === 200) {
    return response.data;
  }
  throw new Error(`Failed to fetch profile: ${response.status}`);
}

/**
 * Get list of conversations
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Array>} Array of conversations
 */
async function getConversations(accessToken) {
  const headers = buildAuthHeaders(accessToken);
  const response = await fanvueRequest('get', '/chats', { headers });

  if (response.status === 200) {
    return response.data?.chats || [];
  }
  return [];
}

/**
 * Get messages for a conversation
 * @param {string} accessToken - OAuth access token
 * @param {string} conversationUuid - Conversation UUID
 * @returns {Promise<Object>} Messages data
 */
async function getMessages(accessToken, conversationUuid) {
  const headers = buildAuthHeaders(accessToken);
  const response = await fanvueRequest('get', `/chats/${conversationUuid}`, { headers });

  if (response.status === 200) {
    return response.data;
  }
  throw new Error(`Failed to fetch messages: ${response.status}`);
}

/**
 * Send a text message
 * @param {string} accessToken - OAuth access token
 * @param {string} conversationUuid - Conversation UUID
 * @param {string} text - Message text
 * @returns {Promise<Object>} Send response
 */
async function sendMessage(accessToken, conversationUuid, text) {
  const headers = buildAuthHeaders(accessToken);
  const response = await fanvueRequest('post', `/chats/${conversationUuid}/message`, {
    headers,
    data: { text }
  });

  return response;
}

/**
 * Send a message with media
 * @param {string} accessToken - OAuth access token
 * @param {string} conversationUuid - Conversation UUID
 * @param {string} text - Message text
 * @param {string[]} mediaUuids - Array of media UUIDs
 * @param {number|null} priceInCents - Price in cents (for PPV), null for free
 * @returns {Promise<Object>} Send response
 */
async function sendMediaMessage(accessToken, conversationUuid, text, mediaUuids, priceInCents = null) {
  const headers = buildAuthHeaders(accessToken);
  const data = {
    text: text || '',
    mediaUuids
  };

  if (priceInCents !== null && priceInCents > 0) {
    data.price = priceInCents;
  }

  const response = await fanvueRequest('post', `/chats/${conversationUuid}/message`, {
    headers,
    data
  });

  return response;
}

/**
 * Get creator's media library
 * @param {string} accessToken - OAuth access token
 * @returns {Promise<Array>} Array of media items
 */
async function getMediaLibrary(accessToken) {
  const headers = buildAuthHeaders(accessToken);
  const response = await fanvueRequest('get', '/media/library', { headers });

  if (response.status === 200) {
    return response.data?.media || [];
  }
  return [];
}

module.exports = {
  buildAuthHeaders,
  buildFanvueUrl,
  fanvueRequest,
  fanvueRequestWithFallbackPaths,
  getCreatorProfile,
  getConversations,
  getMessages,
  sendMessage,
  sendMediaMessage,
  getMediaLibrary,
  API_BASE_URL,
  API_VERSION
};
