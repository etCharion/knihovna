/**
 * Propojení celé aplikace: kamera → vyhledání knihy → tabulka.
 */

import { jeKnizniKod, normalizuj, naFormat } from './isbn.js';
import { najdiKnihu, nahradniObalka } from './lookup.js';
import * as ocr from './ocr.js';
import * as skener from './scanner.js';
import * as ulozne from './storage.js';

const prvek = (id) => document.getElementById(id);

const video = prvek('video');
const kamera = prvek('kamera');
const btnSkenovat = prvek('btn-skenovat');
const btnSvetlo = prvek('btn-svetlo');
const btnCislo = prvek('btn-cislo');
const stav = prvek('stav');
const hlaska = prvek('hlaska');
const telo = prvek('telo-tabulky');
const tabulka = prvek('tabulka');
const prazdno = prvek('prazdno');
const pocet = prvek('pocet');
const hledat = prvek('hledat');
const vyberPolicka = prvek('vyber-policka');
const filtrPolicka = prvek('filtr-policka');
const seznamPolicek = prvek('seznam-policek');

const prekryv = prvek('prekryv');
const btnPridat = prvek('btn-pridat');
const btnZahodit = prvek('btn-zahodit');
const btnZnovu = prvek('btn-znovu');
const nabidkaStav = prvek('nabidka-stav');
const nabidkaUpozorneni = prvek('nabidka-upozorneni');
const poleNabidky = {
  isbn: prvek('nabidka-isbn'),
  nazev: prvek('nabidka-nazev'),
  autor: prvek('nabidka-autor'),
  rok: prvek('nabidka-rok'),
  vydavatel: prvek('nabidka-vydavatel'),
  policka: prvek('nabidka-policka'),
  poznamka: prvek('nabidka-poznamka'),
};

let razeni = { sloupec: null, sestupne: false };
let cekaSeNaVyhledani = new Set();

/** Hodnota pro „všechny poličky“ ve filtru — prázdný řetězec už znamená „bez poličky“. */
const VSECHNY_POLICKY = '\u0000vse';
// Zvolený filtr se drží v proměnné, ne v rozbalovátku: „bez poličky“ je
// prázdný řetězec a od dosud nenaplněného <select> by se nedal odlišit.
let zobrazenaPolicka = VSECHNY_POLICKY;

/** Poslední volba v rozbalovátku, která místo výběru založí novou poličku. */
const NOVA_POLICKA = '\u0000nova';

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

/* ------------------------------------------------------------ poličky */

/**
 * Naplní rozbalovátko poličkami.
 *
 * Prázdná hodnota znamená „bez poličky“ — to je pořád platné zařazení,
 * takže se nabízí všude. Volba „nová polička“ se do seznamu přidá jen tam,
 * kde má smysl rovnou zakládat (u skenování a v tabulce), ne ve filtru.
 */
function naplnVyberPolicek(vyber, vybrana, { sVsemi = false, sNovou = false } = {}) {
  const seznam = ulozne.policky();
  const moznosti = [];

  if (sVsemi) moznosti.push([VSECHNY_POLICKY, 'Všechny poličky']);
  moznosti.push(['', 'Bez poličky']);
  for (const nazev of seznam) moznosti.push([nazev, nazev]);
  // Polička ze zálohy, která se zatím nestihla dostat do seznamu.
  if (vybrana && !seznam.includes(vybrana) && vybrana !== VSECHNY_POLICKY) {
    moznosti.push([vybrana, vybrana]);
  }
  if (sNovou) moznosti.push([NOVA_POLICKA, '➕ Nová polička…']);

  vyber.replaceChildren(...moznosti.map(([hodnota, popis]) => {
    const volba = document.createElement('option');
    volba.value = hodnota;
    volba.textContent = popis;
    return volba;
  }));
  vyber.value = vybrana;
  vyber.dataset.predchozi = vybrana;
}

/**
 * Obslouží volbu „nová polička“: zeptá se na název a poličku založí.
 * Vrátí vybranou poličku, nebo null, když uživatel zakládání zrušil —
 * to se rozbalovátko vrátí k tomu, co v něm bylo předtím.
 */
