const express = require('express');
const router = express.Router();
const User = require('../models/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const speakeasy = require('speakeasy');
const QRCode = require('qrcode');
const UAParser = require('ua-parser-js');
const passport = require('../config/passport'); // Will load config

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt';

// Helper to send email
async function sendEmail({ to, subject, html }) {
    // Standard mock setup using Ethereal - good for dev
    let testAccount = await nodemailer.createTestAccount();
    const transporter = nodemailer.createTransport({
        host: 'smtp.ethereal.email',
        port: 587,
        secure: false, // true for 465, false for other ports
        auth: {
            user: testAccount.user, // generated ethereal user
            pass: testAccount.pass, // generated ethereal password
        },
    });
    
    let info = await transporter.sendMail({
        from: '"Auth System Admin" <no-reply@authsystem.com>',
        to,
        subject,
        html,
    });
    console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
}

// Middleware to check authentication
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ msg: "No token, authorization denied" });

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ msg: "User not found" });

        // Check if device token is valid to support multi-device logout
        const deviceMatch = user.activeDevices.find(d => d.token === token);
        if (!deviceMatch) return res.status(401).json({ msg: "Session expired or logged out on this device" });

        req.user = user;
        req.deviceToken = token;
        req.deviceId = deviceMatch.deviceId;
        next();
    } catch (err) {
        res.status(400).json({ msg: "Token is not valid" });
    }
};

// 1. Sign Up
router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        
        let user = await User.findOne({ email });
        if (user) return res.status(400).json({ msg: "User already exists" });

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        user = new User({
            name,
            email,
            password: hashedPassword,
            isVerified: true   // Auto-verify — no email needed in development
        });

        await user.save();
        res.status(201).json({ msg: "Account created successfully! You can now log in." });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// 2. Email verification
