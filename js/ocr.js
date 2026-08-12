/**
 * Přečtení ISBN z vytištěného čísla, když kniha nemá čárový kód.
 *
 * Rozpoznávání textu obstarává Tesseract, který je stejně jako čtečka kódů
 * přibalený v repozitáři. Je to ale velký kus dat (skoro 7 MB), takže se
 * načítá teprve ve chvíli, kdy o rozpoznání někdo poprvé požádá — kdo
 * skenuje jen čárové kódy, nestáhne z něj nic.
 *
 * Rozpoznaný text bývá nedokonalý. Klíčové je, že ISBN má kontrolní číslici:
 * z textu se proto vytáhnou všichni kandidáti a projde jen ten, kterému
 * kontrolní číslice sedí. Nesmysly z OCR tím spolehlivě propadnou sítem.
 */

import { jeIsbn10, jeIsbn13, normalizuj } from './isbn.js';

const ZAKLAD = new URL('../vendor/tesseract/', import.meta.url).href;

let pracovnik = null;      // jednou nastartovaný Tesseract se drží pro další použití
let startuje = null;       // rozdělaný start, aby se dvojklik nespustil dvakrát

async function nastartuj(onPrubeh) {
  // Sestavený Tesseract nabízí jen výchozí export, pojmenované z něj nejdou.
  const { default: Tesseract } = await import(`${ZAKLAD}tesseract.esm.min.js`);
  const { createWorker, OEM, PSM } = Tesseract;

  const novy = await createWorker('eng', OEM.LSTM_ONLY, {
    workerPath: `${ZAKLAD}worker.min.js`,
    corePath: `${ZAKLAD}tesseract-core-simd-lstm.wasm.js`,
    langPath: ZAKLAD,
    gzip: true,
    logger: (zprava) => {
      if (zprava.status === 'loading tesseract core') {
        onPrubeh?.('Připravuji rozpoznávání textu… (poprvé se stahuje asi 7 MB, potom už je to rychlé)');
      } else if (zprava.status === 'loading language traineddata') {
        onPrubeh?.('Stahuji data pro rozpoznávání písma…');
      }
    },
  });

  // Číslo ISBN je jen z číslic, X a oddělovačů. Omezení na ně výrazně sníží
  // počet překlepů typu „S“ místo „5“.
  await novy.setParameters({
    tessedit_char_whitelist: '0123456789Xx- ',
    tessedit_pageseg_mode: PSM.SINGLE_BLOCK,
  });

  return novy;
}

async function pripravPracovnika(onPrubeh) {
  if (pracovnik) return pracovnik;
  if (!startuje) {
    startuje = nastartuj(onPrubeh)
      .then((novy) => (pracovnik = novy))
      .finally(() => (startuje = null));
  }
  return startuje;
}

/**
 * Vytáhne z rozpoznaného textu všechna platná ISBN.
 *
 * Oddělovače se zahodí a výsledná číslice po číslici se prochází posuvným
 * oknem — OCR totiž běžně přilepí číslo roku nebo ceny hned vedle ISBN.
 */
export function najdiIsbnVTextu(text) {
  const nalezene = [];
  const bloky = String(text || '').match(/[0-9Xx][0-9Xx\s-]{8,}/g) || [];

  for (const blok of bloky) {
    const cislice = blok.replace(/[^0-9Xx]/g, '').toUpperCase();

    for (let i = 0; i + 13 <= cislice.length; i++) {
      const kandidat = cislice.slice(i, i + 13);
      if ((kandidat.startsWith('978') || kandidat.startsWith('979')) && jeIsbn13(kandidat)) {
        nalezene.push(kandidat);
      }
    }
    for (let i = 0; i + 10 <= cislice.length; i++) {
      const kandidat = cislice.slice(i, i + 10);
      if (jeIsbn10(kandidat)) {
        nalezene.push(normalizuj(kandidat));
      }
    }
  }

  return [...new Set(nalezene)];
}

/**
 * Vyřízne z obrazu kamery oblast hledáčku a připraví ji pro OCR.
 *
 * Výřez se zvětší na dvojnásobek a převede do stupňů šedi se zvýšeným
 * kontrastem — drobný tisk na obálce je pak čitelnější.
 */
function pripravVyrez(video) {
  const sirkaZdroje = video.videoWidth;
  const vyskaZdroje = video.videoHeight;
  if (!sirkaZdroje || !vyskaZdroje) throw new Error('Kamera zatím neposílá obraz.');

  // Stejná oblast, jakou uživatel vidí jako rámeček (viz .hledacek v CSS).
  const x = sirkaZdroje * 0.10;
  const y = vyskaZdroje * 0.30;
  const sirka = sirkaZdroje * 0.80;
  const vyska = vyskaZdroje * 0.40;

  const zvetseni = 2;
  const platno = document.createElement('canvas');
  platno.width = sirka * zvetseni;
  platno.height = vyska * zvetseni;

  const kresba = platno.getContext('2d', { willReadFrequently: true });
  kresba.drawImage(video, x, y, sirka, vyska, 0, 0, platno.width, platno.height);

  const obraz = kresba.getImageData(0, 0, platno.width, platno.height);
  const body = obraz.data;
  for (let i = 0; i < body.length; i += 4) {
    const sed = body[i] * 0.299 + body[i + 1] * 0.587 + body[i + 2] * 0.114;
    const kontrastni = sed < 110 ? 0 : sed > 165 ? 255 : (sed - 110) * (255 / 55);
    body[i] = body[i + 1] = body[i + 2] = kontrastni;
  }
  kresba.putImageData(obraz, 0, 0);

  return platno;
}

/**
 * Vezme aktuální snímek z kamery a pokusí se z něj přečíst ISBN.
 * Vrací nalezené ISBN, nebo null i s rozpoznaným textem pro hlášku uživateli.
 */
export async function prectiIsbnZObrazu(video, onPrubeh) {
  const platno = pripravVyrez(video);

  const worker = await pripravPracovnika(onPrubeh);
  onPrubeh?.('Čtu číslo z obrázku…');

  const { data } = await worker.recognize(platno);
  const nalezena = najdiIsbnVTextu(data.text);

  return { isbn: nalezena[0] || null, text: (data.text || '').trim() };
}

/** Uvolní paměť po Tesseractu — volá se, když se skenování vypíná. */
export async function uklid() {
  const stary = pracovnik;
  pracovnik = null;
  await stary?.terminate();
}
