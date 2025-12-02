# Fanvue Chatbot - JavaScript/Node.js Example

A simple chatbot application that integrates with the Fanvue API using OAuth 2.0 authentication, built with Node.js and Express.

## Prerequisites

Before you begin, make sure you have:

1. **Node.js 18 or later** installed on your computer

   - Check by running: `node --version`
   - Download from: https://nodejs.org/

2. **pnpm** package manager installed

   - Install with: `npm install -g pnpm`
   - Check by running: `pnpm --version`

3. **A Fanvue account** with API access

   - Request API access at: https://help.fanvue.com/en/articles/11363222-request-api-keys

4. **An OAuth application** created in the Fanvue Developer area
   - You'll need: Client ID, Client Secret, and Redirect URI

## Step-by-Step Setup Guide

### Step 1: Choose Your App Name

First, choose a name for your app. This will be used for your local domain. For example:

- `my-chatbot`
- `fanvue-bot`
- `test-app`

**Important**: Replace `your-app-name` in all the following steps with the name you choose. Use lowercase letters, numbers, and hyphens only (no spaces).

### Step 2: Create Your OAuth Application

1. Go to the [Fanvue Developer Area](https://www.fanvue.com/developers/apps)
2. Click "Create New App" or "New OAuth Application"
3. Fill in the application details:
   - **App Name**: Give it a name like "My Chatbot"
   - **Redirect URI**: `https://your-app-name.dev:3001/callback` (replace `your-app-name` with your chosen name)
   - **Scopes**: Select these scopes:
     - `read:self` - To read your own profile
     - `read:chat` - To read chat conversations
     - `write:chat` - To send messages
4. Save your application and copy these values:
   - **Client ID** (looks like: `abc123def456...`)
   - **Client Secret** (looks like: `xyz789secret...`)

**Note**: We'll set up HTTPS in the next step, so you can come back and update the Redirect URI after generating the SSL certificate if needed.

### Step 3: Install Dependencies

Open your terminal (Command Prompt on Windows, Terminal on Mac/Linux) and navigate to this directory:

```bash
cd javascript
```

Install the required packages using pnpm:

```bash
pnpm install
```

**Important**: Always use `pnpm` instead of `npm` or `yarn` for this project.

### Step 4: Set Up HTTPS for Local Development

OAuth requires HTTPS redirect URIs, even in local development. We'll use `mkcert` to create local SSL certificates.

#### Install mkcert

**On macOS:**

```bash
brew install mkcert
```

**On Linux:**

```bash
# Ubuntu/Debian
sudo apt install libnss3-tools
# Then download mkcert from: https://github.com/FiloSottile/mkcert/releases

# Or use the install script:
curl -JLO "https://dl.filippo.io/mkcert/latest?for=linux/amd64"
chmod +x mkcert-v*-linux-amd64
sudo mv mkcert-v*-linux-amd64 /usr/local/bin/mkcert
```

**On Windows:**
Download from: https://github.com/FiloSottile/mkcert/releases

#### Generate SSL Certificates

1. Install the local CA:

   ```bash
   mkcert -install
   ```

2. Generate certificates (replace `your-app-name` with your chosen app name):

   ```bash
   mkcert your-app-name.dev
   ```

   This creates two files:

   - `your-app-name.dev.pem` (certificate)
   - `your-app-name.dev-key.pem` (private key)

#### Update Your Hosts File

Add your local domain to your hosts file:

**On macOS/Linux:**

```bash
echo "127.0.0.1 your-app-name.dev" | sudo tee -a /etc/hosts
```

**On Windows:**

1. Open Notepad as Administrator
2. Open `C:\Windows\System32\drivers\etc\hosts`
3. Add this line: `127.0.0.1 your-app-name.dev`
4. Save the file

### Step 5: Configure Environment Variables

1. Copy the example environment file:

   ```bash
   cp .env.example .env
   ```

   On Windows (Command Prompt):

   ```cmd
   copy .env.example .env
   ```

   On Windows (PowerShell):

   ```powershell
   Copy-Item .env.example .env
   ```

2. Open the `.env` file in a text editor (Notepad, TextEdit, VS Code, etc.)

3. Fill in your values (replace `your-app-name` with your chosen app name):

```bash
OAUTH_CLIENT_ID=your_actual_client_id_here
OAUTH_CLIENT_SECRET=your_actual_client_secret_here
OAUTH_REDIRECT_URI=https://your-app-name.dev:3001/callback
OAUTH_SCOPES=openid offline offline_access read:self read:chat write:chat
SESSION_SECRET=make-this-a-random-string-at-least-16-characters-long-12345
OAUTH_ISSUER_BASE_URL=https://auth.fanvue.com
API_BASE_URL=https://api.fanvue.com
API_VERSION=2025-06-26
PORT=3000
```

**Important Notes:**

- Replace `your-app-name` with your chosen app name in `OAUTH_REDIRECT_URI`
- Replace `your_actual_client_id_here` with your actual Client ID from Step 2
- Replace `your_actual_client_secret_here` with your actual Client Secret from Step 2
- For `SESSION_SECRET`, use a random string. You can generate one at: https://randomkeygen.com/ (use the "CodeIgniter Encryption Keys" option)
- **Never share your `.env` file** - it contains sensitive information!

4. Update your OAuth application Redirect URI in the Fanvue Developer area to match: `https://your-app-name.dev:3001/callback`

### Step 6: Run the Application

You'll need **two terminal windows** for this step.

#### Terminal 1: Start the Node.js Application

In your terminal (in the `javascript` directory), run:

```bash
pnpm start
```

Or:

```bash
node app.js
```

You should see output like:

```
Fanvue Chatbot running at http://localhost:3000
Press Ctrl+C to stop the server
```

**Keep this terminal window open.**

#### Terminal 2: Start the HTTPS Proxy

Open a **new terminal window**, navigate to the `javascript` directory, and run (replace `your-app-name` with your chosen app name):

```bash
npx local-ssl-proxy --source 3001 --target 3000 --cert ./your-app-name.dev.pem --key ./your-app-name.dev-key.pem
```

You should see output like:

```
Proxying https://your-app-name.dev:3001 -> http://localhost:3000
```

**Keep this terminal window open too.**

### Step 7: Access the Chatbot

1. Open your web browser
2. Go to: `https://your-app-name.dev:3001` (replace `your-app-name` with your chosen app name)
3. You may see a security warning - click "Advanced" and then "Proceed to your-app-name.dev" (this is normal for local development)
4. Click "Login with Fanvue"
5. You'll be redirected to Fanvue to authorize the application
6. After authorizing, you'll be redirected back to the chatbot
7. Start chatting!

## How It Works

1. **Authentication**: When you click "Login with Fanvue", the app redirects you to Fanvue's OAuth page
2. **Authorization**: You authorize the app to access your Fanvue account
3. **Token Exchange**: Fanvue sends back an authorization code, which the app exchanges for an access token
4. **Chat**: The app uses the access token to send messages through the Fanvue API

## Troubleshooting

### "Cannot find module" error

- Make sure you ran `pnpm install`
- Delete the `node_modules` folder and run `pnpm install` again

### "Invalid redirect URI" error

- Make sure the Redirect URI in your Fanvue OAuth app settings exactly matches: `https://your-app-name.dev:3001/callback` (replace `your-app-name` with your chosen app name)
- Check your `.env` file has the correct `OAUTH_REDIRECT_URI` with HTTPS
- Verify the domain matches exactly (including the `.dev` extension and port `3001`)

### "Invalid client" or "Unauthorized" error

- Double-check your `OAUTH_CLIENT_ID` and `OAUTH_CLIENT_SECRET` in the `.env` file
- Make sure there are no extra spaces or quotes around the values
- Ensure your OAuth app is active in the Fanvue Developer area

### Port 3000 or 3001 already in use

- Another application might be using port 3000 or 3001
- For port 3000: Change `PORT=3000` in your `.env` file to a different number (e.g., `PORT=3002`)
- For port 3001: Change the `--source` parameter in the `local-ssl-proxy` command
- If you change ports, also update `OAUTH_REDIRECT_URI` in `.env` and your Fanvue OAuth app settings

### Certificate errors in browser

- Run `mkcert -install` to install the local CA certificate
- Make sure you're accessing the app via `https://your-app-name.dev:3001` (not `http://`)
- Try clearing your browser cache and cookies

### Cannot reach app at .dev domain

- Verify the hosts file entry: `cat /etc/hosts | grep your-app-name.dev` (should show `127.0.0.1 your-app-name.dev`)
- Make sure both terminal windows are running (Node.js app and SSL proxy)
- Try accessing `https://127.0.0.1:3001` instead

### Proxy connection refused

- Ensure the Node.js app is running on port 3000 before starting the SSL proxy
- Check that both terminal windows are still running
- Verify the certificate files exist: `ls -la your-app-name.dev*.pem`

### Messages not sending

- Check that you selected the `write:chat` scope in your OAuth app settings
- Make sure your `.env` file includes `write:chat` in the `OAUTH_SCOPES`
- Check the terminal for error messages

### "EADDRINUSE" error

- Port 3000 or 3001 is already in use by another application
- Stop the other application or change the ports (update both `.env` and the proxy command)

## Security Notes

- **Never commit your `.env` file to version control** (Git, GitHub, etc.)
- The `.env` file is already in `.gitignore` to prevent accidental commits
- Keep your Client Secret secure - treat it like a password
- In production, use environment variables provided by your hosting service instead of a `.env` file
- Never expose your Client Secret in client-side code

## Webhooks

The chatbot includes a webhook endpoint at `/webhook` that can receive real-time notifications from Fanvue. According to the [Fanvue Webhooks documentation](https://api.fanvue.com/docs/webhooks/webhooks-overview), Fanvue supports 5 event types:

- **Message Received** - When a new message arrives
- **New Follower** - When someone follows a creator
- **New Subscriber** - When someone subscribes to a creator
- **Purchase Received** - When a purchase is made
- **Tip Received** - When a tip is received

### Setting Up Webhooks

1. **Deploy your application** to a publicly accessible URL (required for webhooks)
2. **Navigate to Fanvue Developer Area** → Your App → Webhooks tab
3. **Enter your webhook URL**: `https://your-domain.com/webhook`
4. **Select the events** you want to receive (e.g., "Message Received")
5. **Save and enable** the webhook

### Testing Webhooks Locally

For local development, use a tunneling tool like `ngrok`:

```bash
ngrok http 3001
```

Then use the HTTPS URL provided by ngrok in the Fanvue Webhooks UI.

The webhook endpoint automatically handles all event types and logs the received data to the console for debugging.

## Next Steps

Once you have the basic chatbot working, you can:

1. Customize the chatbot's responses in `app.js`
2. Add more features like message history
3. Deploy to a hosting service (Vercel, Railway, Heroku, etc.)
4. Add more sophisticated AI responses using OpenAI, Anthropic, or other AI services
5. Implement webhook handlers to respond to real-time events
6. Add WebSocket support for real-time messaging

## Production Deployment

When deploying to production:

1. Set environment variables in your hosting provider's dashboard
2. Update the Redirect URI in your Fanvue OAuth app to your production URL
3. Use HTTPS for your production URL (required for OAuth)
4. Set a strong `SESSION_SECRET` (use a secure random generator)
5. Consider using a session store like Redis for production

### Recommended Hosting Services

- **Vercel**: Great for Node.js apps, easy deployment
- **Railway**: Simple deployment, good for beginners
- **Heroku**: Well-established platform with good documentation
- **Render**: Free tier available, easy setup

## Getting Help

If you encounter issues:

1. Check the troubleshooting section above
2. Review the Fanvue API documentation: https://api.fanvue.com/docs
3. Make sure all your environment variables are set correctly
4. Check that your OAuth app settings match your `.env` file
5. Look at the terminal output for error messages

## File Structure

```
javascript/
├── app.js              # Main application file
├── package.json        # Node.js dependencies and scripts
├── .env.example        # Example environment variables
├── .env               # Your actual environment variables (create this)
├── .gitignore         # Git ignore file
└── README.md          # This file
```

## Additional Resources

- Fanvue API Documentation: https://api.fanvue.com/docs
- Node.js Documentation: https://nodejs.org/docs
- Express.js Documentation: https://expressjs.com/
- pnpm Documentation: https://pnpm.io/
