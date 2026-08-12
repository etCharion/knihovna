/**
 * Propojení celé aplikace: kamera → vyhledání knihy → tabulka.
 */

import { jeKnizniKod, normalizuj, naFormat } from './isbn.js';
import { najdiKnihu, nahradniObalka } from './lookup.js';
import * as skener from './scanner.js';
import * as ulozne from './storage.js';

const prvek = (id) => document.getElementById(id);

const video = prvek('video');
const kamera = prvek('kamera');
const btnSkenovat = prvek('btn-skenovat');
const btnSvetlo = prvek('btn-svetlo');
const stav = prvek('stav');
const hlaska = prvek('hlaska');
const telo = prvek('telo-tabulky');
const tabulka = prvek('tabulka');
const prazdno = prvek('prazdno');
const pocet = prvek('pocet');
const hledat = prvek('hledat');

let razeni = { sloupec: null, sestupne: false };
let cekaSeNaVyhledani = new Set();

/* ------------------------------------------------------------ pomůcky */

let casovacHlasky = null;
function oznam(text, druh = 'info') {
  hlaska.textContent = text;
  hlaska.className = `hlaska ${druh}`;
  hlaska.hidden = false;
  clearTimeout(casovacHlasky);
  casovacHlasky = setTimeout(() => {
    hlaska.hidden = true;
  }, 3500);
}

function nastavStav(text) {
  stav.textContent = text;
}

/* ------------------------------------------------------------ tabulka */

function vyfiltrovane() {
  const dotaz = hledat.value.trim().toLowerCase();
  let knihy = ulozne.vsechny();

  if (dotaz) {
    knihy = knihy.filter((k) =>
      ['nazev', 'autor', 'isbn', 'vydavatel', 'poznamka', 'rok']
        .some((pole) => String(k[pole] || '').toLowerCase().includes(dotaz))
    );
  }

  if (razeni.sloupec) {
    const { sloupec, sestupne } = razeni;
    knihy = [...knihy].sort((a, b) => {
      const x = String(a[sloupec] ?? '');
      const y = String(b[sloupec] ?? '');
      const porovnani = x.localeCompare(y, 'cs', { numeric: true, sensitivity: 'base' });
      return sestupne ? -porovnani : porovnani;
    });
  }

  return knihy;
}

function bunka(text, trida) {
  const td = document.createElement('td');
  td.textContent = text ?? '';
  if (trida) td.className = trida;
  return td;
}

/** Buňka, kterou jde přepsat přímo v tabulce — pro ruční doplnění a opravy. */
function bunkaKUprave(kniha, pole, zastupnyText) {
  const td = document.createElement('td');
  td.contentEditable = 'true';
  td.className = 'upravitelne';
  td.textContent = kniha[pole] || '';
  td.dataset.prazdny = zastupnyText;
  td.addEventListener('blur', () => {
    const nova = td.textContent.trim();
    if (nova !== (kniha[pole] || '')) {
      ulozne.uprav(kniha.id, { [pole]: nova });
      kniha[pole] = nova;
    }
  });
  td.addEventListener('keydown', (udalost) => {
    if (udalost.key === 'Enter') {
      udalost.preventDefault();
      td.blur();
    }
  });
  return td;
}

function radek(kniha) {
  const tr = document.createElement('tr');
  if (cekaSeNaVyhledani.has(kniha.isbn)) tr.classList.add('nacita-se');

  const tdObalka = document.createElement('td');
  tdObalka.className = 'sloupec-obalka';
  const obrazek = document.createElement('img');
  obrazek.loading = 'lazy';
  obrazek.alt = '';
  obrazek.src = kniha.obalka || nahradniObalka(kniha.isbn);
  obrazek.onerror = () => {
    obrazek.replaceWith(Object.assign(document.createElement('span'), {
      className: 'bez-obalky',
      textContent: '📕',
    }));
  };
  tdObalka.appendChild(obrazek);
  tr.appendChild(tdObalka);

  const tdNazev = bunkaKUprave(kniha, 'nazev', 'Doplňte název');
  if (Number(kniha.kusu) > 1) {
    const odznak = document.createElement('span');
    odznak.className = 'odznak';
    odznak.textContent = `${kniha.kusu}×`;
    tdNazev.appendChild(document.createTextNode(' '));
    tdNazev.appendChild(odznak);
  }
  tr.appendChild(tdNazev);

  tr.appendChild(bunkaKUprave(kniha, 'autor', 'Doplňte autora'));
  tr.appendChild(bunka(kniha.rok));
  tr.appendChild(bunka(kniha.vydavatel));
  tr.appendChild(bunka(naFormat(kniha.isbn), 'isbn'));
  tr.appendChild(bunkaKUprave(kniha, 'poznamka', 'Poznámka'));

  const tdAkce = document.createElement('td');
  tdAkce.className = 'sloupec-akce';
  const smazat = document.createElement('button');
  smazat.className = 'ikona-tlacitko';
  smazat.title = 'Smazat knihu';
  smazat.setAttribute('aria-label', `Smazat ${kniha.nazev || kniha.isbn}`);
  smazat.textContent = '✕';
  smazat.addEventListener('click', () => {
    if (!confirm(`Smazat „${kniha.nazev || kniha.isbn}“ z tabulky?`)) return;
    ulozne.smaz(kniha.id);
    vykresli();
  });
  tdAkce.appendChild(smazat);
  tr.appendChild(tdAkce);

  return tr;
}

