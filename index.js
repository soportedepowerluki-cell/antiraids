const dns = require('node:dns');
dns.setDefaultResultOrder('ipv4first');

const http = require('http');
const { Client, GatewayIntentBits, Events } = require('discord.js');

const TOKEN = (process.env.TOKEN || '').trim();

if (!TOKEN) {
  console.error('❌ TOKEN no detectado');
  process.exit(1);
}

http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('OK');
}).listen(process.env.PORT || 3000);

const client = new Client({
  intents: [GatewayIntentBits.Guilds]
});

process.on('unhandledRejection', err => console.error('UNHANDLED REJECTION >', err));
process.on('uncaughtException', err => console.error('UNCAUGHT EXCEPTION >', err));

client.on('debug', info => console.log('DEBUG >', info));
client.on('error', err => console.error('CLIENT ERROR >', err));
client.on('shardError', err => console.error('SHARD ERROR >', err));

client.once(Events.ClientReady, c => {
  console.log(`✅ READY COMO: ${c.user.tag}`);
});

(async () => {
  try {
    console.log('🔥 LOGIN...');
    await client.login(TOKEN);
    console.log('✅ LOGIN HECHO');
  } catch (err) {
    console.error('❌ LOGIN FALLÓ:', err);
    process.exit(1);
  }
})();
