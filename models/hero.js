const mongoose = require('mongoose');

const heroSchema = new mongoose.Schema({
    title: { type: String, required: true }, // Teks besar (ex: INDONESIAN WHOLESALE...)
    subtitle: { type: String }, // Teks kecil (ex: ESSENTIAL OILS...)
    image: { type: String, required: true },
    order: { type: Number, default: 0 }
});

module.exports = mongoose.model('Hero', heroSchema);