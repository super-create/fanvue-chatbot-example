const rateLimit = require('express-rate-limit');

// Global API rate limit: 100 requests per minute per IP
const globalApiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please slow down.',
    retryAfterSeconds: 60
  }
});

// AI endpoints: 20 requests per minute (these cost money)
const aiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'AI request limit reached. Please wait a moment.',
    retryAfterSeconds: 60
  }
});

// Auth endpoints: 10 per minute (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many login attempts. Please try again later.',
    retryAfterSeconds: 60
  }
});

module.exports = {
  globalApiLimiter,
  aiLimiter,
  authLimiter
};
