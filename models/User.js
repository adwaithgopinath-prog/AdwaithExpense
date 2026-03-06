const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: { type: String },
    email: { type: String, required: true, unique: true },
    password: { type: String }, // Hashed password
    googleId: { type: String },
    githubId: { type: String },
    isVerified: { type: Boolean, default: false },
    verificationToken: { type: String },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    twoFactorSecret: { type: String },
    isTwoFactorEnabled: { type: Boolean, default: false },
    activeDevices: [{ 
        deviceId: { type: String, required: true },
        deviceInfo: String,
        lastLogin: Date,
        token: String
    }]
}, { timestamps: true });

module.exports = mongoose.model('User', UserSchema);