function vyresVolbuPolicky(vyber) {
  if (vyber.value !== NOVA_POLICKA) {
    vyber.dataset.predchozi = vyber.value;
    return vyber.value;
  }

  const nazev = prompt('Jak se polička jmenuje? (třeba „Obývák — horní řada“)');
  const vytvorena = nazev === null ? null : ulozne.pridejPolicku(nazev);
  if (!vytvorena) {
    vyber.value = vyber.dataset.predchozi ?? '';
    if (nazev !== null) oznam('Polička musí mít název.', 'varovani');
    return null;
  }
  vyber.dataset.predchozi = vytvorena;
  return vytvorena;
}

/** Znovu vykreslí všechna místa, kde se poličky nabízejí. */
function obnovPolicky() {
  naplnVyberPolicek(vyberPolicka, ulozne.aktivniPolicka(), { sNovou: true });

  // Zrušená polička nesmí zůstat viset ve filtru — tabulka by byla prázdná.
  const znameFiltru = [VSECHNY_POLICKY, '', ...ulozne.policky()];
  if (!znameFiltru.includes(zobrazenaPolicka)) zobrazenaPolicka = VSECHNY_POLICKY;
  naplnVyberPolicek(filtrPolicka, zobrazenaPolicka, { sVsemi: true });

  vykresliSpravuPolicek();
}

function vykresliSpravuPolicek() {
  const seznam = ulozne.policky();

  if (!seznam.length) {
    const prazdnaPolozka = document.createElement('li');
    prazdnaPolozka.className = 'napoveda';
    prazdnaPolozka.textContent = 'Zatím žádná polička. Založte první tlačítkem níže.';
    seznamPolicek.replaceChildren(prazdnaPolozka);
    return;
  }

  seznamPolicek.replaceChildren(...seznam.map((nazev) => {
    const { titulu, kusu } = ulozne.obsahPolicky(nazev);
    const polozka = document.createElement('li');

    const popis = document.createElement('span');
    popis.className = 'nazev-policky';
    popis.textContent = nazev;
    polozka.appendChild(popis);

    const pocty = document.createElement('span');
    pocty.className = 'pocty-policky';
    pocty.textContent = titulu === kusu ? `${titulu} tit.` : `${titulu} tit. / ${kusu} ks`;
    polozka.appendChild(pocty);

    const prejmenovat = document.createElement('button');
    prejmenovat.className = 'ikona-tlacitko';
    prejmenovat.type = 'button';
    prejmenovat.title = 'Přejmenovat poličku';
    prejmenovat.setAttribute('aria-label', `Přejmenovat poličku ${nazev}`);
    prejmenovat.textContent = '✏️';
    prejmenovat.addEventListener('click', () => {
      const novy = prompt('Nový název poličky:', nazev);
      if (novy === null) return;
      if (!ulozne.prejmenujPolicku(nazev, novy)) {
        return oznam('Název poličky se nezměnil.', 'varovani');
      }
      obnovPolicky();
      vykresli();
      oznam(`Polička přejmenovaná na „${ulozne.upravNazevPolicky(novy)}“.`, 'uspech');
    });
    polozka.appendChild(prejmenovat);

    const smazat = document.createElement('button');
    smazat.className = 'ikona-tlacitko';
    smazat.type = 'button';
    smazat.title = 'Zrušit poličku';
    smazat.setAttribute('aria-label', `Zrušit poličku ${nazev}`);
    smazat.textContent = '✕';
    smazat.addEventListener('click', () => {
      const otazka = titulu
        ? `Zrušit poličku „${nazev}“? ${titulu} knih na ní zůstane v tabulce bez zařazení.`
        : `Zrušit prázdnou poličku „${nazev}“?`;
      if (!confirm(otazka)) return;
      ulozne.smazPolicku(nazev);
      obnovPolicky();
      vykresli();
      oznam(`Polička „${nazev}“ zrušena.`, 'varovani');
    });
    polozka.appendChild(smazat);

    return polozka;
  }));
}

/* ------------------------------------------------------------ tabulka */

