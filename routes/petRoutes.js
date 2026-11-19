const express = require('express');
const router = express.Router();
const upload = require('../config/upload');
const { isLoggedIn } = require('../middleware/auth');
const petController = require('../controllers/petController');

router.get('/pets/new', isLoggedIn, petController.newPetForm);
router.post('/pets', upload.single('pet_image'), isLoggedIn, petController.createPet);

// Edit pet: isLoggedIn runs BEFORE Multer, so a logged-out request cannot save a file
router.get('/pets/edit/:id', isLoggedIn, petController.editPetForm);
router.post('/pets/edit/:id', isLoggedIn, upload.single('pet_image'), petController.updatePet);

module.exports = router;
