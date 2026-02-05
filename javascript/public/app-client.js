// Fanvue Chatbot - Client-side JavaScript

// Global variables
    let myUserUuid = null;
    let currentConversationUuid = null;
    let chatMediaCache = {};
    let currentUserProfile = null;
    let creatorProfile = null;
    let currentSubscriberMemory = null;
    let systemPrompt = '';
    let autoRefreshInterval = null;
    let pendingAIReply = null;
    let aiMode = 'manual';
    let fastResponseMode = true;

    // Navigation function for sidebar
    function showChatView() {
        // Close any open panels
        const profileSidebar = document.getElementById('profileSidebar');
        const creatorSidebar = document.getElementById('creatorSidebar');
        const analyticsDashboard = document.getElementById('analyticsDashboard');
        const mediaControlPanel = document.getElementById('mediaControlPanel');

        if (profileSidebar) profileSidebar.classList.remove('open');
        if (creatorSidebar) creatorSidebar.classList.remove('open');
        if (analyticsDashboard) analyticsDashboard.classList.remove('open');
        if (mediaControlPanel) mediaControlPanel.style.display = 'none';

        // Update active nav item
        document.querySelectorAll('.sidebar-nav .nav-item').forEach(function(item) {
            item.classList.remove('active');
        });
        const navChat = document.getElementById('navChat');
        if (navChat) navChat.classList.add('active');
    }

    // Update notification badge in sidebar
    function updateNavNotificationBadge(count) {
        const badge = document.getElementById('navNotificationBadge');
        const navItem = document.getElementById('navNotifications');
        if (badge && navItem) {
            if (count > 0) {
                badge.textContent = count;
                badge.style.display = 'block';
                navItem.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }
    }

    function handleKeyPress(event) {
        if (event.key === 'Enter') {
            sendMessage();
        }
    }

    async function loadConversations() {
        const select = document.getElementById('conversationSelect');
        const refreshButton = document.getElementById('refreshButton');
        const errorContainer = document.getElementById('errorContainer');

        refreshButton.disabled = true;
        select.disabled = true;
        select.innerHTML = '<option value="">Loading conversations...</option>';

        try {
            const response = await fetch('/api/conversations');
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to load conversations');
            }

            const conversations = data.conversations || [];
            if (conversations.length === 0) {
                select.innerHTML = '<option value="">No conversations found</option>';
                errorContainer.innerHTML = '';
                return;
            }

            select.innerHTML = '<option value="">Select a conversation...</option>';
            conversations.forEach(function(conversation) {
                var option = document.createElement('option');
                option.value = conversation.uuid;
                option.textContent = conversation.label || conversation.uuid;
                select.appendChild(option);
            });
            errorContainer.innerHTML = '';
        } catch (error) {
            select.innerHTML = '<option value="">Unable to load conversations</option>';
            errorContainer.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
        } finally {
            select.disabled = false;
            refreshButton.disabled = false;
        }
    }

    async function loadMessages(userUuid) {
        const chatContainer = document.getElementById('chatContainer');
        const errorContainer = document.getElementById('errorContainer');

        currentConversationUuid = userUuid;
        loadLastRepliedId(); // Load persisted last replied ID for this conversation
        loadUserProfile(); // Load user profile if exists
        loadSubscriberMemory(); // Load subscriber memory if exists
        loadTipStats(); // Load tip tracking stats for this conversation
        loadPPVStats(); // Load PPV tracking stats for this conversation
        loadMonetizationSummary(); // Load monetization summary for profile sidebar

        // Update media control panel if it's open
        const mediaPanel = document.getElementById('mediaControlPanel');
        if (mediaPanel && mediaPanel.style.display === 'block') {
            loadMediaControlQueue(userUuid);
        }

        const wasScrolledToBottom = chatContainer.scrollHeight - chatContainer.scrollTop <= chatContainer.clientHeight + 50;
        const hadMessages = chatContainer.children.length > 0;

        if (!hadMessages) {
            chatContainer.innerHTML = '<div class="message bot loading"><strong>Loading messages...</strong></div>';
        }

        try {
            // Fetch both messages and media in parallel
            const [messagesResponse, mediaResponse] = await Promise.all([
                fetch('/api/messages/' + userUuid),
                fetch('/api/chat-media/' + userUuid)
            ]);

            const messagesData = await messagesResponse.json();
            const mediaData = await mediaResponse.json();

            if (!messagesResponse.ok) {
                throw new Error(messagesData.error || 'Failed to load messages');
            }

            const messages = messagesData.messages || [];
            const mediaItems = mediaData.media || [];

            // Update media cache
            chatMediaCache = {};
            mediaItems.forEach(function(item) {
                var msgId = item.messageUuid || item.message_uuid;
                if (msgId) {
                    if (!chatMediaCache[msgId]) {
                        chatMediaCache[msgId] = [];
                    }
                    chatMediaCache[msgId].push(item);
                }
            });
            console.log('[Load Messages] Media cache populated with', Object.keys(chatMediaCache).length, 'message entries');

            // Find media-only messages (media whose messageUuid isn't in messages list)
            const messageUuids = new Set(messages.map(m => m.uuid));
            const mediaOnlyMessages = [];

            mediaItems.forEach(function(media) {
                const msgUuid = media.messageUuid || media.message_uuid;
                if (msgUuid && !messageUuids.has(msgUuid)) {
                    // Check if we already added this message
                    if (!mediaOnlyMessages.find(m => m.uuid === msgUuid)) {
                        mediaOnlyMessages.push({
                            uuid: msgUuid,
                            text: '', // No text
                            sentAt: media.sentAt || media.created_at,
                            sender: { uuid: media.ownerUuid },
                            hasMedia: true,
                            mediaType: media.mediaType,
                            isMediaOnly: true
                        });
                        console.log('[Load Messages] Found media-only message:', msgUuid);
                    }
                }
            });

            // Merge and sort all messages by date (newest first for API, but we'll reverse for display)
            const allMessages = [...messages, ...mediaOnlyMessages].sort((a, b) => {
                return new Date(b.sentAt) - new Date(a.sentAt);
            });

            allMessagesCache = allMessages; // Cache for filtering

            chatContainer.innerHTML = '';

            if (allMessages.length === 0) {
                chatContainer.innerHTML = '<div class="message bot"><strong>No messages yet.</strong> Start the conversation by sending a message below!</div>';
                lastMessageCount = 0;
                return;
            }

            // Only update lastMessageCount if AI is in manual mode (to prevent interference with AI detection)
            // When AI is enabled (assisted or full), checkForNewMessagesAndReply handles the count
            if (aiMode === 'manual') {
                lastMessageCount = allMessages.length;
            }

            renderMessages(allMessages);

            if (wasScrolledToBottom || !hadMessages) {
                chatContainer.scrollTop = chatContainer.scrollHeight;
            }
            errorContainer.innerHTML = '';
        } catch (error) {
            if (!hadMessages) {
                chatContainer.innerHTML = '<div class="message bot error"><strong>Error loading messages:</strong> ' + error.message + '</div>';
            }
            errorContainer.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
        }
    }

    function renderMessages(messages) {
        const chatContainer = document.getElementById('chatContainer');
        chatContainer.innerHTML = '';

        // Log first message to see its structure
        if (messages.length > 0) {
            console.log('[Render] Sample message structure:', JSON.stringify(messages[0], null, 2));
        }

        messages.slice().reverse().forEach(function(msg) {
            var messageDiv = document.createElement('div');
            var isSentByYou = msg.sender && msg.sender.uuid === myUserUuid;
            messageDiv.className = isSentByYou ? 'message user' : 'message bot';

            var senderName = isSentByYou ? 'You' : (msg.sender && (msg.sender.username || msg.sender.handle) || 'Subscriber');
            var messageText = msg.text || '';
            var timestamp = msg.sentAt ? new Date(msg.sentAt).toLocaleString() : '';
            var msgUuid = msg.uuid || msg.id;

            // Build message HTML
            var html = '<strong>' + senderName + ':</strong> ';

            if (messageText) {
                html += messageText;
            }

            // Check for media attached to this message
            var mediaItems = chatMediaCache[msgUuid] || [];

            // Debug: log if message has media flag but no items found
            if (msg.hasMedia && mediaItems.length === 0) {
                console.log('[Render] Message has media but not found in cache. msgUuid:', msgUuid, 'hasMedia:', msg.hasMedia, 'msg keys:', Object.keys(msg));
            }

            // Also check if message itself has media info (from API)
            if (msg.media && msg.media.length > 0) {
                msg.media.forEach(function(m) {
                    mediaItems.push(m);
                });
            }

            // Check hasMedia flag
            if (msg.hasMedia && mediaItems.length === 0) {
                html += '<div class="media-placeholder">[Media attached - loading...]</div>';
            }

            // Render media items
            if (mediaItems.length > 0) {
                html += '<div class="message-media-container">';
                mediaItems.forEach(function(media) {
                    // Extract URL from variants array (Fanvue structure)
                    var mainUrl = null;
                    var thumbnailUrl = null;

                    if (media.variants && media.variants.length > 0) {
                        // Find main variant and thumbnail
                        media.variants.forEach(function(v) {
                            if (v.variantType === 'main' && v.url) {
                                mainUrl = v.url;
                            }
                            if ((v.variantType === 'thumbnail' || v.variantType === 'thumbnail_gallery') && v.url) {
                                thumbnailUrl = v.url;
                            }
                        });
                        // Fallback to first variant if no main found
                        if (!mainUrl && media.variants[0].url) {
                            mainUrl = media.variants[0].url;
                        }
                    }

                    // Fallback to direct URL properties
                    var mediaUrl = mainUrl || media.url || media.signedUrl || media.src;
                    var thumbUrl = thumbnailUrl || mediaUrl;
                    var mediaType = media.type || media.mediaType || media.mimeType || '';
                    var isVideo = mediaType.includes('video');
                    var isPaid = media.isPaid || media.locked || media.price > 0;

                    if (mediaUrl) {
                        if (isVideo) {
                            // For videos, show thumbnail with play button overlay
                            html += '<div class="video-container" style="position:relative;display:inline-block;">';
                            if (thumbUrl) {
                                html += '<img class="chat-media video-thumb" src="' + thumbUrl + '" alt="Video thumbnail" data-video="' + mediaUrl + '" onclick="playVideo(this)" style="cursor:pointer;" />';
                                html += '<div class="play-overlay" onclick="playVideo(this.previousElementSibling)" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:60px;height:60px;background:rgba(0,0,0,0.7);border-radius:50%;display:flex;align-items:center;justify-content:center;cursor:pointer;"><span style="color:white;font-size:24px;margin-left:4px;">&#9658;</span></div>';
                            } else {
                                html += '<video class="chat-media" controls src="' + mediaUrl + '" style="max-width:300px;max-height:300px;"></video>';
                            }
                            html += '</div>';
                        } else {
                            html += '<img class="chat-media" src="' + mediaUrl + '" alt="Media" data-url="' + mediaUrl + '" onclick="window.open(this.dataset.url, &quot;_blank&quot;)" />';
                        }
                    } else if (isPaid) {
                        html += '<div class="media-placeholder ppv">[PPV Content - $' + (media.price || '?') + ']</div>';
                    } else {
                        html += '<div class="media-placeholder">[Media - no URL]</div>';
                    }
                });
                html += '</div>';
            } else if (!messageText && msg.hasMedia) {
                // No text and has media flag but no media loaded
                html += '<span class="media-indicator">[Media message]</span>';
            } else if (!messageText) {
                html += '<span class="empty-message">[Empty message]</span>';
            }

            // Add timestamp
            if (timestamp) {
                html += '<br><small style="color: #666;">' + timestamp + '</small>';
            }

            messageDiv.innerHTML = html;
            chatContainer.appendChild(messageDiv);
        });
    }

    function playVideo(imgElement) {
        var videoUrl = imgElement.dataset.video;
        if (!videoUrl) return;

        // Create a modal to play the video
        var modal = document.createElement('div');
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:10000;';
        modal.onclick = function(e) {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        };

        var video = document.createElement('video');
        video.src = videoUrl;
        video.controls = true;
        video.autoplay = true;
        video.style.cssText = 'max-width:90%;max-height:90%;';

        var closeBtn = document.createElement('button');
        closeBtn.innerHTML = '&times;';
        closeBtn.style.cssText = 'position:absolute;top:20px;right:30px;font-size:40px;color:white;background:none;border:none;cursor:pointer;';
        closeBtn.onclick = function() {
            document.body.removeChild(modal);
        };

        modal.appendChild(video);
        modal.appendChild(closeBtn);
        document.body.appendChild(modal);
    }

    function filterMessages() {
        const searchTerm = document.getElementById('messageSearch').value.toLowerCase();

        if (!searchTerm) {
            renderMessages(allMessagesCache);
            return;
        }

        var filtered = allMessagesCache.filter(function(msg) {
            var messageText = (msg.text || '').toLowerCase();
            var senderName = (msg.sender && (msg.sender.username || msg.sender.handle) || '').toLowerCase();
            return messageText.includes(searchTerm) || senderName.includes(searchTerm);
        });

        renderMessages(filtered);

        if (filtered.length === 0) {
            const chatContainer = document.getElementById('chatContainer');
            chatContainer.innerHTML = '<div class="message bot"><strong>No messages found</strong> matching "' + searchTerm + '"</div>';
        }
    }

    async function sendMessage() {
        const input = document.getElementById('messageInput');
        const message = input.value.trim();
        if (!message) return;

        const errorContainer = document.getElementById('errorContainer');
        const sendButton = document.getElementById('sendButton');
        const conversationSelect = document.getElementById('conversationSelect');
        const conversationUuid = conversationSelect.value;

        if (!conversationUuid) {
            errorContainer.innerHTML = '<div class="error">Please select a conversation first.</div>';
            return;
        }

        input.value = '';
        sendButton.disabled = true;

        try {
            const response = await fetch('/api/send-message', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ message: message, conversationUuid: conversationUuid })
            });

            const data = await response.json();

            if (response.ok) {
                errorContainer.innerHTML = '';
                await loadMessages(conversationUuid);
            } else {
                errorContainer.innerHTML = '<div class="error">Error: ' + (data.error || 'Failed to send message') + '</div>';
            }
        } catch (error) {
            errorContainer.innerHTML = '<div class="error">Error: ' + error.message + '</div>';
        } finally {
            sendButton.disabled = false;
        }
    }

    // Variable moved to top
    // Variable moved to top
    // Variable moved to top
    // aiMode moved to top
    // Variable moved to top
    let lastMessageCount = 0;
    let allMessagesCache = []; // Store all messages for filtering
    // Variable moved to top
    // fastResponseMode moved to top
    // Variable moved to top
    let pendingReplyData = null; // Store the generated reply data for preview/edit
    let pendingReplyContext = null; // Store context needed for sending
    let autoReplyCancelled = false; // Track if auto-reply was cancelled
    let delayCountdownInterval = null;
    let lastSuggestedMessageId = null; // Track which message we last suggested for

    async function getMyUserUuid() {
        if (myUserUuid) return myUserUuid;
        try {
            const response = await fetch('/api/profile');
            const data = await response.json();
            if (response.ok && data.profile) {
                myUserUuid = data.profile.uuid;
            }
            return myUserUuid;
        } catch (error) {
            console.error('Failed to get user UUID:', error);
            return null;
        }
    }

    async function loadChatMedia(chatId) {
        try {
            var response = await fetch('/api/chat-media/' + chatId);
            var data = await response.json();
            if (response.ok && data.media) {
                // Log first item to see the structure
                if (data.media.length > 0) {
                    console.log('[Chat Media] Sample media item:', JSON.stringify(data.media[0], null, 2));
                }
                // Index media by message UUID for quick lookup
                chatMediaCache = {};
                data.media.forEach(function(item) {
                    var msgId = item.messageUuid || item.message_uuid || item.messageId || item.chatMessageUuid;
                    console.log('[Chat Media] Item keys:', Object.keys(item), 'msgId:', msgId);
                    if (msgId) {
                        if (!chatMediaCache[msgId]) {
                            chatMediaCache[msgId] = [];
                        }
                        chatMediaCache[msgId].push(item);
                    } else {
                        // If no message ID, store under a special key
                        if (!chatMediaCache['_unlinked']) {
                            chatMediaCache['_unlinked'] = [];
                        }
                        chatMediaCache['_unlinked'].push(item);
                    }
                });
                console.log('[Chat Media] Loaded', data.media.length, 'media items, indexed by', Object.keys(chatMediaCache).length, 'messages');
                console.log('[Chat Media] Cache keys:', Object.keys(chatMediaCache));
                return data.media;
            }
            return [];
        } catch (error) {
            console.error('[Chat Media] Failed to load:', error);
            return [];
        }
    }

    async function loadAISettings() {
        try {
            const response = await fetch('/api/ai-settings');
            const data = await response.json();
            if (response.ok) {
                systemPrompt = data.systemPrompt;
                aiMode = data.aiMode || 'manual';
                fastResponseMode = data.fastResponseMode !== undefined ? data.fastResponseMode : true;

                document.getElementById('systemPromptInput').value = systemPrompt;

                // Set AI mode dropdown
                document.getElementById('aiModeSelect').value = aiMode;
                updateAIModeUI(aiMode);

                document.getElementById('fastModeToggle').checked = fastResponseMode;
                document.getElementById('fastModeLabel').textContent = fastResponseMode ? 'Fast Mode: ON' : 'Natural Delay: ON';

                // Load advanced settings
                const maxReplyTokens = data.maxReplyTokens || 150;
                const maxProfileTokens = data.maxProfileTokens || 500;
                const replyTemperature = data.replyTemperature !== undefined ? data.replyTemperature : 0.9;
                const aiModel = data.aiModel || 'gpt-4o';
                const profileModel = data.profileModel || 'gpt-4o';

                document.getElementById('maxReplyTokens').value = maxReplyTokens;
                document.getElementById('replyTokensDisplay').textContent = maxReplyTokens;
                updateReplyWordsDisplay(maxReplyTokens);

                document.getElementById('maxProfileTokens').value = maxProfileTokens;
                document.getElementById('profileTokensDisplay').textContent = maxProfileTokens;

                document.getElementById('replyTemperature').value = replyTemperature;
                document.getElementById('temperatureDisplay').textContent = replyTemperature.toFixed(1);

                document.getElementById('aiModel').value = aiModel;
                document.getElementById('profileModel').value = profileModel;

                // Load vault settings
                await loadVaultSettings();
            }
        } catch (error) {
            console.error('Failed to load AI settings:', error);
        }
    }

    async function loadVaultSettings() {
        try {
            const response = await fetch('/api/vault-settings');
            const data = await response.json();
            if (response.ok) {
                const vaultCheckbox = document.getElementById('vaultAwarenessEnabled');
                if (vaultCheckbox) vaultCheckbox.checked = data.vaultAwarenessEnabled !== false;

                const tipCheckbox = document.getElementById('tipTrackingEnabled');
                if (tipCheckbox) tipCheckbox.checked = data.tipTrackingEnabled !== false;

                const vaultStats = document.getElementById('vaultStats');
                if (vaultStats && data.cachedMediaCount !== undefined) {
                    vaultStats.style.display = 'block';
                    document.getElementById('vaultMediaCount').textContent = data.cachedMediaCount + ' items';
                    document.getElementById('vaultLastRefresh').textContent = data.lastMediaCacheRefresh
                        ? new Date(data.lastMediaCacheRefresh).toLocaleTimeString()
                        : 'Never';
                }

                // Load folder settings
                const sfwFolderInput = document.getElementById('sfwFolderPrefix');
                const ppvFolderInput = document.getElementById('ppvFolderPrefix');
                if (sfwFolderInput) sfwFolderInput.value = data.sfwFolderPrefix || '';
                if (ppvFolderInput) ppvFolderInput.value = data.ppvFolderPrefix || '';
            }
        } catch (error) {
            console.error('Failed to load vault settings:', error);
        }
    }

    async function toggleVaultAwareness() {
        const checkbox = document.getElementById('vaultAwarenessEnabled');
        const enabled = checkbox.checked;

        try {
            await fetch('/api/vault-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ vaultAwarenessEnabled: enabled })
            });
            console.log('[Vault] Awareness:', enabled ? 'ENABLED' : 'DISABLED');
        } catch (error) {
            console.error('Failed to update vault setting:', error);
        }
    }

    async function saveFolderSettings() {
        const sfwFolder = document.getElementById('sfwFolderPrefix').value.trim();
        const ppvFolder = document.getElementById('ppvFolderPrefix').value.trim();
        const btn = document.getElementById('saveFolderSettingsBtn');

        btn.disabled = true;
        btn.textContent = 'Saving...';

        try {
            const response = await fetch('/api/vault-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sfwFolderPrefix: sfwFolder,
                    ppvFolderPrefix: ppvFolder
                })
            });

            if (response.ok) {
                btn.textContent = 'Saved!';
                console.log('[Vault] Folder settings saved:', { sfwFolder, ppvFolder });
                setTimeout(() => {
                    btn.textContent = 'Save Folder Settings';
                    btn.disabled = false;
                }, 2000);
            } else {
                throw new Error('Failed to save');
            }
        } catch (error) {
            console.error('Failed to save folder settings:', error);
            btn.textContent = 'Error!';
            setTimeout(() => {
                btn.textContent = 'Save Folder Settings';
                btn.disabled = false;
            }, 2000);
        }
    }

    async function refreshVaultLibrary() {
        const btn = document.getElementById('refreshVaultBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'Refreshing...';
        }

        try {
            const response = await fetch('/api/media-library?refresh=true');
            const data = await response.json();

            if (response.ok) {
                document.getElementById('vaultMediaCount').textContent = data.count + ' items';
                document.getElementById('vaultLastRefresh').textContent = data.lastRefresh
                    ? new Date(data.lastRefresh).toLocaleTimeString()
                    : 'Just now';
                console.log('[Vault] Refreshed media library:', data.count, 'items');
            }
        } catch (error) {
            console.error('Failed to refresh vault:', error);
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Refresh Media Library';
            }
        }
    }

    async function toggleTipTracking() {
        const checkbox = document.getElementById('tipTrackingEnabled');
        const enabled = checkbox.checked;

        try {
            await fetch('/api/vault-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tipTrackingEnabled: enabled })
            });
            console.log('[Tips] Tracking:', enabled ? 'ENABLED' : 'DISABLED');
        } catch (error) {
            console.error('Failed to update tip tracking setting:', error);
        }
    }

    async function loadTipStats() {
        if (!currentConversationUuid) {
            document.getElementById('tipStats').style.display = 'none';
            return;
        }

        try {
            const response = await fetch('/api/conversation/' + currentConversationUuid + '/tips');
            const data = await response.json();

            if (response.ok) {
                const tipStats = document.getElementById('tipStats');
                tipStats.style.display = 'block';

                document.getElementById('totalTipsReceived').textContent = '$' + (data.total_tips_received || 0).toFixed(2);

                if (data.days_since_request === null) {
                    document.getElementById('daysSinceTipRequest').textContent = 'Never asked';
                } else {
                    document.getElementById('daysSinceTipRequest').textContent = Math.floor(data.days_since_request) + ' days';
                }

                const canRequestEl = document.getElementById('canRequestTip');
                if (data.can_request_tip) {
                    canRequestEl.textContent = 'Yes ✓';
                    canRequestEl.style.color = '#28a745';
                } else {
                    canRequestEl.textContent = 'No (wait ' + Math.ceil(4 - data.days_since_request) + ' days)';
                    canRequestEl.style.color = '#dc3545';
                }
            }
        } catch (error) {
            console.error('Failed to load tip stats:', error);
        }
    }

    async function markTipRequested() {
        if (!currentConversationUuid) {
            alert('Please select a conversation first');
            return;
        }

        try {
            const response = await fetch('/api/conversation/' + currentConversationUuid + '/tip-request', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                console.log('[Tips] Marked tip as requested');
                await loadTipStats();
            }
        } catch (error) {
            console.error('Failed to mark tip requested:', error);
        }
    }

    async function recordTipReceived() {
        if (!currentConversationUuid) {
            alert('Please select a conversation first');
            return;
        }

        const amount = prompt('Enter tip amount received (e.g., 5.00):');
        if (!amount || isNaN(parseFloat(amount))) {
            return;
        }

        try {
            const response = await fetch('/api/conversation/' + currentConversationUuid + '/tip-received', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ amount: parseFloat(amount) })
            });

            if (response.ok) {
                console.log('[Tips] Recorded tip received:', amount);
                await loadTipStats();
            }
        } catch (error) {
            console.error('Failed to record tip received:', error);
        }
    }

    // PPV Functions
    async function togglePPVAwareness() {
        const checkbox = document.getElementById('ppvAwarenessEnabled');
        const enabled = checkbox.checked;

        try {
            await fetch('/api/ppv-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ppvAwarenessEnabled: enabled })
            });
            console.log('[PPV] Awareness:', enabled ? 'ENABLED' : 'DISABLED');
        } catch (error) {
            console.error('Failed to update PPV setting:', error);
        }
    }

    async function loadPPVStats() {
        if (!currentConversationUuid) {
            document.getElementById('ppvStats').style.display = 'none';
            return;
        }

        try {
            const response = await fetch('/api/conversation/' + currentConversationUuid + '/ppv');
            const data = await response.json();

            if (response.ok) {
                const ppvStats = document.getElementById('ppvStats');
                ppvStats.style.display = 'block';

                document.getElementById('ppvOffersSent').textContent = data.totalSent || 0;
                document.getElementById('ppvPurchased').textContent = data.totalPurchased || 0;
                document.getElementById('ppvRevenue').textContent = '$' + (data.totalRevenue || 0).toFixed(2);
            }
        } catch (error) {
            console.error('Failed to load PPV stats:', error);
        }
    }

    async function recordPPVSent() {
        if (!currentConversationUuid) {
            alert('Please select a conversation first');
            return;
        }

        const mediaUuid = prompt('Enter the media UUID that was sent as PPV:');
        if (!mediaUuid) return;

        const price = prompt('Enter the PPV price (e.g., 9.99):');
        if (!price || isNaN(parseFloat(price))) {
            alert('Please enter a valid price');
            return;
        }

        try {
            const response = await fetch('/api/conversation/' + currentConversationUuid + '/ppv-sent', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaUuid: mediaUuid, price: parseFloat(price) })
            });

            if (response.ok) {
                console.log('[PPV] Recorded PPV sent:', mediaUuid, 'at', price);
                await loadPPVStats();
            }
        } catch (error) {
            console.error('Failed to record PPV sent:', error);
        }
    }

    async function recordPPVPurchased() {
        if (!currentConversationUuid) {
            alert('Please select a conversation first');
            return;
        }

        const mediaUuid = prompt('Enter the media UUID that was purchased:');
        if (!mediaUuid) return;

        try {
            const response = await fetch('/api/conversation/' + currentConversationUuid + '/ppv-purchased', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaUuid: mediaUuid })
            });

            if (response.ok) {
                console.log('[PPV] Recorded PPV purchased:', mediaUuid);
                await loadPPVStats();
                await loadMonetizationSummary(); // Refresh the summary too
            }
        } catch (error) {
            console.error('Failed to record PPV purchased:', error);
        }
    }

    // PPV Media Selection and Sending
    async function loadPPVMediaDropdown() {
        const select = document.getElementById('ppvMediaSelect');
        if (!select) return;

        try {
            const response = await fetch('/api/media-library');
            const data = await response.json();

            if (response.ok && data.media) {
                select.innerHTML = '<option value="">Select media to send...</option>';
                data.media.forEach(function(item) {
                    const option = document.createElement('option');
                    option.value = item.uuid;
                    const name = item.name || 'Untitled';
                    const type = item.mediaType || 'media';
                    const shortDesc = item.description ? ' - ' + item.description.substring(0, 30) + '...' : '';
                    option.textContent = '[' + type + '] ' + name + shortDesc;
                    select.appendChild(option);
                });
                console.log('[PPV] Loaded', data.media.length, 'media items for dropdown');
            }
        } catch (error) {
            console.error('Failed to load PPV media dropdown:', error);
        }
    }

    function updatePPVButtonPrice() {
        const priceInput = document.getElementById('ppvPriceInput');
        const sendBtn = document.getElementById('sendPPVBtn');
        if (priceInput && sendBtn) {
            const price = parseFloat(priceInput.value) || 0;
            if (price >= 3) {
                sendBtn.textContent = 'Send PPV $' + price.toFixed(0);
                sendBtn.style.background = '#dc3545';
            } else {
                sendBtn.textContent = 'PPV (min $3)';
                sendBtn.style.background = '#6c757d';
            }
        }
    }

    async function sendFreeMedia() {
        if (!currentConversationUuid) {
            alert('Please select a conversation first');
            return;
        }

        const mediaSelect = document.getElementById('ppvMediaSelect');
        const messageInput = document.getElementById('ppvMessageInput');
        const sendBtn = document.getElementById('sendFreeMediaBtn');

        const mediaUuid = mediaSelect.value;
        const message = messageInput.value || '';

        if (!mediaUuid) {
            alert('Please select media to send');
            return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        try {
            const response = await fetch('/api/send-media', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationUuid: currentConversationUuid,
                    mediaUuid: mediaUuid,
                    price: 0, // Free
                    message: message
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                alert('Media sent successfully!');
                messageInput.value = '';
                await loadMessages(currentConversationUuid); // Refresh chat
            } else {
                console.error('[Free Media Send] Failed:', data);
                alert('Failed to send media: ' + (data.error || 'Unknown error') + '\\n\\nDetails: ' + JSON.stringify(data.details || data.hint, null, 2));
            }
        } catch (error) {
            console.error('Failed to send media:', error);
            alert('Error sending media: ' + error.message);
        } finally {
            sendBtn.disabled = false;
            sendBtn.textContent = 'Send Free';
        }
    }

    async function sendPPV() {
        if (!currentConversationUuid) {
            alert('Please select a conversation first');
            return;
        }

        const mediaSelect = document.getElementById('ppvMediaSelect');
        const priceInput = document.getElementById('ppvPriceInput');
        const messageInput = document.getElementById('ppvMessageInput');
        const sendBtn = document.getElementById('sendPPVBtn');

        const mediaUuid = mediaSelect.value;
        const price = parseFloat(priceInput.value) || 0;
        const message = messageInput.value || '';

        if (!mediaUuid) {
            alert('Please select media to send');
            return;
        }

        if (price < 3) {
            alert('PPV minimum price is $3. Use "Send Free" for free media.');
            return;
        }

        sendBtn.disabled = true;
        sendBtn.textContent = 'Sending...';

        try {
            const response = await fetch('/api/send-ppv', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationUuid: currentConversationUuid,
                    mediaUuid: mediaUuid,
                    price: price,
                    message: message
                })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                alert('PPV sent successfully!');
                messageInput.value = '';
                await loadPPVStats();
                await loadMonetizationSummary();
                await loadMessages(currentConversationUuid); // Refresh chat
            } else {
                console.error('[PPV Send] Failed:', data);
                alert('Failed to send PPV: ' + (data.error || 'Unknown error') + '\\n\\nDetails: ' + JSON.stringify(data.details || data.hint, null, 2));
            }
        } catch (error) {
            console.error('Failed to send PPV:', error);
            alert('Error sending PPV: ' + error.message);
        } finally {
            sendBtn.disabled = false;
            updatePPVButtonPrice();
        }
    }

    // Monetization Summary
    async function loadMonetizationSummary() {
        const section = document.getElementById('monetizationSection');
        if (!currentConversationUuid) {
            if (section) section.style.display = 'none';
            return;
        }

        try {
            const response = await fetch('/api/conversation/' + currentConversationUuid + '/monetization');
            const data = await response.json();

            if (response.ok) {
                section.style.display = 'block';

                // Update summary stats
                document.getElementById('totalRevenue').textContent = '$' + (data.summary.totalRevenue || 0).toFixed(2);
                document.getElementById('totalPurchases').textContent = data.summary.totalPurchases || 0;

                // Update detailed breakdown
                document.getElementById('moneyTips').textContent = '$' + (data.tips.total || 0).toFixed(2);
                document.getElementById('moneyPPV').textContent = '$' + (data.ppv.totalRevenue || 0).toFixed(2);
                document.getElementById('ppvConversion').textContent = (data.ppv.conversionRate || 0) + '%';

                if (data.tips.daysSinceRequest === null) {
                    document.getElementById('moneyDaysSinceTip').textContent = 'Never asked';
                } else {
                    document.getElementById('moneyDaysSinceTip').textContent = Math.floor(data.tips.daysSinceRequest) + ' days';
                }

                // Show advice if available
                const adviceEl = document.getElementById('monetizationAdvice');
                if (data.advice) {
                    adviceEl.style.display = 'block';
                    adviceEl.innerHTML = '<strong>💡 Tip:</strong> ' + data.advice;
                } else {
                    adviceEl.style.display = 'none';
                }

                // Color-code the total revenue based on spender tier
                const revenueEl = document.getElementById('totalRevenue');
                switch (data.summary.spenderTier) {
                    case 'whale':
                        revenueEl.style.color = '#ffc107'; // Gold
                        break;
                    case 'high':
                        revenueEl.style.color = '#28a745'; // Green
                        break;
                    case 'medium':
                        revenueEl.style.color = '#17a2b8'; // Blue
                        break;
                    case 'low':
                        revenueEl.style.color = '#6c757d'; // Gray
                        break;
                    default:
                        revenueEl.style.color = '#dc3545'; // Red for non-spenders
                }

                console.log('[Monetization] Loaded summary:', data.summary.spenderTier, 'spender, $' + data.summary.totalRevenue);
            }
        } catch (error) {
            console.error('Failed to load monetization summary:', error);
        }
    }

    function updateAIModeUI(mode) {
        const description = document.getElementById('aiModeDescription');
        const fastModeContainer = document.getElementById('fastModeContainer');
        const suggestionBox = document.getElementById('aiSuggestionBox');

        switch(mode) {
            case 'manual':
                description.textContent = 'You chat manually';
                description.style.color = '#666';
                fastModeContainer.style.display = 'none';
                suggestionBox.style.display = 'none';
                break;
            case 'assisted':
                description.textContent = 'AI suggests responses for you to review';
                description.style.color = '#007bff';
                fastModeContainer.style.display = 'none';
                break;
            case 'full':
                description.textContent = 'AI replies automatically';
                description.style.color = '#28a745';
                fastModeContainer.style.display = 'flex';
                suggestionBox.style.display = 'none';
                break;
        }
    }

    async function changeAIMode(newMode) {
        aiMode = newMode;
        updateAIModeUI(newMode);

        // Reset tracking when changing modes
        lastRepliedMessageId = null;
        lastSuggestedMessageId = null;

        try {
            await fetch('/api/ai-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ aiMode: newMode })
            });

            console.log('[AI Mode] Changed to:', newMode);

            // If switching to full AI mode, set baseline to current messages
            if (newMode === 'full' && currentConversationUuid) {
                console.log('[AI Mode] Full AI enabled - setting baseline...');
                const response = await fetch('/api/messages/' + currentConversationUuid);
                const data = await response.json();

                if (response.ok) {
                    const messages = data.messages || [];
                    for (let i = 0; i < messages.length; i++) {
                        const msg = messages[i];
                        const isSentByMe = msg.sender?.uuid === myUserUuid;
                        const hasContent = msg.text || msg.hasMedia || msg.mediaType;
                        if (!isSentByMe && hasContent) {
                            lastRepliedMessageId = msg.uuid;
                            saveLastRepliedId();
                            console.log('[AI Mode] Baseline set to message:', lastRepliedMessageId);
                            break;
                        }
                    }
                }
            }

            // Restart auto-refresh with appropriate interval
            startAutoRefresh();

        } catch (error) {
            console.error('Failed to update AI mode:', error);
        }
    }

    function updateReplyWordsDisplay(tokens) {
        const minWords = Math.floor(tokens * 0.65);
        const maxWords = Math.floor(tokens * 0.80);
        document.getElementById('replyWordsDisplay').textContent = minWords + '-' + maxWords;
    }

    function updateReplyTokensDisplay() {
        const tokens = parseInt(document.getElementById('maxReplyTokens').value);
        document.getElementById('replyTokensDisplay').textContent = tokens;
        updateReplyWordsDisplay(tokens);
    }

    function updateProfileTokensDisplay() {
        const tokens = parseInt(document.getElementById('maxProfileTokens').value);
        document.getElementById('profileTokensDisplay').textContent = tokens;
    }

    function updateTemperatureDisplay() {
        const temperatureInput = document.getElementById('replyTemperature');
        const temperatureDisplay = document.getElementById('temperatureDisplay');
        temperatureDisplay.textContent = parseFloat(temperatureInput.value).toFixed(1);
    }

    async function saveAdvancedSettings() {
        const systemPrompt = document.getElementById('systemPromptInput').value;
        const maxReplyTokens = parseInt(document.getElementById('maxReplyTokens').value);
        const maxProfileTokens = parseInt(document.getElementById('maxProfileTokens').value);
        const replyTemperature = parseFloat(document.getElementById('replyTemperature').value);
        const aiModel = document.getElementById('aiModel').value;
        const profileModel = document.getElementById('profileModel').value;

        try {
            const response = await fetch('/api/ai-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    systemPrompt,
                    maxReplyTokens,
                    maxProfileTokens,
                    replyTemperature,
                    aiModel,
                    profileModel
                })
            });

            if (response.ok) {
                alert('Advanced settings saved successfully!');
                // Update displays
                document.getElementById('replyTokensDisplay').textContent = maxReplyTokens;
                updateReplyWordsDisplay(maxReplyTokens);
                document.getElementById('profileTokensDisplay').textContent = maxProfileTokens;
            } else {
                alert('Failed to save settings');
            }
        } catch (error) {
            console.error('Failed to save advanced settings:', error);
            alert('Error saving settings: ' + error.message);
        }
    }

    async function toggleFastMode() {
        const checkbox = document.getElementById('fastModeToggle');
        fastResponseMode = checkbox.checked;
        document.getElementById('fastModeLabel').textContent = fastResponseMode ? 'Fast Mode (Testing): ON' : 'Natural Delay (1-3 min): ON';

        try {
            await fetch('/api/ai-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fastResponseMode: fastResponseMode })
            });

            console.log('Fast response mode:', fastResponseMode ? 'ENABLED (instant, 5s checks)' : 'DISABLED (1-3 min delay, 30s checks)');

            // Restart auto-refresh with new interval
            startAutoRefresh();
        } catch (error) {
            console.error('Failed to update fast mode:', error);
        }
    }

    function toggleSystemPrompt() {
        const container = document.getElementById('systemPromptContainer');
        container.style.display = container.style.display === 'none' ? 'block' : 'none';
    }

    async function saveSystemPrompt() {
        const newPrompt = document.getElementById('systemPromptInput').value;
        systemPrompt = newPrompt;

        try {
            const response = await fetch('/api/ai-settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ systemPrompt: newPrompt })
            });

            if (response.ok) {
                alert('System prompt saved successfully!');
            } else {
                alert('Failed to save system prompt.');
            }
        } catch (error) {
            console.error('Failed to save system prompt:', error);
            alert('Failed to save system prompt.');
        }
    }

    let lastRepliedMessageId = null;

    // Load last replied message ID from localStorage
    function loadLastRepliedId() {
        if (currentConversationUuid) {
            const stored = localStorage.getItem('lastReplied_' + currentConversationUuid);
            if (stored) {
                lastRepliedMessageId = stored;
                console.log('[Session] Restored last replied ID:', lastRepliedMessageId);
            }
        }
    }

    // Save last replied message ID to localStorage
    function saveLastRepliedId() {
        if (currentConversationUuid && lastRepliedMessageId) {
            localStorage.setItem('lastReplied_' + currentConversationUuid, lastRepliedMessageId);
            console.log('[Session] Saved last replied ID:', lastRepliedMessageId);
        }
    }

    async function checkForNewMessagesAndReply() {
        // Only process in assisted or full AI mode
        if (aiMode === 'manual' || !currentConversationUuid) {
            return;
        }

        console.log('[AI] Checking for new messages (mode: ' + aiMode + ')...');

        try {
            // Fetch both messages and media in parallel
            const [messagesResponse, mediaResponse] = await Promise.all([
                fetch('/api/messages/' + currentConversationUuid),
                fetch('/api/chat-media/' + currentConversationUuid)
            ]);

            const messagesData = await messagesResponse.json();
            const mediaData = await mediaResponse.json();

            if (!messagesResponse.ok) {
                console.error('[AI] Failed to fetch messages');
                return;
            }

            const messages = messagesData.messages || [];
            const mediaItems = mediaData.media || [];

            // Update media cache
            chatMediaCache = {};
            mediaItems.forEach(function(item) {
                var msgId = item.messageUuid || item.message_uuid;
                if (msgId) {
                    if (!chatMediaCache[msgId]) {
                        chatMediaCache[msgId] = [];
                    }
                    chatMediaCache[msgId].push(item);
                }
            });

            // Find media-only messages (media items whose messageUuid isn't in messages list)
            const messageUuids = new Set(messages.map(m => m.uuid));
            const mediaOnlyMessages = [];

            mediaItems.forEach(function(media) {
                const msgUuid = media.messageUuid || media.message_uuid;
                if (msgUuid && !messageUuids.has(msgUuid)) {
                    // This is a media-only message - check if we already added it
                    if (!mediaOnlyMessages.find(m => m.uuid === msgUuid)) {
                        // Check if this media was sent by subscriber (not by me)
                        const isFromSubscriber = media.ownerUuid !== myUserUuid;
                        if (isFromSubscriber) {
                            mediaOnlyMessages.push({
                                uuid: msgUuid,
                                text: '', // No text
                                sentAt: media.sentAt || media.created_at,
                                sender: { uuid: media.ownerUuid },
                                hasMedia: true,
                                mediaType: media.mediaType,
                                isMediaOnly: true
                            });
                            console.log('[AI] Found media-only message:', msgUuid, 'type:', media.mediaType);
                        }
                    }
                }
            });

            // Merge and sort all messages by date (newest first)
            const allMessages = [...messages, ...mediaOnlyMessages].sort((a, b) => {
                return new Date(b.sentAt) - new Date(a.sentAt);
            });

            if (allMessages.length === 0) {
                console.log('[AI] No messages in conversation');
                return;
            }

            // Find the latest message from the SUBSCRIBER (not from me)
            let latestSubscriberMessage = null;
            for (let i = 0; i < allMessages.length; i++) {
                const msg = allMessages[i];
                const isSentByMe = msg.sender?.uuid === myUserUuid;
                const hasContent = msg.text || msg.hasMedia || msg.mediaType || msg.isMediaOnly;
                if (!isSentByMe && hasContent) {
                    latestSubscriberMessage = msg;
                    break;
                }
            }

            if (!latestSubscriberMessage) {
                console.log('[AI] No subscriber messages found');
                return;
            }

            // For media-only messages, log it
            if (latestSubscriberMessage.isMediaOnly || (!latestSubscriberMessage.text && latestSubscriberMessage.hasMedia)) {
                console.log('[AI] Subscriber sent media without text - will analyze image');
            }

            const senderHandle = latestSubscriberMessage.sender?.handle || latestSubscriberMessage.sender?.username;

            // Handle based on AI mode
            if (aiMode === 'assisted') {
                // AI Assisted mode: generate suggestion but don't send
                if (latestSubscriberMessage.uuid !== lastSuggestedMessageId) {
                    console.log('[AI Assisted] New message from:', senderHandle);
                    lastSuggestedMessageId = latestSubscriberMessage.uuid;

                    // Get conversation context (use allMessages which includes media-only)
                    const latestMessageIndex = allMessages.indexOf(latestSubscriberMessage);
                    const contextWindowSize = 30;
                    const startIndex = Math.max(0, latestMessageIndex - contextWindowSize + 1);
                    const conversationContext = allMessages.slice(startIndex, latestMessageIndex + 1);

                    await generateAISuggestion(conversationContext, senderHandle);
                }
            } else if (aiMode === 'full') {
                // Full AI mode: auto-reply with preview
                if (latestSubscriberMessage.uuid !== lastRepliedMessageId) {
                    console.log('[AI Full] New message from:', senderHandle, '- preparing auto-reply...');
                    lastRepliedMessageId = latestSubscriberMessage.uuid;
                    saveLastRepliedId();

                    // Get conversation context (use allMessages which includes media-only)
                    const latestMessageIndex = allMessages.indexOf(latestSubscriberMessage);
                    const contextWindowSize = 30;
                    const startIndex = Math.max(0, latestMessageIndex - contextWindowSize + 1);
                    const conversationContext = allMessages.slice(startIndex, latestMessageIndex + 1);

                    console.log('[AI Full] Context:', conversationContext.length, 'messages');

                    // Reset cancelled flag
                    autoReplyCancelled = false;

                    if (fastResponseMode) {
                        console.log('[AI Full] Fast mode - generating preview then sending immediately');
                        // Even in fast mode, show quick preview (2 seconds to cancel)
                        await generatePreviewAndSend(conversationContext, allMessages, senderHandle, 2);
                    } else {
                        const delayMinutes = Math.random() * 2 + 1;
                        const delaySeconds = Math.floor(delayMinutes * 60);

                        console.log('[AI Full] Natural delay:', delaySeconds, 'seconds');
                        await generatePreviewAndSend(conversationContext, allMessages, senderHandle, delaySeconds);
                    }
                }
            }
        } catch (error) {
            console.error('[AI] Error:', error);
        }
    }

    async function generateAISuggestion(conversationContext, subscriberHandle) {
        subscriberHandle = subscriberHandle || null;
        console.log('[AI Assisted] Generating suggestion...');

        var suggestionBox = document.getElementById('aiSuggestionBox');
        var suggestionText = document.getElementById('aiSuggestionText');

        suggestionText.value = 'Generating suggestion...';
        suggestionBox.style.display = 'block';

        try {
            // Reload media cache to ensure we have the latest media
            if (currentConversationUuid) {
                console.log('[AI Assisted] Refreshing media cache...');
                await loadChatMedia(currentConversationUuid);
            }

            var conversationHistory = conversationContext.map(function(msg) {
                var isSentByYou = msg.sender && msg.sender.uuid === myUserUuid;
                return {
                    uuid: msg.uuid || msg.id,
                    text: msg.text,
                    isSentByYou: isSentByYou,
                    hasMedia: !!(msg.media && msg.media.length > 0) || !!(chatMediaCache && chatMediaCache[msg.uuid])
                };
            });

            // Get media from cache for this conversation
            var chatMediaArray = [];
            if (chatMediaCache) {
                Object.values(chatMediaCache).forEach(function(items) {
                    chatMediaArray = chatMediaArray.concat(items);
                });
            }
            console.log('[AI Assisted] Media cache has', chatMediaArray.length, 'items');

            const response = await fetch('/api/ai-generate-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationHistory: conversationHistory,
                    systemPrompt: systemPrompt,
                    userProfile: currentUserProfile,
                    creatorProfile: creatorProfile,
                    subscriberMemory: currentSubscriberMemory,
                    conversationUuid: currentConversationUuid,
                    subscriberHandle: subscriberHandle,
                    chatMedia: chatMediaArray
                })
            });

            const data = await response.json();

            if (response.ok && data.reply) {
                suggestionText.value = data.reply;
                console.log('[AI Assisted] Suggestion ready' + (currentSubscriberMemory ? ' (with memory)' : ''));
            } else {
                suggestionText.value = 'Failed to generate suggestion. Please try again.';
            }
        } catch (error) {
            console.error('[AI Assisted] Error:', error);
            suggestionText.value = 'Error generating suggestion: ' + error.message;
        }
    }

    async function sendSuggestion() {
        const suggestionText = document.getElementById('aiSuggestionText').value.trim();
        if (!suggestionText || !currentConversationUuid) return;

        try {
            const response = await fetch('/api/send-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: suggestionText,
                    conversationUuid: currentConversationUuid
                })
            });

            if (response.ok) {
                document.getElementById('aiSuggestionBox').style.display = 'none';
                await loadMessages(currentConversationUuid);
                console.log('[AI Assisted] Suggestion sent!');
            }
        } catch (error) {
            console.error('[AI Assisted] Error sending:', error);
        }
    }

    function copyToInput() {
        const suggestionText = document.getElementById('aiSuggestionText').value;
        document.getElementById('messageInput').value = suggestionText;
        document.getElementById('aiSuggestionBox').style.display = 'none';
        document.getElementById('messageInput').focus();
    }

    function dismissSuggestion() {
        document.getElementById('aiSuggestionBox').style.display = 'none';
    }

    async function regenerateSuggestion() {
        if (!currentConversationUuid) return;

        const response = await fetch('/api/messages/' + currentConversationUuid);
        const data = await response.json();
        const messages = data.messages || [];

        let latestSubscriberMessage = null;
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            const isSentByMe = msg.sender?.uuid === myUserUuid;
            const hasContent = msg.text || msg.hasMedia || msg.mediaType;
            if (!isSentByMe && hasContent) {
                latestSubscriberMessage = msg;
                break;
            }
        }

        if (latestSubscriberMessage) {
            const latestMessageIndex = messages.indexOf(latestSubscriberMessage);
            const contextWindowSize = 30;
            const startIndex = Math.max(0, latestMessageIndex - contextWindowSize + 1);
            const conversationContext = messages.slice(startIndex, latestMessageIndex + 1);
            await generateAISuggestion(conversationContext);
        }
    }

    async function generateAndSendAIReply(conversationContext, allMessages, subscriberHandle = null) {
        try {
            // conversationContext contains the last N messages for context
            const latestMessage = conversationContext[conversationContext.length - 1];

            console.log('[AI] Generating reply to this message:', latestMessage.text);
            console.log('[AI] Context window:', conversationContext.length, 'messages');

            // Reload media cache to ensure we have the latest media (including newly sent images)
            if (currentConversationUuid) {
                console.log('[AI] Refreshing media cache before generating reply...');
                await loadChatMedia(currentConversationUuid);
            }

            // Build conversation history for OpenAI
            var conversationHistory = conversationContext.map(function(msg) {
                var isSentByYou = msg.sender && msg.sender.uuid === myUserUuid;
                return {
                    uuid: msg.uuid || msg.id,
                    text: msg.text,
                    isSentByYou: isSentByYou,
                    hasMedia: !!(msg.media && msg.media.length > 0) || !!(chatMediaCache && chatMediaCache[msg.uuid])
                };
            });

            // Get media from cache for this conversation
            var chatMediaArray = [];
            if (chatMediaCache) {
                Object.values(chatMediaCache).forEach(function(items) {
                    chatMediaArray = chatMediaArray.concat(items);
                });
            }
            console.log('[AI] Media cache has', chatMediaArray.length, 'items to send to backend');

            const response = await fetch('/api/ai-generate-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationHistory: conversationHistory,
                    systemPrompt: systemPrompt,
                    userProfile: currentUserProfile,
                    creatorProfile: creatorProfile,
                    subscriberMemory: currentSubscriberMemory,
                    conversationUuid: currentConversationUuid,
                    subscriberHandle: subscriberHandle,
                    chatMedia: chatMediaArray
                })
            });

            const data = await response.json();
            console.log('[AI] Generated response' + (currentSubscriberMemory ? ' (with memory)' : '') + ':', data.reply?.substring(0, 50) + '...');

            if (response.ok && data.reply) {
                // Check if AI sent media with the message
                if (data.mediaSent) {
                    console.log('[AI] Media sent by AI:', data.mediaSent.shortId, '- message already sent with media');
                    // Don't send the text separately - it was already sent with the media
                } else {
                    // Normal text-only reply - send it
                    console.log('[AI] Sending text reply...');
                    await fetch('/api/send-message', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            message: data.reply,
                            conversationUuid: currentConversationUuid
                        })
                    });
                }

                console.log('[AI] Reply sent successfully!' + (data.mediaSent ? ' (with media: ' + data.mediaSent.shortId + ')' : ''));

                // Track AI message sent
                await trackAIMessage(currentConversationUuid);

                await loadMessages(currentConversationUuid);
            } else {
                console.error('[AI] Generation failed:', data);
            }
        } catch (error) {
            console.error('[AI] Error generating AI reply:', error);
        }
    }

    // Generate preview, show it with countdown, then send (used in full auto mode)
    async function generatePreviewAndSend(conversationContext, allMessages, subscriberHandle, delaySeconds) {
        try {
            // Show indicator with "Generating..." status
            showPreviewIndicator('generating');

            // Clear any existing pending reply
            if (pendingAIReply) {
                clearTimeout(pendingAIReply);
                pendingAIReply = null;
            }

            // Reload media cache
            if (currentConversationUuid) {
                await loadChatMedia(currentConversationUuid);
            }

            // Build conversation history for API
            var conversationHistory = conversationContext.map(function(msg) {
                var isSentByYou = msg.sender && msg.sender.uuid === myUserUuid;
                return {
                    uuid: msg.uuid || msg.id,
                    text: msg.text,
                    isSentByYou: isSentByYou,
                    hasMedia: !!(msg.media && msg.media.length > 0) || !!(chatMediaCache && chatMediaCache[msg.uuid])
                };
            });

            // Get media from cache
            var chatMediaArray = [];
            if (chatMediaCache) {
                Object.values(chatMediaCache).forEach(function(items) {
                    chatMediaArray = chatMediaArray.concat(items);
                });
            }

            console.log('[AI Preview] Generating reply preview...');

            // Generate the reply
            const response = await fetch('/api/ai-generate-reply', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationHistory: conversationHistory,
                    systemPrompt: systemPrompt,
                    userProfile: currentUserProfile,
                    creatorProfile: creatorProfile,
                    subscriberMemory: currentSubscriberMemory,
                    conversationUuid: currentConversationUuid,
                    subscriberHandle: subscriberHandle,
                    chatMedia: chatMediaArray
                })
            });

            const data = await response.json();

            if (!response.ok || !data.reply) {
                console.error('[AI Preview] Generation failed:', data);
                hidePreviewIndicator();
                return;
            }

            // Check if cancelled during generation
            if (autoReplyCancelled) {
                console.log('[AI Preview] Cancelled during generation');
                hidePreviewIndicator();
                return;
            }

            console.log('[AI Preview] Reply generated:', data.reply.substring(0, 50) + '...');

            // Store the reply data for potential editing
            pendingReplyData = data;
            pendingReplyContext = {
                conversationContext: conversationContext,
                allMessages: allMessages,
                subscriberHandle: subscriberHandle
            };

            // Show the preview with countdown
            showPreviewWithCountdown(data.reply, delaySeconds, data.mediaSent);

            // Set timeout to send after delay
            pendingAIReply = setTimeout(async function() {
                if (autoReplyCancelled) {
                    console.log('[AI Preview] Send cancelled');
                    hidePreviewIndicator();
                    pendingAIReply = null;
                    return;
                }

                await sendPreviewedReply();
                pendingAIReply = null;
            }, delaySeconds * 1000);

        } catch (error) {
            console.error('[AI Preview] Error:', error);
            hidePreviewIndicator();
        }
    }

    // Send the previewed (and possibly edited) reply
    async function sendPreviewedReply() {
        try {
            const previewTextarea = document.getElementById('autoReplyPreview');
            const editedReply = previewTextarea ? previewTextarea.value.trim() : '';

            if (!editedReply) {
                console.log('[AI Preview] No reply to send (empty)');
                hidePreviewIndicator();
                return;
            }

            // Check if the reply was edited
            const wasEdited = pendingReplyData && editedReply !== pendingReplyData.reply;
            if (wasEdited) {
                console.log('[AI Preview] Reply was edited by user');
            }

            // Check if AI had attached media (only if not edited)
            if (!wasEdited && pendingReplyData && pendingReplyData.mediaSent) {
                console.log('[AI Preview] Media was attached by AI:', pendingReplyData.mediaSent.shortId, '- already sent');
                // Media was already sent with the generation, just hide the indicator
            } else {
                // Send the text reply
                console.log('[AI Preview] Sending reply:', editedReply.substring(0, 50) + '...');
                await fetch('/api/send-message', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        message: editedReply,
                        conversationUuid: currentConversationUuid
                    })
                });
            }

            console.log('[AI Preview] Reply sent successfully!');

            // Track AI message
            await trackAIMessage(currentConversationUuid);

            // Reload messages
            await loadMessages(currentConversationUuid);

            // Clear state
            hidePreviewIndicator();
            pendingReplyData = null;
            pendingReplyContext = null;

        } catch (error) {
            console.error('[AI Preview] Error sending reply:', error);
            hidePreviewIndicator();
        }
    }

    // Show the preview indicator in different states
    function showPreviewIndicator(state) {
        const indicator = document.getElementById('delayIndicator');
        const statusEl = document.getElementById('delayStatus');
        const countdownWrapper = document.getElementById('delayCountdownWrapper');
        const previewContainer = document.getElementById('previewContainer');
        const previewTextarea = document.getElementById('autoReplyPreview');

        indicator.style.display = 'block';

        if (state === 'generating') {
            statusEl.textContent = 'Generating preview...';
            countdownWrapper.style.display = 'none';
            previewContainer.style.display = 'none';
        }
    }

    // Show preview with countdown
    function showPreviewWithCountdown(replyText, seconds, mediaSent) {
        const indicator = document.getElementById('delayIndicator');
        const statusEl = document.getElementById('delayStatus');
        const countdownWrapper = document.getElementById('delayCountdownWrapper');
        const countdownEl = document.getElementById('delayCountdown');
        const previewContainer = document.getElementById('previewContainer');
        const previewTextarea = document.getElementById('autoReplyPreview');

        indicator.style.display = 'block';

        // Update status
        if (mediaSent) {
            statusEl.textContent = 'Preview (with ' + mediaSent.shortId + ' ' + (mediaSent.type === 'ppv' ? 'PPV $' + mediaSent.price : 'media') + '):';
        } else {
            statusEl.textContent = 'Preview:';
        }

        // Show countdown
        countdownWrapper.style.display = 'inline';
        countdownEl.textContent = seconds;

        // Show preview text (editable)
        previewContainer.style.display = 'block';
        previewTextarea.value = replyText;

        // Start countdown
        let remaining = seconds;
        if (delayCountdownInterval) {
            clearInterval(delayCountdownInterval);
        }
        delayCountdownInterval = setInterval(function() {
            remaining--;
            if (remaining <= 0) {
                clearInterval(delayCountdownInterval);
                delayCountdownInterval = null;
                countdownEl.textContent = '0';
            } else {
                countdownEl.textContent = remaining;
            }
        }, 1000);
    }

    // Hide the preview indicator
    function hidePreviewIndicator() {
        const indicator = document.getElementById('delayIndicator');
        indicator.style.display = 'none';

        if (delayCountdownInterval) {
            clearInterval(delayCountdownInterval);
            delayCountdownInterval = null;
        }

        // Reset state
        autoReplyCancelled = false;
    }

    // Cancel the pending auto-reply
    function cancelAutoReply() {
        console.log('[AI Preview] Cancelling auto-reply...');
        autoReplyCancelled = true;

        if (pendingAIReply) {
            clearTimeout(pendingAIReply);
            pendingAIReply = null;
        }

        hidePreviewIndicator();
        pendingReplyData = null;
        pendingReplyContext = null;

        console.log('[AI Preview] Auto-reply cancelled');
    }

    // Send the preview immediately (bypassing countdown)
    function sendPreviewNow() {
        console.log('[AI Preview] Sending immediately...');

        if (pendingAIReply) {
            clearTimeout(pendingAIReply);
            pendingAIReply = null;
        }

        if (delayCountdownInterval) {
            clearInterval(delayCountdownInterval);
            delayCountdownInterval = null;
        }

        sendPreviewedReply();
    }

    function startAutoRefresh() {
        console.log('[Refresh] startAutoRefresh called');
        console.log('[Refresh] autoRefreshInterval exists:', !!autoRefreshInterval);

        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
            console.log('[Refresh] Cleared existing interval');
        }

        // Set refresh interval based on AI mode and fast mode:
        // - Manual: 60 seconds
        // - Assisted: 60 seconds
        // - Full AI with fast mode OFF (natural delay): 30 seconds
        // - Full AI with fast mode ON: 5 seconds (for debugging)
        let refreshInterval;
        if (aiMode === 'auto' && fastResponseMode) {
            refreshInterval = 5000; // 5 seconds for Full AI + Fast Mode (debugging)
        } else if (aiMode === 'auto') {
            refreshInterval = 30000; // 30 seconds for Full AI with natural delay
        } else {
            refreshInterval = 60000; // 60 seconds for Manual and Assisted modes
        }
        console.log('[Refresh] Setting auto-refresh interval to', refreshInterval / 1000, 'seconds (aiMode:', aiMode, ', fastMode:', fastResponseMode, ')');

        autoRefreshInterval = setInterval(async function() {
            console.log('[Refresh] Interval tick - conversationUuid:', currentConversationUuid ? 'set' : 'null', ', aiMode:', aiMode);
            if (currentConversationUuid) {
                if (aiMode !== 'manual') {
                    console.log('[Refresh] Checking for new messages (AI mode active)...');
                    await checkForNewMessagesAndReply();
                }
                console.log('[Refresh] Loading messages...');
                await loadMessages(currentConversationUuid);
            }
        }, refreshInterval);

        console.log('[Refresh] Auto-refresh started with interval ID:', autoRefreshInterval);
    }

    // Variable moved to top
    // Variable moved to top

    function toggleProfileSidebar() {
        const sidebar = document.getElementById('profileSidebar');
        sidebar.classList.toggle('open');
    }

    async function generateSubscriberMemory() {
        if (!currentConversationUuid) {
            alert('Please select a conversation first');
            return;
        }

        const btn = document.getElementById('generateMemoryBtn');
        btn.disabled = true;
        btn.textContent = 'Generating...';

        try {
            const response = await fetch('/api/subscriber-memory/' + currentConversationUuid + '/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            const data = await response.json();

            if (response.ok && data.memory) {
                currentSubscriberMemory = data.memory;
                displaySubscriberMemory(data.memory);
                console.log('[Memory] Generated memory for subscriber');
            } else {
                alert('Failed to generate memory: ' + (data.error || 'Unknown error'));
            }
        } catch (error) {
            console.error('Error generating memory:', error);
            alert('Error generating memory: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Generate Memory';
        }
    }

    async function loadSubscriberMemory() {
        if (!currentConversationUuid) return;

        try {
            const response = await fetch('/api/subscriber-memory/' + currentConversationUuid);
            const data = await response.json();

            if (response.ok && data.memory) {
                currentSubscriberMemory = data.memory;
                displaySubscriberMemory(data.memory);
            } else {
                currentSubscriberMemory = null;
                document.getElementById('memoryContent').style.display = 'none';
            }
        } catch (error) {
            console.error('Error loading memory:', error);
            currentSubscriberMemory = null;
        }
    }

    function displaySubscriberMemory(memory) {
        const container = document.getElementById('memoryContent');
        const summaryDiv = document.getElementById('memorySummary');
        const factsDiv = document.getElementById('memoryFacts');
        const detailsDiv = document.getElementById('memoryDetails');

        container.style.display = 'block';

        // Summary
        summaryDiv.innerHTML = '<strong>Summary:</strong> ' + (memory.summary || 'No summary yet');

        // Key facts
        if (memory.key_facts && memory.key_facts.length > 0) {
            factsDiv.innerHTML = '<strong>Key Facts:</strong><ul style="margin: 5px 0; padding-left: 20px;">' +
                memory.key_facts.map(function(f) { return '<li>' + f + '</li>'; }).join('') + '</ul>';
        } else {
            factsDiv.innerHTML = '';
        }

        // Details
        let details = [];
        if (memory.personality) details.push('<strong>Personality:</strong> ' + memory.personality);
        if (memory.interests && memory.interests.length > 0) details.push('<strong>Interests:</strong> ' + memory.interests.join(', '));
        if (memory.conversation_tone) details.push('<strong>Tone:</strong> ' + memory.conversation_tone);
        if (memory.last_topics && memory.last_topics.length > 0) details.push('<strong>Recent Topics:</strong> ' + memory.last_topics.join(', '));
        if (memory.total_messages) details.push('<strong>Total Messages:</strong> ' + memory.total_messages);
        if (memory.last_contact) details.push('<strong>Last Contact:</strong> ' + new Date(memory.last_contact).toLocaleDateString());

        detailsDiv.innerHTML = details.join('<br>');
    }

    // ============================================
    // CONTENT REQUEST NOTIFICATIONS
    // ============================================

    let contentRequests = [];
    let notificationPanelOpen = false;

    async function loadContentRequests() {
        try {
            const response = await fetch('/api/content-requests');
            const data = await response.json();

            if (response.ok) {
                contentRequests = data.requests || [];
                updateNotificationUI();
            }
        } catch (error) {
            console.error('[Notifications] Error loading content requests:', error);
        }
    }

    function updateNotificationUI() {
        const toggle = document.getElementById('notificationToggle');
        const count = document.getElementById('notificationCount');
        const badge = document.getElementById('notificationBadge');
        const list = document.getElementById('notificationList');

        const pendingCount = contentRequests.length;

        // Show/hide toggle button based on whether there are requests
        toggle.style.display = pendingCount > 0 ? 'flex' : 'none';
        count.textContent = pendingCount;
        badge.textContent = pendingCount;

        // Update sidebar nav notification badge
        updateNavNotificationBadge(pendingCount);

        // Build notification list
        if (pendingCount === 0) {
            list.innerHTML = '<div class="notification-empty">No pending requests</div>';
        } else {
            list.innerHTML = contentRequests.map(function(req) {
                var time = new Date(req.created_at).toLocaleString();
                var msgPreview = req.original_message ? req.original_message.substring(0, 100) : '';
                var msgEllipsis = req.original_message && req.original_message.length > 100 ? '...' : '';
                var handle = req.subscriber_handle || 'unknown';
                var reqType = req.request_type || 'custom';
                var typeLabel = reqType.replace('_', ' ');
                var persona = req.persona_name || 'Unknown persona';
                var convUuid = req.conversation_uuid || '';

                var html = '<div class="notification-item" data-id="' + req.id + '">';
                html += '<div class="notification-meta">';
                html += '<span class="notification-user">@' + handle + '</span>';
                html += '<span class="notification-type ' + reqType + '">' + typeLabel + '</span>';
                html += '</div>';
                html += '<div class="notification-message">"' + escapeHtml(msgPreview) + msgEllipsis + '"</div>';
                html += '<div class="notification-time">' + time + ' - ' + persona + '</div>';
                html += '<div class="notification-actions">';
                html += '<button class="btn-goto" data-uuid="' + convUuid + '" onclick="goToConversation(this.dataset.uuid)">Go to Chat</button>';
                html += '<button class="btn-fulfill" data-id="' + req.id + '" onclick="fulfillRequest(Number(this.dataset.id))">Fulfilled</button>';
                html += '<button class="btn-dismiss" data-id="' + req.id + '" onclick="dismissRequest(Number(this.dataset.id))">Dismiss</button>';
                html += '</div>';
                html += '</div>';
                return html;
            }).join('');
        }
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function toggleNotifications() {
        const panel = document.getElementById('notificationPanel');
        notificationPanelOpen = !notificationPanelOpen;
        panel.style.display = notificationPanelOpen ? 'block' : 'none';
    }

    async function fulfillRequest(requestId) {
        try {
            const response = await fetch('/api/content-requests/' + requestId + '/fulfill', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                contentRequests = contentRequests.filter(function(r) { return r.id !== requestId; });
                updateNotificationUI();
                console.log('[Notifications] Request fulfilled:', requestId);
            }
        } catch (error) {
            console.error('[Notifications] Error fulfilling request:', error);
        }
    }

    async function dismissRequest(requestId) {
        try {
            var response = await fetch('/api/content-requests/' + requestId + '/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });

            if (response.ok) {
                contentRequests = contentRequests.filter(function(r) { return r.id !== requestId; });
                updateNotificationUI();
                console.log('[Notifications] Request dismissed:', requestId);
            }
        } catch (error) {
            console.error('[Notifications] Error dismissing request:', error);
        }
    }

    function goToConversation(conversationUuid) {
        // Close notification panel
        notificationPanelOpen = false;
        document.getElementById('notificationPanel').style.display = 'none';

        // Select the conversation in the dropdown
        const select = document.getElementById('conversationSelect');
        if (select) {
            select.value = conversationUuid;
            // Trigger change event to load the conversation
            select.dispatchEvent(new Event('change'));
        }
    }

    // Load content requests periodically
    setInterval(loadContentRequests, 30000); // Check every 30 seconds

    // ============================================
    // END CONTENT REQUEST NOTIFICATIONS
    // ============================================

    async function generateUserProfile(silentMode = false) {
        if (!currentConversationUuid) {
            if (!silentMode) alert('Please select a conversation first');
            return;
        }

        const btn = document.getElementById('generateProfileBtn');
        if (!silentMode) {
            btn.disabled = true;
            btn.textContent = 'Analyzing...';
        }

        try {
            const response = await fetch('/api/generate-user-profile', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationUuid: currentConversationUuid })
            });

            const data = await response.json();

            if (response.ok && data.profile) {
                currentUserProfile = data.profile;
                displayUserProfile(data.profile);
                if (silentMode) {
                    console.log('[Profile] Auto-generated profile for subscriber');
                }
            } else {
                if (!silentMode) {
                    alert('Failed to generate profile: ' + (data.error || 'Unknown error'));
                }
            }
        } catch (error) {
            console.error('Error generating profile:', error);
            if (!silentMode) {
                alert('Error generating profile: ' + error.message);
            }
        } finally {
            if (!silentMode) {
                btn.disabled = false;
                btn.textContent = 'Regenerate Profile';
            }
        }
    }

    function displayUserProfile(profile) {
        const content = document.getElementById('profileContent');

        var html = '<div class="profile-section"><h4>Summary</h4><p class="profile-summary">' + (profile.summary || 'No summary available') + '</p></div>' +
            '<div class="profile-section"><h4>Interests</h4><div>' +
            (profile.interests && profile.interests.length > 0
                ? profile.interests.map(function(i) { return '<span class="interest-tag">' + i + '</span>'; }).join('')
                : '<p style="color: #999;">No interests identified</p>') +
            '</div></div>' +
            '<div class="profile-section"><h4>Personality</h4><p class="profile-summary">' + (profile.personality || 'Not yet determined') + '</p></div>' +
            '<div class="profile-section"><h4>Key Facts</h4><div>' +
            (profile.facts && profile.facts.length > 0
                ? profile.facts.map(function(f) { return '<div class="fact-item">' + f + '</div>'; }).join('')
                : '<p style="color: #999;">No facts recorded</p>') +
            '</div></div>' +
            '<div style="margin-top: 10px; font-size: 12px; color: #999;">Generated: ' + new Date(profile.generatedAt).toLocaleString() + '<br>Based on ' + profile.messageCount + ' messages</div>';

        content.innerHTML = html;
    }

    async function loadUserProfile() {
        if (!currentConversationUuid) return;

        try {
            const response = await fetch('/api/user-profile/' + currentConversationUuid);
            const data = await response.json();

            if (data.profile) {
                currentUserProfile = data.profile;
                displayUserProfile(data.profile);

                // Only update notes if the textarea is not focused (user is not actively typing)
                const notesTextarea = document.getElementById('subscriberNotes');
                if (document.activeElement !== notesTextarea) {
                    notesTextarea.value = data.profile.manualNotes || '';
                }
            } else {
                // Auto-generate profile if it doesn't exist
                await generateUserProfile(true); // Pass true for silent mode
            }
        } catch (error) {
            console.error('Error loading user profile:', error);
        }
    }

    function toggleCreatorSidebar() {
        const sidebar = document.getElementById('creatorSidebar');
        sidebar.classList.toggle('open');
    }

    // Variable moved to top
    let allPersonas = [];

    // Load the creator's persona (one persona per account)
    async function loadCreatorPersona() {
        try {
            const response = await fetch('/api/persona');
            const data = await response.json();

            if (response.ok && data.persona) {
                creatorProfile = data.persona;

                // Update form fields with the persona data
                document.getElementById('creatorName').value = data.persona.name || '';
                document.getElementById('creatorAge').value = data.persona.age || '';
                document.getElementById('creatorAccent').value = data.persona.accent || '';
                document.getElementById('creatorLocation').value = data.persona.location || '';
                document.getElementById('creatorTimezone').value = data.persona.timezone || '';
                document.getElementById('creatorPhysical').value = data.persona.physical || '';
                document.getElementById('creatorVibe').value = data.persona.vibe || '';
                document.getElementById('creatorFacts').value = data.persona.facts || '';
                document.getElementById('creatorOther').value = data.persona.other || '';

                // Load the system prompt
                if (data.persona.system_prompt) {
                    systemPrompt = data.persona.system_prompt;
                    document.getElementById('systemPromptInput').value = data.persona.system_prompt;
                }

                console.log('[Persona] Loaded persona for this account');
            } else if (response.ok && !data.persona) {
                console.log('[Persona] No persona configured yet - user needs to create one');
                // Clear the form
                document.getElementById('creatorName').value = '';
                document.getElementById('creatorAge').value = '';
                document.getElementById('creatorAccent').value = '';
                document.getElementById('creatorLocation').value = '';
                document.getElementById('creatorTimezone').value = '';
                document.getElementById('creatorPhysical').value = '';
                document.getElementById('creatorVibe').value = '';
                document.getElementById('creatorFacts').value = '';
                document.getElementById('creatorOther').value = '';
            }
        } catch (error) {
            console.error('Error loading persona:', error);
        }
    }


    async function saveCreatorProfile() {
        const name = document.getElementById('creatorName').value;
        const age = document.getElementById('creatorAge').value;
        const accent = document.getElementById('creatorAccent').value;
        const location = document.getElementById('creatorLocation').value;
        const timezone = document.getElementById('creatorTimezone').value;
        const physical = document.getElementById('creatorPhysical').value;
        const vibe = document.getElementById('creatorVibe').value;
        const facts = document.getElementById('creatorFacts').value;
        const other = document.getElementById('creatorOther').value;
        const currentSystemPrompt = document.getElementById('systemPromptInput').value;

        try {
            const response = await fetch('/api/persona', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: name,
                    age: parseInt(age) || age,
                    accent: accent,
                    location: location,
                    timezone: timezone,
                    physical: physical,
                    vibe: vibe,
                    facts: facts,
                    other: other,
                    system_prompt: currentSystemPrompt
                })
            });

            const data = await response.json();

            if (response.ok && data.persona) {
                // Update local variables
                systemPrompt = currentSystemPrompt;
                creatorProfile = data.persona;

                alert('Persona saved to database! Changes will persist for this account.');
            } else {
                alert('Failed to save persona');
            }
        } catch (error) {
            console.error('Error saving persona:', error);
            alert('Error saving persona');
        }
    }

    async function saveSubscriberNotes() {
        if (!currentConversationUuid) {
            alert('Please select a conversation first');
            return;
        }

        const notes = document.getElementById('subscriberNotes').value;

        try {
            const response = await fetch('/api/user-profile-notes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    conversationUuid: currentConversationUuid,
                    notes: notes
                })
            });

            if (response.ok) {
                const data = await response.json();
                if (data.profile) {
                    currentUserProfile = data.profile;
                }
                alert('Notes saved successfully!');
            } else {
                alert('Failed to save notes');
            }
        } catch (error) {
            console.error('Error saving notes:', error);
            alert('Error saving notes');
        }
    }

    // Analytics functions
    function toggleAnalytics() {
        const dashboard = document.getElementById('analyticsDashboard');
        const isOpen = dashboard.classList.contains('open');

        if (isOpen) {
            dashboard.classList.remove('open');
        } else {
            dashboard.classList.add('open');
            loadAnalytics();
        }
    }

    async function loadAnalytics() {
        try {
            const response = await fetch('/api/analytics');
            const data = await response.json();

            // Update summary stats
            document.getElementById('totalMessages').textContent = data.summary.totalMessages;
            document.getElementById('messagesSent').textContent = data.summary.totalMessagesSent;
            document.getElementById('aiReplies').textContent = data.summary.aiRepliesSent;
            document.getElementById('activeChats').textContent = data.summary.activeConversations;

            // Render 7-day chart
            renderBarChart(data.last7Days);

            // Render top conversations
            renderTopConversations(data.topConversations);
        } catch (error) {
            console.error('Error loading analytics:', error);
        }
    }

    function renderBarChart(data) {
        const chartContainer = document.getElementById('barChart');
        chartContainer.innerHTML = '';

        if (!data || data.length === 0) {
            chartContainer.innerHTML = '<div style="text-align: center; color: #999;">No data yet</div>';
            return;
        }

        var maxValue = Math.max.apply(Math, data.map(function(d) { return (d.messagesSent || 0) + (d.messagesReceived || 0); }).concat([1]));

        data.forEach(function(day) {
            var total = (day.messagesSent || 0) + (day.messagesReceived || 0);
            var heightPercent = (total / maxValue) * 100;
            var date = new Date(day.date);
            var dayLabel = date.toLocaleDateString('en-US', { weekday: 'short' });

            var barContainer = document.createElement('div');
            barContainer.className = 'bar-container';

            var barValue = document.createElement('div');
            barValue.className = 'bar-value';
            barValue.textContent = total;

            var bar = document.createElement('div');
            bar.className = 'bar';
            bar.style.height = heightPercent + '%';
            bar.title = total + ' messages on ' + day.date;

            var label = document.createElement('div');
            label.className = 'bar-label';
            label.textContent = dayLabel;

            barContainer.appendChild(barValue);
            barContainer.appendChild(bar);
            barContainer.appendChild(label);
            chartContainer.appendChild(barContainer);
        });
    }

    function renderTopConversations(conversations) {
        const container = document.getElementById('topConversations');

        if (!conversations || conversations.length === 0) {
            container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">No conversation data yet</div>';
            return;
        }

        container.innerHTML = '';
        conversations.forEach(function(conv, index) {
            var row = document.createElement('div');
            row.className = 'conversation-row';

            var info = document.createElement('div');
            info.className = 'conversation-info';

            var uuid = document.createElement('div');
            uuid.className = 'conversation-uuid';
            uuid.textContent = '#' + (index + 1) + ' - ' + conv.uuid.substring(0, 16) + '...';

            var stats = document.createElement('div');
            stats.className = 'conversation-stats';

            var sent = document.createElement('div');
            sent.className = 'stat-item';
            sent.innerHTML = '<div class="stat-item-label">Sent</div><div class="stat-item-value">' + conv.messagesSent + '</div>';

            var received = document.createElement('div');
            received.className = 'stat-item';
            received.innerHTML = '<div class="stat-item-label">Received</div><div class="stat-item-value">' + conv.messagesReceived + '</div>';

            var ai = document.createElement('div');
            ai.className = 'stat-item';
            ai.innerHTML = '<div class="stat-item-label">AI</div><div class="stat-item-value">' + conv.aiReplies + '</div>';

            stats.appendChild(sent);
            stats.appendChild(received);
            stats.appendChild(ai);

            info.appendChild(uuid);
            row.appendChild(info);
            row.appendChild(stats);
            container.appendChild(row);
        });
    }

    // Track AI messages sent
    async function trackAIMessage(conversationUuid) {
        try {
            await fetch('/api/analytics/track-ai-message', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ conversationUuid })
            });
        } catch (error) {
            console.error('Error tracking AI message:', error);
        }
    }

    // ============================================
    // MEDIA CONTROL PANEL FUNCTIONS
    // ============================================

    function toggleMediaControlPanel() {
        const panel = document.getElementById('mediaControlPanel');
        const isOpen = panel.style.display === 'block';

        if (isOpen) {
            panel.style.display = 'none';
        } else {
            panel.style.display = 'block';
            loadMediaControlStats();
            if (currentConversationUuid) {
                loadMediaControlQueue(currentConversationUuid);
            }
        }
    }

    async function loadMediaControlStats() {
        try {
            const response = await fetch('/api/media-control/stats');
            const data = await response.json();

            if (data.success) {
                document.getElementById('vaultTotalItems').textContent = data.totalItems || 0;
                document.getElementById('vaultSFWCount').textContent = data.sfwCount || 0;
                document.getElementById('vaultPPVCount').textContent = data.ppvCount || 0;
            }
        } catch (error) {
            console.error('[Media Control] Error loading stats:', error);
        }
    }

    async function loadMediaControlQueue(conversationUuid) {
        const subscriberInfo = document.getElementById('mediaControlSubscriberInfo');
        const freeQueueList = document.getElementById('freeQueueList');
        const ppvQueueList = document.getElementById('ppvQueueList');
        const sentMediaList = document.getElementById('sentMediaList');

        if (!conversationUuid) {
            subscriberInfo.innerHTML = '<p style="margin: 0; color: #999; text-align: center;">Select a conversation to view media queue</p>';
            freeQueueList.innerHTML = '<p style="margin: 0; color: #999; text-align: center; font-size: 12px;">No conversation selected</p>';
            ppvQueueList.innerHTML = '<p style="margin: 0; color: #999; text-align: center; font-size: 12px;">No conversation selected</p>';
            sentMediaList.innerHTML = '<p style="margin: 0; color: #999; text-align: center; font-size: 12px;">No conversation selected</p>';
            return;
        }

        try {
            const response = await fetch('/api/media-control/queue/' + conversationUuid);
            const data = await response.json();

            if (data.success) {
                // Update subscriber info
                subscriberInfo.innerHTML = '<div style="font-size: 13px; color: #666;">Subscriber: <strong>' + conversationUuid.substring(0, 12) + '...</strong></div>';

                // Update stats
                document.getElementById('sentFreeCount').textContent = data.stats.freeSent || 0;
                document.getElementById('sentPPVCount').textContent = data.stats.ppvSent || 0;

                // Update PPV pricing
                document.getElementById('currentPPVPrice').textContent = '$' + data.ppvPricing.currentPrice;
                document.getElementById('ppvPurchaseCount').textContent = data.ppvPricing.purchaseCount || 0;
                document.getElementById('ppvPricingTier').textContent = 'Tier ' + (data.ppvPricing.tier || 0);

                // Helper function to render queue item with icon and skip button (dark theme)
                function renderQueueItem(item, index, isNext, type) {
                    const bgColor = type === 'free' ? 'rgba(0,200,83,0.15)' : 'rgba(255,152,0,0.15)';
                    const borderColor = type === 'free' ? '#00c853' : '#ff9800';
                    const skipBtnColor = '#f44336';
                    const textColor = '#fff';
                    const mutedColor = '#808080';

                    // Media type icon
                    var icon = '📄';
                    var mediaType = (item.mediaType || 'media').toLowerCase();
                    if (mediaType === 'image' || mediaType === 'photo') icon = '🖼️';
                    else if (mediaType === 'video') icon = '🎬';
                    else if (mediaType === 'audio') icon = '🎵';

                    // Clean up the name for display
                    var displayName = (item.name || 'Unnamed').replace(/^(SFW_|PPV_)/i, '').substring(0, 30);

                    return '<div style="padding: 10px 12px; border-bottom: 1px solid #333; font-size: 13px; display: flex; align-items: center; gap: 10px; transition: background 0.2s; color: ' + textColor + '; ' + (isNext ? 'background: ' + bgColor + '; border-left: 3px solid ' + borderColor + ';' : '') + '">' +
                        '<span style="font-size: 18px; flex-shrink: 0;">' + icon + '</span>' +
                        '<div style="flex: 1; min-width: 0;">' +
                            '<div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: ' + (isNext ? '600' : '400') + ';" title="' + (item.name || 'Unnamed') + '">' +
                                (isNext ? '▶ ' : '') + displayName +
                            '</div>' +
                            '<div style="font-size: 10px; color: ' + mutedColor + '; margin-top: 2px;">' +
                                mediaType + (isNext ? ' • NEXT UP' : ' • #' + (index + 1)) +
                            '</div>' +
                        '</div>' +
                        '<button onclick="skipMediaItem(\'' + item.uuid + '\')" style="background: ' + skipBtnColor + '; color: white; border: none; border-radius: 4px; padding: 4px 8px; font-size: 11px; cursor: pointer; flex-shrink: 0; opacity: 0.8;" title="Skip this item">Skip</button>' +
                    '</div>';
                }

                // Render free queue
                if (data.freeQueue && data.freeQueue.length > 0) {
                    freeQueueList.innerHTML = '<div>' + data.freeQueue.map(function(item, index) {
                        return renderQueueItem(item, index, index === 0, 'free');
                    }).join('') + '</div>';
                    freeQueueList.innerHTML += '<div style="padding: 8px; text-align: center; color: #00c853; font-size: 11px; font-weight: 500;">' + data.stats.freeRemaining + ' remaining in queue</div>';
                } else {
                    freeQueueList.innerHTML = '<p style="margin: 0; color: #808080; text-align: center; font-size: 12px; padding: 20px;">All free content sent!</p>';
                }

                // Render PPV queue
                if (data.ppvQueue && data.ppvQueue.length > 0) {
                    ppvQueueList.innerHTML = '<div>' + data.ppvQueue.map(function(item, index) {
                        return renderQueueItem(item, index, index === 0, 'ppv');
                    }).join('') + '</div>';
                    ppvQueueList.innerHTML += '<div style="padding: 8px; text-align: center; color: #ff9800; font-size: 11px; font-weight: 500;">' + data.stats.ppvRemaining + ' remaining in queue</div>';
                } else {
                    ppvQueueList.innerHTML = '<p style="margin: 0; color: #999; text-align: center; font-size: 12px; padding: 20px;">All PPV content sent!</p>';
                }

                // Render sent media list
                const allSent = (data.sentFree || []).concat(data.sentPPV || []);
                if (allSent.length > 0) {
                    sentMediaList.innerHTML = allSent.slice(0, 10).map(function(item) {
                        const isPPV = (data.sentPPV || []).some(function(p) { return p.uuid === item.uuid; });
                        return '<div style="padding: 4px 8px; border-bottom: 1px solid rgba(0,0,0,0.05); font-size: 11px;" title="UUID: ' + item.uuid + '">' +
                            '<span style="color: ' + (isPPV ? '#f57c00' : '#28a745') + ';">' + (isPPV ? '💰' : '🆓') + '</span> ' +
                            (item.name || 'Unnamed').substring(0, 30) +
                            '</div>';
                    }).join('');
                    if (allSent.length > 10) {
                        sentMediaList.innerHTML += '<div style="padding: 4px 8px; text-align: center; color: #999; font-size: 11px;">...and ' + (allSent.length - 10) + ' more</div>';
                    }
                } else {
                    sentMediaList.innerHTML = '<p style="margin: 0; color: #999; text-align: center; font-size: 12px;">No media sent yet</p>';
                }

                // Render skipped items section if any
                const skippedSection = document.getElementById('skippedItemsSection');
                if (data.skippedItems && data.skippedItems.length > 0) {
                    if (!skippedSection) {
                        // Create skipped section if it doesn't exist
                        const sentSection = sentMediaList.parentElement;
                        const newSection = document.createElement('div');
                        newSection.id = 'skippedItemsSection';
                        newSection.style.marginTop = '15px';
                        sentSection.parentElement.insertBefore(newSection, sentSection.nextSibling);
                    }
                    const section = document.getElementById('skippedItemsSection');
                    section.innerHTML = '<h4 style="margin: 0 0 10px 0; color: #6c757d; font-size: 14px;">⏭️ Skipped Items (' + data.skippedItems.length + ')</h4>' +
                        '<div style="background: #f8f9fa; border-radius: 8px; padding: 10px; max-height: 100px; overflow-y: auto;">' +
                        data.skippedItems.slice(0, 10).map(function(item) {
                            return '<div style="padding: 4px 8px; border-bottom: 1px solid rgba(0,0,0,0.05); font-size: 11px; display: flex; align-items: center; justify-content: space-between;" title="UUID: ' + item.uuid + '">' +
                                '<span style="color: #6c757d; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">' +
                                    (item.name || 'Unnamed').substring(0, 25) +
                                '</span>' +
                                '<button onclick="unskipMediaItem(\'' + item.uuid + '\')" style="background: #28a745; color: white; border: none; border-radius: 4px; padding: 2px 6px; font-size: 10px; cursor: pointer; margin-left: 5px;" title="Restore to queue">↩</button>' +
                                '</div>';
                        }).join('') +
                        '</div>';
                } else if (skippedSection) {
                    skippedSection.innerHTML = '';
                }
            }
        } catch (error) {
            console.error('[Media Control] Error loading queue:', error);
            subscriberInfo.innerHTML = '<p style="margin: 0; color: #e74c3c; text-align: center;">Error loading data</p>';
        }
    }

    // Skip a media item for this subscriber
    async function skipMediaItem(mediaUuid) {
        if (!currentConversationUuid) {
            alert('No conversation selected');
            return;
        }

        try {
            const response = await fetch('/api/media-control/skip/' + currentConversationUuid, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaUuid })
            });
            const data = await response.json();

            if (data.success) {
                // Refresh the queue display
                loadMediaControlQueue(currentConversationUuid);
            } else {
                alert('Error skipping media: ' + data.error);
            }
        } catch (error) {
            console.error('[Media Control] Skip error:', error);
            alert('Error skipping media');
        }
    }
    // Make it globally accessible for onclick
    window.skipMediaItem = skipMediaItem;

    // Restore a skipped media item to the queue
    async function unskipMediaItem(mediaUuid) {
        if (!currentConversationUuid) {
            alert('No conversation selected');
            return;
        }

        try {
            const response = await fetch('/api/media-control/unskip/' + currentConversationUuid, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ mediaUuid })
            });
            const data = await response.json();

            if (data.success) {
                // Refresh the queue display
                loadMediaControlQueue(currentConversationUuid);
            } else {
                alert('Error restoring media: ' + data.error);
            }
        } catch (error) {
            console.error('[Media Control] Unskip error:', error);
            alert('Error restoring media');
        }
    }
    // Make it globally accessible for onclick
    window.unskipMediaItem = unskipMediaItem;

    async function refreshVaultFromControlPanel() {
        const btn = document.getElementById('refreshVaultBtn');
        if (btn) {
            btn.disabled = true;
            btn.textContent = '⏳ Refreshing...';
        }

        try {
            const response = await fetch('/api/media-control/refresh-vault', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' }
            });
            const data = await response.json();

            if (data.success) {
                alert('Vault refreshed! Loaded ' + data.itemsLoaded + ' items.');
                loadMediaControlStats();
                if (currentConversationUuid) {
                    loadMediaControlQueue(currentConversationUuid);
                }
            } else {
                alert('Error refreshing vault: ' + data.error);
            }
        } catch (error) {
            console.error('[Media Control] Refresh error:', error);
            alert('Error refreshing vault');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = '🔄 Refresh Vault';
            }
        }
    }

    async function resetSubscriberTracking() {
        if (!currentConversationUuid) {
            alert('Please select a conversation first');
            return;
        }

        if (!confirm('Are you sure you want to reset media tracking for this subscriber? This will allow all media to be sent again.')) {
            return;
        }

        try {
            const response = await fetch('/api/media-control/reset/' + currentConversationUuid, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ resetType: 'all' })
            });
            const data = await response.json();

            if (data.success) {
                alert('Tracking reset successfully!');
                loadMediaControlQueue(currentConversationUuid);
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('[Media Control] Reset error:', error);
            alert('Error resetting tracking');
        }
    }

    async function resetAllTracking() {
        if (!confirm('⚠️ WARNING: This will reset ALL media tracking for ALL subscribers. This cannot be undone. Are you absolutely sure?')) {
            return;
        }

        const confirmText = prompt('Type "RESET ALL" to confirm:');
        if (confirmText !== 'RESET ALL') {
            alert('Reset cancelled.');
            return;
        }

        try {
            const response = await fetch('/api/media-control/reset-all', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ confirmReset: 'CONFIRM_RESET_ALL' })
            });
            const data = await response.json();

            if (data.success) {
                alert('All tracking has been reset!');
                loadMediaControlStats();
                if (currentConversationUuid) {
                    loadMediaControlQueue(currentConversationUuid);
                }
            } else {
                alert('Error: ' + data.error);
            }
        } catch (error) {
            console.error('[Media Control] Reset all error:', error);
            alert('Error resetting all tracking');
        }
    }

    window.addEventListener('load', async function() {
        // Attach all event listeners
        var refreshBtn = document.getElementById('refreshButton');
        if (refreshBtn) refreshBtn.addEventListener('click', loadConversations);
        var convSelect = document.getElementById('conversationSelect');
        if (convSelect) convSelect.addEventListener('change', function() {
            if (this.value) {
                loadMessages(this.value);
            }
        });
        var msgSearch = document.getElementById('messageSearch');
        if (msgSearch) msgSearch.addEventListener('input', filterMessages);
        var aiModeSelect = document.getElementById('aiModeSelect');
        if (aiModeSelect) aiModeSelect.addEventListener('change', function() {
            changeAIMode(this.value);
        });
        var fastModeToggle = document.getElementById('fastModeToggle');
        if (fastModeToggle) fastModeToggle.addEventListener('change', toggleFastMode);
        var sysPromptBtn = document.getElementById('systemPromptButton');
        if (sysPromptBtn) sysPromptBtn.addEventListener('click', toggleSystemPrompt);
        var savePromptBtn = document.getElementById('savePromptButton');
        if (savePromptBtn) savePromptBtn.addEventListener('click', saveAdvancedSettings);
        var msgInput = document.getElementById('messageInput');
        if (msgInput) msgInput.addEventListener('keypress', handleKeyPress);
        var sendBtn = document.getElementById('sendButton');
        if (sendBtn) sendBtn.addEventListener('click', sendMessage);
        var profileToggleBtn = document.getElementById('profileToggleBtn');
        if (profileToggleBtn) profileToggleBtn.addEventListener('click', toggleProfileSidebar);
        var creatorToggleBtn = document.getElementById('creatorToggleBtn');
        if (creatorToggleBtn) creatorToggleBtn.addEventListener('click', toggleCreatorSidebar);
        var analyticsBtn = document.getElementById('analyticsBtn');
        if (analyticsBtn) analyticsBtn.addEventListener('click', toggleAnalytics);
        var profileCloseBtn = document.getElementById('profileCloseBtnSidebar');
        if (profileCloseBtn) profileCloseBtn.addEventListener('click', toggleProfileSidebar);
        var generateProfileBtn = document.getElementById('generateProfileBtn');
        if (generateProfileBtn) generateProfileBtn.addEventListener('click', generateUserProfile);
        var saveNotesBtn = document.getElementById('saveNotesBtn');
        if (saveNotesBtn) saveNotesBtn.addEventListener('click', saveSubscriberNotes);
        var generateMemoryBtn = document.getElementById('generateMemoryBtn');
        if (generateMemoryBtn) generateMemoryBtn.addEventListener('click', generateSubscriberMemory);
        var creatorCloseBtn = document.getElementById('creatorCloseBtnSidebar');
        if (creatorCloseBtn) creatorCloseBtn.addEventListener('click', toggleCreatorSidebar);
        var savePersonaBtn = document.getElementById('savePersonaBtn');
        if (savePersonaBtn) savePersonaBtn.addEventListener('click', saveCreatorProfile);
        var analyticsCloseBtn = document.getElementById('analyticsCloseBtn');
        if (analyticsCloseBtn) analyticsCloseBtn.addEventListener('click', toggleAnalytics);

        // AI suggestion box buttons
        var useSuggestionBtn = document.getElementById('useSuggestionBtn');
        if (useSuggestionBtn) useSuggestionBtn.addEventListener('click', sendSuggestion);
        var editSuggestionBtn = document.getElementById('editSuggestionBtn');
        if (editSuggestionBtn) editSuggestionBtn.addEventListener('click', copyToInput);
        var dismissSuggestionBtn = document.getElementById('dismissSuggestionBtn');
        if (dismissSuggestionBtn) dismissSuggestionBtn.addEventListener('click', dismissSuggestion);
        var regenerateSuggestionBtn = document.getElementById('regenerateSuggestionBtn');
        if (regenerateSuggestionBtn) regenerateSuggestionBtn.addEventListener('click', regenerateSuggestion);

        // Auto-reply preview controls
        var cancelAutoReplyBtn = document.getElementById('cancelAutoReplyBtn');
        if (cancelAutoReplyBtn) cancelAutoReplyBtn.addEventListener('click', cancelAutoReply);
        var sendNowBtn = document.getElementById('sendNowBtn');
        if (sendNowBtn) sendNowBtn.addEventListener('click', sendPreviewNow);

        // Vault awareness controls
        var vaultAwarenessCheckbox = document.getElementById('vaultAwarenessEnabled');
        if (vaultAwarenessCheckbox) vaultAwarenessCheckbox.addEventListener('change', toggleVaultAwareness);
        var refreshVaultBtn = document.getElementById('refreshVaultBtn');
        if (refreshVaultBtn) refreshVaultBtn.addEventListener('click', refreshVaultLibrary);
        var saveFolderBtn = document.getElementById('saveFolderSettingsBtn');
        if (saveFolderBtn) saveFolderBtn.addEventListener('click', saveFolderSettings);

        // Tip tracking controls
        var tipTrackingCheckbox = document.getElementById('tipTrackingEnabled');
        if (tipTrackingCheckbox) tipTrackingCheckbox.addEventListener('change', toggleTipTracking);
        var markTipRequestBtn = document.getElementById('markTipRequestBtn');
        if (markTipRequestBtn) markTipRequestBtn.addEventListener('click', markTipRequested);
        var recordTipBtn = document.getElementById('recordTipBtn');
        if (recordTipBtn) recordTipBtn.addEventListener('click', recordTipReceived);

        // PPV controls
        var ppvAwarenessCheckbox = document.getElementById('ppvAwarenessEnabled');
        if (ppvAwarenessCheckbox) ppvAwarenessCheckbox.addEventListener('change', togglePPVAwareness);
        var recordPPVSentBtn = document.getElementById('recordPPVSentBtn');
        if (recordPPVSentBtn) recordPPVSentBtn.addEventListener('click', recordPPVSent);
        var recordPPVPurchasedBtn = document.getElementById('recordPPVPurchasedBtn');
        if (recordPPVPurchasedBtn) recordPPVPurchasedBtn.addEventListener('click', recordPPVPurchased);

        // PPV Send controls
        var ppvPriceInput = document.getElementById('ppvPriceInput');
        if (ppvPriceInput) ppvPriceInput.addEventListener('input', updatePPVButtonPrice);
        var sendPPVBtn = document.getElementById('sendPPVBtn');
        if (sendPPVBtn) sendPPVBtn.addEventListener('click', sendPPV);
        var sendFreeMediaBtn = document.getElementById('sendFreeMediaBtn');
        if (sendFreeMediaBtn) sendFreeMediaBtn.addEventListener('click', sendFreeMedia);

        // Media Control Panel controls
        var mediaControlBtn = document.getElementById('mediaControlBtn');
        if (mediaControlBtn) mediaControlBtn.addEventListener('click', toggleMediaControlPanel);
        var mediaControlClose = document.getElementById('mediaControlClose');
        if (mediaControlClose) mediaControlClose.addEventListener('click', toggleMediaControlPanel);
        var refreshVaultCtrlBtn = document.getElementById('refreshVaultBtn');
        if (refreshVaultCtrlBtn) refreshVaultCtrlBtn.addEventListener('click', refreshVaultFromControlPanel);
        var resetTrackingBtn = document.getElementById('resetTrackingBtn');
        if (resetTrackingBtn) resetTrackingBtn.addEventListener('click', resetSubscriberTracking);
        var resetAllTrackingBtn = document.getElementById('resetAllTrackingBtn');
        if (resetAllTrackingBtn) resetAllTrackingBtn.addEventListener('click', resetAllTracking);

        console.log('[window.load] Event listeners attached');
    });

