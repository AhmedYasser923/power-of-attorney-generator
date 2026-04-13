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

exports.renderLogin = (req, res) => {
  if (res.locals.user) return res.redirect('/');
  res.render('login', { title: 'Sign In' });
};

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('login', { title: 'Sign In', error: 'Please provide your email and password.' });
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select('+password');

  if (!user || !(await user.correctPassword(password, user.password))) {
    return res.render('login', { title: 'Sign In', error: 'Incorrect email or password.' });
  }

  if (user.status === 'pending') {
    return res.render('login', { title: 'Sign In', error: 'Your account is awaiting admin approval.' });
  }
  if (user.status === 'suspended') {
    return res.render('login', { title: 'Sign In', error: 'Your account has been suspended. Contact an administrator.' });
  }

  sendTokenCookie(user, res);
  User.findByIdAndUpdate(user._id, { lastSeen: new Date() }).exec();

  res.redirect('/');
});

exports.renderSignup = (req, res) => {
  if (res.locals.user) return res.redirect('/');
  res.render('signup', { title: 'Request Access' });
};

exports.signup = catchAsync(async (req, res, next) => {
  const { name, email, password, passwordConfirm } = req.body;

  if (!name || !email || !password || !passwordConfirm) {
    return res.render('signup', { title: 'Request Access', error: 'All fields are required.' });
  }
  if (password.length < 8) {
    return res.render('signup', { title: 'Request Access', error: 'Password must be at least 8 characters.' });
  }
  if (password !== passwordConfirm) {
    return res.render('signup', { title: 'Request Access', error: 'Passwords do not match.' });
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing) {
    return res.render('signup', { title: 'Request Access', error: 'This email is already registered.' });
  }

  const newUser = await User.create({
    name: name.trim(),
    email: email.toLowerCase().trim(),
    password,
    role: 'user',
    status: 'pending'
  });

  // Broadcast new signup to admin dashboard via Socket.io
  const io = req.app.get('io');
  if (io) {
    const { broadcastNewSignup } = require('../utils/socketManager');
    broadcastNewSignup(io, newUser);
  }

  res.render('signup', { title: 'Request Access', success: true });
});

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedout', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true
  });
  res.redirect('/login');
};
