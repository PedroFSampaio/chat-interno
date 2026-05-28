const socket = io();

// Current user
const currentUserId = window.CURRENT_USER ? window.CURRENT_USER.id : null;
if (!currentUserId) {
  console.error('[CLIENT] CURRENT_USER not defined, currentUserId is null');
  // Do not redirect to avoid loop, just log
}

// Socket connection logs
socket.on('connect', () => {
  console.log('[CLIENT] Socket connected:', socket.id);
});

socket.on('connect_error', (error) => {
  console.error('[CLIENT] Socket connect error:', error);
});

socket.on('disconnect', (reason) => {
  console.log('[CLIENT] Socket disconnected:', reason);
});

let currentConversationId = null;
let conversations = [];
let users = [];

// Load conversations
async function loadConversations() {
  const res = await fetch('/api/conversations');
  conversations = await res.json();
  renderConversationList();
}

// Load users
async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    if (!res.ok) {
      console.error('[CLIENT] Failed to load users:', res.status);
      return;
    }
    users = await res.json();
    console.log('[CLIENT] Loaded users:', users);
    renderUserList();
  } catch (error) {
    console.error('[CLIENT] Error loading users:', error);
  }
}

// Render user list
function renderUserList() {
  const list = document.getElementById('user-list');
  list.innerHTML = '';
  console.log('[CLIENT] Rendering user list with', users.length, 'users');
  users.forEach(user => {
    const li = document.createElement('li');
    li.textContent = user.name;
    li.onclick = () => {
      console.log('[CLIENT] Clicking user:', user.name);
      openOrCreateConversation(user.id, user.name);
    };
    list.appendChild(li);
  });
}

// Render conversation list
function renderConversationList() {
  const list = document.getElementById('conversation-list');
  list.innerHTML = '';
  conversations.forEach(conv => {
    const li = document.createElement('li');
    li.className = 'conversation-item';
    const preview = conv.lastMessage ? (conv.lastSenderId === currentUserId ? `Você: ${conv.lastMessage}` : conv.lastMessage) : 'Nova conversa';
    li.innerHTML = `
      <div class="avatar">${conv.name.charAt(0).toUpperCase()}</div>
      <div class="info">
        <div class="name">${conv.name}</div>
        <div class="preview">${preview}</div>
      </div>
      <div class="meta">
        <div class="time">${conv.lastAt ? new Date(conv.lastAt).toLocaleTimeString() : ''}</div>
        ${conv.unread > 0 ? `<div class="badge">${conv.unread}</div>` : ''}
      </div>
    `;
    li.onclick = () => openConversation(conv.id, conv.name);
    list.appendChild(li);
  });
}

// Open or create conversation
async function openOrCreateConversation(otherUserId, name) {
  const res = await fetch('/api/conversations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ otherUserId })
  });
  const data = await res.json();
  openConversation(data.id, name);
}

// Open conversation
async function openConversation(id, name) {
  currentConversationId = id;
  // reset unread for this conversation locally
  const conv = conversations.find(c => c.id == id);
  if (conv) {
    conv.unread = 0;
    renderConversationList();
    updateDocumentBadge();
  }
  document.getElementById('chat-header').textContent = name;
  socket.emit('joinConversation', id);
  socket.emit('markAsRead', id); // Mark as read
  const res = await fetch(`/api/conversations/${id}/messages`);
  const messages = await res.json();
  const messagesDiv = document.getElementById('messages');
  messagesDiv.innerHTML = '';
  messages.forEach(msg => {
    displayMessage(msg);
  });
  scrollToBottomIfNearEnd();
}

// Display message
function displayMessage(msg) {
  const messagesDiv = document.getElementById('messages');
  const div = document.createElement('div');
  console.log('[CLIENT] displayMessage: msg.sender_id:', msg.sender_id, 'currentUserId:', currentUserId, 'type:', typeof msg.sender_id, typeof currentUserId);
  const isMine = msg.sender_id === currentUserId;
  console.log('[CLIENT] isMine:', isMine);
  div.className = 'msg ' + (isMine ? 'me' : 'them');
  if (msg.type === 'text') {
    div.textContent = msg.content;
  } else {
    const link = document.createElement('a');
    link.href = `/api/download/${msg.file_path}`;
    link.textContent = `📎 ${msg.file_name}`;
    link.download = msg.file_name;
    div.appendChild(link);
  }
  messagesDiv.appendChild(div);
  scrollToBottomIfNearEnd();
}

// Scroll to bottom if near end
function scrollToBottomIfNearEnd() {
  const messagesDiv = document.getElementById('messages');
  const threshold = 100; // pixels from bottom
  const isNearBottom = messagesDiv.scrollHeight - messagesDiv.scrollTop - messagesDiv.clientHeight < threshold;
  if (isNearBottom) {
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }
}

// Send message
function sendMessage() {
  const input = document.getElementById('message-input');
  const content = input.value.trim();
  if (!content || !currentConversationId) {
    console.log('[CLIENT] Send aborted: no content or no conversation');
    return;
  }
  const payload = { conversationId: currentConversationId, type: 'text', content };
  console.log('[CLIENT] Sending message:', payload);
  socket.emit('message:send', payload);
  input.value = '';
  input.style.height = 'auto'; // Reset height
  scrollToBottomIfNearEnd();
}

