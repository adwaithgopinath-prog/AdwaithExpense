const mongoose = require('mongoose');

const ExpenseSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    category: {
        type: String,
        required: true,
        default: 'Other'
    },
    customCategory: {
        type: String,
        default: ''
    },
    description: {
        type: String,
        default: ''
    },
    date: {
        type: Date,
        default: Date.now,
        required: true
    },
    isRecurring: {
        type: Boolean,
        default: false
    },
    recurringInterval: {
        type: String,
        enum: ['none', 'daily', 'weekly', 'monthly', 'yearly'],
        default: 'none'
    }
}, { timestamps: true });

module.exports = mongoose.model('Expense', ExpenseSchema);
