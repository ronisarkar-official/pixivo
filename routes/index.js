// routes.js
require('dotenv').config();
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;

const userModel = require('./users');
const postModel = require('./posts');
const cloudinary = require('cloudinary').v2;
const { upload, handleUploadErrors } = require('./multer');

// ===== Passport Config =====
passport.use(new LocalStrategy(userModel.authenticate()));
passport.serializeUser(userModel.serializeUser());
passport.deserializeUser(userModel.deserializeUser());

function timeAgo(d) {
	let s = Math.floor((Date.now() - new Date(d)) / 1000),
		u = { y: 31536000, mo: 2592000, w: 604800, d: 86400, h: 3600, m: 60, s: 1 };
	for (let k in u) {
		let v = Math.floor(s / u[k]);
		if (v) return v + k;
	}
	return 'just now';
}

// ===== Rate Limiter for Auth =====
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 10,
	message: 'Too many login/register attempts. Please try again later.',
});

// ===== Middleware =====
function isLoggedIn(req, res, next) {
	if (req.isAuthenticated()) return next();

	const isAjax =
		req.xhr ||
		req.headers['x-requested-with'] === 'XMLHttpRequest' ||
		(req.headers.accept &&
			req.headers.accept.indexOf('application/json') !== -1);

	if (isAjax) return res.status(401).json({ error: 'Not authenticated' });

	return res.redirect('/login');
}

function isNotLoggedIn(req, res, next) {
	if (!req.isAuthenticated()) return next();
	res.redirect('/feed');
}

function escapeRegExp(string = '') {
	return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ===== Routes =====

// Auth Pages
router.get(['/', '/login'], isNotLoggedIn, (req, res) => {
	res.render('index', {
		error: req.flash('error') || '',
	});
});

// Feed Page with Pagination Support
router.get('/feed', isLoggedIn, async (req, res) => {
	try {
		const user = await userModel.findOne({ username: req.user.username });
		const q = req.query.q || '';
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 50; // Increased default limit
		const skip = (page - 1) * limit;

		let filter = {};
		if (q) {
			filter = {
				$or: [
					{ imageTitle: new RegExp(escapeRegExp(q), 'i') },
					{ imageDesc: new RegExp(escapeRegExp(q), 'i') },
				],
			};
		}

		const totalPosts = await postModel.countDocuments(filter);
		const posts = await postModel
			.find(filter)
			.populate('user')
			.sort({ createdAt: -1 }) // Sort by newest first
			.skip(skip)
			.limit(limit);

		// For AJAX requests (infinite scroll), send JSON
		if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
			return res.json({
				success: true,
				posts,
				pagination: {
					currentPage: page,
					totalPages: Math.ceil(totalPosts / limit),
					hasNextPage: page < Math.ceil(totalPosts / limit),
					totalPosts,
				},
			});
		}

		res.render('feed', {
			user,
			posts,
			q,
			total: totalPosts,
			pagination: {
				currentPage: page,
				totalPages: Math.ceil(totalPosts / limit),
				hasNextPage: page < Math.ceil(totalPosts / limit),
			},
		});
	} catch (err) {
		console.error('Feed error:', err);
		res.status(500).send('Server error');
	}
});

// Single Post Page - FIXED: Remove limit on related posts
router.get('/pin/:id', isLoggedIn, async (req, res) => {
	try {
		const postId = req.params.id;
		const post = await postModel
			.findById(postId)
			.populate('user', 'username fullname profileimage')
			.populate('comments.user', 'username fullname profileimage');

		if (!post) return res.status(404).send('Post not found');

		const user = await userModel.findOne({ username: req.user.username });

		// FIXED: Remove .limit(20) to show all posts as related posts
		const posts = await postModel
			.find({ _id: { $ne: postId } }) // Exclude current post
			.populate('user', 'username fullname profileimage')
			.sort({ createdAt: -1 }); // Sort by newest first

		res.render('post', { user, post, posts, timeAgo });
	} catch (err) {
		console.error('Error fetching post:', err);
		res.status(500).send('Server error');
	}
});

// Toggle like
router.post('/posts/:id/like', isLoggedIn, async (req, res) => {
	try {
		const postId = req.params.id;
		const userId = req.user._id;

		const post = await postModel.findById(postId);
		if (!post) return res.status(404).json({ error: 'Post not found' });

		const alreadyLiked = post.likes.includes(userId);

		if (alreadyLiked) {
			post.likes.pull(userId);
		} else {
			post.likes.push(userId);
		}

		await post.save();

		res.json({
			success: true,
			liked: !alreadyLiked,
			likesCount: post.likes.length,
		});
	} catch (err) {
		console.error('Like route error:', err);
		res.status(500).json({ error: 'Server error' });
	}
});

