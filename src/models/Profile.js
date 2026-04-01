const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    name: { type: String, trim: true, default: '' },
    bio: { type: String, trim: true, default: '', maxlength: 500 },
    instagram: { type: String, trim: true, default: '', maxlength: 500 },
    facebook: { type: String, trim: true, default: '', maxlength: 500 },
    niche: { type: String, trim: true, default: '', maxlength: 120 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Profile', profileSchema);
