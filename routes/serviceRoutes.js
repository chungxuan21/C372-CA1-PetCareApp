const express = require('express');
const router = express.Router();
const { isLoggedIn } = require('../middleware/auth');
const serviceController = require('../controllers/serviceController');

router.get('/services', isLoggedIn, serviceController.listServices);
router.post('/services/book', isLoggedIn, serviceController.createBooking);
router.get('/bookings', isLoggedIn, serviceController.listBookings);
router.post('/bookings/:id/cancel', isLoggedIn, serviceController.cancelBooking);
router.get('/bookings/:id/reschedule', isLoggedIn, serviceController.rescheduleForm);
router.post('/bookings/:id/reschedule', isLoggedIn, serviceController.rescheduleBooking);

module.exports = router;
