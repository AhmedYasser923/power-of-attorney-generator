const mongoose = require('mongoose');

const powerOfAttorneySchema = new mongoose.Schema({
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  address: {
    type: String,
    required: true
  },
  pnr: {
    type: String,
    required: true,
    
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('PowerOfAttorney', powerOfAttorneySchema);