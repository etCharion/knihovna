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
 * kontrolní číslice sedí. Nesmysly z OCR tím spolehlivě propadnou sítem —
 * a je díky tomu bezpečné zkusit obrázek přečíst několikrát různě upravený
 * a vzít první výsledek, který kontrolou projde.
 */

import { jeIsbn10, jeIsbn13, normalizuj } from './isbn.js';

const ZAKLAD = new URL('../vendor/tesseract/', import.meta.url).href;

let pracovnik = null;      // jednou nastartovaný Tesseract se drží pro další použití
let startuje = null;       // rozdělaný start, aby se dvojklik nespustil dvakrát

async function nastartuj(onPrubeh) {
  // Sestavený Tesseract nabízí jen výchozí export, pojmenované z něj nejdou.
  const { default: Tesseract } = await import(`${ZAKLAD}tesseract.esm.min.js`);
  const { createWorker, OEM } = Tesseract;

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
  await novy.setParameters({ tessedit_char_whitelist: '0123456789Xx- ' });

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

/* --------------------------------------------------------- úprava obrazu */

/**
 * Výchozí čtecí proužek — podíly šířky a výšky obrazu z kamery.
 *
 * Je to úzký pruh na jeden řádek textu, ne velký rámeček. Když se četlo
 * z většího výřezu, pletla se do ISBN čísla, která byla těsně nad ním nebo
 * pod ním (rok vydání, cena, číslo publikace) — a protože OCR nedodrží
 * pořadí řádků, výsledek pak neprošel kontrolní číslicí, i když byl samotný
 * ISBN přečtený dobře.
 */
export const VYCHOZI_PROUZEK = { stred: 0.5, vyska: 0.1 };

/** Proužek osekaný na rozumné meze — aby nevyjel z obrazu ani nezmizel. */
export function omezProuzek({ stred, vyska } = {}) {
  const v = Math.min(0.4, Math.max(0.04, Number(vyska) || VYCHOZI_PROUZEK.vyska));
  const s = Math.min(1 - v / 2, Math.max(v / 2, Number(stred) || VYCHOZI_PROUZEK.stred));
  return { stred: s, vyska: v };
}

/** Vodorovné okraje proužku — stejné pro obraz i pro rámeček na obrazovce. */
export const OKRAJ_PROUZKU = 0.06;

/**
 * Otsuova metoda: najde práh, který nejlíp rozdělí obraz na písmo a papír.
 *
 * Dřív tu byly natvrdo napsané meze (tmavší než 110 je písmo, světlejší než
 * 165 papír). Fungovaly na černý tisk na bílém papíru a na ničem jiném:
 * bílé číslo na tmavé obálce jimi propadlo celé a slabě vytištěné nebo
 * nasvícené číslo taky. Spočítaný práh se přizpůsobí každému snímku sám.
 */
function otsuPrah(histogram, pocetBodu) {
  let soucetVsech = 0;
  for (let i = 0; i < 256; i++) soucetVsech += i * histogram[i];

  let soucetPozadi = 0;
  let bodyPozadi = 0;
  let nejlepsiRozptyl = -1;
  let prah = 127;

  for (let i = 0; i < 256; i++) {
    bodyPozadi += histogram[i];
    if (bodyPozadi === 0) continue;
    const bodyPopredi = pocetBodu - bodyPozadi;
    if (bodyPopredi === 0) break;

    soucetPozadi += i * histogram[i];
    const prumerPozadi = soucetPozadi / bodyPozadi;
    const prumerPopredi = (soucetVsech - soucetPozadi) / bodyPopredi;
    const rozptyl = bodyPozadi * bodyPopredi * (prumerPozadi - prumerPopredi) ** 2;

    if (rozptyl > nejlepsiRozptyl) {
      nejlepsiRozptyl = rozptyl;
      prah = i;
    }
  }

  return prah;
}

/**
 * Vyřízne z obrazu kamery čtecí proužek a převede ho do stupňů šedi.
 *
 * Zvětšuje se tak, aby řádek textu vyšel vysoký aspoň 110 bodů — Tesseract
 * má s drobným písmem potíže a u neobvyklých fontů (psací stroj, Courier)
 * to bývá hlavní příčina přehmatů. Strop je pětinásobek, aby se z rozmazaného
 * snímku nedělal ještě větší rozmazaný snímek.
 */
/**
 * Kus obrazu z kamery, který je na obrazovce doopravdy vidět.
 *
 * Video se vykresluje přes `object-fit: cover`, takže se strany (nebo horní
 * a spodní okraj) ořezávají. Bez tohohle přepočtu by se četlo i z pásu, který
 * uživatel nevidí — a do čísla by se mu pletlo něco, co v proužku vůbec není.
 */
function viditelnaOblast(video) {
  const sirkaZdroje = video.videoWidth;
  const vyskaZdroje = video.videoHeight;
  const sirkaBoxu = video.clientWidth || sirkaZdroje;
  const vyskaBoxu = video.clientHeight || vyskaZdroje;

  const meritko = Math.max(sirkaBoxu / sirkaZdroje, vyskaBoxu / vyskaZdroje);
  const sirka = Math.min(sirkaZdroje, sirkaBoxu / meritko);
  const vyska = Math.min(vyskaZdroje, vyskaBoxu / meritko);

  return { x: (sirkaZdroje - sirka) / 2, y: (vyskaZdroje - vyska) / 2, sirka, vyska };
}

function vyrezVeStupnichSedi(video, prouzek) {
  const sirkaZdroje = video.videoWidth;
  const vyskaZdroje = video.videoHeight;
  if (!sirkaZdroje || !vyskaZdroje) throw new Error('Kamera zatím neposílá obraz.');

  const videt = viditelnaOblast(video);
  const { stred, vyska } = omezProuzek(prouzek);
  const x = videt.x + videt.sirka * OKRAJ_PROUZKU;
  const sirka = videt.sirka * (1 - 2 * OKRAJ_PROUZKU);
  const vyskaVyrezu = videt.vyska * vyska;
  const y = videt.y + videt.vyska * stred - vyskaVyrezu / 2;

  const zvetseni = Math.min(5, Math.max(2, 110 / vyskaVyrezu));
  const platno = document.createElement('canvas');
  platno.width = Math.round(sirka * zvetseni);
  platno.height = Math.round(vyskaVyrezu * zvetseni);

  const kresba = platno.getContext('2d', { willReadFrequently: true });
  kresba.imageSmoothingQuality = 'high';
  kresba.drawImage(video, x, y, sirka, vyskaVyrezu, 0, 0, platno.width, platno.height);

  const obraz = kresba.getImageData(0, 0, platno.width, platno.height);
  const body = obraz.data;
  const histogram = new Uint32Array(256);

  for (let i = 0; i < body.length; i += 4) {
    const sed = Math.round(body[i] * 0.299 + body[i + 1] * 0.587 + body[i + 2] * 0.114);
    body[i] = body[i + 1] = body[i + 2] = sed;
    histogram[sed]++;
  }

  return { platno, kresba, obraz, histogram, pocetBodu: platno.width * platno.height };
}

/**
 * Připraví podoby výřezu, které se postupně zkusí přečíst.
 *
 * Jsou tři, protože žádná sama nestačí na všechno:
 *  1. práh podle Otsua se správnou polaritou — pokrývá běžný tisk;
 *  2. tentýž práh obráceně — pro bílé číslo na tmavé obálce. Polarita se
 *     odhaduje podle toho, čeho je míň: písmo je na stránce vždycky menšina,
 *     takže když po prahování převáží „tmavé“ body, jde o světlý tisk na
 *     tmavém podkladu. Odhad ale nemusí sedět (rámeček, stín přes půl
 *     výřezu), proto se druhá polarita zkusí vždycky;
 *  3. samotné stupně šedi bez prahování — u fontů s tenkými tahy nebo
 *     u nerovnoměrně nasvíceného snímku si s nimi Tesseract poradí líp než
 *     s čímkoliv, co se rozhodlo za něj.
 */
function podobyVyrezu(video, prouzek) {
  const { platno, kresba, obraz, histogram, pocetBodu } = vyrezVeStupnichSedi(video, prouzek);
  const prah = otsuPrah(histogram, pocetBodu);

  let tmavych = 0;
  for (let i = 0; i <= prah; i++) tmavych += histogram[i];
  const svetlyTiskNaTmavem = tmavych > pocetBodu / 2;

  // Stupně šedi si držíme stranou: na plátně se střídají jednotlivé podoby,
  // ale počítají se pokaždé znovu z týchž šedivých bodů.
  const sede = Uint8ClampedArray.from(obraz.data);

  const vykresli = () => {
    kresba.putImageData(obraz, 0, 0);
    return platno;
  };

  const prahuj = (obratit) => {
    const body = obraz.data;
    for (let i = 0; i < body.length; i += 4) {
      const jeTmavy = sede[i] <= prah;
      const pismo = obratit ? !jeTmavy : jeTmavy;
      body[i] = body[i + 1] = body[i + 2] = pismo ? 0 : 255;
    }
    return vykresli();
  };

  return [
    { popis: 'práh podle snímku', vykresli: () => prahuj(svetlyTiskNaTmavem) },
    { popis: 'obrácená polarita', vykresli: () => prahuj(!svetlyTiskNaTmavem) },
    {
      popis: 'bez prahování',
      vykresli: () => {
        obraz.data.set(sede);
        return vykresli();
      },
    },
  ];
}

/* ------------------------------------------------------------ rozpoznání */

// 7 = jeden řádek textu, 6 = souvislý blok. Čte se úzký proužek, takže
// jeden řádek sedí skoro vždycky; blok je záchrana pro číslo přetékající
// na dva řádky nebo pro proužek nastavený vyšší, než je potřeba.
const JEDEN_RADEK = '7';
const BLOK = '6';

/**
 * Vezme aktuální snímek z kamery a pokusí se z něj přečíst ISBN.
 *
 * Zkouší několik úprav obrazu za sebou a končí u první, která vydá číslo
 * se sedící kontrolní číslicí. Vrací nalezené ISBN, nebo null i s tím, co
 * se povedlo přečíst — z toho jde uživateli poradit, co zkusit jinak.
 */
export async function prectiIsbnZObrazu(video, onPrubeh, prouzek = VYCHOZI_PROUZEK) {
  const podoby = podobyVyrezu(video, prouzek);

  const worker = await pripravPracovnika(onPrubeh);
  onPrubeh?.('Čtu číslo z obrázku…');

  let posledniText = '';

  const zkus = async (podoba, rezim) => {
    await worker.setParameters({ tessedit_pageseg_mode: rezim });
    const { data } = await worker.recognize(podoba.vykresli());
    const text = (data.text || '').trim();
    if (text) posledniText = text;
    const nalezena = najdiIsbnVTextu(text);
    return nalezena[0] || null;
  };

  for (const [poradi, podoba] of podoby.entries()) {
    if (poradi > 0) onPrubeh?.(`Zkouším jinak — ${podoba.popis}…`);
    const isbn = await zkus(podoba, JEDEN_RADEK);
    if (isbn) return { isbn, text: posledniText };
  }

  // Nic. Poslední pokus s jiným rozvržením — pro číslo zalomené na dva řádky.
  onPrubeh?.('Zkouším číslo přes víc řádků…');
  const isbn = await zkus(podoby[0], BLOK);
  return { isbn, text: posledniText };
}

/** Uvolní paměť po Tesseractu — volá se, když se skenování vypíná. */
export async function uklid() {
  const stary = pracovnik;
  pracovnik = null;
  await stary?.terminate();
}
