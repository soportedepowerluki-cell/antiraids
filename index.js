const http = require('http');
const { Client, GatewayIntentBits } = require('discord.js');

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

// 👇 ESTO ES OBLIGATORIO EN RENDER
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot activo');
}).listen(process.env.PORT || 3000);

client.once('ready', () => {
  console.log(`✅ CONECTADO COMO ${client.user.tag}`);
});

client.login(process.env.TOKEN);
