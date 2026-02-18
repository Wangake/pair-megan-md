const express = require('express');
const path = require('path');
const fs = require('fs-extra');
const pino = require('pino');
const QRCode = require('qrcode');
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require('@whiskeysockets/baileys');

const { generateId, getTimestamp, cleanupTemp } = require('./app');

const router = express.Router();

// Serve scan page
router.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'scan.html'));
});

// Generate QR code API
router.get('/generate', async (req, res) => {
    const sessionId = generateId(8);
    const sessionDir = path.join(__dirname, 'temp', sessionId);
    await fs.ensureDir(sessionDir);
    
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
        
        sock.ev.on('creds.update', saveCreds);
        
        // Handle QR code
        sock.ev.on('connection.update', async (s) => {
            const { connection, qr } = s;
            
            if (qr) {
                // Generate QR code image
                const qrImage = await QRCode.toDataURL(qr);
                
                if (!res.headersSent) {
                    res.json({
                        success: true,
                        qr: qrImage,
                        message: 'Scan this QR code with your WhatsApp'
                    });
                }
            }
            
            if (connection === 'open') {
                console.log(`✅ QR Scan successful`);
                
                const { time, date } = getTimestamp();
                
                // Get user info
                const userName = sock.user?.name || 'User';
                const userPhone = sock.user?.id?.split(':')[0] || 'Unknown';
                
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
        
    } catch (error) {
        console.error('QR generation error:', error);
        await cleanupTemp(sessionDir);
        
        if (!res.headersSent) {
            res.status(500).json({
                success: false,
                error: 'Failed to generate QR code'
            });
        }
    }
});

module.exports = router;