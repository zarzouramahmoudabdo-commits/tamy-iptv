// Usage: node scripts/set-url.js "https://owner.github.io/repo/?apk=1&nh=abc"
const fs = require('fs');
const url = process.argv[2];
if (!url) { console.error('missing url'); process.exit(1); }
const c = JSON.parse(fs.readFileSync('capacitor.config.json', 'utf8'));
c.server = Object.assign({}, c.server, { url, cleartext: true });
fs.writeFileSync('capacitor.config.json', JSON.stringify(c, null, 2));
console.log('server.url =', url);