function vykresli() {
  const knihy = vyfiltrovane();
  const celkem = ulozne.vsechny().length;

  telo.replaceChildren(...knihy.map(radek));
  pocet.textContent = String(celkem);
  tabulka.hidden = knihy.length === 0;
  prazdno.hidden = knihy.length !== 0;
  prazdno.textContent = celkem === 0
    ? 'Zatím tu nic není. Naskenujte první knihu.'
    : 'Hledání nic nenašlo.';
}

/* ------------------------------------------------- zpracování jednoho kódu */

async function zpracujKod(kod) {
  const isbn = normalizuj(kod);

  if (!jeKnizniKod(kod)) {
    nastavStav(`Kód ${kod} nevypadá na knihu (chybí prefix 978/979). Zkuste jiný kód.`);
    return;
  }
  if (cekaSeNaVyhledani.has(isbn)) return;

  skener.potvrzeniSkenu();

  const jiz = ulozne.podleIsbn(isbn);
  if (jiz) {
    ulozne.pridej({ isbn });
    vykresli();
    oznam(`„${jiz.nazev || isbn}“ už v tabulce byla — přidán další kus.`, 'varovani');
    return;
  }

  cekaSeNaVyhledani.add(isbn);
  nastavStav(`Hledám ${naFormat(isbn)} …`);

  try {
    const kniha = await najdiKnihu(isbn);
    ulozne.pridej(kniha);

    if (kniha.nalezeno) {
      oznam(`✓ ${kniha.nazev}${kniha.autor ? ' — ' + kniha.autor : ''}`, 'uspech');
      nastavStav(`Uloženo z: ${kniha.zdroj}. Můžete skenovat dál.`);
    } else if (kniha.nedostupne) {
      oznam('Databáze knih neodpověděly — údaje doplníme později.', 'chyba');
      nastavStav(`ISBN ${naFormat(isbn)} je uložené, ale databáze nebyly k zastižení. Zkontrolujte připojení; údaje můžete dopsat ručně.`);
    } else {
      oznam('Kniha se nenašla — doplňte údaje ručně v tabulce.', 'varovani');
      nastavStav(`ISBN ${naFormat(isbn)} se v databázích nenašlo. Řádek je v tabulce, název a autora dopište klepnutím.`);
    }
  } catch (chyba) {
    console.error(chyba);
    oznam('Vyhledávání selhalo — zkontrolujte připojení.', 'chyba');
    nastavStav('Nepodařilo se spojit s databázemi knih.');
  } finally {
    cekaSeNaVyhledani.delete(isbn);
    vykresli();
  }
}

/* ------------------------------------------------------------ skenování */

async function prepniSkenovani() {
  if (skener.jeSpusten()) {
    skener.zastav(video);
    kamera.hidden = true;
    btnSvetlo.hidden = true;
    btnSkenovat.textContent = '📷 Spustit skenování';
    nastavStav('Skenování zastaveno.');
    return;
  }

  btnSkenovat.disabled = true;
  nastavStav('Zapínám kameru …');

  try {
    kamera.hidden = false;
    await skener.spust(video, zpracujKod);
    btnSkenovat.textContent = '⏹ Zastavit';
    btnSvetlo.hidden = !skener.maSvetlo();
    nastavStav('Namiřte kód na knize do rámečku.');
  } catch (chyba) {
    kamera.hidden = true;
    console.error(chyba);
    nastavStav(popisChybyKamery(chyba));
    oznam('Kameru se nepodařilo spustit.', 'chyba');
  } finally {
    btnSkenovat.disabled = false;
  }
}

