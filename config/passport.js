const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const GitHubStrategy = require('passport-github2').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => {
    done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});

// Assuming placeholder IDs if not present. In production, these should be loaded from .env
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'mock_google_id';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || 'mock_google_secret';

passport.use(new GoogleStrategy({
    clientID: GOOGLE_CLIENT_ID,
    clientSecret: GOOGLE_CLIENT_SECRET,
    callbackURL: '/api/auth/google/callback'
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        if (!user) {
            user = await User.findOne({ email: profile.emails[0].value });
            if (user) {
                user.googleId = profile.id;
                await user.save();
            } else {
                user = await User.create({
                    googleId: profile.id,
                    name: profile.displayName,
                    email: profile.emails[0].value,
                    isVerified: true
                });
            }
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'mock_github_id';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || 'mock_github_secret';

passport.use(new GitHubStrategy({
    clientID: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET,
    callbackURL: '/api/auth/github/callback',
    scope: ['user:email']
}, async (accessToken, refreshToken, profile, done) => {
    try {
        const email = profile.emails && profile.emails[0].value ? profile.emails[0].value : `${profile.id}@github.mock`;
        let user = await User.findOne({ githubId: profile.id });
        if (!user) {
            user = await User.findOne({ email });
            if (user) {
                user.githubId = profile.id;
                await user.save();
            } else {
                user = await User.create({
                    githubId: profile.id,
                    name: profile.displayName || profile.username,
                    email,
                    isVerified: true
                });
            }
        }
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

module.exports = passport;
