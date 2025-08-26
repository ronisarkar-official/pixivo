const multer = require('multer');
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (move these to environment variables in production)
cloudinary.config({
	secure: true,
	cloud_name: process.env.CLOUDINARY_CLOUD_NAME || 'your_cloud_name',
	api_key: process.env.CLOUDINARY_API_KEY || 'your_api_key',
	api_secret: process.env.CLOUDINARY_API_SECRET || 'your_api_secret',
});

const storage = new CloudinaryStorage({
	cloudinary: cloudinary,
	params: {
		public_id: () => {
			// Generate short ID (6 chars)
			return Math.random().toString(36).substring(2, 8);
		},
		allowed_formats: [
			'jpg',
			'jpeg',
			'png',
			'gif',
			'bmp',
			'tiff',
			'tif',
			'ico',
			'svg',
			'webp',
			'heif',
			'heic',
		],
		transformation: [{ width: 800, height: 800, crop: 'limit' }],
	},
});

const upload = multer({ storage });

// Error handling middleware
const handleUploadErrors = (err, req, res, next) => {
	if (err instanceof multer.MulterError) {
		return res.status(400).json({ error: err.message });
	} else if (err) {
		return res.status(500).json({ error: err.message });
	}
	next();
};

module.exports = { upload, handleUploadErrors };
