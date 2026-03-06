const express = require('express');
const router = express.Router();
const Expense = require('../models/Expense');
const jwt = require('jsonwebtoken');
const User = require('../models/User');

const JWT_SECRET = process.env.JWT_SECRET || 'super_secret_jwt';

// Middleware to check authentication
const authMiddleware = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.split(" ")[1];
        if (!token) return res.status(401).json({ msg: "No token, authorization denied" });

        const decoded = jwt.verify(token, JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) return res.status(404).json({ msg: "User not found" });

        // Device Check
        const deviceMatch = user.activeDevices.find(d => d.token === token);
        if (!deviceMatch) return res.status(401).json({ msg: "Session expired or logged out on this device" });

        req.user = user;
        next();
    } catch (err) {
        res.status(400).json({ msg: "Token is not valid" });
    }
};

// @route   POST /api/expenses
// @desc    Add a new expense
router.post('/', authMiddleware, async (req, res) => {
    try {
        const { amount, category, customCategory, description, date, isRecurring, recurringInterval } = req.body;
        
        const expense = new Expense({
            user: req.user.id,
            amount,
            category: category || 'Other',
            customCategory: customCategory || '',
            description: description || '',
            date: date ? new Date(date) : new Date(),
            isRecurring: !!isRecurring,
            recurringInterval: recurringInterval || 'none'
        });

        const savedExpense = await expense.save();
        res.status(201).json(savedExpense);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   GET /api/expenses
// @desc    Get all expenses for logged-in user
router.get('/', authMiddleware, async (req, res) => {
    try {
        const expenses = await Expense.find({ user: req.user.id }).sort({ date: -1 });
        res.json(expenses);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   PUT /api/expenses/:id
// @desc    Update an expense
router.put('/:id', authMiddleware, async (req, res) => {
    try {
        const { amount, category, customCategory, description, date, isRecurring, recurringInterval } = req.body;
        
        let expense = await Expense.findById(req.params.id);
        
        if (!expense) return res.status(404).json({ msg: 'Expense not found' });
        
        // Ensure user owns expense
        if (expense.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        const updateFields = {
            amount: amount || expense.amount,
            category: category || expense.category,
            customCategory: customCategory !== undefined ? customCategory : expense.customCategory,
            description: description !== undefined ? description : expense.description,
            date: date ? new Date(date) : expense.date,
            isRecurring: isRecurring !== undefined ? isRecurring : expense.isRecurring,
            recurringInterval: recurringInterval || expense.recurringInterval
        };

        expense = await Expense.findByIdAndUpdate(req.params.id, { $set: updateFields }, { new: true });
        
        res.json(expense);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// @route   DELETE /api/expenses/:id
// @desc    Delete an expense
router.delete('/:id', authMiddleware, async (req, res) => {
    try {
        let expense = await Expense.findById(req.params.id);
        
        if (!expense) return res.status(404).json({ msg: 'Expense not found' });
        
        if (expense.user.toString() !== req.user.id) {
            return res.status(401).json({ msg: 'Not authorized' });
        }

        await Expense.findByIdAndDelete(req.params.id);
        res.json({ msg: 'Expense removed' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
