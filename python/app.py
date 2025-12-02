from flask import Flask, redirect, request, session, url_for, render_template_string, jsonify
import requests
from dotenv import load_dotenv
import os
import secrets
import hashlib
import base64

load_dotenv()

app = Flask(__name__)
app.secret_key = os.getenv('SESSION_SECRET', 'dev-secret-change-in-production')

OAUTH_CLIENT_ID = os.getenv('OAUTH_CLIENT_ID')
OAUTH_CLIENT_SECRET = os.getenv('OAUTH_CLIENT_SECRET')
OAUTH_REDIRECT_URI = os.getenv('OAUTH_REDIRECT_URI', 'http://localhost:5000/callback')
DEFAULT_SCOPES = 'openid offline_access offline'
USER_SCOPES = os.getenv('OAUTH_SCOPES', 'read:self read:chat write:chat')
OAUTH_SCOPES = f"{DEFAULT_SCOPES} {USER_SCOPES}".strip()
OAUTH_ISSUER_BASE_URL = os.getenv('OAUTH_ISSUER_BASE_URL', 'https://auth.fanvue.com')
API_BASE_URL = os.getenv('API_BASE_URL', 'https://api.fanvue.com')
API_VERSION = os.getenv('API_VERSION', '2025-06-26')

OAUTH_AUTH_URL = f"{OAUTH_ISSUER_BASE_URL}/oauth2/auth"
OAUTH_TOKEN_URL = f"{OAUTH_ISSUER_BASE_URL}/oauth2/token"

def base64url_encode(data):
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def generate_pkce():
    code_verifier = base64url_encode(secrets.token_bytes(32))
    code_challenge = base64url_encode(
        hashlib.sha256(code_verifier.encode('utf-8')).digest()
    )
    return code_verifier, code_challenge

HTML_TEMPLATE = """
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
    </style>
</head>
<body>
    <div class="container">
        <h1>Fanvue Chatbot</h1>
        {% if not session.get('access_token') %}
        <div class="login-prompt">
            <p>Please log in with Fanvue to use the chatbot.</p>
            <a href="/login" class="login-button">Login with Fanvue</a>
        </div>
        {% else %}
        <div id="userInfo">
            <p>Logged in as: <strong>{{ user_info.get('username', 'User') }}</strong></p>
            <p><a href="/logout">Logout</a></p>
        </div>
        <div class="chat-container" id="chatContainer">
            <div class="message bot">
                <strong>Bot:</strong> Hello! I'm your Fanvue chatbot assistant. How can I help you today?
            </div>
        </div>
        <div id="errorContainer"></div>
        <div class="input-container">
            <input type="text" id="messageInput" placeholder="Type your message..." onkeypress="handleKeyPress(event)">
            <button onclick="sendMessage()" id="sendButton">Send</button>
        </div>
        {% endif %}
    </div>

    <script>
        function handleKeyPress(event) {
            if (event.key === 'Enter') {
                sendMessage();
            }
        }

        async function sendMessage() {
            const input = document.getElementById('messageInput');
            const message = input.value.trim();
            if (!message) return;

            const chatContainer = document.getElementById('chatContainer');
            const errorContainer = document.getElementById('errorContainer');
            const sendButton = document.getElementById('sendButton');

            const userMessage = document.createElement('div');
            userMessage.className = 'message user';
            userMessage.innerHTML = '<strong>You:</strong> ' + message;
            chatContainer.appendChild(userMessage);

            input.value = '';
            sendButton.disabled = true;

            const loadingMessage = document.createElement('div');
            loadingMessage.className = 'message bot loading';
            loadingMessage.innerHTML = '<strong>Bot:</strong> Thinking...';
            chatContainer.appendChild(loadingMessage);
            chatContainer.scrollTop = chatContainer.scrollHeight;

            try {
                const response = await fetch('/api/send-message', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ message: message })
                });

                const data = await response.json();
                loadingMessage.remove();

                if (response.ok) {
                    const botMessage = document.createElement('div');
                    botMessage.className = 'message bot';
                    botMessage.innerHTML = '<strong>Bot:</strong> ' + (data.response || 'Message sent successfully!');
                    chatContainer.appendChild(botMessage);
                    errorContainer.innerHTML = '';
                } else {
                    errorContainer.innerHTML = '<div class="error">Error: ' + (data.error || 'Failed to send message') + '</div>';
                }
            } catch (error) {
                loadingMessage.remove();
                errorContainer.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
            } finally {
                sendButton.disabled = false;
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
        }
    </script>
</body>
</html>
"""