function vyfiltrovane() {
  const dotaz = hledat.value.trim().toLowerCase();
  let knihy = ulozne.vsechny();

  if (zobrazenaPolicka !== VSECHNY_POLICKY) {
    knihy = knihy.filter((k) => ulozne.upravNazevPolicky(k.policka) === zobrazenaPolicka);
  }

  if (dotaz) {
    knihy = knihy.filter((k) =>
      ['nazev', 'autor', 'isbn', 'vydavatel', 'poznamka', 'rok', 'policka']
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

/** Pole, která patří ke knize samotné — po opravě ISBN se dohledávají znovu. */
const POLE_O_KNIZE = ['nazev', 'autor', 'rok', 'vydavatel', 'stran', 'jazyk', 'obalka', 'zdroj'];

/**
 * Buňka s ISBN, kterou jde přepsat, když skener přečetl číslo špatně.
 *
 * Po opravě se údaje o knize načtou znovu — ty původní patřily jinému
 * číslu, takže by po opravě zůstaly viset u nesprávné knihy.
 */
function bunkaIsbn(kniha) {
  const td = document.createElement('td');
  td.className = 'isbn upravitelne';
  td.contentEditable = 'true';
  td.dataset.prazdny = 'ISBN';
  td.textContent = naFormat(kniha.isbn);

  const vratPuvodni = () => {
    td.textContent = naFormat(kniha.isbn);
  };

  td.addEventListener('keydown', (udalost) => {
    if (udalost.key === 'Enter') {
      udalost.preventDefault();
      td.blur();
    } else if (udalost.key === 'Escape') {
      vratPuvodni();
      td.blur();
    }
  });

  td.addEventListener('blur', async () => {
    const zadane = td.textContent.trim();
    const nove = normalizuj(zadane);

    if (!nove) {
      oznam('To není platné ISBN — zkontrolujte číslice.', 'chyba');
      return vratPuvodni();
    }
    if (nove === kniha.isbn) return vratPuvodni();
    if (!jeKnizniKod(nove)) {
      oznam('Číslo nezačíná na 978 ani 979, takže to není kniha.', 'chyba');
      return vratPuvodni();
    }
    if (ulozne.podleIsbn(nove, kniha.policka)) {
      oznam('Kniha s tímto ISBN už na téhle poličce je.', 'varovani');
      return vratPuvodni();
    }

    const prazdneUdaje = Object.fromEntries(POLE_O_KNIZE.map((pole) => [pole, '']));
    ulozne.uprav(kniha.id, { isbn: nove, ...prazdneUdaje });
    cekaSeNaVyhledani.add(nove);
    nastavStav(`Opraveno na ${naFormat(nove)}, hledám údaje …`);
    vykresli();

    try {
      const nalezena = await najdiKnihu(nove);
      if (nalezena.nalezeno) {
        ulozne.uprav(kniha.id, Object.fromEntries(POLE_O_KNIZE.map((p) => [p, nalezena[p]])));
        oznam(`✓ ${nalezena.nazev}${nalezena.autor ? ' — ' + nalezena.autor : ''}`, 'uspech');
        nastavStav(`Údaje načteny znovu z: ${nalezena.zdroj}.`);
      } else if (nalezena.nedostupne) {
        oznam('ISBN opraveno, ale databáze neodpověděly.', 'chyba');
        nastavStav('Údaje se nepodařilo načíst — zkontrolujte připojení a opravu ISBN zopakujte.');
      } else {
        oznam('ISBN opraveno, kniha se ale nenašla — doplňte údaje ručně.', 'varovani');
        nastavStav(`ISBN ${naFormat(nove)} se v databázích nenašlo.`);
      }
    } finally {
      cekaSeNaVyhledani.delete(nove);
      vykresli();
    }
  });

  return td;
}

/**
 * Buňka s poličkou. Přeřazení knihy jinam je běžná věc (kniha se přestěhuje),
 * proto rovnou v tabulce a bez potvrzování.
 */
function bunkaPolicka(kniha) {
  const td = document.createElement('td');
  td.className = 'sloupec-policka';

  const puvodni = ulozne.upravNazevPolicky(kniha.policka);
  const vyber = document.createElement('select');
  vyber.setAttribute('aria-label', `Polička knihy ${kniha.nazev || kniha.isbn}`);
  naplnVyberPolicek(vyber, puvodni, { sNovou: true });

  vyber.addEventListener('change', () => {
    const nova = vyresVolbuPolicky(vyber);
    if (nova === null || nova === puvodni) return;

    const vysledek = ulozne.presunNaPolicku(kniha.id, nova);
    obnovPolicky();
    vykresli();
    oznam(
      vysledek?.slouceno
        ? `Na poličce „${nova || 'bez poličky'}“ už tenhle titul byl — kusy se sečetly.`
        : `Přesunuto na „${nova || 'bez poličky'}“.`,
      vysledek?.slouceno ? 'varovani' : 'uspech'
    );
  });

  td.appendChild(vyber);
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
  tr.appendChild(bunkaIsbn(kniha));
  tr.appendChild(bunkaPolicka(kniha));
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
  const filtrovanaPolicka = zobrazenaPolicka !== VSECHNY_POLICKY;

  telo.replaceChildren(...knihy.map(radek));
  pocet.textContent = String(celkem);
  tabulka.hidden = knihy.length === 0;
  prazdno.hidden = knihy.length !== 0;
  prazdno.textContent = celkem === 0
    ? 'Zatím tu nic není. Naskenujte první knihu.'
    : filtrovanaPolicka
      ? 'Na téhle poličce nic takového není.'
      : 'Hledání nic nenašlo.';
}

/* ----------------------------------------- nabídka před přidáním knihy */

/**
 * Nic se neukládá samo.
 *
 * Skener se občas splete a načte kód sousední knihy nebo číslo, které knize
 * vůbec nepatří — dřív takový omyl skončil rovnou v tabulce. Každý načtený
 * kód se proto nejdřív ukáže tady: jde opravit ISBN a vyhledat znovu, upravit
 * údaje, vybrat poličku a teprve pak knihu přidat. Nebo ji zahodit.
 */
let nabizenaKniha = null;   // údaje, které se nevyplňují ve formuláři (obálka, stran, jazyk, zdroj)

// Pořadové číslo nabídky. Zahození a hned další sken se stihnou dřív, než
// doběhne dohledávání toho prvního čísla — podle tohohle se pozná, že
// odpověď patří k nabídce, která už na obrazovce není, a zahodí se.
let poradiNabidky = 0;

function jeNabidkaOtevrena() {
  return !prekryv.hidden;
}

function nastavNabidkuStav(text) {
  nabidkaStav.textContent = text;
}

/** Ukáže, jestli tenhle titul v knihovně už někde je — ať se omylem nezdvojí. */
function zkontrolujDuplicitu() {
  const isbn = normalizuj(poleNabidky.isbn.value);
  const policka = ulozne.upravNazevPolicky(poleNabidky.policka.value);

  const naPolicce = isbn ? ulozne.podleIsbn(isbn, policka) : null;
  const jinde = isbn ? ulozne.vsudePodleIsbn(isbn).filter((k) => k !== naPolicce) : [];

  if (naPolicce) {
    const kde = policka ? `na poličce „${policka}“` : 'v knihovně';
    nabidkaUpozorneni.textContent =
      `Tenhle titul už ${kde} máte (${naPolicce.kusu || 1}×). Přidáním přibude další kus, ` +
      'upravené údaje se nepoužijí.';
    nabidkaUpozorneni.hidden = false;
    btnPridat.textContent = '➕ Přidat další kus';
    return;
  }

  if (jinde.length) {
    const mista = [...new Set(jinde.map((k) => ulozne.upravNazevPolicky(k.policka) || 'bez poličky'))];
    nabidkaUpozorneni.textContent = `Tenhle titul už máte: ${mista.join(', ')}. Přibude jako další výtisk.`;
    nabidkaUpozorneni.hidden = false;
  } else {
    nabidkaUpozorneni.hidden = true;
  }
  btnPridat.textContent = '✓ Přidat do knihovny';
}

function vyplnNabidku(kniha) {
  poleNabidky.nazev.value = kniha.nazev || '';
  poleNabidky.autor.value = kniha.autor || '';
  poleNabidky.rok.value = kniha.rok || '';
  poleNabidky.vydavatel.value = kniha.vydavatel || '';
}

function otevriNabidku(isbn) {
  poradiNabidky++;
  nabizenaKniha = { obalka: '', stran: '', jazyk: '', zdroj: '' };
  poleNabidky.isbn.value = naFormat(isbn);
  poleNabidky.poznamka.value = '';
  vyplnNabidku({});
  naplnVyberPolicek(poleNabidky.policka, ulozne.aktivniPolicka(), { sNovou: true });
  prekryv.hidden = false;
  document.body.classList.add('bez-posunu');
  // Že je kniha už v knihovně, se ví hned — nemusí se čekat na dohledání údajů.
  zkontrolujDuplicitu();
}

function zavriNabidku() {
  prekryv.hidden = true;
  nabizenaKniha = null;
  document.body.classList.remove('bez-posunu');
}

/** Dohledá údaje k číslu v nabídce a vyplní jimi formulář. */
async function vyhledejDoNabidky(isbn) {
  const moje = poradiNabidky;
  const platna = () => jeNabidkaOtevrena() && poradiNabidky === moje;

  btnPridat.disabled = true;
  btnZnovu.disabled = true;
  nastavNabidkuStav(`Hledám ${naFormat(isbn)} …`);

  try {
    const kniha = await najdiKnihu(isbn);
    if (!platna()) return;          // nabídka se mezitím zahodila nebo vyměnila

    nabizenaKniha = Object.fromEntries(POLE_O_KNIZE.map((pole) => [pole, kniha[pole] || '']));
    vyplnNabidku(kniha);

    if (kniha.nalezeno) {
      nastavNabidkuStav(`Nalezeno v: ${kniha.zdroj}. Zkontrolujte údaje a knihu přidejte.`);
    } else if (kniha.nedostupne) {
      nastavNabidkuStav(
        `Žádná databáze neodpověděla (${kniha.selhalyZdroje.join(', ')}). ` +
        'Zkontrolujte připojení a vyhledejte znovu, nebo údaje dopište ručně.'
      );
    } else {
      const selhaly = kniha.selhalyZdroje?.length
        ? ` Neodpověděly: ${kniha.selhalyZdroje.join(', ')}.`
        : '';
      nastavNabidkuStav(
        `ISBN ${naFormat(isbn)} databáze neznají.${selhaly} ` +
        'Zkontrolujte číslo — skener se plete — nebo údaje dopište ručně.'
      );
    }
  } catch (chyba) {
    console.error(chyba);
    if (platna()) nastavNabidkuStav('Nepodařilo se spojit s databázemi knih. Zkuste vyhledat znovu.');
  } finally {
    if (platna()) {
      btnPridat.disabled = false;
      btnZnovu.disabled = false;
      zkontrolujDuplicitu();
    }
  }
}

/** Uloží knihu z nabídky do tabulky. */
function pridejZNabidky() {
  const isbn = normalizuj(poleNabidky.isbn.value);
  if (!isbn) {
    return oznam('To není platné ISBN — zkontrolujte číslice.', 'chyba');
  }
  if (!jeKnizniKod(isbn)) {
    return oznam('Číslo nezačíná na 978 ani 979, takže to není kniha.', 'chyba');
  }

  const policka = ulozne.upravNazevPolicky(poleNabidky.policka.value);
  const { zaznam, duplicita } = ulozne.pridej({
    ...nabizenaKniha,
    isbn,
    nazev: poleNabidky.nazev.value.trim(),
    autor: poleNabidky.autor.value.trim(),
    rok: poleNabidky.rok.value.trim(),
    vydavatel: poleNabidky.vydavatel.value.trim(),
    poznamka: poleNabidky.poznamka.value.trim(),
    policka,
  });

  ulozne.nastavAktivniPolicku(policka);
  zavriNabidku();
  obnovPolicky();
  vykresli();

  const kde = policka ? ` na poličku „${policka}“` : '';
  if (duplicita) {
    oznam(`„${zaznam.nazev || naFormat(isbn)}“ už tam byla — přidán ${zaznam.kusu}. kus.`, 'varovani');
    nastavStav(`Přibyl další kus${kde}. Můžete skenovat dál.`);
  } else {
    oznam(`✓ ${zaznam.nazev || naFormat(isbn)}${zaznam.autor ? ' — ' + zaznam.autor : ''}`, 'uspech');
    nastavStav(`Přidáno${kde}. Můžete skenovat dál.`);
  }
}

/* ------------------------------------------------- zpracování jednoho kódu */

async function zpracujKod(kod) {
  const isbn = normalizuj(kod);

  if (!jeKnizniKod(kod)) {
    nastavStav(`Kód ${kod} nevypadá na knihu (chybí prefix 978/979). Zkuste jiný kód.`);
    return;
  }
  if (jeNabidkaOtevrena()) {
    nastavStav('Nejdřív dořešte načtenou knihu — přidejte ji, nebo zahoďte.');
    return;
  }

  skener.potvrzeniSkenu();
  otevriNabidku(isbn);
  nastavStav(`Načteno ${naFormat(isbn)} — potvrďte přidání.`);
  await vyhledejDoNabidky(isbn);
}

/* ------------------------------------------------------------ skenování */

async function prepniSkenovani() {
  if (skener.jeSpusten()) {
    skener.zastav(video);
    ocr.uklid();                 // rozpoznávání textu si drží hodně paměti
    kamera.hidden = true;
    btnSvetlo.hidden = true;
    btnCislo.hidden = true;
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
    btnCislo.hidden = false;
    nastavStav('Namiřte čárový kód do rámečku. Kniha žádný nemá? Zaměřte na řádek s číslem ISBN a klepněte na „Přečíst číslo ISBN“.');
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

/* ---------------------------------------------- obsluha nabídky ke schválení */

btnPridat.addEventListener('click', pridejZNabidky);

btnZahodit.addEventListener('click', () => {
  const isbn = normalizuj(poleNabidky.isbn.value);
  zavriNabidku();
  nastavStav(
    isbn
      ? `Kniha ${naFormat(isbn)} zahozena — nic se neuložilo. Můžete skenovat dál.`
      : 'Zahozeno — nic se neuložilo.'
  );
});

btnZnovu.addEventListener('click', async () => {
  const isbn = normalizuj(poleNabidky.isbn.value);
  if (!isbn) return oznam('To není platné ISBN — zkontrolujte číslice.', 'chyba');
  if (!jeKnizniKod(isbn)) {
    return oznam('Číslo nezačíná na 978 ani 979, takže to není kniha.', 'chyba');
  }
  poleNabidky.isbn.value = naFormat(isbn);
  await vyhledejDoNabidky(isbn);
});

// Enter v čísle znamená „vyhledej znovu“, v ostatních polích rovnou „přidej“.
poleNabidky.isbn.addEventListener('keydown', (udalost) => {
  if (udalost.key !== 'Enter') return;
  udalost.preventDefault();
  btnZnovu.click();
});

for (const [nazev, pole] of Object.entries(poleNabidky)) {
  if (nazev === 'isbn' || pole.tagName === 'SELECT') continue;
  pole.addEventListener('keydown', (udalost) => {
    if (udalost.key !== 'Enter') return;
    udalost.preventDefault();
    btnPridat.click();
  });
}

poleNabidky.policka.addEventListener('change', () => {
  const vybrana = vyresVolbuPolicky(poleNabidky.policka);
  if (vybrana === null) return;
  naplnVyberPolicek(poleNabidky.policka, vybrana, { sNovou: true });
  obnovPolicky();
  zkontrolujDuplicitu();
});

// Escape zavírá nabídku stejně jako „Zahodit“ — nic se neztratí, kód se dá načíst znovu.
document.addEventListener('keydown', (udalost) => {
  if (udalost.key === 'Escape' && jeNabidkaOtevrena()) btnZahodit.click();
});

/* ------------------------------------------------------- výběr poliček */

vyberPolicka.addEventListener('change', () => {
  const vybrana = vyresVolbuPolicky(vyberPolicka);
  if (vybrana === null) return;
  ulozne.nastavAktivniPolicku(vybrana);
  obnovPolicky();
  nastavStav(
    vybrana
      ? `Nové knihy se budou nabízet na poličku „${vybrana}“.`
      : 'Nové knihy se budou nabízet bez poličky.'
  );
});

prvek('btn-nova-policka').addEventListener('click', () => {
  const nazev = prompt('Jak se polička jmenuje? (třeba „Obývák — horní řada“)');
  if (nazev === null) return;
  const vytvorena = ulozne.pridejPolicku(nazev);
  if (!vytvorena) return oznam('Polička musí mít název.', 'varovani');
  ulozne.nastavAktivniPolicku(vytvorena);
  obnovPolicky();
  oznam(`Polička „${vytvorena}“ založena a nastavená pro skenování.`, 'uspech');
});

filtrPolicka.addEventListener('change', () => {
  zobrazenaPolicka = filtrPolicka.value;
  vykresli();
});

/* ------------------------------------------------- přečtení ISBN z čísla */

/**
 * Pro knihy bez čárového kódu: vyfotí se rámeček a z obrázku se přečte
 * vytištěné číslo ISBN. Trvá to pár vteřin, proto se to spouští klepnutím
 * a ne průběžně jako čtení čárových kódů.
 */
btnCislo.addEventListener('click', async () => {
  if (!skener.jeSpusten()) return;

  btnCislo.disabled = true;
  const puvodniPopis = btnCislo.textContent;
  btnCislo.textContent = '⏳ Čtu…';

  try {
    const { isbn, text } = await ocr.prectiIsbnZObrazu(video, nastavStav);

    if (isbn) {
      await zpracujKod(isbn);
    } else if (text) {
      oznam('Číslo ISBN se v obrázku nenašlo.', 'varovani');
      nastavStav(`Přečteno „${text.replace(/\s+/g, ' ').slice(0, 40)}“, ale platné ISBN v tom není. Zkuste jít blíž, přisvítit, nebo číslo zadat ručně.`);
    } else {
      oznam('Z obrázku se nepodařilo nic přečíst.', 'varovani');
      nastavStav('Namiřte na řádek s číslem ISBN, držte telefon v klidu a zkuste to znovu.');
    }
  } catch (chyba) {
    console.error(chyba);
    oznam('Rozpoznávání textu selhalo.', 'chyba');
    nastavStav(chyba.message || 'Rozpoznávání textu se nepodařilo spustit.');
  } finally {
    btnCislo.disabled = false;
    btnCislo.textContent = puvodniPopis;
  }
});

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
    const slouceno = ulozne.uklidDuplicity();
    obnovPolicky();
    vykresli();
    oznam(
      `Načteno ${pridano} nových knih${slouceno ? `, sloučeno ${slouceno} duplicit` : ''}.`,
      'uspech'
    );
  } catch (chyba) {
    console.error(chyba);
    oznam('Soubor se nepodařilo načíst.', 'chyba');
  } finally {
    udalost.target.value = '';
  }
});

prvek('btn-smazat-vse').addEventListener('click', () => {
  if (!ulozne.vsechny().length) return;
  if (!confirm('Opravdu smazat celou tabulku? Tuhle akci nejde vzít zpět. Poličky zůstanou.')) return;
  ulozne.smazVse();
  obnovPolicky();
  vykresli();
  oznam('Tabulka vymazána. Poličky zůstaly.', 'varovani');
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

// Data mohla vzniknout ve starší verzi aplikace nebo přijít ze zálohy
// z jiného telefonu — dvojí záznamy o téže knize se hned na začátku sloučí.
const slouceneNaStartu = ulozne.uklidDuplicity();
if (slouceneNaStartu) {
  oznam(`Sloučeno ${slouceneNaStartu} duplicitních záznamů podle ISBN.`, 'varovani');
}

// Poličky ze zálohy z jiného telefonu se objeví u knih, ale v seznamu chybí.
ulozne.uklidPolicky();
obnovPolicky();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* aplikace funguje i bez offline režimu */
    });
  });
}

vykresli();
