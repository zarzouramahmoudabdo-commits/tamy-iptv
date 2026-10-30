// ينسخ hls.js من node_modules إلى www/vendor (يعمل تلقائياً في GitHub Actions)
const fs = require('fs');
const path = require('path');
const src = path.join(__dirname, '..', 'node_modules', 'hls.js', 'dist', 'hls.min.js');
const dstDir = path.join(__dirname, '..', 'www', 'vendor');
fs.mkdirSync(dstDir, { recursive: true });
if (fs.existsSync(src)) {
  fs.copyFileSync(src, path.join(dstDir, 'hls.min.js'));
  console.log('hls.js copied to www/vendor');
} else {
  console.warn('hls.js not found - run npm install first');
}
