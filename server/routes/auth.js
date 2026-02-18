const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const router = express.Router();

// Login page
router.get('/login', (req, res) => {
  if (req.session.userId) {
    return res.redirect('/');
  }
  res.render('login', { errorMessage: null });
});

// Login POST
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  db.get('SELECT * FROM users WHERE username = ?', [username], async (err, user) => {
    if (err) return res.status(500).send('Erro interno');
    if (user && await bcrypt.compare(password, user.password_hash)) {
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.name = user.name;
      req.session.role = user.role;
      res.redirect('/');
    } else {
      res.render('login', { errorMessage: 'Credenciais inválidas' });
    }
  });
});

// Logout
router.get('/logout', (req, res) => {
  console.log('[AUTH] Logout requested');
  req.session.destroy((err) => {
    if (err) {
      console.error('[AUTH] Error destroying session:', err);
      return res.status(500).send('Erro ao sair');
    }
    console.log('[AUTH] Session destroyed, redirecting to login');
    res.redirect('/login');
  });
});

module.exports = router;