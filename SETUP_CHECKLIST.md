# Setup Checklist

Use this checklist to track your progress. For detailed instructions, see the [main README](./README.md) and your chosen example's guide:

- [Python Setup Guide](./python/README.md)
- [JavaScript Setup Guide](./javascript/README.md)

## Prerequisites

- [ ] Python 3.8+ OR Node.js 18+ installed
- [ ] pnpm installed (for JavaScript example)
- [ ] Fanvue API access requested
- [ ] Access to [Fanvue Developer Area](https://www.fanvue.com/developers/apps)

## Setup Steps

- [ ] **Chose app name** (e.g., `my-chatbot`) - lowercase, numbers, hyphens only
- [ ] **Set up HTTPS** - Installed mkcert, generated certificates, updated hosts file
- [ ] **Created OAuth app** - Got Client ID and Secret, set HTTPS Redirect URI
- [ ] **Chose example** - Python or JavaScript
- [ ] **Configured `.env`** - Copied `.env.example`, filled in credentials
- [ ] **Installed dependencies** - `pip install -r requirements.txt` or `pnpm install`
- [ ] **Started app** - Terminal 1: app running, Terminal 2: SSL proxy running
- [ ] **Tested login** - Accessed HTTPS URL, logged in with Fanvue, sent test message

## Troubleshooting Checklist

- [ ] Redirect URI matches exactly (HTTPS, domain, port)
- [ ] Both terminals running (app + SSL proxy)
- [ ] Certificate files exist in project directory
- [ ] Hosts file entry correct
- [ ] Environment variables set correctly
- [ ] Checked terminal for errors

## Success! 🎉

Your chatbot is working! See the [main README](./README.md) for next steps.
