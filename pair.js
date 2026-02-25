const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { default: makeWASocket, useMultiFileAuthState, Browsers } = require('gifted-baileys');
const pino = require('pino');
const { makeid } = require('./id');

// Store active sessions
const activeSessions = new Map();

// Clean up old sessions every 5 minutes
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, data] of activeSessions.entries()) {
        if (now - data.createdAt > 300000) { // 5 minutes
            if (data.sock) {
                try { data.sock.ws.close(); } catch (e) {}
            }
            activeSessions.delete(sessionId);
            
            const sessionPath = path.join(__dirname, 'temp', sessionId);
            if (fs.existsSync(sessionPath)) {
                fs.rmSync(sessionPath, { recursive: true, force: true });
            }
        }
    }
}, 60000);

router.get('/', async (req, res) => {
    const phoneNumber = req.query.number;
    const sessionId = makeid(8);
    
    // Validate phone number
    if (!phoneNumber) {
        return res.status(400).json({ 
            success: false, 
            error: 'Phone number is required' 
        });
    }
    
    // Clean phone number
    let cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    
    // Basic validation
    if (cleanNumber.length < 10 || cleanNumber.length > 15) {
        return res.status(400).json({ 
            success: false, 
            error: 'Invalid phone number format. Please include country code (e.g., 254700000000)' 
        });
    }
    
    console.log(`[${sessionId}] 📱 Pairing request for: ${cleanNumber}`);
    
    try {
        // Setup auth state
        const { state, saveCreds } = await useMultiFileAuthState(`./temp/${sessionId}`);
        
        // Create socket connection
        const sock = makeWASocket({
            auth: state,
            browser: Browsers.windows('Chrome'), // Using Chrome browser
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            syncFullHistory: false,
            markOnlineOnConnect: false
        });
        
        let pairingCode = null;
        let codeGenerated = false;
        
        // Generate pairing code after short delay
        setTimeout(async () => {
            try {
                if (!sock.authState.creds.registered && !codeGenerated) {
                    codeGenerated = true;
                    console.log(`[${sessionId}] 🔑 Generating code for ${cleanNumber}...`);
                    
                    // Request pairing code
                    const code = await sock.requestPairingCode(cleanNumber);
                    pairingCode = code;
                    
                    // Format code for display
                    const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
                    
                    console.log(`[${sessionId}] ✅ Code: ${formattedCode}`);
                    
                    // Send code back to client
                    if (!res.headersSent) {
                        res.json({
                            success: true,
                            sessionId: sessionId,
                            code: formattedCode,
                            rawCode: code,
                            phone: cleanNumber,
                            message: 'Enter this code in WhatsApp → Settings → Linked Devices'
                        });
                    }
                    
                    // Store session
                    activeSessions.set(sessionId, {
                        sock,
                        state,
                        phoneNumber: cleanNumber,
                        pairingCode: code,
                        createdAt: Date.now(),
                        status: 'waiting'
                    });
                }
            } catch (err) {
                console.error(`[${sessionId}] ❌ Code generation error:`, err.message);
                
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: err.message || 'Failed to generate pairing code'
                    });
                }
            }
        }, 2000);
        
        // Handle connection updates
        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect } = update;
            
            if (connection === 'open') {
                console.log(`[${sessionId}] ✅ Successfully paired!`);
                
                // Update session status
                const session = activeSessions.get(sessionId);
                if (session) {
                    session.status = 'connected';
                    
                    // Save credentials
                    setTimeout(() => {
                        try {
                            const credsPath = path.join(__dirname, 'temp', sessionId, 'creds.json');
                            if (fs.existsSync(credsPath)) {
                                const creds = fs.readFileSync(credsPath, 'utf8');
                                console.log(`[${sessionId}] 💾 Session saved`);
                            }
                        } catch (e) {}
                    }, 2000);
                }
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`[${sessionId}] 🔌 Connection closed: ${statusCode || 'unknown'}`);
            }
        });
        
        // Save credentials on update
        sock.ev.on('creds.update', saveCreds);
        
        // Set timeout for code generation
        setTimeout(() => {
            if (!pairingCode && !res.headersSent) {
                res.status(504).json({
                    success: false,
                    error: 'Request timeout. Please try again.'
                });
            }
        }, 25000);
        
    } catch (error) {
        console.error(`[${sessionId}] ❌ Fatal error:`, error.message);
        
        // Clean up
        const sessionPath = path.join(__dirname, 'temp', sessionId);
        if (fs.existsSync(sessionPath)) {
            fs.rmSync(sessionPath, { recursive: true, force: true });
        }
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Server error. Please try again.'
            });
        }
    }
});

// Status check endpoint
router.get('/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const session = activeSessions.get(sessionId);
    
    if (!session) {
        return res.json({
            success: false,
            error: 'Session not found or expired'
        });
    }
    
    res.json({
        success: true,
        status: session.status,
        phone: session.phoneNumber,
        code: session.pairingCode,
        timeLeft: Math.max(0, 300 - Math.floor((Date.now() - session.createdAt) / 1000))
    });
});

module.exports = router;