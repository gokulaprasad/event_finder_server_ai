const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Please provide an event title'],
    trim: true,
    maxlength: [100, 'Title cannot be more than 100 characters']
  },
  description: {
    type: String,
    required: [true, 'Please provide an event description'],
    maxlength: [2000, 'Description cannot be more than 2000 characters']
  },
  category: {
    type: String,
    required: [true, 'Please provide a category'],
    enum: [
      'Technology',
      'Business',
      'Music',
      'Sports',
      'Arts',
      'Food',
      'Health',
      'Education',
      'Entertainment',
      'Networking',
      'Other'
    ]
  },
  location: {
    address: {
      type: String,
      required: [true, 'Please provide an address']
    },
    coordinates: {
      lat: {
        type: Number,
        default: null
      },
      lng: {
        type: Number,
        default: null
      }
    }
  },
  date: {
    type: Date,
    required: [true, 'Please provide an event date']
  },
  endDate: {
    type: Date,
    default: null
  },
  organizer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  attendees: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    registeredAt: {
      type: Date,
      default: Date.now
    }
  }],
  capacity: {
    type: Number,
    required: [true, 'Please provide event capacity'],
    min: [1, 'Capacity must be at least 1']
  },
  image: {
    type: String,
    default: ''
  },
  price: {
    type: Number,
    default: 0,
    min: [0, 'Price cannot be negative']
  },
  isOnline: {
    type: Boolean,
    default: false
  },
  onlineLink: {
    type: String,
    default: ''
  },
  trendingScore: {
    type: Number,
    default: 0
  },
  views: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['draft', 'published', 'cancelled', 'completed'],
    default: 'published'
  },
  tags: [{
    type: String,
    trim: true
  }]
}, {
  timestamps: true
});

// Index for search functionality
eventSchema.index({ title: 'text', description: 'text', tags: 'text' });
eventSchema.index({ category: 1, date: 1 });
eventSchema.index({ trendingScore: -1 });

// Virtual for available spots
eventSchema.virtual('availableSpots').get(function() {
  return this.capacity - this.attendees.length;
});

// Virtual for isFull
eventSchema.virtual('isFull').get(function() {
  return this.attendees.length >= this.capacity;
});

// Method to calculate trending score
eventSchema.methods.calculateTrendingScore = function() {
  const now = new Date();
  const hoursSinceCreation = (now - this.createdAt) / (1000 * 60 * 60);
  const registrationsPerHour = this.attendees.length / (hoursSinceCreation || 1);
  const viewWeight = this.views * 0.1;
  
  // Score based on registration velocity, views, and recency
  this.trendingScore = (registrationsPerHour * 10) + viewWeight;
  return this.trendingScore;
};

// Method to check if user is registered
eventSchema.methods.isUserRegistered = function(userId) {
  return this.attendees.some(attendee => attendee.user.toString() === userId.toString());
};

// Method to register user
eventSchema.methods.registerUser = function(userId) {
  if (this.isFull) {
    throw new Error('Event is full');
  }
  if (this.isUserRegistered(userId)) {
    throw new Error('User already registered');
  }
  this.attendees.push({ user: userId });
  this.calculateTrendingScore();
  return this.save();
};

// Method to unregister user
eventSchema.methods.unregisterUser = function(userId) {
  this.attendees = this.attendees.filter(
    attendee => attendee.user.toString() !== userId.toString()
  );
  this.calculateTrendingScore();
  return this.save();
};

module.exports = mongoose.model('Event', eventSchema);
