const dns = require('dns');
const mongoose = require('mongoose');

// Prefer IPv4 first — helps some Windows / DNS setups.
if (typeof dns.setDefaultResultOrder === 'function') {
  dns.setDefaultResultOrder('ipv4first');
}

// Optional: comma-separated DNS servers (e.g. 8.8.8.8,1.1.1.1) when SRV lookups fail with querySrv ECONNREFUSED.
const mongoDns = process.env.MONGO_DNS_SERVERS;
if (mongoDns) {
  const servers = mongoDns.split(',').map((s) => s.trim()).filter(Boolean);
  if (servers.length) {
    dns.setServers(servers);
    // eslint-disable-next-line no-console
    console.log('Using MONGO_DNS_SERVERS for MongoDB SRV resolution');
  }
}

async function connectDb() {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    throw new Error('MONGO_URI is not set');
  }
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 15_000,
    socketTimeoutMS: 45_000,
  });
  // eslint-disable-next-line no-console
  console.log('MongoDB connected');
}

module.exports = { connectDb };
