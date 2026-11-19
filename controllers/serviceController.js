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

module.exports = { listServices, createBooking };
