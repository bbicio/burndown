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

// Attributes shared by every cookie the API sets; a clear passes the same ones so it matches the cookie.
function cookieOptions(opts) {
  return { httpOnly: true, secure: cookieSecure(), ...opts };
}

const AUTH_COOKIE = { sameSite: 'lax' };

function setAuthCookie(res, payload) {
  const token = signToken(payload);
  res.cookie('pdash_token', token, cookieOptions({ ...AUTH_COOKIE, maxAge: 8 * 60 * 60 * 1000 })); // 8h in ms
}

function clearAuthCookie(res) {
  res.clearCookie('pdash_token', cookieOptions(AUTH_COOKIE));
}

module.exports = { cookieSecure, cookieOptions, signToken, verifyToken, setAuthCookie, clearAuthCookie };
