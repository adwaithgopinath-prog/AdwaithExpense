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

// @route   GET /api/insights
// @desc    Get smart insights for spending
router.get('/', authMiddleware, async (req, res) => {
    try {
        const userId = req.user.id;
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const startOfMonth = new Date(currentYear, currentMonth, 1);
        const startOfLastMonth = new Date(currentYear, currentMonth - 1, 1);
        const endOfLastMonth = new Date(currentYear, currentMonth, 0);

        // 1. All expenses for current month
        const currentMonthExpenses = await Expense.find({
            user: userId,
            date: { $gte: startOfMonth, $lte: now }
        });

        // 2. All expenses for last month
        const lastMonthExpenses = await Expense.find({
            user: userId,
            date: { $gte: startOfLastMonth, $lte: endOfLastMonth }
        });

        // Calculate Totals
        const currentTotal = currentMonthExpenses.reduce((sum, exp) => sum + exp.amount, 0);
        const lastTotal = lastMonthExpenses.reduce((sum, exp) => sum + exp.amount, 0);

        // Category breakdown for current month
        const categoryTotals = {};
        currentMonthExpenses.forEach(exp => {
            const cat = exp.category || 'Other';
            categoryTotals[cat] = (categoryTotals[cat] || 0) + exp.amount;
        });

        // Category breakdown for last month
        const lastCategoryTotals = {};
        lastMonthExpenses.forEach(exp => {
            const cat = exp.category || 'Other';
            lastCategoryTotals[cat] = (lastCategoryTotals[cat] || 0) + exp.amount;
        });

        // highest spending category
        let highestCategory = { category: 'None', amount: 0 };
        for (const [category, amount] of Object.entries(categoryTotals)) {
            if (amount > highestCategory.amount) {
                highestCategory = { category, amount };
            }
        }

        // Average daily spending (current month)
        const daysPassed = now.getDate();
        const avgDailySpending = daysPassed > 0 ? (currentTotal / daysPassed) : 0;

        // Suggestions for reducing spending
        let suggestions = [];
        if (highestCategory.amount > 0) {
            if (['Entertainment', 'Dining', 'Shopping', 'Other'].includes(highestCategory.category)) {
                suggestions.push(`Your spending in "${highestCategory.category}" is high this month. Consider setting a stricter budget for this category.`);
            }
            
            // Compare with last month
            const lastMonthAmount = lastCategoryTotals[highestCategory.category] || 0;
            if (lastMonthAmount > 0 && highestCategory.amount > lastMonthAmount * 1.2) {
                suggestions.push(`You spent ${( (highestCategory.amount - lastMonthAmount) / lastMonthAmount * 100).toFixed(0)}% more on ${highestCategory.category} compared to last month.`);
            }
        }

        if (currentTotal > lastTotal && lastTotal > 0) {
            suggestions.push(`Your overall spending is up by ${(((currentTotal - lastTotal) / lastTotal) * 100).toFixed(0)}% from last month. Try to track smaller daily expenses.`);
        }

        if (suggestions.length === 0) {
            suggestions.push("Great job! Your spending habits look stable so far this month.");
        }

        res.json({
            currentMonthTotal: currentTotal,
            lastMonthTotal: lastTotal,
            highestCategory,
            avgDailySpending: avgDailySpending.toFixed(2),
            suggestions,
            categoryTotals
        });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

module.exports = router;