router.get('/verify/:token', async (req, res) => {
    try {
        const user = await User.findOne({ verificationToken: req.params.token });
        if (!user) return res.status(400).json({ msg: "Invalid token" });

        user.isVerified = true;
        user.verificationToken = undefined;
        await user.save();
        res.send("Email verified successfully! You can now log in.");
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// 3. Login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ msg: "Invalid Credentials" });

        // Check password
        if (user.password) {
            const isMatch = await bcrypt.compare(password, user.password);
            if (!isMatch) return res.status(400).json({ msg: "Invalid Credentials" });
        } else {
             return res.status(400).json({ msg: "Use Social Login for this account" });
        }

        if (!user.isVerified) {
            // Auto-fix legacy unverified accounts
            user.isVerified = true;
            await user.save();
        }

        if (user.isTwoFactorEnabled) {
            // Require two factor response
            return res.json({ msg: "2FA Required", require2fa: true, userId: user._id });
        }

        // Issue Token
        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

        // Register device
        const parser = new UAParser(req.headers['user-agent']);
        const deviceInfo = `${parser.getBrowser().name} on ${parser.getOS().name}`;
        const deviceId = crypto.randomBytes(16).toString('hex');

        user.activeDevices.push({
            deviceId,
            deviceInfo,
            lastLogin: new Date(),
            token
        });
        await user.save();

        res.json({ token, user: { id: user._id, name: user.name, email: user.email } });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// 3.1 Verify 2FA to complete login
router.post('/login/2fa', async (req, res) => {
    try {
        const { userId, token: userToken } = req.body;
        const user = await User.findById(userId);

        if (!user || (!user.isTwoFactorEnabled)) return res.status(400).json({ msg: "Invalid request" });

        const verified = speakeasy.totp.verify({
            secret: user.twoFactorSecret,
            encoding: 'base32',
            token: userToken
        });

        if (!verified) return res.status(400).json({ msg: "Invalid code" });

        const payloadToken = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });
        
        const parser = new UAParser(req.headers['user-agent']);
        const deviceInfo = `${parser.getBrowser().name} on ${parser.getOS().name}`;
        const deviceId = crypto.randomBytes(16).toString('hex');

        user.activeDevices.push({
            deviceId,
            deviceInfo,
            lastLogin: new Date(),
            token: payloadToken
        });
        await user.save();

        res.json({ token: payloadToken, user: { id: user._id, name: user.name, email: user.email } });
    } catch (error) {
        res.status(500).send('Server Error');
    }
});

// 4. Generate 2FA
router.post('/2fa/generate', authMiddleware, async (req, res) => {
    try {
        const secret = speakeasy.generateSecret({ name: `AuthSystem (${req.user.email})` });
        req.user.twoFactorSecret = secret.base32;
        await req.user.save();
        
        QRCode.toDataURL(secret.otpauth_url, (err, data_url) => {
            res.json({ secret: secret.base32, qrCode: data_url });
        });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// 4.1 Turn on 2FA
router.post('/2fa/enable', authMiddleware, async (req, res) => {
    try {
        const { token } = req.body;
        const verified = speakeasy.totp.verify({
            secret: req.user.twoFactorSecret,
            encoding: 'base32',
            token
        });

        if (verified) {
            req.user.isTwoFactorEnabled = true;
            await req.user.save();
            res.json({ msg: "2FA enabled successfully" });
        } else {
            res.status(400).json({ msg: "Invalid Token" });
        }
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// 5. Password Reset
router.post('/password-reset', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(404).json({ msg: "User doesn't exist" });

        const resetToken = crypto.randomBytes(20).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        const resetUrl = `http://localhost:5000/api/auth/reset/${resetToken}`;
        await sendEmail({
            to: email,
            subject: 'Password Reset',
            html: `<p>Please click this link to reset your password: <a href="${resetUrl}">${resetUrl}</a></p>`
        });

        res.json({ msg: "Password reset prompt sent to email." });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/reset/:token', async (req, res) => {
    try {
        const { newPassword } = req.body;
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) return res.status(400).json({ msg: "Invalid or expired reset token" });

        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(newPassword, salt);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();
        res.json({ msg: "Password updated successfully" });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// 6. User profile management / change password
router.get('/profile', authMiddleware, async (req, res) => {
    res.json(req.user);
});

router.put('/profile', authMiddleware, async (req, res) => {
    try {
        const { name } = req.body;
        if(name) req.user.name = name;
        await req.user.save();
        res.json({ msg: "Profile updated successfully" });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.post('/change-password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        
        if (!req.user.password) return res.status(400).json({ msg: "Cannot change password for OAuth account" });

        const isMatch = await bcrypt.compare(currentPassword, req.user.password);
        if (!isMatch) return res.status(400).json({ msg: "Incorrect current password" });

        const salt = await bcrypt.genSalt(10);
        req.user.password = await bcrypt.hash(newPassword, salt);
        await req.user.save();
        res.json({ msg: "Password changed successfully" });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// 7. Logout / Multiple Device Support
router.post('/logout', authMiddleware, async (req, res) => {
    try {
        // Remove the current device token
        req.user.activeDevices = req.user.activeDevices.filter(d => d.token !== req.deviceToken);
        await req.user.save();
        res.json({ msg: "Logged out successfully" });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

router.get('/devices', authMiddleware, async (req, res) => {
    res.json(req.user.activeDevices.map(d => ({
        deviceId: d.deviceId,
        deviceInfo: d.deviceInfo,
        lastLogin: d.lastLogin,
        isCurrentDevice: d.deviceId === req.deviceId
    })));
});

router.delete('/devices/:deviceId', authMiddleware, async (req, res) => {
    try {
        req.user.activeDevices = req.user.activeDevices.filter(d => d.deviceId !== req.params.deviceId);
        await req.user.save();
        res.json({ msg: "Device logged out successfully" });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// 8. OAuth Routes (Google/Github)
router.get('/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/google/callback', passport.authenticate('google', { session: false }), async (req, res) => {
    // Generate JWT and log device in
    const token = jwt.sign({ id: req.user._id }, JWT_SECRET, { expiresIn: '7d' });
    
    const parser = new UAParser(req.headers['user-agent']);
    const deviceInfo = `${parser.getBrowser().name} on ${parser.getOS().name}`;
    req.user.activeDevices.push({
        deviceId: crypto.randomBytes(16).toString('hex'),
        deviceInfo,
        lastLogin: new Date(),
        token
    });
    await req.user.save();

    // Redirect to frontend with token
    res.redirect(`/?token=${token}`);
});

router.get('/github', passport.authenticate('github', { scope: ['user:email'] }));

router.get('/github/callback', passport.authenticate('github', { session: false }), async (req, res) => {
    const token = jwt.sign({ id: req.user._id }, JWT_SECRET, { expiresIn: '7d' });
    
    const parser = new UAParser(req.headers['user-agent']);
    const deviceInfo = `${parser.getBrowser().name} on ${parser.getOS().name}`;
    req.user.activeDevices.push({
        deviceId: crypto.randomBytes(16).toString('hex'),
        deviceInfo,
        lastLogin: new Date(),
        token
    });
    await req.user.save();

    res.redirect(`/?token=${token}`);
});

module.exports = router;
