const requireAuth = (req, res, next) => {
  if (req.session.userId) {
    return next();
  }
  res.redirect('/login');
};

const requireAdmin = (req, res, next) => {
  if (req.session.userId && req.session.role === 'admin') {
    return next();
  }
  res.status(403).send('Acesso negado');
};

module.exports = { requireAuth, requireAdmin };