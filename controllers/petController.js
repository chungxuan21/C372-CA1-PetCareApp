const fs = require('fs');
const path = require('path');
const petModel = require('../models/petModel');

// Add Pet Form
function newPetForm(req, res) {
  res.render('newPet', { session: req.session });
}

// Handle Add Pet Submission
function createPet(req, res) {
  const { pet_name, species, breed, age } = req.body;
  let petImage;

  if (req.file) {
    petImage = req.file.filename; // use uploaded filename
  } else {
    petImage = null;
  }

  const ownerId = req.session.user.id;

  petModel.createPet(ownerId, pet_name, species, breed, age, petImage, (err) => {
    if (err) {
      console.error(err);
      return res.send('Failed to add pet.');
    }
    res.redirect('/journals');
  });
}

// "1", "25" are valid IDs; "", "0", "-1", "abc" are not
function isPositiveInteger(value) {
  return typeof value === 'string' && /^[1-9][0-9]*$/.test(value);
}

// Remove a just-uploaded file when we reject the request (keeps public/images clean)
function removeUploadedFile(file) {
  if (file) {
    fs.unlink(path.join('public', 'images', file.filename), () => {});
  }
}

// Check the edit form on the server (the browser checks can be bypassed)
function validatePetInput(body, file) {
  const name = (body.pet_name || '').trim();
  const species = (body.species || '').trim();
  const breed = (body.breed || '').trim();
  const ageText = (body.age || '').trim();

  if (!name || name.length > 80) return { error: 'Pet name is required (max 80 characters).' };
  if (!species || species.length > 50) return { error: 'Species is required (max 50 characters).' };
  if (!breed || breed.length > 80) return { error: 'Breed is required (max 80 characters).' };
  if (!/^[0-9]+$/.test(ageText) || Number(ageText) > 100) {
    return { error: 'Age must be a whole number from 0 to 100.' };
  }
  if (file && !file.mimetype.startsWith('image/')) {
    return { error: 'The new photo must be an image file.' };
  }
  return { name, species, breed, age: Number(ageText) };
}

// GET /pets/edit/:id - show the edit form for the owner's own pet
function editPetForm(req, res) {
  const ownerId = req.session.user.id; // from the session, never from the URL
  const petId = req.params.id;

  if (!isPositiveInteger(petId)) return res.status(404).send('Pet not found.');

  petModel.getPetByIdAndOwner(Number(petId), ownerId, (err, results) => {
    if (err) {
      console.error('Error loading pet:', err);
      return res.status(500).send('Unable to load pet.');
    }
    // Not found OR belongs to someone else -> same answer, so we do not reveal other users' pets
    if (results.length === 0) return res.status(404).send('Pet not found.');

    res.render('editPet', {
      pet: results[0],
      errors: req.flash('error'),
      session: req.session
    });
  });
}

// POST /pets/edit/:id - save changes for the owner's own pet
function updatePet(req, res) {
  const ownerId = req.session.user.id;
  const petId = req.params.id;

  if (!isPositiveInteger(petId)) {
    removeUploadedFile(req.file);
    return res.status(404).send('Pet not found.');
  }

  const input = validatePetInput(req.body, req.file);
  if (input.error) {
    removeUploadedFile(req.file);
    req.flash('error', input.error);
    return res.redirect(`/pets/edit/${petId}`);
  }

  // New photo only if one was uploaded; otherwise keep the old one
  const newImage = req.file ? req.file.filename : null;

  petModel.updatePet(Number(petId), ownerId, input.name, input.species, input.breed, input.age, newImage,
    (err, result) => {
      if (err) {
        console.error('Error updating pet:', err);
        removeUploadedFile(req.file);
        req.flash('error', 'Unable to update the pet. Please try again.');
        return res.redirect(`/pets/edit/${petId}`);
      }
      // 0 rows matched = not this owner's pet (or it does not exist)
      if (result.affectedRows === 0) {
        removeUploadedFile(req.file);
        return res.status(404).send('Pet not found.');
      }
      req.flash('success', 'Pet details updated.');
      res.redirect(`/journals?petId=${petId}`);
    });
}

module.exports = { newPetForm, createPet, editPetForm, updatePet };