// Attach file
document.getElementById('attach-btn').onclick = () => {
  document.getElementById('file-input').click();
};

document.getElementById('file-input').onchange = async (e) => {
  const file = e.target.files[0];
  if (!file || !currentConversationId) return;
  const formData = new FormData();
  formData.append('file', file);
  const res = await fetch('/api/upload', { method: 'POST', body: formData });
  const data = await res.json();
  const payload = {
    conversationId: currentConversationId,
    type: 'file',
    content: '',
    fileName: data.fileName,
    filePath: data.filePath
  };
  console.log('[CLIENT] Sending file message:', payload);
  socket.emit('message:send', payload);
};

// Input events
const messageInput = document.getElementById('message-input');
messageInput.addEventListener('input', function() {
  this.style.height = 'auto';
  this.style.height = this.scrollHeight + 'px';
});
messageInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    console.log('[CLIENT] Enter send triggered');
    sendMessage();
  }
});

// Send button
document.getElementById('send-btn').addEventListener('click', () => {
  console.log('[CLIENT] Send button clicked');
  sendMessage();
});

// Socket events
socket.on('message:new', (data) => {
  console.log('[CLIENT] Received message:new:', data);
  const { conversationId, message } = data;
  if (conversationId == currentConversationId) {
    displayMessage(message);
  }
  // Update conversation list
  loadConversations();
  // Notification / badge / title handling
  try {
    const isHidden = document.hidden;
    const hasFocus = document.hasFocus && document.hasFocus();
    const isNotVisible = isHidden || !hasFocus;
    const conv = conversations.find(c => c.id == conversationId);
    if (conv) conv.unread = (conv.unread || 0) + (conversationId == currentConversationId ? 0 : 1);
    renderConversationList();
    updateDocumentBadge();
    // Desktop notification
    if (conversationId != currentConversationId && isNotVisible) {
      if (Notification.permission === 'granted') {
        new Notification(`Nova mensagem de ${message.sender_name}`, { body: message.content || message.file_name });
      }
      playBeep();
      startTitleBlink(message.sender_name || 'Nova mensagem');
    } else if (conversationId != currentConversationId && !isHidden) {
      // Play a subtle sound even when visible
      playBeep();
    }
  } catch (e) {
    console.error('[CLIENT] Notification handling error:', e);
  }
});

socket.on('conversation:upsert', (conv) => {
  console.log('[CLIENT] Received conversation:upsert:', conv);
  const existing = conversations.find(c => c.id == conv.id);
  if (existing) {
    Object.assign(existing, conv);
  } else {
    conversations.unshift(conv);
  }
  renderConversationList();
  updateDocumentBadge();
});

// Notifications utilities and visibility handling
if ('Notification' in window) {
  Notification.requestPermission().catch(() => {});
}

let originalTitle = document.title;
let titleBlinkInterval = null;
let blinkCount = 0;

function startTitleBlink(name) {
  stopTitleBlink();
  blinkCount = 0;
  titleBlinkInterval = setInterval(() => {
    document.title = (document.title === originalTitle) ? `(${++blinkCount}) ${name}` : originalTitle;
  }, 1000);
}

function stopTitleBlink() {
  if (titleBlinkInterval) {
    clearInterval(titleBlinkInterval);
    titleBlinkInterval = null;
    document.title = originalTitle;
  }
}

function playBeep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 880;
    o.connect(g);
    g.connect(ctx.destination);
    g.gain.setValueAtTime(0.0001, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    setTimeout(() => { o.stop(); ctx.close(); }, 400);
  } catch (e) {
    console.warn('[CLIENT] beep failed:', e);
  }
}

function updateDocumentBadge() {
  const totalUnread = (conversations || []).reduce((s, c) => s + (c.unread || 0), 0);
  if (totalUnread > 0) {
    document.title = `(${totalUnread}) ` + originalTitle;
    setAppBadge(totalUnread);
  } else {
    document.title = originalTitle;
    clearAppBadge();
  }
}

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    // When user comes back, stop blinking and refresh conversations
    stopTitleBlink();
    loadConversations();
  }
});

// Window focus/blur to detect if user is outside the browser window
window.addEventListener('focus', () => {
  stopTitleBlink();
  loadConversations();
  clearAppBadge();
});

window.addEventListener('blur', () => {
  // nothing for now; presence check happens on incoming messages
});

// Badging API helpers (optional, supported on some platforms/browsers)
function setAppBadge(n) {
  try {
    if (navigator.setAppBadge) return navigator.setAppBadge(n);
  } catch (e) {
    console.warn('[CLIENT] setAppBadge failed:', e);
  }
}

function clearAppBadge() {
  try {
    if (navigator.clearAppBadge) return navigator.clearAppBadge();
  } catch (e) {
    console.warn('[CLIENT] clearAppBadge failed:', e);
  }
}

// Load on start
loadConversations();
loadUsers();

// Logout button
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
  logoutBtn.addEventListener('click', () => {
    console.log('[CLIENT] Logout button clicked');
    fetch('/logout', { method: 'GET' })
      .then(() => {
        console.log('[CLIENT] Logout successful, redirecting');
        window.location.href = '/login';
      })
      .catch(err => {
        console.error('[CLIENT] Logout failed:', err);
        window.location.href = '/login'; // Force redirect anyway
      });
  });
} else {
  console.error('[CLIENT] Logout button not found');
}