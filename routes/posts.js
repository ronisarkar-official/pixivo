const mongoose = require('mongoose');

const commentSchema = new mongoose.Schema(
	{
		text: { type: String, required: true, trim: true },
		user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
	},
	{ timestamps: true },
);

const postSchema = new mongoose.Schema(
	{
		imageTitle: { type: String, required: true, trim: true },
		imageDesc: { type: String, trim: true },
		image: { type: String, trim: true },
		user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
		likes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
		comments: [commentSchema], // <-- Add comments here
	},
	{ timestamps: true },
);

// Text index (for full-text relevance search)
postSchema.index({ imageTitle: 'text', imageDesc: 'text' });

module.exports = mongoose.model('Post', postSchema);
