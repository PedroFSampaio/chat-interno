const db = require('./db');
const bcrypt = require('bcrypt');

// Create tables
const createTables = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          username TEXT UNIQUE NOT NULL,
          password_hash TEXT NOT NULL,
          role TEXT NOT NULL DEFAULT 'user',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          title TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS conversation_members (
          conversation_id INTEGER,
          user_id INTEGER,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          PRIMARY KEY (conversation_id, user_id)
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          conversation_id INTEGER NOT NULL,
          sender_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          content TEXT,
          file_name TEXT,
          file_path TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          read_at DATETIME,
          FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
          FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  });
};

// Seed admin user
const seedAdmin = async () => {
  const adminUser = process.env.ADMIN_USER || 'admin';
  const adminPass = process.env.ADMIN_PASS || 'admin123';

  return new Promise((resolve, reject) => {
    db.get('SELECT id FROM users WHERE username = ?', [adminUser], async (err, row) => {
      if (err) return reject(err);
      if (!row) {
        const hash = await bcrypt.hash(adminPass, 10);
        db.run('INSERT INTO users (name, username, password_hash, role) VALUES (?, ?, ?, ?)', ['Administrador', adminUser, hash, 'admin'], (err) => {
          if (err) reject(err);
          else {
            console.log('Admin user created');
            resolve();
          }
        });
      } else {
        resolve();
      }
    });
  });
};

// Create uploads directory if not exists
const createUploadsDir = () => {
  const fs = require('fs');
  const path = require('path');
  const uploadsDir = path.join(__dirname, '..', 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir);
  }
};

const init = async () => {
  try {
    await createTables();
    await seedAdmin();
    createUploadsDir();
    console.log('Database initialized');
  } catch (err) {
    console.error(err);
  }
};

init();