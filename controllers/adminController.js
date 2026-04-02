const User = require('../models/User');
const Event = require('../models/Event');
const Message = require('../models/Message');
const { asyncHandler } = require('../middleware/errorHandler');

// @desc    Get dashboard statistics
// @route   GET /api/admin/stats
// @access  Private (Admin only)
exports.getDashboardStats = asyncHandler(async (req, res) => {
  const now = new Date();
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

  // User stats
  const totalUsers = await User.countDocuments();
  const newUsersThisMonth = await User.countDocuments({
    createdAt: { $gte: thirtyDaysAgo }
  });
  const organizers = await User.countDocuments({ role: 'organizer' });

  // Event stats
  const totalEvents = await Event.countDocuments();
  const upcomingEvents = await Event.countDocuments({
    date: { $gte: now },
    status: 'published'
  });
  const pastEvents = await Event.countDocuments({
    date: { $lt: now }
  });

  // Registration stats
  const allEvents = await Event.find();
  const totalRegistrations = allEvents.reduce(
    (sum, event) => sum + event.attendees.length, 0
  );

  // Message stats
  const totalMessages = await Message.countDocuments();

  // Recent activity
  const recentUsers = await User.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .select('name email role createdAt');

  const recentEvents = await Event.find()
    .sort({ createdAt: -1 })
    .limit(5)
    .populate('organizer', 'name')
    .select('title category date status');

  res.json({
    success: true,
    data: {
      users: {
        total: totalUsers,
        newThisMonth: newUsersThisMonth,
        organizers,
        regularUsers: totalUsers - organizers
      },
      events: {
        total: totalEvents,
        upcoming: upcomingEvents,
        past: pastEvents
      },
      registrations: totalRegistrations,
      messages: totalMessages,
      recentActivity: {
        users: recentUsers,
        events: recentEvents
      }
    }
  });
});

// @desc    Get all users with pagination
// @route   GET /api/admin/users
// @access  Private (Admin only)
exports.getAllUsers = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search = '', role = '' } = req.query;

  const query = {};
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } }
    ];
  }
  if (role) {
    query.role = role;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const users = await User.find(query)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const total = await User.countDocuments(query);

  res.json({
    success: true,
    data: users,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    }
  });
});

// @desc    Update user role
// @route   PUT /api/admin/users/:id/role
// @access  Private (Admin only)
exports.updateUserRole = asyncHandler(async (req, res) => {
  const { role } = req.body;
  const userId = req.params.id;

  if (!['user', 'organizer', 'admin'].includes(role)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid role'
    });
  }

  // Prevent admin from demoting themselves
  if (userId === req.user.id && role !== 'admin') {
    return res.status(400).json({
      success: false,
      message: 'Cannot change your own admin role'
    });
  }

  const user = await User.findByIdAndUpdate(
    userId,
    { role },
    { new: true }
  ).select('-password');

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  res.json({
    success: true,
    message: 'User role updated successfully',
    data: user
  });
});

// @desc    Delete user
// @route   DELETE /api/admin/users/:id
// @access  Private (Admin only)
exports.deleteUser = asyncHandler(async (req, res) => {
  const userId = req.params.id;

  // Prevent admin from deleting themselves
  if (userId === req.user.id) {
    return res.status(400).json({
      success: false,
      message: 'Cannot delete your own account'
    });
  }

  const user = await User.findByIdAndDelete(userId);

  if (!user) {
    return res.status(404).json({
      success: false,
      message: 'User not found'
    });
  }

  // Remove user from events
  await Event.updateMany(
    {},
    { $pull: { attendees: { user: userId } } }
  );

  // Delete user's messages
  await Message.deleteMany({ sender: userId });

  res.json({
    success: true,
    message: 'User deleted successfully'
  });
});

// @desc    Get all events with pagination
// @route   GET /api/admin/events
// @access  Private (Admin only)
exports.getAllEvents = asyncHandler(async (req, res) => {
  const { page = 1, limit = 10, search = '', status = '' } = req.query;

  const query = {};
  if (search) {
    query.$or = [
      { title: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }
  if (status) {
    query.status = status;
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const events = await Event.find(query)
    .populate('organizer', 'name email')
    .sort({ createdAt: -1 })
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

// @desc    Update event status
// @route   PUT /api/admin/events/:id/status
// @access  Private (Admin only)
exports.updateEventStatus = asyncHandler(async (req, res) => {
  const { status } = req.body;
  const eventId = req.params.id;

  if (!['draft', 'published', 'cancelled'].includes(status)) {
    return res.status(400).json({
      success: false,
      message: 'Invalid status'
    });
  }

  const event = await Event.findByIdAndUpdate(
    eventId,
    { status },
    { new: true }
  ).populate('organizer', 'name email');

  if (!event) {
    return res.status(404).json({
      success: false,
      message: 'Event not found'
    });
  }

  res.json({
    success: true,
    message: 'Event status updated successfully',
    data: event
  });
});

// @desc    Delete event (admin can delete any event)
// @route   DELETE /api/admin/events/:id
// @access  Private (Admin only)
exports.deleteEvent = asyncHandler(async (req, res) => {
  const eventId = req.params.id;

  const event = await Event.findByIdAndDelete(eventId);

  if (!event) {
    return res.status(404).json({
      success: false,
      message: 'Event not found'
    });
  }

  // Delete associated messages
  await Message.deleteMany({ eventId });

  res.json({
    success: true,
    message: 'Event deleted successfully'
  });
});

// @desc    Get analytics data
// @route   GET /api/admin/analytics
// @access  Private (Admin only)
exports.getAnalytics = asyncHandler(async (req, res) => {
  const { period = '30' } = req.query; // days
  const daysAgo = parseInt(period);
  const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);

  // User growth over time
  const userGrowth = await User.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Event creation over time
  const eventGrowth = await Event.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        },
        count: { $sum: 1 }
      }
    },
    { $sort: { _id: 1 } }
  ]);

  // Top categories
  const topCategories = await Event.aggregate([
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 }
      }
    },
    { $sort: { count: -1 } },
    { $limit: 5 }
  ]);

  // Most popular events
  const popularEvents = await Event.find()
    .sort({ 'attendees.length': -1, views: -1 })
    .limit(5)
    .populate('organizer', 'name')
    .select('title category attendees views');

  res.json({
    success: true,
    data: {
      userGrowth,
      eventGrowth,
      topCategories,
      popularEvents
    }
  });
});
