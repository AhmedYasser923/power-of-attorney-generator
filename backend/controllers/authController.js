const jwt = require('jsonwebtoken');
const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '90d' });

const sendTokenCookie = (user, res) => {
  res.cookie('jwt', signToken(user._id), {
    expires: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict'
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
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.redirect('/login');
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

  if (!email || !password) {
    return res.status(400).json({ status: 'fail', message: 'Please provide your email and password.' });
  }

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

  sendTokenCookie(user, res);
  User.findByIdAndUpdate(user._id, { lastSeen: new Date() }).exec();

  res.status(200).json({ status: 'success', data: { user: serializeUser(user) } });
});

exports.apiSignup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm } = req.body;

  if (!name || !email || !password || !passwordConfirm) {
    return res.status(400).json({ status: 'fail', message: 'All fields are required.' });
  }
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
