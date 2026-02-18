const express = require('express');
const bcrypt = require('bcrypt');
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// Admin panel
router.get('/admin', requireAdmin, (req, res) => {
  db.all('SELECT id, name, username, role, created_at FROM users', [], (err, users) => {
    if (err) return res.status(500).send('Erro interno');
    res.render('admin', { users, errorMessage: null });
  });
});

// Create user
router.post('/admin/users', requireAdmin, async (req, res) => {
  const { name, username, password, role } = req.body;
  const hash = await bcrypt.hash(password, 10);
  db.run('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)', [name, username, hash, role], function(err) {
    if (err) {
      db.all('SELECT id, name, username, role, created_at FROM users', [], (err2, users) => {
        res.render('admin', { errorMessage: 'Erro ao criar usuário', users: users || [] });
      });
    } else {
      res.redirect('/admin');
    }
  });
});

// Delete user
router.post('/admin/users/:id/delete', requireAdmin, (req, res) => {
  const { id } = req.params;
  if (id == req.session.userId) {
    return res.status(400).send('Não pode deletar a si mesmo');
  }
  // Check if user is admin
  db.get('SELECT role FROM users WHERE id = ?', [id], (err, user) => {
    if (err) return res.status(500).send('Erro interno');
    if (user && user.role === 'admin') {
      return res.status(400).send('Não pode deletar usuário administrador');
    }
    db.run('DELETE FROM users WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).send('Erro interno');
      res.redirect('/admin');
    });
  });
});

// Reset password
router.post('/admin/users/:id/reset', requireAdmin, async (req, res) => {
  const { id } = req.params;
  const newPass = '123456'; // Simple reset
  const hash = await bcrypt.hash(newPass, 10);
  db.run('UPDATE users SET password_hash = ? WHERE id = ?', [hash, id], (err) => {
    if (err) return res.status(500).send('Erro interno');
    res.redirect('/admin');
  });
});

// Update user role
router.post('/admin/users/:id/role', requireAdmin, (req, res) => {
  const { id } = req.params;
  const { role } = req.body;
  if (!role || !['user', 'admin'].includes(role)) {
    return res.status(400).send('Cargo inválido');
  }
  if (id == req.session.userId) {
    return res.status(400).send('Não pode alterar seu próprio cargo');
  }
  db.run('UPDATE users SET role = ? WHERE id = ?', [role, id], (err) => {
    if (err) return res.status(500).send('Erro interno');
    res.redirect('/admin');
  });
});

module.exports = router;