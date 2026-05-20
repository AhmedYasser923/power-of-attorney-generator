const jwt = require('jsonwebtoken');
const { promisify } = require('util');
const User = require('../models/User');
const AppError = require('../utils/appError');
const catchAsync = require('../utils/catchAsync');
const { TOKEN_RENEW_AFTER_DAYS, sendTokenCookie } = require('../controllers/authController');

exports.protect = catchAsync(async (req, res, next) => {
  const token = req.cookies && req.cookies.jwt;

  const isApiRoute = req.originalUrl.startsWith('/api');

  if (!token || token === 'loggedout') {
    if (isApiRoute) return next(new AppError('Not logged in. Please authenticate.', 401));
    return res.redirect('/login');
  }

  // isLoggedIn (global middleware) already verified this token, checked status,
  // and loaded the user - reuse it to avoid a second DB round-trip.
  if (req.user) return next();

  let decoded;
  try {
    decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
  } catch {
    if (isApiRoute) return next(new AppError('Invalid or expired session. Please log in again.', 401));
    return res.redirect('/login');
  }

  const user = await User.findById(decoded.id);
  if (!user) {
    if (isApiRoute) return next(new AppError('User no longer exists.', 401));
    return res.redirect('/login');
  }

  if (user.status === 'pending') {
    return next(new AppError('Your account is awaiting admin approval.', 403));
  }
  if (user.status === 'suspended') {
    return next(new AppError('Your account has been suspended. Contact an administrator.', 403));
  }

  if (user.changedPasswordAfter(decoded.iat)) {
    if (isApiRoute) return next(new AppError('Password was recently changed. Please log in again.', 401));
    return res.redirect('/login');
  }

  // Sliding session: renew token if older than threshold
  const tokenAgeDays = (Date.now() / 1000 - decoded.iat) / 86400;
  if (tokenAgeDays > TOKEN_RENEW_AFTER_DAYS) {
    sendTokenCookie(user, res, req);
  }

  req.user = user;
  res.locals.user = user;
  next();
});

exports.restrictTo = (...roles) => (req, res, next) => {
  if (!roles.includes(req.user.role)) {
    return next(new AppError('You do not have permission to perform this action.', 403));
  }
  next();
};

exports.isLoggedIn = async (req, res, next) => {
  try {
    const token = req.cookies && req.cookies.jwt;
    if (!token || token === 'loggedout') return next();

    const decoded = await promisify(jwt.verify)(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id);

    if (!user || user.status !== 'active' || user.changedPasswordAfter(decoded.iat)) {
      return next();
    }

    res.locals.user = user;
    req.user = user;
  } catch {
    // silently ignore
  }
  next();
};
