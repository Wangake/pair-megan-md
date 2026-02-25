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

function removeFile(FilePath){
    if(!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true })
};

// Store active pairings
const activePairings = new Map();

router.get('/', async (req, res) => {
    const sessionId = makeid(8);
    let num = req.query.number;

    if (!num) {
        return res.json({ error: "Phone number is required" });
    }

    try {
        // Format phone number
        num = num.replace(/[^0-9]/g,'');
        
        // **CRITICAL FIX: Don't force 254 if it's not Kenyan**
        // Just use the number as provided, but ensure it has country code
        if (num.length <= 10) {
            return res.json({ 
                error: "Please include country code (e.g., 254 for Kenya, 92 for Pakistan)" 
            });
        }

        console.log(`[${sessionId}] Starting pairing for: ${num}`);

        // Setup auth state
        const { state, saveCreds } = await useMultiFileAuthState('./temp/'+sessionId);
        const { version } = await fetchLatestBaileysVersion();

        // Create socket
        const sock = makeWASocket({
            version,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, pino({level: "silent"})),
            },
            logger: pino({ level: "silent" }),
            printQRInTerminal: false,
            browser: Browsers.ubuntu('Chrome'), // Use the built-in browser constant
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            markOnlineOnConnect: false, // Don't mark online until paired
            syncFullHistory: false,
            generateHighQualityLinkPreview: false
        });

        // **CRITICAL FIX: Request pairing code IMMEDIATELY**
        // Don't wait for connection.open - request code right away
        let pairingCode = null;
        let codeRequested = false;

        // Request code after a short delay
        setTimeout(async () => {
            if (!codeRequested && sock.authState && !sock.authState.creds.registered) {
                try {
                    codeRequested = true;
                    console.log(`[${sessionId}] Requesting pairing code for ${num}...`);
                    
                    // This is the key - requestPairingCode works when not registered
                    const code = await sock.requestPairingCode(num);
                    pairingCode = code;
                    
                    console.log(`[${sessionId}] ✅ Code received: ${code}`);
                    
                    // Format code for display
                    const formattedCode = code.match(/.{1,4}/g)?.join('-') || code;
                    
                    // Send code to browser immediately
                    if (!res.headersSent) {
                        res.json({
                            success: true,
                            sessionId,
                            code: code,
                            formatted: formattedCode,
                            number: num,
                            message: `Enter ${formattedCode} in WhatsApp Linked Devices`
                        });
                    }
                    
                    // Store session
                    activePairings.set(sessionId, {
                        sock,
                        state,
                        saveCreds,
                        phoneNumber: num,
                        pairingCode: code,
                        createdAt: Date.now(),
                        status: 'waiting'
                    });
                    
                } catch (err) {
                    console.error(`[${sessionId}] Code request error:`, err.message);
                    if (!res.headersSent) {
                        res.json({ error: err.message });
                    }
                }
            }
        }, 2000);

        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect } = update;
            
            console.log(`[${sessionId}] Connection: ${connection}`);

            if (connection === 'open') {
                console.log(`[${sessionId}] ✅ Successfully paired with WhatsApp!`);
                
                // Update status
                const pairing = activePairings.get(sessionId);
                if (pairing) {
                    pairing.status = 'paired';
                    
                    // Send session info to user
                    try {
                        await delay(3000);
                        
                        // Read credentials
                        let data = fs.readFileSync(path.join(__dirname, 'temp', sessionId, 'creds.json'));
                        let b64data = Buffer.from(data).toString('base64');
                        
                        const userJid = sock.user.id;
                        
                        // Send session token
                        await sock.sendMessage(userJid, {
                            text: `✅ *MEGAN-MD SESSION*\n\n\`\`\`${b64data}\`\`\`\n\nSave this for your bot.`
                        });
                        
                        console.log(`[${sessionId}] Session sent to user`);
                        
                    } catch (sendError) {
                        console.error(`[${sessionId}] Send error:`, sendError.message);
                    }
                }
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`[${sessionId}] Closed:`, statusCode);
                
                // Clean up
                activePairings.delete(sessionId);
                setTimeout(() => {
                    removeFile('./temp/'+sessionId);
                }, 5000);
            }
        });

        // Save credentials
        sock.ev.on('creds.update', saveCreds);

        // Set timeout for code generation
        setTimeout(() => {
            if (!pairingCode && !res.headersSent) {
                res.json({ error: "Failed to generate pairing code. Please try again." });
            }
        }, 30000);

    } catch (error) {
        console.error(`[${sessionId}] Error:`, error.message);
        removeFile('./temp/'+sessionId);
        activePairings.delete(sessionId);
        
        if (!res.headersSent) {
            res.json({ error: error.message });
        }
    }
});

module.exports = router;