const PastebinAPI = require('pastebin-js'),
pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL')
const {makeid} = require('./id');
const express = require('express');
const fs = require('fs');
let router = express.Router()
const pino = require("pino");
const {
    default: France_King,
    useMultiFileAuthState,
    delay,
    makeCacheableSignalKeyStore,
    Browsers
} = require("@whiskeysockets/baileys");

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
            let Pair_Code_By_MEGAN = France_King({
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, pino({level: "fatal"}).child({level: "fatal"})),
                },
                printQRInTerminal: false,
                logger: pino({ level: "fatal" }).child({ level: "fatal" }),
                browser: Browsers.macOS('Chrome')
             });
             if(!Pair_Code_By_MEGAN.authState.creds.registered) {
                await delay(1500);
                        num = num.replace(/[^0-9]/g,'');
                            const code = await Pair_Code_By_MEGAN.requestPairingCode(num)
                 if(!res.headersSent){
                 await res.send({code});
                     }
                 }
            Pair_Code_By_MEGAN.ev.on('creds.update', saveCreds)
            Pair_Code_By_MEGAN.ev.on("connection.update", async (s) => {
                const {
                    connection,
                    lastDisconnect
                } = s;
                if (connection == "open") {
                await delay(50000);
                let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
                await delay(8000);
               let b64data = Buffer.from(data).toString('base64');
               let session = await Pair_Code_By_MEGAN.sendMessage(Pair_Code_By_MEGAN.user.id, { text: 'MEGAN-MD='+ b64data });

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
`
 await Pair_Code_By_MEGAN.sendMessage(Pair_Code_By_MEGAN.user.id,{text:MEGAN_MD_TEXT},{quoted:session})
 

        await delay(100);
        await Pair_Code_By_MEGAN.ws.close();
        return await removeFile('./temp/'+id);
            } else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
                    await delay(10000);
                    MEGAN_MD_PAIR_CODE();
                }
            });
        } catch (err) {
            console.log("service restated");
            await removeFile('./temp/'+id);
         if(!res.headersSent){
            await res.send({code:"Service is Currently Unavailable"});
         }
        }
    }
    return await MEGAN_MD_PAIR_CODE()
});
module.exports = router