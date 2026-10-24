/* index.html と CSS・JS を1つのファイルにまとめる（Webページとして公開する用）
   使い方: node tools/build-artifact.js 出力先.html */
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('index.html');
const title = html.match(/<title>.*<\/title>/)[0];
let body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'));
body = body.replace(/<script src="([^"]+)"><\/script>/g, (_, src) => '<script>\n' + read(src).replace(/<\/script/gi, '<\\/script') + '\n</script>');

const out = title + '\n<style>\n' + read('css/style.css') + '\n</style>\n' + body.trim() + '\n';
fs.writeFileSync(process.argv[2] || path.join(root, 'dist', 'juku.html'), out);
