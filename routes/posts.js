const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
	{
		imageTitle: {
			type: String,
			required: true,
			trim: true,
		},
		imageDesc: {
			type: String,
			trim: true,
		},
		image: {
			type: String,
			trim: true,
		},
		user: {
			type: mongoose.Schema.Types.ObjectId,
			ref: 'User', // Capitalized to match model naming convention
			required: true,
		},
		likes: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'User', // Keeps track of which users liked
			},
		],
	},
	{
		timestamps: true, // Automatically adds createdAt and updatedAt
	},
);

module.exports = mongoose.model('Post', postSchema);
