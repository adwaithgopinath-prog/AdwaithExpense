const mongoose = require('mongoose');

const IncomeSchema = new mongoose.Schema({
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
        enum: ['Salary', 'Freelance', 'Business', 'Investment', 'Side Income', 'Gift', 'Other'],
        default: 'Other'
    },
    source: {
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
        enum: ['none', 'weekly', 'bi-weekly', 'monthly', 'yearly'],
        default: 'none'
    }
}, { timestamps: true });

module.exports = mongoose.model('Income', IncomeSchema);
