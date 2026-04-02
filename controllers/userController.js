const { validationResult } = require('express-validator');
const User = require('../models/User');
const Event = require('../models/Event');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// @desc    Get user profile
// @route   GET /api/user/profile
// @access  Private
exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .populate('savedEvents', 'title date image location category status')
    .populate('registeredEvents', 'title date image location category status');

  res.json({
    success: true,
    data: user
  });
});

// @desc    Update user profile
// @route   PUT /api/user/profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const { name, interests, location, avatar } = req.body;

  const updateData = {};
  if (name) updateData.name = name;
  if (interests) updateData.interests = interests;
  if (location) updateData.location = location;
  if (avatar) updateData.avatar = avatar;

  const user = await User.findByIdAndUpdate(
    req.user.id,
    updateData,
    { new: true, runValidators: true }
  );

  res.json({
    success: true,
    message: 'Profile updated successfully',
    data: user
  });
});

// @desc    Get personalized recommendations
// @route   GET /api/user/recommendations
// @access  Private
exports.getRecommendations = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const { limit = 10 } = req.query;

  // Get user's interests and registered events
  const userInterests = user.interests || [];
  const registeredEventIds = user.registeredEvents.map(id => id.toString());
  const savedEventIds = user.savedEvents.map(id => id.toString());

  // Get categories of events user has registered for
  const registeredEvents = await Event.find({
    _id: { $in: user.registeredEvents }
  }).select('category');

  const registeredCategories = [...new Set(registeredEvents.map(e => e.category))];

  // Build recommendation query
  const query = {
    status: 'published',
    date: { $gte: new Date() },
    _id: { 
      $nin: [...registeredEventIds, ...savedEventIds] 
    }
  };

  // Find events
  let events = await Event.find(query)
    .populate('organizer', 'name avatar')
    .limit(parseInt(limit) * 2); // Get more to sort by relevance

  // Calculate relevance score for each event
  const scoredEvents = events.map(event => {
    let score = 0;

    // Interest match score (highest weight)
    const eventTags = event.tags || [];
    const interestMatches = userInterests.filter(interest => 
      eventTags.some(tag => tag.toLowerCase().includes(interest.toLowerCase())) ||
      event.category.toLowerCase().includes(interest.toLowerCase())
    ).length;
    score += interestMatches * 10;

    // Category match score based on past registrations
    if (registeredCategories.includes(event.category)) {
      score += 5;
    }

    // Trending score
    score += event.trendingScore * 0.5;

    // Upcoming events get a small boost
    const daysUntilEvent = (event.date - new Date()) / (1000 * 60 * 60 * 24);
    if (daysUntilEvent <= 7) {
      score += 2;
    }

    return { event, score };
  });

  // Sort by score and take top results
  const recommendations = scoredEvents
    .sort((a, b) => b.score - a.score)
    .slice(0, parseInt(limit))
    .map(item => ({
      ...item.event.toObject(),
      relevanceScore: item.score
    }));

  res.json({
    success: true,
    data: recommendations
  });
});

// @desc    Get user's saved events
// @route   GET /api/user/saved-events
// @access  Private
exports.getSavedEvents = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .populate({
      path: 'savedEvents',
      populate: {
        path: 'organizer',
        select: 'name avatar'
      }
    });

  res.json({
    success: true,
    data: user.savedEvents
  });
});

// @desc    Get user's registered events
// @route   GET /api/user/registered-events
// @access  Private
exports.getRegisteredEvents = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id)
    .populate({
      path: 'registeredEvents',
      populate: {
        path: 'organizer',
        select: 'name avatar'
      }
    });

  res.json({
    success: true,
    data: user.registeredEvents
  });
});

// @desc    Get user stats
// @route   GET /api/user/stats
// @access  Private
exports.getUserStats = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  // Get upcoming registered events count
  const upcomingEvents = await Event.countDocuments({
    _id: { $in: user.registeredEvents },
    date: { $gte: new Date() }
  });

  // Get past events count
  const pastEvents = await Event.countDocuments({
    _id: { $in: user.registeredEvents },
    date: { $lt: new Date() }
  });

  res.json({
    success: true,
    data: {
      savedEventsCount: user.savedEvents.length,
      registeredEventsCount: user.registeredEvents.length,
      upcomingEvents,
      pastEvents,
      interestsCount: user.interests.length
    }
  });
});
