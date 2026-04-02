const express = require('express');
const { protect, isAdmin } = require('../middleware/auth');
const {
  getDashboardStats,
  getAllUsers,
  updateUserRole,
  deleteUser,
  getAllEvents,
  updateEventStatus,
  deleteEvent,
  getAnalytics
} = require('../controllers/adminController');

const router = express.Router();

// All routes are protected and require admin role
router.use(protect, isAdmin);

// Dashboard stats
router.get('/stats', getDashboardStats);

// User management
router.get('/users', getAllUsers);
router.put('/users/:id/role', updateUserRole);
router.delete('/users/:id', deleteUser);

// Event management
router.get('/events', getAllEvents);
router.put('/events/:id/status', updateEventStatus);
router.delete('/events/:id', deleteEvent);

// Analytics
router.get('/analytics', getAnalytics);

module.exports = router;
