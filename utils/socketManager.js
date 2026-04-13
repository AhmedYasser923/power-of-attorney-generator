const jwt = require('jsonwebtoken');
const { promisify } = require('util');

// Map<userId(string), Set<socketId>>
const onlineUsers = new Map();

let _io = null;

exports.initSocketManager = (io) => {
  _io = io;

  // Authenticate each socket connection via JWT cookie
  io.use(async (socket, next) => {
    try {
      const cookieHeader = socket.handshake.headers.cookie || '';
      const match = cookieHeader.match(/(?:^|;\s*)jwt=([^;]+)/);
      if (!match || match[1] === 'loggedout') return next(new Error('Unauthorized'));

      const decoded = await promisify(jwt.verify)(match[1], process.env.JWT_SECRET);

      const User = require('../models/User');
      const user = await User.findById(decoded.id);
      if (!user || user.status !== 'active') return next(new Error('Unauthorized'));

      socket.data.user = user;
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.data.user._id.toString();

    if (!onlineUsers.has(userId)) onlineUsers.set(userId, new Set());
    onlineUsers.get(userId).add(socket.id);

    socket.join(userId); // personal room for this user
    if (socket.data.user.role === 'admin') socket.join('admin');

    io.to('admin').emit('online_count', exports.getOnlineCount());

    socket.on('disconnect', () => {
      const set = onlineUsers.get(userId);
      if (set) {
        set.delete(socket.id);
        if (set.size === 0) onlineUsers.delete(userId);
      }
      io.to('admin').emit('online_count', exports.getOnlineCount());
    });
  });
};

exports.broadcastOperation = (io, logEntry) => {
  const opLabels = {
    ticket_analysis: 'Ticket Analysis',
    email_translation: 'Email Translation',
    poa_standard: 'POA (Standard)',
    poa_lufthansa: 'POA (Lufthansa)',
    poa_aerlingus: 'POA (Aer Lingus)',
    text_autofill: 'Text Autofill'
  };
  io.to('admin').emit('new_operation', {
    user: logEntry.userName,
    type: opLabels[logEntry.operationType] || logEntry.operationType,
    operationType: logEntry.operationType,
    costUSD: logEntry.costUSD,
    model: logEntry.model,
    metadata: logEntry.metadata,
    timestamp: logEntry.createdAt
  });
};

exports.broadcastNewSignup = (io, user) => {
  io.to('admin').emit('new_signup', {
    id: user._id,
    name: user.name,
    email: user.email,
    createdAt: user.createdAt
  });
};

exports.getOnlineCount = () => onlineUsers.size;
exports.getOnlineUserIds = () => [...onlineUsers.keys()];
exports.getIo = () => _io;
