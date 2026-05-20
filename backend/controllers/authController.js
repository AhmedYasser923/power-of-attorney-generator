const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { assertEmail, assertString } = require('../middleware/validate');

const TOKEN_MAX_AGE_DAYS = 90;
const TOKEN_RENEW_AFTER_DAYS = 7;
const TOKEN_MAX_AGE_MS = TOKEN_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: `${TOKEN_MAX_AGE_DAYS}d` });

const isSecureRequest = (req) =>
  Boolean(req && (req.secure || req.headers?.['x-forwarded-proto'] === 'https')) ||
  process.env.NODE_ENV === 'production';

const cookieOptions = (req) => ({
  expires: new Date(Date.now() + TOKEN_MAX_AGE_MS),
  httpOnly: true,
  secure: isSecureRequest(req),
  sameSite: 'lax'
});

const sendTokenCookie = (user, res, req) => {
  res.cookie('jwt', signToken(user._id), cookieOptions(req));
};

const clearTokenCookie = (res, req) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
    secure: isSecureRequest(req),
    sameSite: 'lax'
  });
};

// Bootstrap admin from env on server start (idempotent)
exports.bootstrapAdmin = async () => {
  try {
    if (!process.env.ADMIN_NAME || !process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
      console.log('[Auth] Admin bootstrap skipped — ADMIN_NAME, ADMIN_EMAIL, or ADMIN_PASSWORD not set.');
      return;
    }
    const existing = await User.findOne({ email: process.env.ADMIN_EMAIL });
    if (existing) {
      console.log('[Auth] Admin account already exists.');
      return;
    }
    await User.create({
      name: process.env.ADMIN_NAME,
      email: process.env.ADMIN_EMAIL,
      password: process.env.ADMIN_PASSWORD,
      role: 'admin',
      status: 'active'
    });
    console.log(`[Auth] Admin bootstrapped: ${process.env.ADMIN_EMAIL}`);
  } catch (err) {
    console.error('[Auth] Bootstrap error:', err.message);
  }
};

exports.logout = (req, res) => {
  clearTokenCookie(res, req);
  res.redirect('/login');
};

exports.apiLogout = (req, res) => {
  clearTokenCookie(res, req);
  res.status(200).json({ status: 'success' });
};

// --- JSON API endpoints (used by React frontend) ---

const serializeUser = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  status: user.status
});

exports.apiLogin = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string') {
    return res.status(400).json({ status: 'fail', message: 'Invalid input.' });
  }
  if (!email || !password) {
    return res.status(400).json({ status: 'fail', message: 'Please provide your email and password.' });
  }
  assertEmail(email);
  assertString(password, 'Password', { maxLength: 256 });

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return res.status(401).json({ status: 'fail', message: 'Incorrect email or password.' });
  }

  if (user.status === 'pending') {
    return res.status(403).json({ status: 'fail', message: 'Your account is awaiting admin approval.' });
  }
  if (user.status === 'suspended') {
    return res.status(403).json({ status: 'fail', message: 'Your account has been suspended. Contact an administrator.' });
  }

  sendTokenCookie(user, res, req);
  User.findByIdAndUpdate(user._id, { lastSeen: new Date() }).exec();

  res.status(200).json({ status: 'success', data: { user: serializeUser(user) } });
});

exports.apiSignup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm } = req.body;

  if (typeof name !== 'string' || typeof email !== 'string' ||
      typeof password !== 'string' || typeof passwordConfirm !== 'string') {
    return res.status(400).json({ status: 'fail', message: 'All fields must be text.' });
  }
  if (!name || !email || !password || !passwordConfirm) {
    return res.status(400).json({ status: 'fail', message: 'All fields are required.' });
  }
  assertString(name, 'Name', { maxLength: 100 });
  assertEmail(email);
  assertString(password, 'Password', { maxLength: 256 });
  assertString(passwordConfirm, 'Password confirmation', { maxLength: 256 });
  if (password.length < 8) {
    return res.status(400).json({ status: 'fail', message: 'Password must be at least 8 characters.' });
  }
  if (password !== passwordConfirm) {
    return res.status(400).json({ status: 'fail', message: 'Passwords do not match.' });
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return res.status(400).json({ status: 'fail', message: 'This email is already registered.' });
  }

  await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role: 'user',
    status: 'pending'
  });

  res.status(201).json({ status: 'success', message: 'Your request was submitted and is awaiting admin approval.' });
});

exports.apiGetMe = (req, res) => {
  res.status(200).json({ status: 'success', data: { user: serializeUser(req.user) } });
};

exports.TOKEN_RENEW_AFTER_DAYS = TOKEN_RENEW_AFTER_DAYS;
exports.sendTokenCookie = sendTokenCookie;
