const { makeid } = require('./id');

// Generate random ID
function generateId(length = 6) {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Format phone number
function formatPhoneNumber(number) {
    // Remove all non-digits
    let cleaned = number.replace(/\D/g, '');
    
    // Ensure it starts with country code
    if (cleaned.startsWith('0')) {
        cleaned = '254' + cleaned.substring(1);
    } else if (!cleaned.startsWith('254')) {
        cleaned = '254' + cleaned;
    }
    
    return cleaned;
}

// Validate phone number
function isValidPhone(number) {
    const cleaned = number.replace(/\D/g, '');
    return cleaned.length >= 10 && cleaned.length <= 15;
}

// Format timestamp
function getTimestamp() {
    const now = new Date();
    const time = now.toLocaleTimeString('en-US', { 
        hour12: true, 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    const date = now.toLocaleDateString('en-GB', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    });
    return { time, date };
}

// Clean up temp directory
async function cleanupTemp(dir) {
    const fs = require('fs-extra');
    const path = require('path');
    
    if (fs.existsSync(dir)) {
        await fs.remove(dir);
    }
}

module.exports = {
    generateId,
    formatPhoneNumber,
    isValidPhone,
    getTimestamp,
    cleanupTemp
};