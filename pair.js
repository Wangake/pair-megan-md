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
    makeCacheableSignalKeyStore
} = require("@whiskeysockets/baileys");

function removeFile(FilePath){
    if(!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true })
};

router.get('/', async (req, res) => {
    const id = makeid(6);
    let num = req.query.number;
    
    // Log the request
    console.log(`[${id}] Pairing request for number: ${num}`);
    
    if (!num) {
        return res.json({ error: "Phone number required" });
    }
    
    async function PAIR_CODE() {
        try {
            // Clean the number - remove all non-digits
            num = num.replace(/[^0-9]/g, '');
            console.log(`[${id}] Cleaned number: ${num}`);
            
            // Validate number length (should be 10-15 digits with country code)
            if (num.length < 10 || num.length > 15) {
                console.log(`[${id}] Invalid number length: ${num.length}`);
                if (!res.headersSent) {
                    return res.json({ error: "Invalid phone number. Include country code (e.g., 254 for Kenya)" });
                }
            }
            
            // Create temp directory if it doesn't exist
            const tempDir = path.join(__dirname, 'temp');
            if (!fs.existsSync(tempDir)) {
                fs.mkdirSync(tempDir, { recursive: true });
            }
            
            const sessionDir = path.join(tempDir, id);
            
            const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
            
            // Create socket with minimal configuration
            const sock = makeWASocket({
                auth: state,
                printQRInTerminal: false,
                logger: pino({ level: 'silent' }),
                browser: ["Chrome (Linux)", "", ""], // Working format
                syncFullHistory: false,
                markOnlineOnConnect: false,
                connectTimeoutMs: 60000,
                defaultQueryTimeoutMs: 60000
            });
            
            console.log(`[${id}] Socket created, waiting before requesting code...`);
            
            // Wait a bit for socket to initialize
            await delay(3000);
            
            if (!sock.authState.creds.registered) {
                console.log(`[${id}] Requesting pairing code for ${num}...`);
                
                try {
                    // Request the code
                    const code = await sock.requestPairingCode(num);
                    
                    // Format for display
                    const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                    
                    console.log(`[${id}] ✅ Code generated: ${formattedCode}`);
                    
                    if (!res.headersSent) {
                        res.json({ code: formattedCode });
                    }
                    
                    // Store code in session file
                    fs.writeFileSync(path.join(sessionDir, 'code.txt'), formattedCode);
                    
                } catch (codeError) {
                    console.error(`[${id}] ❌ Code request error:`, codeError.message);
                    if (!res.headersSent) {
                        res.json({ error: codeError.message });
                    }
                    await sock.ws.close();
                    await removeFile(sessionDir);
                    return;
                }
            } else {
                console.log(`[${id}] Already registered`);
                if (!res.headersSent) {
                    res.json({ error: "Device already registered" });
                }
                await sock.ws.close();
                await removeFile(sessionDir);
                return;
            }
            
            // Handle connection updates
            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect, qr } = s;
                
                if (qr) {
                    console.log(`[${id}] QR received (ignoring)`);
                }
                
                if (connection === "open") {
                    console.log(`[${id}] ✅ Device successfully paired!`);
                    
                    // Send session to user
                    try {
                        await delay(3000);
                        
                        if (fs.existsSync(path.join(sessionDir, 'creds.json'))) {
                            let data = fs.readFileSync(path.join(sessionDir, 'creds.json'));
                            let b64data = Buffer.from(data).toString('base64');
                            
                            // Get user's JID
                            const userJid = sock.user.id;
                            
                            // Send session via WhatsApp
                            await sock.sendMessage(userJid, { 
                                text: `*MEGAN-MD SESSION*\n\n\`\`\`${b64data}\`\`\`\n\nSave this for your bot.` 
                            });
                            
                            console.log(`[${id}] Session sent to user`);
                        }
                    } catch (sendError) {
                        console.error(`[${id}] Error sending session:`, sendError.message);
                    }
                    
                    // Close connection after delay
                    setTimeout(async () => {
                        await sock.ws.close();
                        await removeFile(sessionDir);
                        console.log(`[${id}] Session cleaned up`);
                    }, 5000);
                    
                } else if (connection === "close") {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    console.log(`[${id}] Connection closed: ${statusCode || 'unknown'}`);
                    
                    // Only restart if not a logout and we haven't sent response yet
                    if (statusCode !== 401 && !res.headersSent) {
                        // Don't automatically restart here as it might cause loops
                        console.log(`[${id}] Connection closed but code may still work`);
                    }
                }
            });
            
            // Set a timeout to clean up if no response sent
            setTimeout(() => {
                if (!res.headersSent) {
                    console.log(`[${id}] Timeout - no response sent`);
                    res.json({ error: "Request timeout. Please try again." });
                    sock.ws.close();
                    removeFile(sessionDir);
                }
            }, 30000);
            
        } catch (err) {
            console.error(`[${id}] ❌ Fatal error:`, err.message);
            console.error(err.stack);
            
            await removeFile('./temp/'+id);
            
            if (!res.headersSent) {
                res.json({ error: err.message || "Service unavailable" });
            }
        }
    }
    
    await PAIR_CODE()
});

module.exports = router;