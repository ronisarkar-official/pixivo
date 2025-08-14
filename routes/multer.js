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

// Create Cloudinary storage engine
const storage = new CloudinaryStorage({
	cloudinary: cloudinary,
	params: {
		folder: 'profilePic', // Optional - folder in Cloudinary
		public_id: (req, file) => {
			// Generate unique filename similar to your current setup
			const uniqueFilename =
				'uuid-' + Date.now() + '-' + Math.round(Math.random() * 1e9);
			return uniqueFilename;
		},
		allowed_formats: ['jpg', 'png', 'jpeg', 'gif'], // Allowed file formats
		transformation: [{ width: 800, height: 800, crop: 'limit' }], // Optional transformations
	},
});

const upload = multer({ storage: storage });

// Error handling middleware (optional but recommended)
const handleUploadErrors = (err, req, res, next) => {
	if (err instanceof multer.MulterError) {
		// A Multer error occurred when uploading
		return res.status(400).json({ error: err.message });
	} else if (err) {
		// An unknown error occurred
		return res.status(500).json({ error: err.message });
	}
	next();
};

module.exports = { upload, handleUploadErrors };
