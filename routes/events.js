const express = require('express');
const { body } = require('express-validator');
const {
  getEvents,
  getTrendingEvents,
  getEventById,
  createEvent,
  updateEvent,
  deleteEvent,
  registerForEvent,
  saveEvent,
  getMyEvents
} = require('../controllers/eventController');
const { protect, optionalAuth, isOrganizer } = require('../middleware/auth');
const { upload, handleUploadError } = require('../middleware/upload');

const router = express.Router();

// Validation rules
const eventValidation = [
  body('title')
    .trim()
    .notEmpty().withMessage('Title is required')
    .isLength({ max: 100 }).withMessage('Title cannot exceed 100 characters'),
  body('description')
    .trim()
    .notEmpty().withMessage('Description is required'),
  body('category')
    .notEmpty().withMessage('Category is required')
    .isIn([
      'Technology', 'Business', 'Music', 'Sports', 'Arts',
      'Food', 'Health', 'Education', 'Entertainment', 'Networking', 'Other'
    ]).withMessage('Invalid category'),
  body('location.address')
    .trim()
    .notEmpty().withMessage('Address is required'),
  body('date')
    .notEmpty().withMessage('Date is required')
    .isISO8601().withMessage('Invalid date format'),
  body('capacity')
    .notEmpty().withMessage('Capacity is required')
    .isInt({ min: 1 }).withMessage('Capacity must be at least 1')
];

// Public routes
router.get('/', optionalAuth, getEvents);
router.get('/trending', getTrendingEvents);
router.get('/my-events', protect, isOrganizer, getMyEvents);
router.get('/:id', optionalAuth, getEventById);

// Protected routes
router.post(
  '/',
  protect,
  isOrganizer,
  upload.single('image'),
  handleUploadError,
  eventValidation,
  createEvent
);

router.put(
  '/:id',
  protect,
  isOrganizer,
  upload.single('image'),
  handleUploadError,
  eventValidation,
  updateEvent
);

router.delete('/:id', protect, isOrganizer, deleteEvent);
router.post('/:id/register', protect, registerForEvent);
router.post('/:id/save', protect, saveEvent);

module.exports = router;
