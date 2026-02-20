const {makeid} = require('./id');
const express = require('express');
const fs = require('fs');
let router = express.Router()
const pino = require("pino");
const {
    default: makeWASocket,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers,
    DisconnectReason
} = require("@whiskeysockets/baileys");
const { Boom } = require("@hapi/boom");

function removeFile(FilePath){
    if(!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true })
};

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;
    
    if (!num) {
        return res.send({ error: "Phone number is required" });
    }
    
    async function MEGAN_MD_PAIR_CODE() {
        const {
            state,
            saveCreds
        } = await useMultiFileAuthState('./temp/'+id)
        
        try {
            // Format phone number
            num = num.replace(/[^0-9]/g,'');
            if (num.startsWith('0')) {
                num = '254' + num.slice(1);
            }
            if (!num.startsWith('254')) {
                num = '254' + num;
            }
            
            // Create socket
            let sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({level: "silent"}).child({level: "silent"})),
                },
                printQRInTerminal: false,
                logger: pino({ level: "silent" }).child({ level: "silent" }),
                browser: Browsers.macOS('Chrome'),
                syncFullHistory: false,
                markOnlineOnConnect: false
            });
            
            // Handle connection updates
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                
                if (qr) {
                    console.log('QR received (ignoring, using pairing code)');
                }
                
                if (connection === 'open') {
                    console.log('Connection opened for ID:', id);
                    
                    // Wait for credentials to be fully saved
                    await delay(3000);
                    
                    try {
                        // Read credentials
                        let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                        let b64data = Buffer.from(data).toString('base64');
                        
                        // Send session to user
                        let sessionMsg = await sock.sendMessage(sock.user.id, { 
                            text: 'MEGAN-MD=' + b64data 
                        });
                        
                        // Send success message
                        let MEGAN_MD_TEXT = `
╔══════════════════════════════╗
║     𝐌𝐄𝐆𝐀𝐍-𝐌𝐃 SESSION       ║
║   Multi-Device Engineered    ║
╠══════════════════════════════╣
║  ✅ SESSION CONNECTED!       ║
║  📱 Session ID Generated     ║
║  🔑 MEGAN-MD=your_session    ║
╠══════════════════════════════╣
║  📢 CHANNEL:                 ║
║  https://whatsapp.com/channel/║
║  0029VbB6d0KKAwEdvcgqrH26    ║
╠══════════════════════════════╣
║  👑 OWNER: 254111385747      ║
║  💻 GITHUB:                  ║
║  github.com/mrpopkid/        ║
╠══════════════════════════════╣
║  🔧 Engineered by WANGA      ║
║  🛠️  Multi-Device Expert      ║
╚══════════════════════════════╝

📌 Copy your session and use in MEGAN-MD bot
⭐ Star the repo if you found this helpful!
`;
                        
                        await sock.sendMessage(sock.user.id, { 
                            text: MEGAN_MD_TEXT 
                        }, { quoted: sessionMsg });
                        
                        console.log('Session sent successfully for ID:', id);
                        
                        // Close connection after sending
                        await delay(2000);
                        await sock.ws.close();
                        
                        // Clean up temp folder after delay
                        setTimeout(() => {
                            removeFile('./temp/'+id);
                        }, 5000);
                        
                    } catch (err) {
                        console.error('Error sending session:', err);
                    }
                }
                
                else if (connection === 'close') {
                    const reason = new Boom(lastDisconnect?.error)?.output?.statusCode;
                    
                    if (reason === DisconnectReason.loggedOut) {
                        console.log('Logged out for ID:', id);
                        removeFile('./temp/'+id);
                    } else if (reason === DisconnectReason.connectionClosed) {
                        console.log('Connection closed for ID:', id);
                    } else if (reason === DisconnectReason.timedOut) {
                        console.log('Connection timeout for ID:', id);
                        // Try to reconnect
                        setTimeout(() => {
                            if (!res.headersSent) {
                                res.send({ error: "Connection timeout, please try again" });
                            }
                            removeFile('./temp/'+id);
                        }, 5000);
                    }
                }
                
                else if (connection === 'connecting') {
                    console.log('Connecting for ID:', id);
                }
            });
            
            // Request pairing code if not registered
            if (!sock.authState.creds.registered) {
                console.log('Requesting pairing code for:', num);
                
                try {
                    const pairingCode = await sock.requestPairingCode(num);
                    
                    // Format code for display (XXXX-XXXX-XXXX)
                    let formattedCode = pairingCode;
                    if (pairingCode.length >= 8) {
                        formattedCode = pairingCode.match(/.{1,4}/g)?.join('-') || pairingCode;
                    }
                    
                    // Send code to browser
                    if (!res.headersSent) {
                        res.send({ 
                            code: pairingCode,
                            formatted: formattedCode,
                            number: num,
                            message: "Enter this code in WhatsApp Web to connect"
                        });
                        
                        console.log('Pairing code sent for:', num, 'Code:', pairingCode);
                    }
                    
                } catch (err) {
                    console.error('Error requesting pairing code:', err);
                    
                    if (!res.headersSent) {
                        res.send({ 
                            error: "Failed to get pairing code",
                            details: err.message 
                        });
                    }
                    
                    // Clean up
                    await sock.ws.close();
                    removeFile('./temp/'+id);
                }
            }
            
            // Save credentials on update
            sock.ev.on('creds.update', saveCreds);
            
        } catch (err) {
            console.error('Service error:', err);
            
            if (!res.headersSent) {
                res.send({ 
                    error: "Service is currently unavailable",
                    details: err.message 
                });
            }
            
            removeFile('./temp/'+id);
        }
    }
    
    return await MEGAN_MD_PAIR_CODE()
});

module.exports = router;