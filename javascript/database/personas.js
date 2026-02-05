const { supabase } = require('./index');

/**
 * Get persona for specific creator (each creator has ONE persona)
 * @param {string} creatorEmail - Creator's email address
 * @returns {Object|null} Persona data or null if not found
 */
async function getCreatorPersona(creatorEmail) {
  if (!creatorEmail) {
    console.error('[DB] Cannot get persona without creator email');
    return null;
  }

  const { data, error } = await supabase
    .from('creator_personas')
    .select('*')
    .eq('creator_email', creatorEmail)
    .single();

  if (error) {
    if (error.code === 'PGRST116') {
      // No persona found - this is expected for new accounts
      console.log('[DB] No persona found for:', creatorEmail);
      return null;
    }
    console.error('[DB] Error fetching persona:', error);
    return null;
  }
  return data;
}

/**
 * Save or update creator's persona (one persona per creator)
 * @param {string} creatorEmail - Creator's email address
 * @param {Object} personaData - Persona data to save
 * @returns {Object|null} Saved persona or null on error
 */
async function saveCreatorPersona(creatorEmail, personaData) {
  if (!creatorEmail) {
    console.error('[DB] Cannot save persona without creator email');
    return null;
  }

  // Prepare data for database (handle type conversions)
  const dbData = {
    ...personaData,
    // Convert age to integer or null
    age: personaData.age && personaData.age !== '' ? parseInt(personaData.age, 10) : null,
    // Use email as the key (since each account has one persona)
    key: creatorEmail
  };

  // Check if persona exists for this creator
  const { data: existing } = await supabase
    .from('creator_personas')
    .select('id')
    .eq('creator_email', creatorEmail)
    .single();

  if (existing) {
    // Update existing persona
    const { data, error } = await supabase
      .from('creator_personas')
      .update({ ...dbData, updated_at: new Date().toISOString() })
      .eq('creator_email', creatorEmail)
      .select()
      .single();

    if (error) {
      console.error('[DB] Error updating persona:', error);
      return null;
    }
    return data;
  } else {
    // Insert new persona
    const { data, error } = await supabase
      .from('creator_personas')
      .insert({
        creator_email: creatorEmail,
        ...dbData,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[DB] Error creating persona:', error);
      return null;
    }
    return data;
  }
}

module.exports = {
  getCreatorPersona,
  saveCreatorPersona
};
