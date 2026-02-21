const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Supabase client
// Use service role key for server-side access (bypasses RLS).
// Falls back to anon key for backwards compatibility.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.warn('[DB] WARNING: Using SUPABASE_ANON_KEY. Set SUPABASE_SERVICE_ROLE_KEY for production.');
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  supabaseKey
);

// Initialize database tables
async function initializeDatabase() {
  console.log('[DB] Initializing database...');

  // Test connection
  const { data, error } = await supabase.from('ai_settings').select('count').limit(1);

  if (error) {
    console.error('[DB] Warning: Could not connect to database:', error.message);
  } else {
    console.log('[DB] Database initialization complete');
  }
}

module.exports = { supabase, initializeDatabase };
