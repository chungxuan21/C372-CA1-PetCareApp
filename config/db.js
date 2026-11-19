const mysql = require('mysql2');

// MySQL connection pool
// Credentials come from the .env file (never commit .env to GitHub).
// A pool lets each request (and each booking transaction) use its own
// connection, while pool.query() still works for the existing models.
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10
});

module.exports = pool;
