/**
 * Test, že se nová verze aplikace dostane k uživateli.
 *
 * Proč zrovna tohle: service worker původně bral soubory nejdřív z cache
 * a na síť sahal, jen když v cache nic nebylo. Jednou uložený soubor se tak
 * už nikdy nenahradil — na telefonu běžela stará verze aplikace i dlouho po
 * vydání oprav a nedalo se to poznat. Tenhle test to hlídá.
 *
 * Postup: aplikace se nakopíruje do dočasné složky, spustí se nad ní server,
 * stránka se načte (service worker si ji uloží), pak se soubor na serveru
 * změní — a musí se projevit. Nakonec se server vypne a ověří se, že
 * offline režim pořád funguje.
 *
 * Spuštění:  node tests/aktualizace.mjs
 */

import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const KOREN = dirname(dirname(fileURLToPath(import.meta.url)));
const PORT = 8791;
const ADRESA = `http://localhost:${PORT}/`;

let selhani = 0;
const t = (ok, popis, detail = '') => {
  if (!ok) selhani++;
  console.log(`${ok ? '✓' : '✗ SELHALO'} ${popis}${detail ? ' → ' + detail : ''}`);
};
const pockej = (ms) => new Promise((hotovo) => setTimeout(hotovo, ms));

/* ------------------------------------------- kopie aplikace a vlastní server */

const slozka = mkdtempSync(join(tmpdir(), 'knihovna-aktualizace-'));
for (const cast of ['index.html', 'sw.js', 'manifest.webmanifest', 'css', 'js', 'icons', 'vendor']) {
  cpSync(join(KOREN, cast), join(slozka, cast), { recursive: true });
}

const server = spawn('python3', ['-m', 'http.server', String(PORT)], {
  cwd: slozka,
  stdio: 'ignore',
});
await pockej(1200);

const prohlizec = await chromium.launch({ channel: 'chromium' });
const kontext = await prohlizec.newContext({ viewport: { width: 390, height: 844 } });
const stranka = await kontext.newPage();

try {
  /* ------------------------------------------------ první návštěva */

  await stranka.goto(ADRESA, { waitUntil: 'networkidle' });
  await stranka.evaluate(() => navigator.serviceWorker.ready);
  await pockej(600);
  t(await stranka.evaluate(() => !!navigator.serviceWorker.controller),
    'service worker se ujal stránky');

  /* --------------------------- na serveru vyjde nová verze aplikace */

  const cestaKodu = join(slozka, 'js', 'app.js');
  writeFileSync(cestaKodu, readFileSync(cestaKodu, 'utf8') + '\nwindow.NOVA_VERZE = true;\n');

  // Nadpisů je na stránce víc (jeden na každou záložku), sleduje se ten
  // na úvodní obrazovce skenování.
  const cestaStranky = join(slozka, 'index.html');
  const puvodniNadpis = '<h1>Skenování</h1>';
  const zdrojStranky = readFileSync(cestaStranky, 'utf8');
  if (!zdrojStranky.includes(puvodniNadpis)) {
    throw new Error(`V index.html chybí ${puvodniNadpis} — test aktualizace je potřeba srovnat.`);
  }
  writeFileSync(cestaStranky, zdrojStranky.replace(puvodniNadpis, '<h1>Skenování po aktualizaci</h1>'));

  await stranka.reload({ waitUntil: 'networkidle' });
  await pockej(400);

  t(await stranka.evaluate(() => window.NOVA_VERZE === true),
    'po znovunačtení běží nový JavaScript, ne ten z cache');
  const nadpisSkeneru = stranka.locator('#obrazovka-skener h1');
  t((await nadpisSkeneru.innerText()).includes('po aktualizaci'),
    'a nová podoba stránky', await nadpisSkeneru.innerText());

  /* ------------------------------------- offline musí dál fungovat */

  server.kill();
  await pockej(600);

  await stranka.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
  t((await stranka.locator('#obrazovka-skener h1').innerText()).includes('Skenování'),
    'bez serveru se aplikace načte z cache',
    await stranka.locator('#obrazovka-skener h1').innerText());
  t(await stranka.evaluate(() => !!document.querySelector('#btn-skenovat')),
    'a je použitelná');
} finally {
  await prohlizec.close();
  server.kill();
}

console.log(selhani === 0 ? '\nVŠE PROŠLO' : `\n${selhani} testů selhalo`);
process.exit(selhani ? 1 : 0);
