const connection = require('../config/db');

function createPet(ownerId, name, species, breed, age, image, callback) {
  const sql = 'INSERT INTO pets (owner_id, name, species, breed, age, image) VALUES (?, ?, ?, ?, ?, ?)';
  connection.query(sql, [ownerId, name, species, breed, age, image], callback);
}

function getPetsByOwner(ownerId, callback) {
  const sql = 'SELECT * FROM pets WHERE owner_id = ?';
  connection.query(sql, [ownerId], callback);
}

// Get one pet ONLY if it belongs to this owner (empty result = not found / not yours)
function getPetByIdAndOwner(petId, ownerId, callback) {
  const sql = 'SELECT * FROM pets WHERE id = ? AND owner_id = ?';
  connection.query(sql, [petId, ownerId], callback);
}

// Update a pet ONLY if it belongs to this owner.
// If image is null, the existing photo is kept.
function updatePet(petId, ownerId, name, species, breed, age, image, callback) {
  let sql;
  let params;
  if (image) {
    sql = 'UPDATE pets SET name = ?, species = ?, breed = ?, age = ?, image = ? WHERE id = ? AND owner_id = ?';
    params = [name, species, breed, age, image, petId, ownerId];
  } else {
    sql = 'UPDATE pets SET name = ?, species = ?, breed = ?, age = ? WHERE id = ? AND owner_id = ?';
    params = [name, species, breed, age, petId, ownerId];
  }
  connection.query(sql, params, callback);
}

module.exports = {
  createPet,
  getPetsByOwner,
  getPetByIdAndOwner,
  updatePet
};
