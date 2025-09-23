// routes.js
require('dotenv').config();
const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const rateLimit = require('express-rate-limit');
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const { Types } = require('mongoose');
const userModel = require('./users');
const postModel = require('./posts');
const cloudinary = require('cloudinary').v2;
const { upload, handleUploadErrors } = require('./multer');

// ===== Passport Config =====
passport.use(new LocalStrategy(userModel.authenticate()));
passport.serializeUser(userModel.serializeUser());
passport.deserializeUser(userModel.deserializeUser());

function timeAgo(date) {
	const seconds = Math.floor((Date.now() - new Date(date)) / 1000);
	const intervals = [
		['y', 31536000],
		['mo', 2592000],
		['w', 604800],
		['d', 86400],
		['h', 3600],
		['m', 60],
		['s', 1],
	];
	for (const [label, sec] of intervals) {
		const val = Math.floor(seconds / sec);
		if (val > 0) return `${val} ${label}${val > 1 ? '' : ''}`;
	}
	return 'just now';
}

// ===== Rate Limiter for Auth =====
const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	max: 30,
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

// Single Post Page - show all related posts and pass isFollowing + author fields to template
router.get('/pin/:id', isLoggedIn, async (req, res) => {
	try {
		const postId = req.params.id;

		// load post + author + comment authors
		const post = await postModel
			.findById(postId)
			.populate('user', 'username fullname profileimage')
			.populate('comments.user', 'username fullname profileimage');

		if (!post) return res.status(404).send('Post not found');

		// load current user doc (to check following)
		const user = await userModel
			.findOne({ username: req.user.username })
			.lean();
		const isOwner = !!(
			req.user && String(req.user.username) === String(post.user.username)
		);

		// Determine isFollowing robustly for multiple common schemas:
		// - user.following: array of ObjectId references to users
		// - user.followingUsernames: array of usernames (less common)
		// - post author having followers array (fallback)
		let isFollowing = false;
		try {
			if (user) {
				// case: following is an array of ObjectId refs
				if (Array.isArray(user.following) && user.following.length) {
					isFollowing = user.following.some(
						(f) => String(f) === String(post.user._id),
					);
				}
				// case: following stored as usernames
				else if (
					Array.isArray(user.followingUsernames) &&
					user.followingUsernames.length
				) {
					isFollowing = user.followingUsernames.includes(post.user.username);
				}
				// fallback: check whether the post author lists current user in their followers array
				else {
					const authorHasFollower = await userModel
						.findOne({
							_id: post.user._id,
							followers: user._id,
						})
						.lean();
					isFollowing = !!authorHasFollower;
				}
			}
		} catch (checkErr) {
			// If your schema is different, avoid crashing — log and default to false
			console.warn('isFollowing check failed, defaulting to false:', checkErr);
			isFollowing = false;
		}

		// related posts (exclude current post) - no limit
		const posts = await postModel
			.find({ _id: { $ne: postId } })
			.populate('user', 'username fullname profileimage')
			.sort({ createdAt: -1 });

		// Optional CSRF token support if you use csurf
		const csrfToken =
			typeof req.csrfToken === 'function' ? req.csrfToken() : null;

		// Pass everything the template expects (author* fields + isFollowing)
		res.render('post', {
			user, // current logged-in user (lean)
			post,
			posts,
			timeAgo,
			isFollowing,
			isOwner,
			authorUsername: post.user.username,
			authorImg: post.user.profileimage,
			authorName: post.user.fullname,
			csrfToken,
		});
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

		const alreadyLiked = post.likes.some((id) => id.equals(userId));

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

		res.render('profile', {
			user,
			followersCount: Number(user.followers?.length || 0),
			followingCount: Number(user.following?.length || 0),
		});
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

// at top of file (if not present)

router.get('/user/:username', async (req, res) => {
	try {
		const rawUsername = req.params.username || '';
		const username = String(rawUsername).trim();

		if (!/^[\w.-]{3,30}$/.test(username)) {
			return res.status(400).render('404', { message: 'Invalid username' });
		}

		const agg = await userModel.aggregate([
			{ $match: { username } },
			{
				$project: {
					_id: 1,
					username: 1,
					fullname: 1,
					profileimage: 1,
					bio: 1,
					createdAt: 1,
					followersCount: { $size: { $ifNull: ['$followers', []] } },
					followingCount: { $size: { $ifNull: ['$following', []] } },
				},
			},
			{ $limit: 1 },
		]);

		const profileUser = agg && agg.length ? agg[0] : null;
		if (!profileUser) {
			return res.status(404).render('404', { message: 'User not found' });
		}

		const page = Math.max(1, parseInt(req.query.page, 10) || 1);
		const rawLimit = parseInt(req.query.limit, 10) || 20;
		const MAX_LIMIT = 50;
		const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
		const skip = (page - 1) * limit;

		const [totalPosts, posts] = await Promise.all([
			postModel.countDocuments({ user: profileUser._id }),
			postModel
				.find({ user: profileUser._id })
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.populate('user', 'username fullname profileimage')
				.lean(),
		]);

		const totalPages = Math.ceil(totalPosts / limit);
		const pagination = {
			currentPage: page,
			totalPages,
			hasNextPage: page < totalPages,
			totalPosts,
		};

		const wantsJson =
			req.get('x-requested-with') === 'XMLHttpRequest' ||
			(req.get('accept') || '').includes('application/json');

		let viewer = null;
		let isFollowing = false;

		if (req.user && Types.ObjectId.isValid(req.user._id)) {
			viewer = await userModel
				.findById(req.user._id)
				.select('username profileimage fullname')
				.lean();

			const exists = await userModel.exists({
				_id: req.user._id,
				following: profileUser._id,
			});
			isFollowing = !!exists;
		}

		if (wantsJson) {
			return res.json({
				success: true,
				user: profileUser,
				posts,
				pagination,
				followersCount: Number(profileUser.followersCount || 0),
				followingCount: Number(profileUser.followingCount || 0),
				isFollowing,
				viewer: viewer || null,
			});
		}

		res.render('user_profile', {
			profileUser,
			posts,
			pagination,
			viewer: viewer || null,
			isFollowing,
			timeAgo,
		});
	} catch (err) {
		console.error('Public profile error:', err);
		res.status(500).send('Server error');
	}
});

// Optional: API-only endpoint to fetch more posts for infinite scroll
router.get('/user/:username/posts', async (req, res) => {
	try {
		const username = String(req.params.username || '').trim();
		if (!/^[\w.-]{3,30}$/.test(username))
			return res.status(400).json({ error: 'Invalid username' });

		const user = await userModel.findOne({ username }).select('_id').lean();
		if (!user) return res.status(404).json({ error: 'User not found' });

		const page = Math.max(1, parseInt(req.query.page, 10) || 1);
		const rawLimit = parseInt(req.query.limit, 10) || 20;
		const MAX_LIMIT = 50;
		const limit = Math.min(Math.max(1, rawLimit), MAX_LIMIT);
		const skip = (page - 1) * limit;

		const [totalPosts, posts] = await Promise.all([
			postModel.countDocuments({ user: user._id }),
			postModel
				.find({ user: user._id })
				.sort({ createdAt: -1 })
				.skip(skip)
				.limit(limit)
				.populate('user', 'username fullname profileimage')
				.lean(),
		]);

		const pagination = {
			currentPage: page,
			totalPages: Math.ceil(totalPosts / limit),
			hasNextPage: page < Math.ceil(totalPosts / limit),
			totalPosts,
		};

		res.json({ success: true, posts, pagination });
	} catch (err) {
		console.error('User posts API error:', err);
		res.status(500).json({ error: 'Server error' });
	}
});

// rate limiter for follow API
const followLimiter = rateLimit({
	windowMs: 60 * 1000, // 1 minute
	max: 10, // max 10 follow/unfollow attempts per minute per IP
	message: { error: 'Too many follow actions. Try again soon.' },
});

// Toggle follow/unfollow (robust version)
router.post(
	'/users/:username/follow',
	isLoggedIn,
	followLimiter,
	async (req, res) => {
		try {
			const targetUsername = String(req.params.username || '').trim();
			if (!/^[\w.-]{3,30}$/.test(targetUsername)) {
				return res.status(400).json({ error: 'Invalid username' });
			}

			if (!req.user)
				return res.status(401).json({ error: 'Not authenticated' });

			if (req.user.username === targetUsername) {
				return res.status(400).json({ error: 'Cannot follow yourself' });
			}

			// Find only necessary fields
			const target = await userModel
				.findOne({ username: targetUsername })
				.select('_id followers')
				.exec();
			if (!target) return res.status(404).json({ error: 'User not found' });

			const meId = req.user._id; // may be ObjectId or string; normalize when comparing

			// Normalize comparisons to strings to avoid .equals errors when items are plain strings
			const alreadyFollowing = Array.isArray(target.followers)
				? target.followers.some((f) => String(f) === String(meId))
				: false;

			if (alreadyFollowing) {
				// Unfollow: atomically remove follower and update my following
				const updatedTarget = await userModel
					.findByIdAndUpdate(
						target._id,
						{ $pull: { followers: meId } },
						{ new: true, select: 'followers' },
					)
					.exec();

				await userModel
					.findByIdAndUpdate(meId, { $pull: { following: target._id } })
					.exec();

				const followersCount = Array.isArray(
					updatedTarget && updatedTarget.followers,
				)
					? updatedTarget.followers.length
					: 0;
				return res.json({ success: true, following: false, followersCount });
			} else {
				// Follow: atomically add follower and update my following
				const updatedTarget = await userModel
					.findByIdAndUpdate(
						target._id,
						{ $addToSet: { followers: meId } },
						{ new: true, select: 'followers' },
					)
					.exec();

				await userModel
					.findByIdAndUpdate(meId, { $addToSet: { following: target._id } })
					.exec();

				const followersCount = Array.isArray(
					updatedTarget && updatedTarget.followers,
				)
					? updatedTarget.followers.length
					: 0;
				return res.json({ success: true, following: true, followersCount });
			}
		} catch (err) {
			console.error('Follow/unfollow error:', err);
			// include minimal error detail for debugging (do NOT expose stack in production)
			res.status(500).json({ error: 'Server error' });
		}
	},
);

module.exports = router;
