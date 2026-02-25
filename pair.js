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
    Browsers
} = require("@whiskeysockets/baileys"); // Using official Baileys

function removeFile(FilePath){
    if(!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true })
};

router.get('/', async (req, res) => {
    const id = makeid(6);
    let num = req.query.number;
    
    async function PAIR_CODE() {
        const { state, saveCreds } = await useMultiFileAuthState('./temp/'+id)
        
        try {
            // CRITICAL: Use the browser format that works
            const sock = makeWASocket({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({level: "silent"})),
                },
                printQRInTerminal: false,
                logger: pino({level: "silent"}),
                // THIS IS THE KEY - "Name (OS)" format [citation:10]
                browser: ["Chrome (Linux)", "", ""],
                // Or try this alternative [citation:7]:
                // browser: ["Windows", "Chrome", "Chrome 114.0.5735.198"],
                syncFullHistory: false,
                markOnlineOnConnect: false, // Important for notifications [citation:1]
                generateHighQualityLinkPreview: false
            });
            
            // Wait a moment for connection to initialize
            await delay(2000);
            
            if(!sock.authState.creds.registered) {
                // Clean the number
                num = num.replace(/[^0-9]/g,'');
                
                console.log(`Requesting pairing code for ${num}`);
                
                // Request the code
                const code = await sock.requestPairingCode(num);
                
                // Format for display
                const formattedCode = code?.match(/.{1,4}/g)?.join("-") || code;
                
                if(!res.headersSent){
                    await res.send({code: formattedCode});
                    console.log(`✅ Code sent: ${formattedCode}`);
                }
            }
            
            // Handle connection
            sock.ev.on('creds.update', saveCreds);
            
            sock.ev.on("connection.update", async (s) => {
                const { connection, lastDisconnect } = s;
                
                if (connection == "open") {
                    console.log("✅ Connection opened - device paired!");
                    
                    // Send session to user
                    await delay(5000);
                    try {
                        let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                        let b64data = Buffer.from(data).toString('base64');
                        
                        await sock.sendMessage(sock.user.id, { 
                            text: 'MEGAN-MD SESSION\n\n' + b64data 
                        });
                        
                        console.log("Session sent to user");
                    } catch (e) {
                        console.log("Error sending session:", e.message);
                    }
                    
                    await delay(2000);
                    await sock.ws.close();
                    await removeFile('./temp/'+id);
                    
                } else if (connection === "close") {
                    const statusCode = lastDisconnect?.error?.output?.statusCode;
                    if (statusCode !== 401) { // Not logged out
                        console.log("Connection closed, restarting...");
                        await delay(10000);
                        PAIR_CODE();
                    }
                }
            });
            
        } catch (err) {
            console.log("Error:", err.message);
            await removeFile('./temp/'+id);
            if(!res.headersSent){
                await res.send({code:"Error generating code"});
            }
        }
    }
    
    return await PAIR_CODE()
});

module.exports = router;