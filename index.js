const express = require('express');
const app = express();
__path = process.cwd()
const bodyParser = require("body-parser");
const PORT = process.env.PORT || 8000;
let server = require('./qr'),
    code = require('./pair');
require('events').EventEmitter.defaultMaxListeners = 500;
app.use('/qr', server);
app.use('/code', code);
app.use('/pair',async (req, res, next) => {
res.sendFile(__path + '/pair.html')
})
app.use('/',async (req, res, next) => {
res.sendFile(__path + '/index.html')
})
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.listen(PORT, () => {
    console.log(`
╔══════════════════════════════╗
║     MEGAN-MD SESSIONS        ║
║   Multi-Device Engineered    ║
╠══════════════════════════════╣
║  🚀 Server is Live!          ║
║  📍 Port: ` + PORT + `                ║
║  🔧 Engineered by WANGA      ║
╚══════════════════════════════╝
`)
})

module.exports = app