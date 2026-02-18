const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');
const fs = require('fs-extra');

// Import routes
const pairRoute = require('./pair');
const scanRoute = require('./scan');

const app = express();
const PORT = process.env.PORT || 8000;

// Create temp directory
fs.ensureDirSync(path.join(__dirname, 'temp'));

// Middleware
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

// Routes
app.use('/pair', pairRoute);
app.use('/code', pairRoute); // Alias for backward compatibility
app.use('/scan', scanRoute);
app.use('/qr', scanRoute); // Alias for backward compatibility

// Serve HTML pages
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/pair-page', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

app.get('/scan-page', (req, res) => {
    res.sendFile(path.join(__dirname, 'scan.html'));
});

// 404 handler
app.use((req, res) => {
    res.status(404).sendFile(path.join(__dirname, 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════════════╗
║     🤖 MEGAN-MD PAIRING SYSTEM       ║
╠══════════════════════════════════════╣
║  ✅ Server is running                ║
║  📍 Port: ${PORT}                           ║
║  🌐 URL: http://localhost:${PORT}           ║
║                                        ║
║  📱 Pairing: http://localhost:${PORT}/pair-page ║
║  📸 QR Scan: http://localhost:${PORT}/scan-page ║
╚══════════════════════════════════════╝
    `);
});

module.exports = app;