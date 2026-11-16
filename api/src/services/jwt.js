const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '8h';

function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: EXPIRES_IN });
}

function verifyToken(token) {
  return jwt.verify(token, SECRET);
}

// Cookies carry Secure unless NODE_ENV is exactly 'development'.
function cookieSecure() {
  return process.env.NODE_ENV !== 'development';
}

function setAuthCookie(res, payload) {
  const token = signToken(payload);
  res.cookie('pdash_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: cookieSecure(),
    maxAge: 8 * 60 * 60 * 1000, // 8h in ms
  });
}

function clearAuthCookie(res) {
  res.clearCookie('pdash_token');
}

module.exports = { cookieSecure, signToken, verifyToken, setAuthCookie, clearAuthCookie };
