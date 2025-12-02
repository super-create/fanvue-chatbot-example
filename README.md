# Fanvue API Chatbot Examples

This repository contains example chatbot applications that integrate with the Fanvue API using OAuth 2.0 authentication. Choose between Python or JavaScript/Node.js implementations based on your preference and experience.

## What's Included

- **Python Example** (`python/`) - Flask-based chatbot application
- **JavaScript Example** (`javascript/`) - Node.js/Express-based chatbot application

Both examples provide:

- OAuth 2.0 authentication with Fanvue
- Simple web-based chat interface
- Integration with Fanvue's chat API
- Comprehensive setup instructions for non-developers

## Quick Start

### Choose Your Language

- **New to programming?** Start with the JavaScript example - it's straightforward and has great tooling support
- **Prefer Python?** Use the Python example - Python is known for being beginner-friendly
- **Already know one language?** Use the example in the language you're most comfortable with

### Prerequisites

Before starting, you'll need:

1. **Programming Language Runtime**

   - For Python: Python 3.8+ ([Download](https://www.python.org/downloads/))
   - For JavaScript: Node.js 18+ ([Download](https://nodejs.org/))

2. **Package Manager** (for JavaScript)

   - pnpm ([Installation Guide](https://pnpm.io/installation))

3. **Fanvue API Access**
   - Go to the [Fanvue Developer Area](https://www.fanvue.com/developers/apps)
   - Create an OAuth application

## Getting Started

**New to this?** Start with the [Setup Checklist](./SETUP_CHECKLIST.md) to track your progress step-by-step.

### Option 1: Python Example

```bash
cd python
# Follow the instructions in python/README.md
```

[📖 Python Setup Guide](./python/README.md)

### Option 2: JavaScript Example

```bash
cd javascript
# Follow the instructions in javascript/README.md
```

[📖 JavaScript Setup Guide](./javascript/README.md)

## What You'll Build

Both examples create a simple web-based chatbot that:

1. **Authenticates** users via Fanvue OAuth
2. **Displays** a chat interface in your web browser
3. **Sends messages** through the Fanvue API
4. **Handles** conversations automatically

## Common Setup Steps

Regardless of which example you choose, you'll need to:

1. **Choose an App Name** - Pick a name for your local domain (e.g., `my-chatbot`)

2. **Set Up HTTPS for Local Development** - OAuth requires HTTPS, even locally

   - Install `mkcert` to generate SSL certificates
   - Generate certificates for your app name
   - Update your hosts file

3. **Create an OAuth Application** in [Fanvue Developer Area](https://www.fanvue.com/developers/apps)

   - Get your Client ID and Client Secret
   - Set the Redirect URI using HTTPS (e.g., `https://your-app-name.dev:5001/callback` for Python or `https://your-app-name.dev:3001/callback` for JavaScript)
   - Select required scopes: `read:self`, `read:chat`, `write:chat`

4. **Configure Environment Variables**

   - Copy `.env.example` to `.env`
   - Fill in your OAuth credentials
   - Set a secure session secret
   - Update Redirect URI to use HTTPS

5. **Install Dependencies**

   - Python: `pip install -r requirements.txt`
   - JavaScript: `pnpm install`

6. **Run the Application** (requires two terminal windows)

   - Terminal 1: Start the app (Python: `python app.py` or JavaScript: `pnpm start`)
   - Terminal 2: Start the HTTPS proxy with `npx local-ssl-proxy`

7. **Access in Browser**
   - Open `https://your-app-name.dev:5001` (Python) or `https://your-app-name.dev:3001` (JavaScript)
   - Accept the security warning (normal for local development)
   - Click "Login with Fanvue"
   - Start chatting!

## Features

- ✅ OAuth 2.0 authentication
- ✅ Secure session management
- ✅ Chat interface with message history
- ✅ Automatic conversation handling
- ✅ Error handling and user feedback
- ✅ Clean, modern UI

## Security Best Practices

- **Never commit `.env` files** - They contain sensitive credentials
- **Use strong session secrets** - Generate random strings for production
- **Keep credentials secure** - Treat Client Secret like a password
- **Use HTTPS in production** - Required for OAuth redirects

## Troubleshooting

### Authentication Issues

- Verify your Client ID and Client Secret are correct
- Ensure Redirect URI matches exactly in both `.env` and Fanvue Developer area
- Check that required scopes are selected

### Connection Issues

- Make sure the application is running (check terminal output)
- Verify the port isn't already in use
- Check firewall settings

### API Errors

- Verify you have API access enabled
- Check that scopes include `read:chat` and `write:chat`
- Review error messages in the terminal

For more specific troubleshooting, see the README in your chosen example directory.

## Next Steps

Once you have the basic chatbot working:

1. **Customize Responses** - Modify the chatbot logic to add custom responses
2. **Add AI Integration** - Connect to OpenAI, Anthropic, or other AI services
3. **Enhance UI** - Improve the chat interface with better styling
4. **Add Features** - Message history, file uploads, emoji support, etc.
5. **Deploy** - Host your chatbot on Vercel, Railway, Heroku, or another platform

## Resources

- [Fanvue API Documentation](https://api.fanvue.com/docs)
- [Fanvue API Quick Start](https://api.fanvue.com/docs/introduction/quick-start)
- [OAuth 2.0 Tutorial](https://api.fanvue.com/docs/authentication/o-auth-2-0)
- [Request API Access](https://help.fanvue.com/en/articles/11363222-request-api-keys)

## Support

If you encounter issues:

1. Check the troubleshooting section in your chosen example's README
2. Review the Fanvue API documentation
3. Verify all environment variables are set correctly
4. Check terminal output for error messages

## License

MIT License - Feel free to use and modify these examples for your own projects.

## Contributing

Found a bug or have a suggestion? Feel free to open an issue or submit a pull request!
