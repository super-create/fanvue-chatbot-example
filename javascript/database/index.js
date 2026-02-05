const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');

dotenv.config();

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
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
