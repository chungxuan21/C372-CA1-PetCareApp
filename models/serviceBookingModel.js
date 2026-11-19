const pool = require('../config/db');

// Roll back, release the connection, then report the original error.
function rollbackWithError(conn, err, callback) {
  conn.rollback(() => {
    conn.release();
    callback(err);
  });
}

// Create one pending booking and one pending payment in ONE transaction.
// Callback outcomes:
//   callback(null, { bookingId, paymentId })  -> both rows committed
//   callback(null, null)                      -> pet not owned / service not active
//   callback(err)                             -> database failure (rolled back)
function createPendingBooking(ownerId, petId, serviceId, bookingDate, callback) {
  pool.getConnection((err, conn) => {
    if (err) return callback(err);

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        return callback(err);
      }

      // Insert ONLY if the pet belongs to the signed-in owner AND the service is active.
      // The price is copied from services.price - never from the browser.
      const bookingSql = `
        INSERT INTO service_bookings (pet_id, service_id, booking_status, booked_price, booking_date)
        SELECT p.id, s.id, 'pending', s.price, ?
        FROM pets AS p
        JOIN services AS s ON s.id = ? AND s.is_active = 1
        WHERE p.id = ? AND p.owner_id = ?`;

      conn.query(bookingSql, [bookingDate, serviceId, petId, ownerId], (err, result) => {
        if (err) return rollbackWithError(conn, err, callback);

        // 0 rows inserted = not the owner's pet, or service unknown/inactive
        if (result.affectedRows !== 1) {
          return conn.rollback(() => {
            conn.release();
            callback(null, null);
          });
        }

        const bookingId = result.insertId;

        // Payment amount is copied from the booking's stored price
        const paymentSql = `
          INSERT INTO payments (booking_id, amount, payment_status)
          SELECT id, booked_price, 'pending' FROM service_bookings WHERE id = ?`;

        conn.query(paymentSql, [bookingId], (err, payResult) => {
          if (err) return rollbackWithError(conn, err, callback);

          conn.commit((err) => {
            if (err) return rollbackWithError(conn, err, callback);
            conn.release();
            callback(null, { bookingId, paymentId: payResult.insertId });
          });
        });
      });
    });
  });
}

// Booking History: only bookings for pets owned by this owner, newest first.
// LEFT JOIN payments keeps a booking visible even if it has no payment row.
// Revision 2: optional status filter. status is null (All) or a value the
// controller has already checked against its allowed list. It is still sent
// as a ? parameter, never joined into the SQL text.
function getBookingsByOwner(ownerId, status, callback) {
  const sql = `
    SELECT sb.id AS booking_id,
           DATE_FORMAT(sb.booking_date, '%Y-%m-%d') AS booking_date,
           p.name AS pet_name,
           s.name AS service_name,
           sb.booked_price,
           sb.booking_status,
           pay.payment_status,
           pay.payment_reference,
           sb.created_at
    FROM service_bookings AS sb
    JOIN pets AS p ON p.id = sb.pet_id
    JOIN services AS s ON s.id = sb.service_id
    LEFT JOIN payments AS pay ON pay.booking_id = sb.id
    WHERE p.owner_id = ?`;
  const params = [ownerId];

  let filterSql = '';
  if (status) {
    filterSql = ' AND sb.booking_status = ?';
    params.push(status);
  }

  const orderSql = ' ORDER BY sb.created_at DESC, sb.id DESC';
  pool.query(sql + filterSql + orderSql, params, callback);
}

// Revision 1: cancel the owner's own PENDING booking and its payment in ONE transaction.
// Callback outcomes:
//   callback(null, { bookingId })  -> booking and payment cancelled (committed)
//   callback(null, null)           -> not this owner's booking / not pending / not found
//   callback(err)                  -> database failure (rolled back)
function cancelPendingBooking(ownerId, bookingId, callback) {
  pool.getConnection((err, conn) => {
    if (err) return callback(err);

    conn.beginTransaction((err) => {
      if (err) {
        conn.release();
        return callback(err);
      }

      // Ownership + pending check are part of the UPDATE itself
      const bookingSql = `
        UPDATE service_bookings AS sb
        JOIN pets AS p ON p.id = sb.pet_id
        SET sb.booking_status = 'cancelled'
        WHERE sb.id = ? AND p.owner_id = ? AND sb.booking_status = 'pending'`;

      conn.query(bookingSql, [bookingId, ownerId], (err, result) => {
        if (err) return rollbackWithError(conn, err, callback);

        if (result.affectedRows !== 1) {
          return conn.rollback(() => {
            conn.release();
            callback(null, null);
          });
        }

        const paymentSql = `
          UPDATE payments SET payment_status = 'cancelled'
          WHERE booking_id = ? AND payment_status = 'pending'`;

        conn.query(paymentSql, [bookingId], (err) => {
          if (err) return rollbackWithError(conn, err, callback);

          conn.commit((err) => {
            if (err) return rollbackWithError(conn, err, callback);
            conn.release();
            callback(null, { bookingId });
          });
        });
      });
    });
  });
}

// Revision 1 (spec section 12): load ONE booking for the reschedule form.
// Returns the row only if the pet belongs to this owner AND the booking is pending.
function getPendingBookingForOwner(ownerId, bookingId, callback) {
  const sql = `
    SELECT sb.id AS booking_id,
           DATE_FORMAT(sb.booking_date, '%Y-%m-%d') AS booking_date,
           p.name AS pet_name,
           s.name AS service_name,
           sb.booked_price,
           sb.booking_status,
           pay.payment_status
    FROM service_bookings AS sb
    JOIN pets AS p ON p.id = sb.pet_id
    JOIN services AS s ON s.id = sb.service_id
    LEFT JOIN payments AS pay ON pay.booking_id = sb.id
    WHERE sb.id = ? AND p.owner_id = ? AND sb.booking_status = 'pending'`;
  pool.query(sql, [bookingId, ownerId], (err, rows) => {
    if (err) return callback(err);
    callback(null, rows.length ? rows[0] : null);
  });
}

// Revision 1 (spec section 12): change ONLY booking_date of the owner's pending booking.
// One UPDATE on one table, so no transaction is needed. The payments table is not touched.
// Callback outcomes:
//   callback(null, { bookingId })  -> date changed
//   callback(null, null)           -> not this owner's booking / not pending / not found
//   callback(err)                  -> database failure
function reschedulePendingBooking(ownerId, bookingId, newDate, callback) {
  const sql = `
    UPDATE service_bookings AS sb
    JOIN pets AS p ON p.id = sb.pet_id
    SET sb.booking_date = ?
    WHERE sb.id = ? AND p.owner_id = ? AND sb.booking_status = 'pending'`;
  pool.query(sql, [newDate, bookingId, ownerId], (err, result) => {
    if (err) return callback(err);
    if (result.affectedRows !== 1) return callback(null, null);
    callback(null, { bookingId });
  });
}

module.exports = {
  createPendingBooking,
  getBookingsByOwner,
  cancelPendingBooking,
  getPendingBookingForOwner,
  reschedulePendingBooking
};
