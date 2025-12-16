const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
    title: { type: String, required: true },
    content: { type: String, required: true },
    image: { type: String, required: true },
    author: { type: String, default: 'Admin' },
    views: { type: Number, default: 30000 }, 
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Article', articleSchema);