document.addEventListener('DOMContentLoaded', async function() {
    console.log('[DOMContentLoaded] Starting initialization...');

    // Initialize PPV button state
    if (typeof updatePPVButtonPrice === 'function') updatePPVButtonPrice();

    // Only load data if user is logged in
    const chatInterface = document.getElementById('conversationSelect');
    if (chatInterface) {
        // START AUTO-REFRESH IMMEDIATELY - before any async calls that might hang
        console.log('[DOMContentLoaded] Starting auto-refresh FIRST...');
        if (typeof startAutoRefresh === 'function') {
            startAutoRefresh();
            console.log('[DOMContentLoaded] Auto-refresh started!');
        }

        // Now load data (these might hang but auto-refresh is already running)
        console.log('[DOMContentLoaded] User is logged in, loading data...');

        // Load these in parallel to speed up, don't block each other
        Promise.all([
            getMyUserUuid().then(() => console.log('[Init] getMyUserUuid done')),
            loadAISettings().then(() => console.log('[Init] loadAISettings done')),
            loadCreatorPersona().then(() => console.log('[Init] loadCreatorPersona done')),
            (typeof loadPPVMediaDropdown === 'function' ? loadPPVMediaDropdown() : Promise.resolve()).then(() => console.log('[Init] loadPPVMediaDropdown done'))
        ]).then(() => {
            console.log('[Init] All async loading complete');
        }).catch(err => {
            console.error('[Init] Error during parallel loading:', err);
        });

        // These don't need to wait
        loadConversations();
        if (typeof loadContentRequests === 'function') loadContentRequests();
    } else {
        console.log('[App] Not logged in - skipping data load');
    }
});
