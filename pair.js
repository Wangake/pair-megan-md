const {makeid} = require('./id');
const express = require('express');
const fs = require('fs');
const path = require('path');
let router = express.Router()
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason,
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");

// Silent logger (exactly like your example)
const silentLogger = {
    trace: () => {}, debug: () => {}, info: () => {},
    warn: () => {}, error: () => {}, fatal: () => {},
    child: () => silentLogger
};

function removeFile(FilePath){
    if(!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true })
};

// Store active pairings
const activePairings = new Map();
const SESSION_TIMEOUT = 5 * 60 * 1000; // 5 minutes

// Cleanup old sessions
setInterval(() => {
    const now = Date.now();
    for (const [sessionId, data] of activePairings.entries()) {
        if (now - data.createdAt > SESSION_TIMEOUT) {
            if (data.sock && data.sock.ws) {
                try { data.sock.ws.close(); } catch (e) {}
            }
            activePairings.delete(sessionId);
            removeFile('./temp/'+sessionId);
        }
    }
}, 30000);

router.get('/', async (req, res) => {
    const sessionId = makeid(8); // Make slightly longer ID
    let num = req.query.number;
    
    if (!num) {
        return res.json({ error: "Phone number is required" });
    }
    
    try {
        // Format phone number (EXACTLY like your example)
        num = num.replace(/[^0-9]/g,'');
        if (num.startsWith('0')) {
            num = '254' + num.slice(1);
        }
        if (!num.startsWith('254')) {
            num = '254' + num;
        }
        
        // Validate format (2547XXXXXXXX - 12 digits)
        if (!num.match(/^254[0-9]{9}$/)) {
            return res.json({ 
                error: "Invalid phone number format. Use: 2547XXXXXXXX (12 digits)" 
            });
        }

        console.log(`[${sessionId}] Starting pairing for: ${num}`);

        // Setup auth state
        const { state, saveCreds } = await useMultiFileAuthState('./temp/'+sessionId);

        // Get latest version like your example
        const { version } = await fetchLatestBaileysVersion();

        // Create socket with EXACT browser settings from your example
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({level: "silent"}).child({level: "silent"})),
            },
            logger: silentLogger,
            printQRInTerminal: false,
            browser: ["Ubuntu", "Chrome", "20.0.04"], // EXACT from your working example
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: true,
            syncFullHistory: false,
            generateHighQualityLinkPreview: false
        });

        // Wait for connection and get pairing code (EXACT approach from your example)
        const pairingCode = await new Promise((resolve, reject) => {
            let resolved = false;
            
            const connectionHandler = async (update) => {
                const { connection, lastDisconnect } = update;
                
                console.log(`[${sessionId}] Connection: ${connection}`);
                
                if (connection === 'open') {
                    console.log(`[${sessionId}] Connected, requesting code for ${num}`);
                    
                    // Wait a bit before requesting code (like your example)
                    setTimeout(async () => {
                        try {
                            // IMPORTANT: This requests WhatsApp to PROVIDE the code
                            const code = await sock.requestPairingCode(num);
                            
                            if (!resolved) {
                                resolved = true;
                                sock.ev.off('connection.update', connectionHandler);
                                console.log(`[${sessionId}] Code received: ${code}`);
                                resolve(code);
                            }
                        } catch (err) {
                            console.error(`[${sessionId}] Code request error:`, err);
                            if (!resolved) {
                                resolved = true;
                                sock.ev.off('connection.update', connectionHandler);
                                reject(err);
                            }
                        }
                    }, 2000); // 2 second delay like your example
                } 
                else if (connection === 'close') {
                    if (!resolved) {
                        const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                        console.log(`[${sessionId}] Closed:`, reason);
                        resolved = true;
                        sock.ev.off('connection.update', connectionHandler);
                        reject(new Error('Connection closed'));
                    }
                }
            };

            sock.ev.on('connection.update', connectionHandler);
            
            // Save credentials on update
            sock.ev.on('creds.update', saveCreds);
            
            // Overall timeout (60 seconds like your example)
            setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    sock.ev.off('connection.update', connectionHandler);
                    reject(new Error('Timeout (60s)'));
                }
            }, 60000);
        });

        // Store the session for monitoring
        activePairings.set(sessionId, {
            sock,
            state,
            saveCreds,
            phoneNumber: num,
            pairingCode,
            createdAt: Date.now(),
            status: 'waiting'
        });

        console.log(`[${sessionId}] ✅ Code for ${num}: ${pairingCode}`);

        // Format code for display (XXXX-XXXX-XXXX)
        const formattedCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;

        // Send code to browser immediately
        if (!res.headersSent) {
            res.json({
                success: true,
                sessionId,
                code: pairingCode,
                formatted: formattedCode,
                number: num,
                message: `Enter ${pairingCode} in WhatsApp Linked Devices`
            });
        }

        // Start monitoring for successful connection
        startPairingMonitor(sessionId);

    } catch (error) {
        console.error(`[${sessionId}] ❌ Error:`, error.message);
        
        // Clean up
        removeFile('./temp/'+sessionId);
        activePairings.delete(sessionId);
        
        if (!res.headersSent) {
            // Better error messages (like your example)
            let errorMessage = error.message;
            if (error.message.includes('Timeout')) {
                errorMessage = 'Connection timeout. Please try again.';
            } else if (error.message.includes('closed')) {
                errorMessage = 'WhatsApp connection closed. Please try again.';
            } else if (error.message.includes('rate')) {
                errorMessage = 'Rate limited. Please wait a moment.';
            }
            
            res.json({ 
                error: errorMessage
            });
        }
    }
});

