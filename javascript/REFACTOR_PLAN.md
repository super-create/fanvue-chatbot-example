# App Refactoring Plan

## Current Problem
- app.js is 7900+ lines - impossible to maintain
- Everything mixed together: routes, database, HTML, business logic
- Hard to debug and add features
- Not production-ready

## New Structure

```
javascript/
├── server.js              # Main entry point (minimal)
├── config/
│   └── index.js          # Environment & config
├── database/
│   ├── index.js          # Supabase client
│   ├── ai-settings.js    # AI settings queries
│   ├── personas.js       # Persona queries
│   ├── memories.js       # Subscriber memory queries
│   ├── content-requests.js
│   ├── tips.js
│   └── ppv.js
├── routes/
│   ├── auth.js           # Login, logout, callback
│   ├── ai.js             # AI endpoints
│   ├── vault.js          # Vault & media endpoints
│   ├── persona.js        # Persona endpoints
│   ├── conversations.js  # Chat endpoints
│   └── webhook.js        # Fanvue webhooks
├── services/
│   ├── ai-service.js     # AI reply generation logic
│   ├── vault-service.js  # Media management
│   ├── fanvue-api.js     # Fanvue API client
│   └── media-processor.js # Media descriptions
├── middleware/
│   ├── auth.js           # Authentication checks
│   └── session.js        # Session management
├── utils/
│   ├── pkce.js           # OAuth helpers
│   └── templates.js      # HTML rendering
└── public/
    ├── index.html        # Main UI (extracted from template)
    ├── styles.css        # Styles
    └── app-client.js     # Frontend JavaScript
```

## Migration Steps

### Phase 1: Extract Database Layer
- Create `database/` folder
- Move all Supabase queries into separate files
- Create clean API for each table

### Phase 2: Extract Services
- Move AI generation logic to `services/ai-service.js`
- Move vault logic to `services/vault-service.js`
- Move Fanvue API calls to `services/fanvue-api.js`

### Phase 3: Extract Routes
- Split routes by feature area
- Use Express Router for each module
- Keep routes thin - call services for logic

### Phase 4: Extract Frontend
- Move HTML template to `public/index.html`
- Extract inline JavaScript to `public/app-client.js`
- Add proper CSS file

### Phase 5: Configuration
- Environment variables
- Config management
- Remove hardcoded values

## Benefits
- Easy to find bugs (know which file to check)
- Can add features without breaking others
- Ready for deployment
- Can add tests
- Multiple developers can work on different parts
