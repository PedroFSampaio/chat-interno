const express = require('express');
const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('../middleware/auth');
const router = express.Router();

// Configure multer for uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, '..', '..', 'uploads'));
  },
  filename: (req, file, cb) => {
    const uniqueName = uuidv4() + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.jpg', '.png', '.txt', '.xlsx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Tipo de arquivo não permitido'));
    }
  }
});

// Get users
router.get('/users', requireAuth, (req, res) => {
  console.log('[API] Getting users for userId:', req.session.userId);
  db.all('SELECT id, name FROM users WHERE id != ?', [req.session.userId], (err, users) => {
    if (err) {
      console.error('[API] Error getting users:', err);
      return res.status(500).json({ error: 'Erro interno' });
    }
    console.log('[API] Found users:', users);
    res.json(users);
  });
});

// Get conversations for user
router.get('/conversations', requireAuth, (req, res) => {
  const userId = req.session.userId;
  db.all(`
    SELECT c.id, u.name, 
           (SELECT m.content FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as lastMessage,
           (SELECT m.sender_id FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as lastSenderId,
           (SELECT m.created_at FROM messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as lastAt,
           (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.sender_id != ? AND m.read_at IS NULL) as unread
    FROM conversations c
    JOIN conversation_members cm ON c.id = cm.conversation_id
    JOIN users u ON (u.id = cm.user_id AND u.id != ?)
    WHERE c.id IN (SELECT conversation_id FROM conversation_members WHERE user_id = ?)
    ORDER BY lastAt DESC
  `, [userId, userId, userId], (err, conversations) => {
    if (err) return res.status(500).json({ error: 'Erro interno' });
    res.json(conversations);
  });
});

// Create or get DM conversation
router.post('/conversations', requireAuth, (req, res) => {
  const { otherUserId } = req.body;
  const userId = req.session.userId;
  if (userId == otherUserId) return res.status(400).json({ error: 'Não pode conversar consigo mesmo' });

  // Check if exists
  db.get(`
    SELECT c.id FROM conversations c
    JOIN conversation_members cm1 ON c.id = cm1.conversation_id AND cm1.user_id = ?
    JOIN conversation_members cm2 ON c.id = cm2.conversation_id AND cm2.user_id = ?
    WHERE c.type = 'dm'
  `, [userId, otherUserId], (err, row) => {
    if (err) return res.status(500).json({ error: 'Erro interno' });
    if (row) {
      return res.json({ id: row.id });
    }

    // Create new
    db.get('SELECT name FROM users WHERE id = ?', [otherUserId], (err, otherUser) => {
      if (err) return res.status(500).json({ error: 'Erro interno' });
      const title = `DM with ${otherUser.name}`;
      db.run('INSERT INTO conversations (type, title) VALUES (?, ?)', ['dm', title], function(err) {
        if (err) return res.status(500).json({ error: 'Erro interno' });
        const convId = this.lastID;
        db.run('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [convId, userId], (err) => {
          if (err) return res.status(500).json({ error: 'Erro interno' });
          db.run('INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?)', [convId, otherUserId], (err) => {
            if (err) return res.status(500).json({ error: 'Erro interno' });
            res.json({ id: convId });
          });
        });
      });
    });
  });
});

// Get messages for conversation
router.get('/conversations/:id/messages', requireAuth, (req, res) => {
  const { id } = req.params;
  const userId = req.session.userId;
  // Check if user is member
  db.get('SELECT * FROM conversation_members WHERE conversation_id = ? AND user_id = ?', [id, userId], (err, member) => {
    if (err) return res.status(500).json({ error: 'Erro interno' });
    if (!member) return res.status(403).json({ error: 'Acesso negado' });

    db.all(`
      SELECT m.*, u.name as sender_name
      FROM messages m
      JOIN users u ON m.sender_id = u.id
      WHERE m.conversation_id = ?
      ORDER BY m.created_at ASC
    `, [id], (err, messages) => {
      if (err) return res.status(500).json({ error: 'Erro interno' });
      res.json(messages);
    });
  });
});

// Upload file
router.post('/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });
  res.json({
    fileName: req.file.originalname,
    filePath: req.file.filename,
    size: req.file.size
  });
});

// Download file
router.get('/download/:filename', requireAuth, (req, res) => {
  const { filename } = req.params;
  const filePath = path.join(__dirname, '..', '..', 'uploads', filename);
  res.download(filePath);
});

// Get or create support conversation
router.get('/support', requireAuth, (req, res) => {
  const userId = req.session.userId;
  
  // Find admin user
  db.get('SELECT id FROM users WHERE role = ? LIMIT 1', ['admin'], (err, admin) => {
    if (err || !admin) {
      return res.status(500).json({ error: 'Admin não encontrado' });
    }
    
    // Check if support conversation exists
    db.get(`
      SELECT c.id FROM conversations c
      WHERE c.type = 'support' AND c.id IN (
        SELECT conversation_id FROM conversation_members WHERE user_id = ?
      )
    `, [userId], (err, conversation) => {
      if (err) return res.status(500).json({ error: 'Erro interno' });
      
      if (conversation) {
        // Conversation exists, return it
        return res.json({ id: conversation.id, isNew: false });
      }
      
      // Create new support conversation
      db.run(`
        INSERT INTO conversations (type) VALUES (?)
      `, ['support'], function(err) {
        if (err) return res.status(500).json({ error: 'Erro ao criar conversa' });
        
        const conversationId = this.lastID;
        
        // Add members (user and admin)
        db.run(`
          INSERT INTO conversation_members (conversation_id, user_id) VALUES (?, ?), (?, ?)
        `, [conversationId, userId, conversationId, admin.id], (err) => {
          if (err) return res.status(500).json({ error: 'Erro ao adicionar membros' });
          
          // Send welcome message
          const welcomeMsg = `Bem-vindo ao Suporte! 👋\n\nEsta é uma aba exclusiva para relatar bugs, solicitar melhorias e tirar dúvidas.\n\nPor favor, descreva seu problema ou sugestão de forma clara e detalhada.\n\nEquipe de Suporte`;
          
          db.run(`
            INSERT INTO messages (conversation_id, sender_id, type, content) VALUES (?, ?, ?, ?)
          `, [conversationId, admin.id, 'text', welcomeMsg], (err) => {
            if (err) return res.status(500).json({ error: 'Erro ao enviar mensagem' });
            res.json({ id: conversationId, isNew: true });
          });
        });
      });
    });
  });
});

module.exports = router;