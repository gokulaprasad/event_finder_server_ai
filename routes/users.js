const express = require('express');
const { body } = require('express-validator');
const {
  getProfile,
  updateProfile,
  getRecommendations,
  getSavedEvents,
  getRegisteredEvents,
  getUserStats
} = require('../controllers/userController');
const { protect } = require('../middleware/auth');

const router = express.Router();

// Validation rules
const profileValidation = [
  body('name')
    .optional()
    .trim()
    .isLength({ max: 50 }).withMessage('Name cannot exceed 50 characters'),
  body('interests')
    .optional()
    .isArray().withMessage('Interests must be an array'),
  body('location')
    .optional()
    .trim()
    .isLength({ max: 100 }).withMessage('Location cannot exceed 100 characters')
];

// All routes are protected
router.use(protect);

router.get('/profile', getProfile);
router.put('/profile', profileValidation, updateProfile);
router.get('/recommendations', getRecommendations);
router.get('/saved-events', getSavedEvents);
router.get('/registered-events', getRegisteredEvents);
router.get('/stats', getUserStats);

module.exports = router;
