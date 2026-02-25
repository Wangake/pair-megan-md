const PastebinAPI = require('pastebin-js'),
pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL')
const {makeid} = require('./id');
const express = require('express');
const fs = require('fs');
let router = express.Router()
const pino = require("pino");
const {
    default: Gifted_Tech,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("maher-zubair-baileys");

function removeFile(FilePath){
    if(!fs.existsSync(FilePath)) return false;
    fs.rmSync(FilePath, { recursive: true, force: true })
};

router.get('/', async (req, res) => {
    const id = makeid();
    let num = req.query.number;
    
    async function MEGAN_MD_PAIR_CODE() {
        const {
            state,
            saveCreds
        } = await useMultiFileAuthState('./temp/'+id)
        
        try {
            let Pair_Code_By_Megan = Gifted_Tech({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({level: "fatal"}).child({level: "fatal"})),
                },
                printQRInTerminal: false,
                logger: pino({level: "fatal"}).child({level: "fatal"}),
                browser: ["Chrome (Linux)", "", ""] // EXACT browser format that works
            });
            
            if(!Pair_Code_By_Megan.authState.creds.registered) {
                await delay(1500);
                num = num.replace(/[^0-9]/g,'');
                
                // IMPORTANT: This triggers the WhatsApp notification
                const code = await Pair_Code_By_Megan.requestPairingCode(num)
                
                if(!res.headersSent){
                    await res.send({code});
                }
            }
            
            Pair_Code_By_Megan.ev.on('creds.update', saveCreds)
            
            Pair_Code_By_Megan.ev.on("connection.update", async (s) => {
                const {
                    connection,
                    lastDisconnect
                } = s;
                
                if (connection == "open") {
                    await delay(5000);
                    
                    let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                    await delay(800);
                    let b64data = Buffer.from(data).toString('base64');
                    
                    let session = await Pair_Code_By_Megan.sendMessage(Pair_Code_By_Megan.user.id, { 
                        text: 'MEGAN-MD~' + b64data 
                    });

                    let MEGAN_TEXT = `

╔════════════════════◇
║『 ✅ SESSION CONNECTED 』
║ ✨ MEGAN-MD 🔷
║ ✨ Engineered by WANGA🔷
╚════════════════════╝

╔════════════════════◇
║ 『 YOU'VE CHOSEN MEGAN-MD 』
║ -Set the session ID in your bot:
║ - SESSION_ID: 
╚════════════════════╝
╔════════════════════◇
║ 『••• _Visit For Help_ •••』
║❍ 𝐎𝐰𝐧𝐞𝐫: Wanga
║❍ 𝐑𝐞𝐩𝐨: https://github.com/Wangake/megan-md
║❍ 𝐖𝐚𝐆𝐫𝐨𝐮𝐩: [Your Group Link]
║❍ 𝐖𝐚𝐂𝐡𝐚𝐧𝐧𝐞𝐥: [Your Channel Link]
╚═════════════════════╝

Don't Forget To Give Star ⭐ To My Repo
______________________________`

                    await Pair_Code_By_Megan.sendMessage(Pair_Code_By_Megan.user.id, 
                        {text: MEGAN_TEXT}, 
                        {quoted: session}
                    )

                    await delay(100);
                    await Pair_Code_By_Megan.ws.close();
                    return await removeFile('./temp/'+id);
                    
                } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    await delay(10000);
                    MEGAN_MD_PAIR_CODE();
                }
            });
            
        } catch (err) {
            console.log("Service restarted");
            await removeFile('./temp/'+id);
            if(!res.headersSent){
                await res.send({code:"Service Unavailable"});
            }
        }
    }
    
    return await MEGAN_MD_PAIR_CODE()
});

module.exports = router