@app.route('/')
def home():
    if 'access_token' not in session:
        return render_template_string(HTML_TEMPLATE)
    
    try:
        headers = {
            'Authorization': f"Bearer {session['access_token']}",
            'X-Fanvue-API-Version': API_VERSION
        }
        profile_response = requests.get(f"{API_BASE_URL}/users/me", headers=headers)
        if profile_response.status_code == 200:
            user_info = profile_response.json()
        else:
            user_info = {}
    except:
        user_info = {}
    
    return render_template_string(HTML_TEMPLATE, user_info=user_info)

@app.route('/login')
def login():
    code_verifier, code_challenge = generate_pkce()
    state = secrets.token_hex(32)
    
    session['code_verifier'] = code_verifier
    session['state'] = state
    
    from urllib.parse import urlencode
    
    params = {
        'client_id': OAUTH_CLIENT_ID,
        'redirect_uri': OAUTH_REDIRECT_URI,
        'response_type': 'code',
        'scope': OAUTH_SCOPES,
        'state': state,
        'code_challenge': code_challenge,
        'code_challenge_method': 'S256'
    }
    
    auth_url = f"{OAUTH_AUTH_URL}?{urlencode(params)}"
    return redirect(auth_url)

@app.route('/callback')
def callback():
    code = request.args.get('code')
    state = request.args.get('state')
    
    if not code:
        return redirect(url_for('home'))
    
    if state != session.get('state'):
        return "Error: Invalid state parameter", 400
    
    code_verifier = session.get('code_verifier')
    if not code_verifier:
        return "Error: Missing code verifier. Please try logging in again.", 400
    
    try:
        import base64 as b64
        
        auth_header = b64.b64encode(
            f"{OAUTH_CLIENT_ID}:{OAUTH_CLIENT_SECRET}".encode()
        ).decode('utf-8')
        
        token_response = requests.post(
            OAUTH_TOKEN_URL,
            data={
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': OAUTH_REDIRECT_URI,
                'client_id': OAUTH_CLIENT_ID,
                'code_verifier': code_verifier
            },
            headers={
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': f'Basic {auth_header}'
            }
        )
        
        if token_response.status_code == 200:
            token_json = token_response.json()
            session['access_token'] = token_json['access_token']
            if 'refresh_token' in token_json:
                session['refresh_token'] = token_json['refresh_token']
            session.pop('code_verifier', None)
            session.pop('state', None)
            return redirect(url_for('home'))
        else:
            error_text = token_response.text
            return f"Error: Failed to get access token. Status: {token_response.status_code}, Response: {error_text}", 400
    except Exception as e:
        return f"Error: {str(e)}", 500

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('home'))

