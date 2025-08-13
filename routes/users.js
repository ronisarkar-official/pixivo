const mongoose = require('mongoose');
const plm = require('passport-local-mongoose');


require('dotenv').config();

mongoose.set('strictQuery', false);

mongoose.connect(process.env.MONGO_URI)
	.then(() => console.log('✅ Connected to MongoDB Atlas'))
	.catch((err) => console.error('❌ MongoDB connection error:', err));



const userSchema = new mongoose.Schema(
	{
		username: {
			type: String,
			required: true,
			unique: true,
			trim: true,
		},
		password: {
			type: String,
		},
		posts: [
			{
				type: mongoose.Schema.Types.ObjectId,
				ref: 'Post', // Or change to `type: String` if you store raw content
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
	{
		timestamps: true, // adds createdAt and updatedAt automatically
	},
);

userSchema.plugin(plm);

module.exports = mongoose.model('User', userSchema);
