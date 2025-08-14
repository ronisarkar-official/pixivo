require('dotenv').config();
const plm = require('passport-local-mongoose');

const mongoose = require('mongoose');

mongoose
	.connect(process.env.MONGO_URI)
	.then(() => console.log('✅ MongoDB Connected'))
	.catch((err) => console.error('❌', err));

const userSchema = new mongoose.Schema(
	{
		username: {
			type: String,
			required: true,
			unique: true,
			trim: true,
		},
		posts: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Post',
			},
		],
		profileimage: {
			type: String,
		},
		email: {
			type: String,
			required: true,
			unique: true,
			lowercase: true,
			trim: true,
		},
		boards: {
			type: Array,
			default: [],
		},
		fullname: {
			type: String,
			required: true,
			trim: true,
		},
	},
	{ timestamps: true },
);

userSchema.plugin(plm);

module.exports = mongoose.model('User', userSchema);