@app.route('/webhook', methods=['POST'])
def webhook():
    try:
        data = request.get_json()
        
        if not data:
            return jsonify({'error': 'Invalid payload'}), 400
        
        if 'message' in data and 'sender' in data:
            event_type = 'message.received'
            message_data = data.get('message', {})
            message_uuid = data.get('messageUuid') or message_data.get('uuid')
            message_text = message_data.get('text', '')
            sender = data.get('sender', {})
            sender_uuid = sender.get('uuid')
            sender_handle = sender.get('handle', '')
            sender_display_name = sender.get('displayName', '')
            recipient_uuid = data.get('recipientUuid')
            timestamp = data.get('timestamp')
            has_media = message_data.get('hasMedia', False)
            
            print(f"Message Received webhook:")
            print(f"  Message UUID: {message_uuid}")
            print(f"  From: {sender_display_name} (@{sender_handle})")
            print(f"  To: {recipient_uuid}")
            print(f"  Text: {message_text}")
            print(f"  Has Media: {has_media}")
            print(f"  Timestamp: {timestamp}")
            
        elif 'follower' in data or 'followerUuid' in data:
            event_type = 'follower.new'
            follower_data = data.get('follower', {})
            follower_uuid = data.get('followerUuid') or follower_data.get('uuid')
            creator_uuid = data.get('creatorUuid') or data.get('recipientUuid')
            
            print(f"New Follower webhook:")
            print(f"  Follower UUID: {follower_uuid}")
            print(f"  Creator UUID: {creator_uuid}")
            
        elif 'subscriber' in data or 'subscriberUuid' in data:
            event_type = 'subscriber.new'
            subscriber_data = data.get('subscriber', {})
            subscriber_uuid = data.get('subscriberUuid') or subscriber_data.get('uuid')
            creator_uuid = data.get('creatorUuid') or data.get('recipientUuid')
            
            print(f"New Subscriber webhook:")
            print(f"  Subscriber UUID: {subscriber_uuid}")
            print(f"  Creator UUID: {creator_uuid}")
            
        elif 'purchase' in data or 'purchaseUuid' in data:
            event_type = 'purchase.received'
            purchase_data = data.get('purchase', {})
            purchase_uuid = data.get('purchaseUuid') or purchase_data.get('uuid')
            creator_uuid = data.get('creatorUuid') or data.get('recipientUuid')
            
            print(f"Purchase Received webhook:")
            print(f"  Purchase UUID: {purchase_uuid}")
            print(f"  Creator UUID: {creator_uuid}")
            
        elif 'tip' in data or 'tipUuid' in data:
            event_type = 'tip.received'
            tip_data = data.get('tip', {})
            tip_uuid = data.get('tipUuid') or tip_data.get('uuid')
            creator_uuid = data.get('creatorUuid') or data.get('recipientUuid')
            amount = tip_data.get('amount') or data.get('amount')
            
            print(f"Tip Received webhook:")
            print(f"  Tip UUID: {tip_uuid}")
            print(f"  Creator UUID: {creator_uuid}")
            print(f"  Amount: {amount}")
            
        else:
            event_type = 'unknown'
            print(f"Unknown webhook event type. Data: {data}")
        
        return jsonify({'status': 'received'}), 200
        
    except Exception as e:
        print(f"Webhook processing error: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

@app.route('/api/refresh-token', methods=['POST'])
def refresh_token():
    refresh_token = session.get('refresh_token')
    if not refresh_token:
        return jsonify({'error': 'No refresh token available'}), 401
    
    try:
        import base64 as b64
        
        auth_header = b64.b64encode(
            f"{OAUTH_CLIENT_ID}:{OAUTH_CLIENT_SECRET}".encode()
        ).decode('utf-8')
        
        token_response = requests.post(
            OAUTH_TOKEN_URL,
            data={
                'grant_type': 'refresh_token',
                'refresh_token': refresh_token,
                'client_id': OAUTH_CLIENT_ID
            },
            headers={
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': f'Basic {auth_header}'
            }
        )
        
        if token_response.status_code == 200:
            token_json = token_response.json()
            session['access_token'] = token_json['access_token']
            if 'refresh_token' in token_json:
                session['refresh_token'] = token_json['refresh_token']
            return jsonify({
                'access_token': token_json['access_token'],
                'expires_in': token_json.get('expires_in'),
                'token_type': token_json.get('token_type', 'Bearer')
            }), 200
        else:
            error_text = token_response.text
            return jsonify({
                'error': f'Failed to refresh token. Status: {token_response.status_code}',
                'details': error_text
            }), token_response.status_code
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def refresh_access_token_if_needed():
    if 'refresh_token' not in session:
        return False
    
    try:
        import base64 as b64
        
        auth_header = b64.b64encode(
            f"{OAUTH_CLIENT_ID}:{OAUTH_CLIENT_SECRET}".encode()
        ).decode('utf-8')
        
        token_response = requests.post(
            OAUTH_TOKEN_URL,
            data={
                'grant_type': 'refresh_token',
                'refresh_token': session['refresh_token'],
                'client_id': OAUTH_CLIENT_ID
            },
            headers={
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': f'Basic {auth_header}'
            }
        )
        
        if token_response.status_code == 200:
            token_json = token_response.json()
            session['access_token'] = token_json['access_token']
            if 'refresh_token' in token_json:
                session['refresh_token'] = token_json['refresh_token']
            return True
    except:
        pass
    
    return False

def handle_rate_limit(response):
    if response.status_code == 429:
        retry_after = response.headers.get('Retry-After', '60')
        rate_limit_limit = response.headers.get('X-RateLimit-Limit', '100')
        rate_limit_remaining = response.headers.get('X-RateLimit-Remaining', '0')
        rate_limit_reset = response.headers.get('X-RateLimit-Reset', '')
        
        try:
            retry_seconds = int(retry_after)
        except (ValueError, TypeError):
            retry_seconds = 60
        
        return {
            'error': 'Rate limit exceeded',
            'message': f'Too many requests. Please wait {retry_seconds} seconds before trying again.',
            'retry_after': retry_seconds,
            'rate_limit_limit': rate_limit_limit,
            'rate_limit_remaining': rate_limit_remaining,
            'rate_limit_reset': rate_limit_reset
        }
    return None

@app.route('/api/send-message', methods=['POST'])
def send_message():
    if 'access_token' not in session:
        return jsonify({'error': 'Not authenticated'}), 401
    
    data = request.get_json()
    message = data.get('message', '')
    
    if not message:
        return jsonify({'error': 'Message is required'}), 400
    
    try:
        headers = {
            'Authorization': f"Bearer {session['access_token']}",
            'X-Fanvue-API-Version': API_VERSION,
            'Content-Type': 'application/json'
        }
        
        user_response = requests.get(f"{API_BASE_URL}/users/me", headers=headers)
        
        rate_limit_error = handle_rate_limit(user_response)
        if rate_limit_error:
            return jsonify(rate_limit_error), 429
        
        if user_response.status_code == 401:
            if refresh_access_token_if_needed():
                headers['Authorization'] = f"Bearer {session['access_token']}"
                user_response = requests.get(f"{API_BASE_URL}/users/me", headers=headers)
                rate_limit_error = handle_rate_limit(user_response)
                if rate_limit_error:
                    return jsonify(rate_limit_error), 429
            else:
                return jsonify({'error': 'Failed to get user info. Please log in again.'}), 401
        
        if user_response.status_code != 200:
            return jsonify({'error': 'Failed to get user info'}), user_response.status_code
        
        user_info = user_response.json()
        user_uuid = user_info.get('uuid')
        
        if not user_uuid:
            return jsonify({'error': 'User UUID not found'}), 400
        
        conversations_response = requests.get(
            f"{API_BASE_URL}/users/{user_uuid}/conversations",
            headers=headers
        )
        
        rate_limit_error = handle_rate_limit(conversations_response)
        if rate_limit_error:
            return jsonify(rate_limit_error), 429
        
        conversation_uuid = None
        if conversations_response.status_code == 200:
            conversations = conversations_response.json()
            if isinstance(conversations, dict) and 'data' in conversations:
                conversations_list = conversations['data']
            elif isinstance(conversations, list):
                conversations_list = conversations
            else:
                conversations_list = []
            
            if conversations_list:
                conversation_uuid = conversations_list[0].get('uuid')
        
        if not conversation_uuid:
            create_response = requests.post(
                f"{API_BASE_URL}/users/{user_uuid}/conversations",
                headers=headers,
                json={}
            )
            
            rate_limit_error = handle_rate_limit(create_response)
            if rate_limit_error:
                return jsonify(rate_limit_error), 429
            
            if create_response.status_code in [200, 201]:
                conversation_data = create_response.json()
                conversation_uuid = conversation_data.get('uuid')
        
        if not conversation_uuid:
            return jsonify({
                'response': f'Your message: "{message}" was received. This is a demo chatbot - in a real implementation, this would send your message to the conversation.'
            }), 200
        
        send_response = requests.post(
            f"{API_BASE_URL}/conversations/{conversation_uuid}/messages",
            headers=headers,
            json={'text': message}
        )
        
        rate_limit_error = handle_rate_limit(send_response)
        if rate_limit_error:
            return jsonify(rate_limit_error), 429
        
        if send_response.status_code in [200, 201]:
            return jsonify({
                'response': f'Message sent successfully! Your message: "{message}"'
            }), 200
        else:
            return jsonify({
                'response': f'Your message: "{message}" was received. API response: {send_response.status_code}'
            }), 200
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=5000)

