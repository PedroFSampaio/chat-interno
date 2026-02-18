require('dotenv').config();
const express = require('express');
const session = require('express-session');
const SQLiteStore = require('connect-sqlite3')(session);
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const cookieParser = require('cookie-parser');

const db = require('./db');
require('./initDb'); // Initialize DB

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const apiRoutes = require('./routes/api');

const app = express();
const server = createServer(app);
const io = new Server(server);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(session({
  store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
  secret: process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: false } // For local, no HTTPS
}));
app.use(express.static(path.join(__dirname, '..', 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));
app.set('view cache', false); // Disable view cache for development

// Routes
app.use('/', authRoutes);
app.use('/', adminRoutes);
app.use('/api', apiRoutes);

// Main chat page
app.get('/', (req, res) => {
  if (!req.session.userId) return res.redirect('/login');
  const user = { id: req.session.userId, name: req.session.name, role: req.session.role };
  console.log('[SERVER] Rendering chat for user:', user);
  res.render('chat', { user });
});

// Socket.IO
io.use((socket, next) => {
  // Wrap session middleware for Socket.IO
  const sessionMiddleware = session({
    store: new SQLiteStore({ db: 'sessions.db', dir: __dirname }),
    secret: process.env.SESSION_SECRET || 'secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false }
  });
  sessionMiddleware(socket.request, {}, next);
}).use((socket, next) => {
  const session = socket.request.session;
  if (session && session.userId) {
    socket.userId = session.userId;
    socket.username = session.username;
    socket.name = session.name;
    console.log(`[SOCKET] User authenticated: ${socket.name} (ID: ${socket.userId}, Socket: ${socket.id})`);
    return next();
  }
  console.log(`[SOCKET] Authentication failed for socket: ${socket.id}`);
  next(new Error('Authentication error'));
});

io.on('connection', (socket) => {
  console.log(`[SOCKET] User connected: ${socket.name} (ID: ${socket.userId})`);
  socket.join(`user:${socket.userId}`);
  console.log(`[SOCKET] Joined room: user:${socket.userId}`);

  socket.on('joinConversation', (conversationId) => {
    socket.join(conversationId);
    console.log(`[SOCKET] Joined conversation room: ${conversationId}`);
  });

  socket.on('markAsRead', (conversationId) => {
    db.run('UPDATE messages SET read_at = CURRENT_TIMESTAMP WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL', [conversationId, socket.userId], (err) => {
      if (err) console.error('[DB] Error marking as read:', err);
      updateConversationList(socket.userId, conversationId);
    });
  });

  socket.on('message:send', (data) => {
    console.log(`[SOCKET] message:send received from ${socket.name} (ID: ${socket.userId}):`, data);
    const { conversationId, type, content, fileName, filePath } = data;
    if (!content && type !== 'file') {
      console.log('[SOCKET] Invalid message: no content');
      return;
    }

    try {
      // Get recipient
      db.get('SELECT u.id as recipientId FROM conversation_members cm JOIN users u ON cm.user_id = u.id WHERE cm.conversation_id = ? AND u.id != ?', [conversationId, socket.userId], (err, row) => {
        if (err) {
          console.error('[DB] Error getting recipient:', err);
          return;
        }
        const recipientId = row ? row.recipientId : null;
        console.log(`[DB] Recipient ID: ${recipientId}`);

        // Save to DB
        db.run('INSERT INTO messages (conversation_id, sender_id, type, content, file_name, file_path) VALUES (?, ?, ?, ?, ?, ?)', [conversationId, socket.userId, type, content, fileName, filePath], function(err) {
          if (err) {
            console.error('[DB] Error inserting message:', err);
            return;
          }
          const messageId = this.lastID;
          console.log(`[DB] Message inserted with ID: ${messageId}`);

          // Validate insert
          db.get('SELECT m.*, u.name as sender_name FROM messages m JOIN users u ON m.sender_id = u.id WHERE m.id = ?', [messageId], (err, message) => {
            if (err) {
              console.error('[DB] Error validating insert:', err);
              return;
            }
            console.log('[DB] Validated message:', message);

            // Emit to both
            io.to(`user:${socket.userId}`).emit('message:new', { conversationId, message });
            console.log(`[SOCKET] Emitted message:new to sender: user:${socket.userId}`);
            if (recipientId) {
              io.to(`user:${recipientId}`).emit('message:new', { conversationId, message });
              console.log(`[SOCKET] Emitted message:new to recipient: user:${recipientId}`);
            }

            // Update conversation list
            updateConversationList(socket.userId, conversationId);
            if (recipientId) updateConversationList(recipientId, conversationId);
          });
        });
      });
    } catch (error) {
      console.error('[SOCKET] Error in message:send:', error);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[SOCKET] User disconnected: ${socket.name} (ID: ${socket.userId})`);
  });
});

// Start server
const PORT = process.env.PORT || 3002;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
});

function updateConversationList(userId, conversationId) {
  // Get last message and unread count
  db.get(`
    SELECT m.content, m.created_at, (SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND sender_id != ? AND read_at IS NULL) as unread
    FROM messages m WHERE m.conversation_id = ? ORDER BY m.created_at DESC LIMIT 1
  `, [conversationId, userId, conversationId], (err, lastMsg) => {
    if (err) return console.error(err);
    db.get('SELECT u.name FROM conversation_members cm JOIN users u ON cm.user_id = u.id WHERE cm.conversation_id = ? AND u.id != ?', [conversationId, userId], (err, other) => {
      if (err) return console.error(err);
      const payload = {
        id: conversationId,
        name: other ? other.name : 'Unknown',
        lastMessage: lastMsg ? lastMsg.content : '',
        lastAt: lastMsg ? lastMsg.created_at : '',
        unread: lastMsg ? lastMsg.unread : 0
      };
      io.to(`user:${userId}`).emit('conversation:upsert', payload);
    });
  });
}