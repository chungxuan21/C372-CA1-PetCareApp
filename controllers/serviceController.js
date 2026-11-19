const petModel = require('../models/petModel');
const serviceModel = require('../models/serviceModel');
const serviceBookingModel = require('../models/serviceBookingModel');

// Exact messages from specs/service-booking.md section 7
const MSG_SUCCESS = 'Booking created. Payment is pending; no payment has been processed.';
const MSG_INVALID = 'Choose a pet, service, and valid booking date.';
const MSG_UNAVAILABLE = 'That pet or service is unavailable for booking.';
const MSG_DB_ERROR = 'Unable to create the booking. Please try again.';

// Today's LOCAL date as YYYY-MM-DD (not UTC - Singapore is UTC+8)
function getToday() {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${mm}-${dd}`;
}

// "1", "25" are valid; "", "0", "-1", "1.5", "abc" are not
function isPositiveInteger(value) {
  return typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
}

// Must be YYYY-MM-DD, a real calendar date, and today or later
function isValidBookingDate(value, today) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const isRealDate = date.getFullYear() === year &&
    date.getMonth() === month - 1 &&
    date.getDate() === day;
  if (!isRealDate) return false;
  return value >= today; // same YYYY-MM-DD format, so text comparison works
}

// GET /services - booking form with the owner's pets and active services
function listServices(req, res) {
  const ownerId = req.session.user.id;

  petModel.getPetsByOwner(ownerId, (err, pets) => {
    if (err) {
      console.error('Error loading pets:', err);
      return res.status(500).send('Unable to load pets.');
    }

    serviceModel.getActiveServices((err2, services) => {
      if (err2) {
        console.error('Error loading services:', err2);
        return res.status(500).send('Unable to load services.');
      }

      // Preselect a pet only if it belongs to this owner
      const requestedPetId = req.query.petId;
      let selectedPetId = '';
      if (requestedPetId && pets.some((p) => String(p.id) === requestedPetId)) {
        selectedPetId = requestedPetId;
      }

      res.render('services', {
        pets,
        services,
        selectedPetId,
        today: getToday(),
        messages: req.flash('success'),
        errors: req.flash('error'),
        session: req.session
      });
    });
  });
}

// POST /services/book - validate, then save booking + payment in one transaction
function createBooking(req, res) {
  const ownerId = req.session.user.id; // always from the session, never the form
  const { petId, serviceId, bookingDate } = req.body;

  if (!isPositiveInteger(petId) || !isPositiveInteger(serviceId) ||
      !isValidBookingDate(bookingDate, getToday())) {
    req.flash('error', MSG_INVALID);
    return res.redirect('/services');
  }

  serviceBookingModel.createPendingBooking(
    ownerId, Number(petId), Number(serviceId), bookingDate,
    (err, result) => {
      if (err) {
        console.error('Error creating booking:', err);
        req.flash('error', MSG_DB_ERROR);
        return res.redirect(`/services?petId=${petId}`);
      }

      if (!result) {
        req.flash('error', MSG_UNAVAILABLE);
        return res.redirect('/services');
      }

      req.flash('success', MSG_SUCCESS);
      return res.redirect('/bookings');
    }
  );
}

// Revision 2 (spec section 14): the only statuses the filter accepts
const ALLOWED_STATUSES = ['pending', 'cancelled'];

// GET /bookings?status=... - Booking History for the signed-in owner only
function listBookings(req, res) {
  const ownerId = req.session.user.id; // from the session, never from the URL

  // Allowed list: anything that is not exactly 'pending' or 'cancelled' means All
  const requested = req.query.status;
  const currentStatus = ALLOWED_STATUSES.includes(requested) ? requested : 'all';
  const statusFilter = currentStatus === 'all' ? null : currentStatus;

  serviceBookingModel.getBookingsByOwner(ownerId, statusFilter, (err, bookings) => {
    if (err) {
      console.error('Error loading booking history:', err);
      return res.status(500).send('Unable to load booking history.');
    }

    res.render('bookings', {
      bookings,
      currentStatus,
      messages: req.flash('success'),
      errors: req.flash('error'),
      session: req.session
    });
  });
}

// POST /bookings/:id/cancel - Revision 1 (spec section 11)
function cancelBooking(req, res) {
  const ownerId = req.session.user.id; // from the session, never from the request
  const bookingId = req.params.id;

  if (!isPositiveInteger(bookingId)) {
    req.flash('error', 'That booking cannot be cancelled.');
    return res.redirect('/bookings');
  }

  serviceBookingModel.cancelPendingBooking(ownerId, Number(bookingId), (err, result) => {
    if (err) {
      console.error('Error cancelling booking:', err);
      req.flash('error', 'Unable to cancel the booking. Please try again.');
      return res.redirect('/bookings');
    }
    if (!result) {
      req.flash('error', 'That booking cannot be cancelled.');
      return res.redirect('/bookings');
    }
    req.flash('success', 'Booking cancelled. No payment was collected.');
    return res.redirect('/bookings');
  });
}

// Exact messages from specs/service-booking.md section 12
const MSG_RESCHEDULED = 'Booking rescheduled. Payment is still pending.';
const MSG_BAD_DATE = 'Choose a valid booking date (today or later).';
const MSG_CANNOT_RESCHEDULE = 'That booking cannot be rescheduled.';
const MSG_RESCHEDULE_ERROR = 'Unable to reschedule the booking. Please try again.';

// GET /bookings/:id/reschedule - show the form for the owner's own pending booking
function rescheduleForm(req, res) {
  const ownerId = req.session.user.id; // from the session, never from the request
  const bookingId = req.params.id;

  if (!isPositiveInteger(bookingId)) {
    req.flash('error', MSG_CANNOT_RESCHEDULE);
    return res.redirect('/bookings');
  }

  serviceBookingModel.getPendingBookingForOwner(ownerId, Number(bookingId), (err, booking) => {
    if (err) {
      console.error('Error loading booking to reschedule:', err);
      req.flash('error', MSG_RESCHEDULE_ERROR);
      return res.redirect('/bookings');
    }
    if (!booking) {
      req.flash('error', MSG_CANNOT_RESCHEDULE);
      return res.redirect('/bookings');
    }
    res.render('rescheduleBooking', {
      booking,
      today: getToday(),
      errors: req.flash('error'),
      session: req.session
    });
  });
}

// POST /bookings/:id/reschedule - validate the new date, then change booking_date only
function rescheduleBooking(req, res) {
  const ownerId = req.session.user.id; // from the session, never from the request
  const bookingId = req.params.id;
  const { bookingDate } = req.body;

  if (!isPositiveInteger(bookingId)) {
    req.flash('error', MSG_CANNOT_RESCHEDULE);
    return res.redirect('/bookings');
  }

  // Same date rule as booking a service (section 4)
  if (!isValidBookingDate(bookingDate, getToday())) {
    req.flash('error', MSG_BAD_DATE);
    return res.redirect(`/bookings/${bookingId}/reschedule`); // back to the form
  }

  serviceBookingModel.reschedulePendingBooking(ownerId, Number(bookingId), bookingDate, (err, result) => {
    if (err) {
      console.error('Error rescheduling booking:', err);
      req.flash('error', MSG_RESCHEDULE_ERROR);
      return res.redirect('/bookings');
    }
    if (!result) {
      req.flash('error', MSG_CANNOT_RESCHEDULE);
      return res.redirect('/bookings');
    }
    req.flash('success', MSG_RESCHEDULED);
    return res.redirect('/bookings');
  });
}

module.exports = {
  listServices,
  createBooking,
  listBookings,
  cancelBooking,
  rescheduleForm,
  rescheduleBooking
};
