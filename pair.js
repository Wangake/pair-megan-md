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
    fetchLatestBaileysVersion
} = require("@whiskeysockets/baileys");

function removeFile(FilePath){
    if(!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true })
};

// Clean up old sessions every 10 minutes
setInterval(() => {
    const tempDir = path.join(__dirname, 'temp');
    if (fs.existsSync(tempDir)) {
        const sessions = fs.readdirSync(tempDir);
        const now = Date.now();
        sessions.forEach(session => {
            const sessionPath = path.join(tempDir, session);
            const stats = fs.statSync(sessionPath);
            if (now - stats.mtimeMs > 600000) { // 10 minutes
                fs.rmSync(sessionPath, { recursive: true, force: true });
                console.log(`Cleaned up old session: ${session}`);
            }
        });
    }
}, 600000);

router.get('/', async (req, res) => {
    const id = makeid(6);
    let num = req.query.number;
    
    console.log(`[${id}] 📱 Pairing request for: ${num}`);
    
    if (!num) {
        return res.json({ error: "Phone number required" });
    }
    
    // Clean number
    num = num.replace(/[^0-9]/g, '');
    
    // Validate
    if (num.length < 10 || num.length > 15) {
        return res.json({ error: "Invalid phone number. Include country code (e.g., 254 for Kenya)" });
    }
    
    // Create temp directory
    const sessionDir = path.join(__dirname, 'temp', id);
    if (!fs.existsSync(sessionDir)) {
        fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    // Send immediate response to let client know we're processing
    res.json({ 
        status: "processing", 
        message: "Generating pairing code...",
        sessionId: id 
    });
    
    // Process in background
    processPairing(num, id, sessionDir).catch(err => {
        console.error(`[${id}] Background error:`, err);
    });
});

async function processPairing(num, id, sessionDir) {
    try {
        console.log(`[${id}] Starting pairing process for ${num}`);
        
        const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
        const { version } = await fetchLatestBaileysVersion();
        
        // Create socket with Chrome browser
        const sock = makeWASocket({
            version,
            auth: state,
            printQRInTerminal: false,
            logger: pino({ level: 'silent' }),
            // CHROME BROWSER FORMAT - Try these different formats:
            browser: ["Chrome", "Linux", "120.0.6099.109"], // Full Chrome version
            // browser: ["Chrome (Linux)", "", ""], // Alternative format
            // browser: ["Google Chrome", "Windows", "120.0.6099.109"], // Another format
            syncFullHistory: false,
            markOnlineOnConnect: false,
            connectTimeoutMs: 60000,
            defaultQueryTimeoutMs: 60000,
            keepAliveIntervalMs: 10000,
            generateHighQualityLinkPreview: false
        });
        
        console.log(`[${id}] Socket created, waiting for connection...`);
        
        // Track if code was sent
        let codeSent = false;
        let codeFile = path.join(sessionDir, 'code.txt');
        
        // Handle connection updates
        sock.ev.on('connection.update', async (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            console.log(`[${id}] Connection update:`, connection);
            
            if (qr) {
                console.log(`[${id}] QR received (ignoring)`);
            }
            
            if (connection === 'open') {
                console.log(`[${id}] ✅ Connection opened - device paired!`);
                
                try {
                    // Send session to user
                    await delay(3000);
                    
                    if (fs.existsSync(path.join(sessionDir, 'creds.json'))) {
                        let data = fs.readFileSync(path.join(sessionDir, 'creds.json'));
                        let b64data = Buffer.from(data).toString('base64');
                        
                        // Get user's JID
                        const userJid = sock.user.id;
                        
                        // Read the code that was generated
                        let generatedCode = "Unknown";
                        if (fs.existsSync(codeFile)) {
                            generatedCode = fs.readFileSync(codeFile, 'utf8');
                        }
                        
                        // Send session via WhatsApp
                        await sock.sendMessage(userJid, { 
                            text: `✅ *MEGAN-MD SESSION*\n\nPhone: ${num}\nCode: ${generatedCode}\n\n\`\`\`${b64data}\`\`\`\n\nSave this for your bot.` 
                        });
                        
                        console.log(`[${id}] Session sent to user`);
                    }
                } catch (sendError) {
                    console.error(`[${id}] Error sending session:`, sendError.message);
                }
                
                // Close after sending
                setTimeout(async () => {
                    await sock.ws.close();
                    console.log(`[${id}] Connection closed`);
                }, 5000);
            }
            
            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                console.log(`[${id}] Connection closed:`, statusCode);
                
                // If we haven't generated a code yet and this is an error, try alternative browser format
                if (!codeSent && statusCode === 500) {
                    console.log(`[${id}] Connection closed with 500, trying alternative browser format...`);
                    // Will be handled by retry logic in main function
                }
            }
        });
        
        // Handle credentials update
        sock.ev.on('creds.update', saveCreds);
        
        // Request pairing code after socket is ready
        await delay(3000);
        
        if (!sock.authState.creds.registered) {
            console.log(`[${id}] Requesting pairing code for ${num}...`);
            
            try {
                const code = await sock.requestPairingCode(num);
                const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                
                console.log(`[${id}] ✅ Code generated: ${formattedCode}`);
                
                // Save code to file
                fs.writeFileSync(codeFile, formattedCode);
                codeSent = true;
                
                // Also save to a status file that frontend can read
                fs.writeFileSync(path.join(sessionDir, 'status.json'), JSON.stringify({
                    code: formattedCode,
                    status: 'code_ready',
                    phone: num,
                    timestamp: Date.now()
                }));
                
            } catch (codeError) {
                console.error(`[${id}] ❌ Code request error:`, codeError.message);
                
                // Save error to file
                fs.writeFileSync(path.join(sessionDir, 'error.json'), JSON.stringify({
                    error: codeError.message,
                    timestamp: Date.now()
                }));
                
                await sock.ws.close();
            }
        }
        
        // Wait for connection to close or timeout
        await delay(60000);
        
        // Clean up if still open
        try {
            await sock.ws.close();
        } catch (e) {}
        
    } catch (error) {
        console.error(`[${id}] ❌ Fatal error:`, error.message);
        
        // Save error
        fs.writeFileSync(path.join(sessionDir, 'error.json'), JSON.stringify({
            error: error.message,
            timestamp: Date.now()
        }));
    }
}

// Status check endpoint
router.get('/status/:sessionId', (req, res) => {
    const { sessionId } = req.params;
    const sessionDir = path.join(__dirname, 'temp', sessionId);
    
    if (!fs.existsSync(sessionDir)) {
        return res.json({ status: 'expired' });
    }
    
    // Check for code
    const codeFile = path.join(sessionDir, 'code.txt');
    if (fs.existsSync(codeFile)) {
        const code = fs.readFileSync(codeFile, 'utf8');
        return res.json({ 
            status: 'code_ready', 
            code: code 
        });
    }
    
    // Check for error
    const errorFile = path.join(sessionDir, 'error.json');
    if (fs.existsSync(errorFile)) {
        const error = JSON.parse(fs.readFileSync(errorFile, 'utf8'));
        return res.json({ 
            status: 'error', 
            error: error.error 
        });
    }
    
    res.json({ status: 'processing' });
});

module.exports = router;