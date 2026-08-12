/**
 * Vyrobí Y4M video s vytištěným číslem ISBN — pro test čtení textu (OCR)
 * z knihy, která čárový kód nemá.
 *
 * Text se vykreslí v Chromiu (kvůli fontům) a výsledné pixely se uloží
 * jako video, které se pak dá prohlížeči podstrčit místo kamery.
 *
 * Spuštění:  node tests/vytvor-video-s-cislem.mjs <cesta.y4m> [ISBN]
 */

import { chromium } from 'playwright';
import { writeFileSync } from 'node:fs';

const CESTA = process.argv[2] || 'cislo.y4m';
const ISBN = process.argv[3] || '978-80-242-6870-5';
const S = 640;
const V = 480;
const SNIMKU = 30;

const prohlizec = await chromium.launch({ channel: 'chromium' });
const stranka = await prohlizec.newPage();

const sedive = await stranka.evaluate(
  ({ S, V, ISBN }) => {
    const platno = document.createElement('canvas');
    platno.width = S;
    platno.height = V;
    const k = platno.getContext('2d');

    k.fillStyle = '#fff';
    k.fillRect(0, 0, S, V);
    k.fillStyle = '#000';

    // Rozvržení jako na tiráži knihy. Číslo ISBN musí padnout doprostřed,
    // do oblasti, kterou aplikace vyřezává pro rozpoznávání (30–70 % výšky).
    k.font = '17px serif';
    k.fillText('Vydalo nakladatelstvi Karolinum', 70, 120);
    k.font = 'bold 30px monospace';
    k.fillText(`ISBN ${ISBN}`, 70, 250);
    k.font = '17px serif';
    k.fillText('Praha 2015, cena 349 Kc', 70, 400);

    const body = k.getImageData(0, 0, S, V).data;
    const sed = new Array(S * V);
    for (let i = 0; i < sed.length; i++) {
      sed[i] = Math.round(
        body[i * 4] * 0.299 + body[i * 4 + 1] * 0.587 + body[i * 4 + 2] * 0.114
      );
    }
    return sed;
  },
  { S, V, ISBN }
);

await prohlizec.close();

const jas = Buffer.from(sedive);
const barva = Buffer.alloc((S / 2) * (V / 2), 128); // šedý obraz: barvonosné složky jsou neutrální
const snimek = Buffer.concat([Buffer.from('FRAME\n'), jas, barva, barva]);
const hlavicka = Buffer.from(`YUV4MPEG2 W${S} H${V} F30:1 Ip A1:1 C420mpeg2\n`);

writeFileSync(CESTA, Buffer.concat([hlavicka, ...Array(SNIMKU).fill(snimek)]));
console.log('Hotovo:', CESTA, '| ISBN v obraze:', ISBN);
