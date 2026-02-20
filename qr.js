const PastebinAPI = require('pastebin-js'),
pastebin = new PastebinAPI('EMWTMkQAVfJa9kM-MRUrxd5Oku1U7pgL')
const {makeid} = require('./id');
const QRCode = require('qrcode');
const express = require('express');
const path = require('path');
const fs = require('fs');
let router = express.Router()
const pino = require("pino");
const {
	default: France_King,
	useMultiFileAuthState,
	jidNormalizedUser,
	Browsers,
	delay,
	makeInMemoryStore,
} = require("@whiskeysockets/baileys");

function removeFile(FilePath) {
	if (!fs.existsSync(FilePath)) return false;
	fs.rmSync(FilePath, {
		recursive: true,
		force: true
	})
};
const {
	readFile
} = require("node:fs/promises")
router.get('/', async (req, res) => {
	const id = makeid();
	async function MEGAN_MD_QR_CODE() {
		const {
			state,
			saveCreds
		} = await useMultiFileAuthState('./temp/' + id)
		try {
			let Qr_Code_By_MEGAN = France_King({
				auth: state,
				printQRInTerminal: false,
				logger: pino({
					level: "silent"
				}),
				browser: Browsers.macOS("Desktop"),
			});

			Qr_Code_By_MEGAN.ev.on('creds.update', saveCreds)
			Qr_Code_By_MEGAN.ev.on("connection.update", async (s) => {
				const {
					connection,
					lastDisconnect,
					qr
				} = s;
				if (qr) await res.end(await QRCode.toBuffer(qr));
				if (connection == "open") {
					await delay(5000);
					let data = fs.readFileSync(__dirname + `/temp/${id}/creds.json`);
					await delay(800);
				   let b64data = Buffer.from(data).toString('base64');
				   let session = await Qr_Code_By_MEGAN.sendMessage(Qr_Code_By_MEGAN.user.id, { text: 'MEGAN-MD=' + b64data });
	
				   let MEGAN_MD_TEXT = `
╔══════════════════════════════╗
║     𝐌𝐄𝐆𝐀𝐍-𝐌𝐃 SESSION       ║
║   Multi-Device Engineered    ║
╠══════════════════════════════╣
║  ✅ QR SCAN SUCCESSFUL!      ║
║  📱 Session Generated        ║
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
	 await Qr_Code_By_MEGAN.sendMessage(Qr_Code_By_MEGAN.user.id,{text:MEGAN_MD_TEXT},{quoted:session})

					await delay(100);
					await Qr_Code_By_MEGAN.ws.close();
					return await removeFile("temp/" + id);
				} else if (connection === "close" && lastDisconnect && lastDisconnect.error && lastDisconnect.error.output.statusCode != 401) {
					await delay(10000);
					MEGAN_MD_QR_CODE();
				}
			});
		} catch (err) {
			if (!res.headersSent) {
				await res.json({
					code: "Service is Currently Unavailable"
				});
			}
			console.log(err);
			await removeFile("temp/" + id);
		}
	}
	return await MEGAN_MD_QR_CODE()
});
module.exports = router