// Monitor for successful pairing
function startPairingMonitor(sessionId) {
    const checkInterval = setInterval(async () => {
        const pairing = activePairings.get(sessionId);
        if (!pairing) {
            clearInterval(checkInterval);
            return;
        }

        // Check if registered (successfully paired)
        if (pairing.state.creds.registered && pairing.state.creds.me?.id) {
            clearInterval(checkInterval);
            console.log(`[${sessionId}] 📱 Paired: ${pairing.phoneNumber}`);
            
            try {
                // Send session to user
                await sendSessionToUser(pairing);
                pairing.status = 'completed';
            } catch (error) {
                console.error(`[${sessionId}] Send error:`, error.message);
            }
            
            // Clean up after 10 seconds
            setTimeout(() => {
                activePairings.delete(sessionId);
                removeFile('./temp/'+sessionId);
            }, 10000);
        }
        
        // Timeout check
        if (Date.now() - pairing.createdAt > SESSION_TIMEOUT) {
            clearInterval(checkInterval);
            console.log(`[${sessionId}] ⌛ Timeout`);
            activePairings.delete(sessionId);
            removeFile('./temp/'+sessionId);
        }
    }, 2000); // Check every 2 seconds like your example
}

// Send session to user (like your example)
async function sendSessionToUser(pairing) {
    try {
        // Read credentials
        let data = fs.readFileSync(path.join(__dirname, 'temp', pairing.sessionId, 'creds.json'));
        let b64data = Buffer.from(data).toString('base64');
        
        const userJid = pairing.state.creds.me.id;
        
        // Send session token
        await pairing.sock.sendMessage(userJid, {
            text: `🎉 *MEGAN-MD SESSION TOKEN*\n\n\`\`\`MEGAN-MD=${b64data}\`\`\`\n\nSave this for your MEGAN-MD bot.\n🔧 Engineered by WANGA`
        });
        
        // Send success message
        await pairing.sock.sendMessage(userJid, {
            text: `╔══════════════════════════════╗
║     ✅ SESSION CONNECTED     ║
╚══════════════════════════════╝

📱 *Number:* ${pairing.phoneNumber}
🔧 *Engineered by WANGA*
📢 *Channel:* @MEGAN_MD

✅ Your bot is ready to use!`
        });
        
        console.log(`[${pairing.sessionId}] 📨 Session sent`);
        
    } catch (error) {
        console.error(`[${pairing.sessionId}] Send error:`, error.message);
    }
}

// Optional: Status endpoint (like your example)
router.get('/status/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const pairing = activePairings.get(sessionId);
        
        if (!pairing) {
            return res.json({ 
                success: false, 
                error: 'Session expired or not found' 
            });
        }

        const timeLeft = Math.max(0, SESSION_TIMEOUT - (Date.now() - pairing.createdAt));
        
        res.json({
            success: true,
            status: pairing.status,
            isRegistered: pairing.state.creds.registered,
            pairingCode: pairing.pairingCode,
            phoneNumber: pairing.phoneNumber,
            timeLeft: Math.floor(timeLeft / 1000),
            message: pairing.status === 'completed' ? 
                '✅ Check your WhatsApp for session!' : 
                '⌛ Enter code on your phone'
        });
        
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

// Optional: Cancel endpoint (like your example)
router.delete('/cancel/:sessionId', async (req, res) => {
    try {
        const { sessionId } = req.params;
        const pairing = activePairings.get(sessionId);
        
        if (pairing && pairing.sock) {
            try { pairing.sock.ws.close(); } catch (e) {}
        }
        
        activePairings.delete(sessionId);
        removeFile('./temp/'+sessionId);
        
        res.json({ success: true, message: 'Cancelled' });
        
    } catch (error) {
        res.json({ success: false, error: error.message });
    }
});

module.exports = router;