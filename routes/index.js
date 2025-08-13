// routes.js
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

const userModel = require('./users');
const postModel = require('./posts');
const upload = require('./multer');

// ===== Passport Config =====
passport.use(new LocalStrategy(userModel.authenticate()));
passport.serializeUser(userModel.serializeUser());
passport.deserializeUser(userModel.deserializeUser());

// ===== Rate Limiter for Auth =====
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	message: 'Too many login/register attempts. Please try again later.',
});

// ===== Middleware =====
function isLoggedIn(req, res, next) {
	if (req.isAuthenticated()) return next();
	res.redirect('/login');
}

// ===== Routes =====

// Auth Pages
router.get(['/', '/login'], (req, res) => {
	res.render('index', {
		error: req.flash('error') || '',
	});
});

// Feed Page
router.get('/feed', isLoggedIn, async (req, res) => {
	const user = await userModel.findOne({ username: req.user.username });
	const posts = await postModel.find().populate('user');
	res.render('feed', { user, posts });
});

// Profile Page
router.get('/profile', isLoggedIn, async (req, res) => {
	const user = await userModel
		.findOne({ username: req.user.username })
		.populate('posts');

	res.render('profile', { user });
});

router.get('/allpins', isLoggedIn, async (req, res) => {
	const user = await userModel
		.findOne({ username: req.user.username })
		.populate('posts');

	res.render('pins', { user });
});

// File Uploads
router.post(
	'/fileupload',
	isLoggedIn,
	upload.single('image'),
	async (req, res) => {
		const user = await userModel.findOne({
			username: req.session.passport.user,
		});
		user.profileimage = req.file.filename;
		await user.save();
		res.redirect('/profile');
	},
);

router.post('/upload', isLoggedIn, upload.single('file'), async (req, res) => {
	if (!req.file) return res.status(400).send('No file provided');

	try {
		const user = await userModel.findOne({ username: req.user.username });
		const post = await postModel.create({
			image: req.file.filename,
			imageTitle: req.body.filetitle,
			imageDesc: req.body.filecaption,
			user: user._id,
		});

		user.posts.push(post._id);
		await user.save();

		res.redirect('/profile');
	} catch (err) {
		console.error('Upload failed:', err);
		res.status(500).send('Upload failed');
	}
});

// Register
router.post('/register', authLimiter, async (req, res) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		req.flash('error', 'Validation failed');
		return res.redirect('/');
	}

	try {
		const { username, email, fullname, password } = req.body;
		const userData = new userModel({ username, email, fullname });

		await userModel.register(userData, password);

		passport.authenticate('local')(req, res, () => res.redirect('/profile'));
	} catch (err) {
		console.error('Registration failed:', err);
		req.flash('error', 'Registration failed. Please try again.');
		res.redirect('/');
	}
});

// Login
router.post(
	'/login',
	authLimiter,
	passport.authenticate('local', {
		successRedirect: '/profile',
		failureRedirect: '/login',
		failureFlash: true,
	}),
);

// Logout
router.get('/logout', (req, res, next) => {
	req.logout((err) => {
		if (err) return next(err);
		res.redirect('/');
	});
});

module.exports = router;