// Add comment to a post
router.post('/posts/:id/comments', isLoggedIn, async (req, res) => {
	try {
		const post = await postModel.findById(req.params.id);
		if (!post) return res.status(404).json({ error: 'Post not found' });

		const text = (req.body.text || '').trim();
		if (!text) return res.status(400).json({ error: 'Comment text required' });

		post.comments.push({ text, user: req.user._id });
		await post.save();

		// Re-populate the last comment's user data
		const populated = await postModel
			.findById(post._id)
			.populate('comments.user', 'username fullname profileimage');

		const newComment = populated.comments[populated.comments.length - 1];

		return res.json({ success: true, comment: newComment });
	} catch (err) {
		console.error('Comment error:', err);
		return res.status(500).json({ error: 'Server error' });
	}
});

// Profile Page
router.get('/profile', isLoggedIn, async (req, res) => {
	try {
		const username = req.session.passport.user;
		const user = await userModel.findOne({ username }).populate('posts');

		if (!user) {
			return res.status(404).send('User not found');
		}

		res.render('profile', { user });
	} catch (err) {
		console.error(err);
		res.status(500).send('Server error');
	}
});

// All Pins Page - Show user's posts with pagination
router.get('/allpins', isLoggedIn, async (req, res) => {
	try {
		const page = parseInt(req.query.page) || 1;
		const limit = parseInt(req.query.limit) || 20;
		const skip = (page - 1) * limit;

		const user = await userModel.findOne({ username: req.user.username });

		// Get user's posts with pagination
		const totalPosts = await postModel.countDocuments({ user: user._id });
		const posts = await postModel
			.find({ user: user._id })
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit);

		// For AJAX requests
		if (req.xhr || req.headers['x-requested-with'] === 'XMLHttpRequest') {
			return res.json({
				success: true,
				posts,
				pagination: {
					currentPage: page,
					totalPages: Math.ceil(totalPosts / limit),
					hasNextPage: page < Math.ceil(totalPosts / limit),
					totalPosts,
				},
			});
		}

		// Set posts directly on user object for template compatibility
		user.posts = posts;

		res.render('pins', {
			user,
			pagination: {
				currentPage: page,
				totalPages: Math.ceil(totalPosts / limit),
				hasNextPage: page < Math.ceil(totalPosts / limit),
				totalPosts,
			},
		});
	} catch (err) {
		console.error('All pins error:', err);
		res.status(500).send('Server error');
	}
});

// File upload routes remain the same
router.post(
	'/fileupload',
	isLoggedIn,
	upload.single('image'),
	async (req, res) => {
		try {
			const user = await userModel.findOne({
				username: req.session.passport.user,
			});

			user.profileimage = req.file.path;
			await user.save();
			res.redirect('/profile');
		} catch (err) {
			console.error('Upload error:', err);
			req.flash('error', 'Failed to upload image');
			res.redirect('/profile');
		}
	},
);

router.post('/upload', isLoggedIn, upload.single('file'), async (req, res) => {
	if (!req.file) return res.status(400).send('No file provided');

	try {
		const user = await userModel.findOne({ username: req.user.username });
		const post = await postModel.create({
			image: req.file.path,
			imageTitle: req.body.filetitle,
			imageDesc: req.body.filecaption,
			user: user._id,
		});

		user.posts.push(post._id);
		await user.save();

		res.redirect('/profile');
	} catch (err) {
		console.error('Upload failed:', err);
		if (req.file) {
			await cloudinary.uploader
				.destroy(req.file.filename)
				.catch((cleanupErr) => console.error('Cleanup failed:', cleanupErr));
		}
		req.flash('error', 'Failed to upload post');
		res.redirect('/profile');
	}
});

// Auth routes remain the same
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
		passport.authenticate('local')(req, res, () => res.redirect('/feed'));
	} catch (err) {
		console.error('Registration failed:', err);
		req.flash('error', 'Registration failed. Please try again.');
		res.redirect('/');
	}
});

router.post(
	'/login',
	authLimiter,
	passport.authenticate('local', {
		successRedirect: '/feed',
		failureRedirect: '/login',
		failureFlash: true,
	}),
);

router.get('/logout', (req, res, next) => {
	req.logout((err) => {
		if (err) return next(err);
		res.redirect('/');
	});
});

module.exports = router;