function popisChybyKamery(chyba) {
  switch (chyba?.name) {
    case 'NotAllowedError':
      return 'Přístup ke kameře byl odmítnut. Povolte ho v nastavení prohlížeče u této stránky a zkuste to znovu.';
    case 'NotFoundError':
      return 'V zařízení se nenašla žádná kamera. Použijte ruční zadání ISBN.';
    case 'NotReadableError':
      return 'Kameru používá jiná aplikace. Zavřete ji a zkuste to znovu.';
    case 'NotSupportedError':
      return 'Prohlížeč tu kameru nenabízí. Stránka musí běžet přes HTTPS — zkontrolujte adresu, nebo použijte ruční zadání ISBN.';
    default:
      return chyba?.message || 'Kameru se nepodařilo spustit. Stránka musí běžet přes HTTPS.';
  }
}

let svetloSviti = false;
btnSvetlo.addEventListener('click', async () => {
  svetloSviti = !svetloSviti;
  await skener.prepniSvetlo(svetloSviti);
  btnSvetlo.classList.toggle('aktivni', svetloSviti);
});

btnSkenovat.addEventListener('click', prepniSkenovani);

/* ------------------------------------------------------------ ruční zadání */

prvek('form-rucne').addEventListener('submit', async (udalost) => {
  udalost.preventDefault();
  const vstup = prvek('vstup-isbn');
  const hodnota = vstup.value.trim();
  if (!hodnota) return;

  if (!normalizuj(hodnota)) {
    oznam('To není platné ISBN — zkontrolujte číslice.', 'chyba');
    return;
  }
  vstup.value = '';
  await zpracujKod(hodnota);
});

/* ------------------------------------------------------- export a import */

function casovaZnacka() {
  return new Date().toISOString().slice(0, 10);
}

prvek('btn-csv').addEventListener('click', () => {
  if (!ulozne.vsechny().length) return oznam('Tabulka je prázdná.', 'varovani');
  ulozne.stahni(ulozne.doCsv(), `knihovna-${casovaZnacka()}.csv`, 'text/csv;charset=utf-8');
});

prvek('btn-json').addEventListener('click', () => {
  if (!ulozne.vsechny().length) return oznam('Tabulka je prázdná.', 'varovani');
  ulozne.stahni(ulozne.doJson(), `knihovna-${casovaZnacka()}.json`, 'application/json');
});

prvek('btn-import').addEventListener('click', () => prvek('soubor-import').click());

prvek('soubor-import').addEventListener('change', async (udalost) => {
  const soubor = udalost.target.files?.[0];
  if (!soubor) return;
  try {
    const data = JSON.parse(await soubor.text());
    if (!Array.isArray(data)) throw new Error('Soubor nemá očekávaný tvar.');
    const pridano = ulozne.importuj(data);
    vykresli();
    oznam(`Načteno ${pridano} nových knih.`, 'uspech');
  } catch (chyba) {
    console.error(chyba);
    oznam('Soubor se nepodařilo načíst.', 'chyba');
  } finally {
    udalost.target.value = '';
  }
});

prvek('btn-smazat-vse').addEventListener('click', () => {
  if (!ulozne.vsechny().length) return;
  if (!confirm('Opravdu smazat celou tabulku? Tuhle akci nejde vzít zpět.')) return;
  ulozne.smazVse();
  vykresli();
  oznam('Tabulka vymazána.', 'varovani');
});

/* ------------------------------------------------------- hledání a řazení */

hledat.addEventListener('input', vykresli);

document.querySelectorAll('th[data-radit]').forEach((zahlavi) => {
  zahlavi.addEventListener('click', () => {
    const sloupec = zahlavi.dataset.radit;
    razeni = {
      sloupec,
      sestupne: razeni.sloupec === sloupec ? !razeni.sestupne : false,
    };
    document.querySelectorAll('th[data-radit]').forEach((jine) => {
      jine.dataset.smer = jine === zahlavi ? (razeni.sestupne ? 'dolu' : 'nahoru') : '';
    });
    vykresli();
  });
});

/* ------------------------------------------------------------ start */

// Když se aplikace schová na pozadí, kamera se vypne, ať netahá baterku.
document.addEventListener('visibilitychange', () => {
  if (document.hidden && skener.jeSpusten()) prepniSkenovani();
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* aplikace funguje i bez offline režimu */
    });
  });
}

vykresli();
