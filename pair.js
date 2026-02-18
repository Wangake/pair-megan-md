const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

const { generateId, formatPhoneNumber, isValidPhone, getTimestamp, cleanupTemp } = require('./app');

const router = express.Router();

// Serve pairing page
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'pair.html'));
});

// Generate pairing code API
router.get('/generate', async (req, res) => {
    const phoneNumber = req.query.number;
    
    if (!phoneNumber) {
        return res.status(400).json({
            success: false,
            error: 'Phone number is required'
        });
    }
    
    if (!isValidPhone(phoneNumber)) {
        return res.status(400).json({
            success: false,
            error: 'Invalid phone number. Use country code e.g., 254700000000'
        });
    }
    
    const sessionId = generateId(8);
    const sessionDir = path.join(__dirname, 'temp', sessionId);
    await fs.ensureDir(sessionDir);
    
    const formattedNumber = formatPhoneNumber(phoneNumber);
    
    try {
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        
        const sock = makeWASocket({
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({ level: 'silent' }))
            },
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            browser: Browsers.macOS('Chrome')
        });
        
        // Handle credentials update
        sock.ev.on('creds.update', saveCreds);
        
        // Request pairing code if not registered
        if (!sock.authState.creds.registered) {
            await delay(1000);
            
            try {
                const pairingCode = await sock.requestPairingCode(formattedNumber);
                
                // Send response with pairing code
                res.json({
                    success: true,
                    code: pairingCode,
                    number: formattedNumber,
                    message: 'Enter this code in WhatsApp'
                });
                
                // Wait for connection
                sock.ev.on('connection.update', async (s) => {
                    const { connection } = s;
                    
                    if (connection === 'open') {
                        console.log(`✅ Paired successfully: ${formattedNumber}`);
                        
                        const { time, date } = getTimestamp();
                        
                        // Get user info
                        const userName = sock.user?.name || 'User';
                        const userPhone = sock.user?.id?.split(':')[0] || formattedNumber;
                        
                        // Send fancy success message
                        await sock.sendMessage(sock.user.id, {
                            text: `┏━━━━━━━━━━━━━━━━━━━┓\n┃ *𝐌𝐄𝐆𝐀𝐍-𝐌𝐃*\n┗━━━━━━━━━━━━━━━━━━━┛\n\n✅ *CONNECTED SUCCESSFULLY!*\n\n👤 *Name:* ${userName}\n📱 *Phone:* ${userPhone}\n⏰ *Time:* ${time}\n📅 *Date:* ${date}\n\n> created by tracker wanga`
                        });
                        
                        // Read session file
                        await delay(2000);
                        const credsPath = path.join(sessionDir, 'creds.json');
                        
                        if (fs.existsSync(credsPath)) {
                            const credsData = await fs.readFile(credsPath, 'utf8');
                            const base64Creds = Buffer.from(credsData).toString('base64');
                            
                            // Send session data with prefix
                            await sock.sendMessage(sock.user.id, {
                                text: `MEGAN-MD=${base64Creds}`
                            });
                            
                            console.log(`✅ Session sent to ${userPhone}`);
                        }
                        
                        await delay(3000);
                        await sock.ws.close();
                        await cleanupTemp(sessionDir);
                    }
                });
                
            } catch (pairError) {
                console.error('Pairing error:', pairError);
                await cleanupTemp(sessionDir);
                
                if (!res.headersSent) {
                    res.status(500).json({
                        success: false,
                        error: 'Failed to generate pairing code. Please try again.'
                    });
                }
            }
        }
        
    } catch (error) {
        console.error('Server error:', error);
        await cleanupTemp(sessionDir);
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Server error. Please try again.'
            });
        }
    }
});

// API route for AJAX calls
router.get('/api', (req, res) => {
    res.json({
        name: 'MEGAN-MD Pairing API',
        version: '1.0.0',
        endpoints: {
            generate: '/pair/generate?number=254700000000'
        }
    });
});

module.exports = router;