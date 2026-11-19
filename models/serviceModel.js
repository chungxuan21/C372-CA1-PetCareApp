const pool = require('../config/db');

// Active services from the database (not the Lesson 5/6 mock catalogue)
function getActiveServices(callback) {
  const sql = 'SELECT id, name, price FROM services WHERE is_active = 1 ORDER BY name';
  pool.query(sql, callback);
}

module.exports = { getActiveServices };
