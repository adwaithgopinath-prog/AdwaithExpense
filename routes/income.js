const express = require('express');
const router = express.Router();
const Income = require('../models/Income');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt';

// Shared auth middleware
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ msg: "No token" });
        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ msg: "User not found" });
        const deviceMatch = user.activeDevices.find(d => d.token === token);
        if (!deviceMatch) return res.status(401).json({ msg: "Session expired" });
        req.user = user;
        next();
    } catch (err) {
        res.status(400).json({ msg: "Token is not valid" });
    }
};

// POST /api/income — Add income
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { amount, category, source, description, date, isRecurring, recurringInterval } = req.body;
        const income = new Income({
            user: req.user.id,
            amount,
            category: category || 'Other',
            source: source || '',
            description: description || '',
            date: date ? new Date(date) : new Date(),
            isRecurring: !!isRecurring,
            recurringInterval: recurringInterval || 'none'
        });
        const saved = await income.save();
        res.status(201).json(saved);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// GET /api/income — Get all income for user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const incomes = await Income.find({ user: req.user.id }).sort({ date: -1 });
        res.json(incomes);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// GET /api/income/report — Monthly income report
router.get('/report', authMiddleware, async (req, res) => {
    try {
        const incomes = await Income.find({ user: req.user.id });

        // Group by month
        const monthlyReport = {};
        incomes.forEach(inc => {
            const key = new Date(inc.date).toLocaleString('default', { month: 'long', year: 'numeric' });
            if (!monthlyReport[key]) monthlyReport[key] = { total: 0, entries: [] };
            monthlyReport[key].total += inc.amount;
            monthlyReport[key].entries.push(inc);
        });

        // Category breakdown
        const categoryBreakdown = {};
        incomes.forEach(inc => {
            if (!categoryBreakdown[inc.category]) categoryBreakdown[inc.category] = 0;
            categoryBreakdown[inc.category] += inc.amount;
        });

        res.json({ monthlyReport, categoryBreakdown });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// PUT /api/income/:id — Edit income
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        let income = await Income.findById(req.params.id);
        if (!income) return res.status(404).json({ msg: 'Income not found' });
        if (income.user.toString() !== req.user.id) return res.status(401).json({ msg: 'Not authorized' });

        const { amount, category, source, description, date, isRecurring, recurringInterval } = req.body;
        income = await Income.findByIdAndUpdate(req.params.id, {
            $set: {
                amount: amount ?? income.amount,
                category: category || income.category,
                source: source ?? income.source,
                description: description ?? income.description,
                date: date ? new Date(date) : income.date,
                isRecurring: isRecurring !== undefined ? isRecurring : income.isRecurring,
                recurringInterval: recurringInterval || income.recurringInterval
            }
        }, { new: true });

        res.json(income);
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

// DELETE /api/income/:id — Delete income
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        const income = await Income.findById(req.params.id);
        if (!income) return res.status(404).json({ msg: 'Income not found' });
        if (income.user.toString() !== req.user.id) return res.status(401).json({ msg: 'Not authorized' });
        await Income.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Income entry removed' });
    } catch (err) {
        res.status(500).send('Server Error');
    }
});

module.exports = router;
