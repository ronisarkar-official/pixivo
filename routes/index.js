require('dotenv').config();
const express = require('express');
const router = express.Router();
const passport = require('passport');
const LocalStrategy = require('passport-local').Strategy;
const userModel = require('./users');
const postModel = require('./posts');
const cloudinary = require('cloudinary').v2;
const { upload, handleUploadErrors } = require('./multer');

// Passport Config
passport.use(new LocalStrategy(userModel.authenticate()));
passport.serializeUser(userModel.serializeUser());
passport.deserializeUser(userModel.deserializeUser());

// Middleware
const isLoggedIn = (req, res, next) => {
	if (req.isAuthenticated()) return next();
	if (req.xhr) return res.status(401).json({ error: 'Not authenticated' });
	res.redirect('/login');
};

const isNotLoggedIn = (req, res, next) => {
	if (!req.isAuthenticated()) return next();
	res.redirect('/feed');
};

// Helper Functions
const timeAgo = (date) => {
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
		if (val > 0) return `${val} ${label}`;
	}
	return 'just now';
};

const getPagination = (query, total) => {
	const page = parseInt(query.page) || 1;
	const limit = parseInt(query.limit) || 100;
	const totalPages = Math.ceil(total / limit);
	return {
		page,
		limit,
		skip: (page - 1) * limit,
		totalPages,
		hasNextPage: page < totalPages,
	};
};

// Routes
router.get(['/', '/login'], isNotLoggedIn, (req, res) => {
	res.render('index', { error: req.flash('error') || '' });
});

// routes/index.js (replace your existing /feed handler)
router.get('/feed', isLoggedIn, async (req, res) => {
  try {
    const user = await userModel.findOne({ username: req.user.username });

    const q = req.query.q ? String(req.query.q).trim() : '';

    // escape user input for safe regex usage
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    const filter = q
      ? {
          $or: [
            { imageTitle: { $regex: escapeRegExp(q), $options: 'i' } },
            { imageDesc: { $regex: escapeRegExp(q), $options: 'i' } },
          ],
        }
      : {};

    // total count for the given filter (important for pagination & template)
    const total = await postModel.countDocuments(filter);

    // pass the proper total to pagination helper so page/skip are correct for filtered results
    const { page, limit, skip, totalPages, hasNextPage } = getPagination(req.query, total);

    const posts = await postModel
      .find(filter)
      .populate('user')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean();

    if (req.xhr) {
      return res.json({
        success: true,
        posts,
        pagination: { currentPage: page, totalPages, hasNextPage, total },
        total,
      });
    }

    res.render('feed', {
      user,
      posts,
      q,
      total,
      pagination: { currentPage: page, totalPages, hasNextPage },
    });
  } catch (err) {
    console.error('Error in /feed:', err);
    res.status(500).send('Server error');
  }
});

router.get('/pin/:id', isLoggedIn, async (req, res) => {
	try {
		const post = await postModel
			.findById(req.params.id)
			.populate('user')
			.populate('comments.user');

		if (!post) return res.status(404).send('Post not found');

		const user = await userModel.findOne({ username: req.user.username });
		const isOwner = req.user.username === post.user.username;
		const isFollowing = user.following.includes(post.user._id);

		const posts = await postModel
			.find({ _id: { $ne: req.params.id } })
			.populate('user')
			.sort({ createdAt: -1 });

		res.render('post', {
			user,
			post,
			posts,
			timeAgo,
			isFollowing,
			isOwner,
			authorUsername: post.user.username,
			authorImg: post.user.profileimage,
			authorName: post.user.fullname,
		});
	} catch (err) {
		res.status(500).send('Server error');
	}
});

router.post('/posts/:id/like', isLoggedIn, async (req, res) => {
	try {
		const post = await postModel.findById(req.params.id);
		if (!post) return res.status(404).json({ error: 'Post not found' });

		const userId = req.user._id;
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
		res.status(500).json({ error: 'Server error' });
	}
});

router.post('/posts/:id/comments', isLoggedIn, async (req, res) => {
	try {
		const text = (req.body.text || '').trim();
		if (!text) return res.status(400).json({ error: 'Comment text required' });

		const post = await postModel.findById(req.params.id);
		if (!post) return res.status(404).json({ error: 'Post not found' });

		post.comments.push({ text, user: req.user._id });
		await post.save();

		const populated = await postModel
			.findById(post._id)
			.populate('comments.user');

		const newComment = populated.comments[populated.comments.length - 1];
		res.json({ success: true, comment: newComment });
	} catch (err) {
		res.status(500).json({ error: 'Server error' });
	}
});

