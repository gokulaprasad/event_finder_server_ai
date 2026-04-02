const { validationResult } = require('express-validator');
const Event = require('../models/Event');
const User = require('../models/User');
const { AppError, asyncHandler } = require('../middleware/errorHandler');

// @desc    Get all events with filters and pagination
// @route   GET /api/events
// @access  Public
exports.getEvents = asyncHandler(async (req, res) => {
  const {
    page = 1,
    limit = 10,
    category,
    location,
    date,
    search,
    sortBy = 'date',
    order = 'asc'
  } = req.query;

  // Build query
  const query = { status: 'published' };

  // Category filter
  if (category && category !== 'All') {
    query.category = category;
  }

  // Location filter
  if (location) {
    query['location.address'] = { $regex: location, $options: 'i' };
  }

  // Date filter
  if (date) {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    query.date = { $gte: startOfDay, $lte: endOfDay };
  } else {
    // Default: show only future events
    query.date = { $gte: new Date() };
  }

  // Search filter
  if (search) {
    query.$text = { $search: search };
  }

  // Sort options
  const sortOptions = {};
  if (sortBy === 'trending') {
    sortOptions.trendingScore = -1;
  } else if (sortBy === 'date') {
    sortOptions.date = order === 'desc' ? -1 : 1;
  } else if (sortBy === 'created') {
    sortOptions.createdAt = -1;
  }

  // Execute query with pagination
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const events = await Event.find(query)
    .populate('organizer', 'name avatar')
    .sort(sortOptions)
    .skip(skip)
    .limit(parseInt(limit));

  const total = await Event.countDocuments(query);

  res.json({
    success: true,
    data: events,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

// @desc    Get trending events
// @route   GET /api/events/trending
// @access  Public
exports.getTrendingEvents = asyncHandler(async (req, res) => {
  const { limit = 6 } = req.query;

  const events = await Event.find({ 
    status: 'published',
    date: { $gte: new Date() }
  })
    .populate('organizer', 'name avatar')
    .sort({ trendingScore: -1, views: -1 })
    .limit(parseInt(limit));

  res.json({
    success: true,
    data: events
  });
});

// @desc    Get single event by ID
// @route   GET /api/events/:id
// @access  Public
exports.getEventById = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id)
    .populate('organizer', 'name avatar email')
    .populate('attendees.user', 'name avatar');

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  // Increment views
  event.views += 1;
  await event.save();

  // Check if current user is registered (if authenticated)
  let isRegistered = false;
  let isSaved = false;

  if (req.user) {
    isRegistered = event.isUserRegistered(req.user.id);
    const user = await User.findById(req.user.id);
    isSaved = user.savedEvents.includes(event._id);
  }

  res.json({
    success: true,
    data: {
      ...event.toObject(),
      isRegistered,
      isSaved
    }
  });
});

// @desc    Create new event
// @route   POST /api/events
// @access  Private (Organizers only)
exports.createEvent = asyncHandler(async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      errors: errors.array()
    });
  }

  const eventData = {
    ...req.body,
    organizer: req.user.id
  };

  // Handle image upload
  if (req.file) {
    eventData.image = `/uploads/${req.file.filename}`;
  }

  const event = await Event.create(eventData);

  await event.populate('organizer', 'name avatar');

  res.status(201).json({
    success: true,
    message: 'Event created successfully',
    data: event
  });
});

// @desc    Update event
// @route   PUT /api/events/:id
// @access  Private (Organizer only)
exports.updateEvent = asyncHandler(async (req, res) => {
  let event = await Event.findById(req.params.id);

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  // Check if user is the organizer
  if (event.organizer.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new AppError('Not authorized to update this event', 403);
  }

  const updateData = { ...req.body };

  // Handle image upload
  if (req.file) {
    updateData.image = `/uploads/${req.file.filename}`;
  }

  event = await Event.findByIdAndUpdate(
    req.params.id,
    updateData,
    { new: true, runValidators: true }
  ).populate('organizer', 'name avatar');

  res.json({
    success: true,
    message: 'Event updated successfully',
    data: event
  });
});

// @desc    Delete event
// @route   DELETE /api/events/:id
// @access  Private (Organizer only)
exports.deleteEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  // Check if user is the organizer
  if (event.organizer.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new AppError('Not authorized to delete this event', 403);
  }

  await event.deleteOne();

  res.json({
    success: true,
    message: 'Event deleted successfully'
  });
});

// @desc    Register for event
// @route   POST /api/events/:id/register
// @access  Private
exports.registerForEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  // Check if already registered
  if (event.isUserRegistered(req.user.id)) {
    // Unregister if already registered
    await event.unregisterUser(req.user.id);
    
    // Remove from user's registered events
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { registeredEvents: event._id }
    });

    return res.json({
      success: true,
      message: 'Successfully unregistered from event',
      data: { registered: false }
    });
  }

  // Check if event is full
  if (event.isFull) {
    throw new AppError('Event is full', 400);
  }

  // Register user
  await event.registerUser(req.user.id);

  // Add to user's registered events
  await User.findByIdAndUpdate(req.user.id, {
    $addToSet: { registeredEvents: event._id }
  });

  res.json({
    success: true,
    message: 'Successfully registered for event',
    data: { registered: true }
  });
});

// @desc    Save/unsave event
// @route   POST /api/events/:id/save
// @access  Private
exports.saveEvent = asyncHandler(async (req, res) => {
  const event = await Event.findById(req.params.id);

  if (!event) {
    throw new AppError('Event not found', 404);
  }

  const user = await User.findById(req.user.id);
  const isSaved = user.savedEvents.includes(event._id);

  if (isSaved) {
    // Remove from saved
    await User.findByIdAndUpdate(req.user.id, {
      $pull: { savedEvents: event._id }
    });

    return res.json({
      success: true,
      message: 'Event removed from saved',
      data: { saved: false }
    });
  } else {
    // Add to saved
    await User.findByIdAndUpdate(req.user.id, {
      $addToSet: { savedEvents: event._id }
    });

    return res.json({
      success: true,
      message: 'Event saved successfully',
      data: { saved: true }
    });
  }
});

// @desc    Get events created by user
// @route   GET /api/events/my-events
// @access  Private
exports.getMyEvents = asyncHandler(async (req, res) => {
  const events = await Event.find({ organizer: req.user.id })
    .populate('attendees.user', 'name avatar email')
    .sort({ createdAt: -1 });

  res.json({
    success: true,
    data: events
  });
});
