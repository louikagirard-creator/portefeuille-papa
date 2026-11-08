// Au moment de la publication : donne un numéro de version à chaque fichier CSS/JS du site.
// Sans ça, le navigateur peut garder d'anciens modules en cache (jusqu'à 10 min sur GitHub Pages)
// et mélanger l'ancienne et la nouvelle version après une mise à jour.
//  - remplace __VERSION__ dans index.html (CSS, data.js, app.js, main.js);
//  - remplit la carte d'import (importmap) : chaque module js/*.js est chargé avec ?v=VERSION.
import { readFile, writeFile, readdir } from 'node:fs/promises';

const version = (process.env.GITHUB_SHA || Date.now().toString(36)).slice(0, 10);
const modules = (await readdir('js')).filter((f) => f.endsWith('.js')).sort();
const carte = { imports: Object.fromEntries(modules.map((f) => [`./js/${f}`, `./js/${f}?v=${version}`])) };
let html = await readFile('index.html', 'utf8');
html = html.replaceAll('__VERSION__', version)
  .replace('<script type="importmap">{"imports":{}}</script>', `<script type="importmap">${JSON.stringify(carte)}</script>`);
await writeFile('index.html', html);
// Le service worker change aussi de version : l'ancien cache hors ligne est vidé.
const sw = await readFile('sw.js', 'utf8');
await writeFile('sw.js', sw.replace(/const CACHE = 'mg-[^']*';/, `const CACHE = 'mg-${version}';`));
console.log(`Version ${version} : ${modules.length} modules versionnés.`);