router.get('/profile', isLoggedIn, async (req, res) => {
	try {
		const user = await userModel
			.findOne({ username: req.user.username })
			.populate('posts');

		res.render('profile', {
			user,
			followersCount: user.followers?.length || 0,
			followingCount: user.following?.length || 0,
		});
	} catch (err) {
		res.status(500).send('Server error');
	}
});

router.get('/allpins', isLoggedIn, async (req, res) => {
	try {
		const user = await userModel.findOne({ username: req.user.username });
		const totalPosts = await postModel.countDocuments({ user: user._id });
		const { page, limit, skip, totalPages, hasNextPage } = getPagination(
			req.query,
			totalPosts,
		);

		const posts = await postModel
			.find({ user: user._id })
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit);

		if (req.xhr) {
			return res.json({
				success: true,
				posts,
				pagination: { currentPage: page, totalPages, hasNextPage, totalPosts },
			});
		}

		user.posts = posts;
		res.render('pins', {
			user,
			pagination: { currentPage: page, totalPages, hasNextPage, totalPosts },
		});
	} catch (err) {
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


router.post('/register', async (req, res) => {
	try {
		const { username, email, fullname, password } = req.body;
		const userData = new userModel({ username, email, fullname });
		await userModel.register(userData, password);
		passport.authenticate('local')(req, res, () => res.redirect('/feed'));
	} catch (err) {
		req.flash('error', 'Registration failed');
		res.redirect('/');
	}
});

router.post(
	'/login',
	passport.authenticate('local', {
		successRedirect: '/feed',
		failureRedirect: '/login',
		failureFlash: true,
	}),
);

router.get('/logout', (req, res) => {
	req.logout((err) => {
		if (err) return res.status(500).send('Logout error');
		res.redirect('/');
	});
});

router.get('/user/:username', async (req, res) => {
	try {
		const username = req.params.username;
		const profileUser = await userModel
			.findOne({ username })
			.select(
				'username fullname profileimage bio createdAt followers following',
			);

		if (!profileUser) {
			return res.status(404).render('404', { message: 'User not found' });
		}

		const totalPosts = await postModel.countDocuments({
			user: profileUser._id,
		});

		const { page, limit, skip, totalPages, hasNextPage } = getPagination(
			req.query,
			totalPosts,
		);

		const posts = await postModel
			.find({ user: profileUser._id })
			.sort({ createdAt: -1 })
			.skip(skip)
			.limit(limit)
			.populate('user');

		let isFollowing = false;
		let viewer = null;

		if (req.user) {
			viewer = await userModel
				.findById(req.user._id)
				.select('username profileimage fullname following'); // Added 'following' here

			// Check if following array exists and includes the profileUser
			isFollowing =
				viewer.following && Array.isArray(viewer.following)
					? viewer.following.some(
							(id) => id.toString() === profileUser._id.toString(),
					  )
					: false;
		}

		if (req.xhr) {
			return res.json({
				success: true,
				user: profileUser,
				posts,
				pagination: { currentPage: page, totalPages, hasNextPage, totalPosts },
				followersCount: profileUser.followers
					? profileUser.followers.length
					: 0,
				followingCount: profileUser.following
					? profileUser.following.length
					: 0,
				isFollowing,
				viewer,
			});
		}

		res.render('user_profile', {
			profileUser,
			posts,
			pagination: { currentPage: page, totalPages, hasNextPage },
			viewer,
			isFollowing,
			timeAgo,
		});
	} catch (err) {
		console.error('User profile error:', err); // Add logging to see the actual error
		res.status(500).send('Server error');
	}
});

router.post('/users/:username/follow', isLoggedIn, async (req, res) => {
	try {
		const targetUsername = req.params.username;
		if (req.user.username === targetUsername) {
			return res.status(400).json({ error: 'Cannot follow yourself' });
		}

		const target = await userModel.findOne({ username: targetUsername });
		if (!target) return res.status(404).json({ error: 'User not found' });

		const userId = req.user._id;
		const alreadyFollowing = target.followers.includes(userId);

		if (alreadyFollowing) {
			await userModel.findByIdAndUpdate(target._id, {
				$pull: { followers: userId },
			});
			await userModel.findByIdAndUpdate(userId, {
				$pull: { following: target._id },
			});
		} else {
			await userModel.findByIdAndUpdate(target._id, {
				$addToSet: { followers: userId },
			});
			await userModel.findByIdAndUpdate(userId, {
				$addToSet: { following: target._id },
			});
		}

		const updatedTarget = await userModel.findById(target._id);
		res.json({
			success: true,
			following: !alreadyFollowing,
			followersCount: updatedTarget.followers.length,
		});
	} catch (err) {
		res.status(500).json({ error: 'Server error' });
	}
});

module.exports = router;
