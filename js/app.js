/**
 * Propojení celé aplikace: kamera → vyhledání knihy → tabulka.
 */

import { naFormat, navrhniOpravu, rozpoznej } from './isbn.js';
import { hledejPodleTextu, najdiKnihu, nahradniObalka } from './lookup.js';
import * as ocr from './ocr.js';
import * as skener from './scanner.js';
import * as ulozne from './storage.js';
import * as zaloha from './zaloha.js';

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
const panelNalezu = prvek('vysledky-hledani');

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

/**
 * Popisky „už v knihovně“ u knih nabídnutých hledáním podle názvu.
 *
 * Kniha se ukládá až potvrzením v nabídce, takže popisek nejde obnovit hned
 * po klepnutí — visí proto na překreslení tabulky, které přijde vždycky,
 * ať se kniha uložila odkudkoliv.
 */
const obnovyNalezu = [];
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

/** České skloňování po číslovce: 1 kniha, 2 knihy, 5 knih. */
function pocetSlovem(kolik, jedna, dve, pet) {
  return `${kolik} ${kolik === 1 ? jedna : kolik < 5 ? dve : pet}`;
}

/** Jak se v hláškách jmenuje číslo, o které zrovna jde. */
const jmenoCisla = (druh) => (druh === 'periodikum' ? 'ISSN' : 'ISBN');

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

/**
 * Text, který jde přepsat přímo v tabulce — pro ruční doplnění a opravy.
 *
 * Upravitelný je vždycky jen tenhle prvek, ne celá buňka. Do buňky totiž může
 * patřit i něco dalšího (odznak s počtem kusů) a to by se při uložení stalo
 * součástí zapsané hodnoty — přesně tak se dřív do názvů dostávalo „3×“.
 */
function poleKUprave(kniha, pole, zastupnyText) {
  const prvek = document.createElement('span');
  prvek.contentEditable = 'true';
  prvek.className = 'upravitelne';
  prvek.dataset.pole = pole;
  prvek.dataset.prazdny = zastupnyText;
  prvek.textContent = kniha[pole] || '';
  prvek.addEventListener('blur', () => {
    const nova = prvek.textContent.trim();
    if (nova !== (kniha[pole] || '')) {
      ulozne.uprav(kniha.id, { [pole]: nova });
      kniha[pole] = nova;
    }
  });
  prvek.addEventListener('keydown', (udalost) => {
    if (udalost.key === 'Enter') {
      udalost.preventDefault();
      prvek.blur();
    }
  });
  return prvek;
}

/** Buňka s upravitelným textem. Klepnutí kamkoliv do buňky začne psát. */
function bunkaKUprave(kniha, pole, zastupnyText) {
  const td = document.createElement('td');
  const prvek = poleKUprave(kniha, pole, zastupnyText);
  td.appendChild(prvek);
  td.addEventListener('click', (udalost) => {
    if (udalost.target === td) prvek.focus();
  });
  return td;
}

/** Pole, která patří ke knize samotné — po opravě čísla se dohledávají znovu. */
const POLE_O_KNIZE = ['nazev', 'autor', 'rok', 'vydavatel', 'stran', 'jazyk', 'obalka', 'zdroj'];

/**
 * Buňka s ISBN (u periodik ISSN), kterou jde přepsat, když skener přečetl
 * číslo špatně.
 *
 * Po opravě se údaje o titulu načtou znovu — ty původní patřily jinému
 * číslu, takže by po opravě zůstaly viset u nesprávné knihy.
 */
function bunkaIsbn(kniha) {
  const td = document.createElement('td');
  td.className = 'isbn';
  const prvek = document.createElement('span');
  prvek.className = 'upravitelne';
  prvek.contentEditable = 'true';
  prvek.dataset.pole = 'isbn';
  prvek.dataset.prazdny = 'ISBN';
  prvek.textContent = naFormat(kniha.isbn);
  td.appendChild(prvek);
  td.addEventListener('click', (udalost) => {
    if (udalost.target === td) prvek.focus();
  });

  const vratPuvodni = () => {
    prvek.textContent = naFormat(kniha.isbn);
  };

  prvek.addEventListener('keydown', (udalost) => {
    if (udalost.key === 'Enter') {
      udalost.preventDefault();
      prvek.blur();
    } else if (udalost.key === 'Escape') {
      vratPuvodni();
      prvek.blur();
    }
  });

  prvek.addEventListener('blur', async () => {
    const zadane = prvek.textContent.trim();
    const rozpoznane = rozpoznej(zadane);

    if (!rozpoznane) {
      const navrh = navrhniOpravu(zadane);
      oznam('To není platné ISBN ani ISSN — zkontrolujte číslice.', 'chyba');
      nastavStav(navrh
        ? `U ${zadane} nesedí kontrolní číslice — podle zbytku čísla by mělo být ${naFormat(navrh)}.`
        : `Číslo ${zadane} neprošlo kontrolou, v tabulce zůstalo původní.`);
      return vratPuvodni();
    }

    const { kod: nove, druh } = rozpoznane;
    const cislo = jmenoCisla(druh);
    if (nove === kniha.isbn) return vratPuvodni();
    if (ulozne.podleIsbn(nove, kniha.policka)) {
      oznam(`Titul s tímto ${cislo} už na téhle poličce je.`, 'varovani');
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
        oznam(`${cislo} opraveno, ale databáze neodpověděly.`, 'chyba');
        nastavStav(`Údaje se nepodařilo načíst — zkontrolujte připojení a opravu ${cislo} zopakujte.`);
      } else {
        oznam(`${cislo} opraveno, titul se ale nenašel — doplňte údaje ručně.`, 'varovani');
        nastavStav(`${cislo} ${naFormat(nove)} se v databázích nenašlo.`);
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

  // Odznak s počtem kusů patří do buňky vedle názvu, ne dovnitř upravitelné
  // části — jinak by se při klepnutí do buňky uložil jako součást názvu.
  const tdNazev = bunkaKUprave(kniha, 'nazev', 'Doplňte název');
  if (Number(kniha.kusu) > 1) {
    const odznak = document.createElement('span');
    odznak.className = 'odznak';
    odznak.textContent = `${kniha.kusu}×`;
    odznak.title = `Počet kusů: ${kniha.kusu}`;
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

  for (const obnov of obnovyNalezu) obnov();
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
  const isbn = rozpoznej(poleNabidky.isbn.value)?.kod || '';
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

/**
 * `zHledani` jsou údaje z nabídky hledání podle názvu a autora. Ukážou se hned,
 * ať uživatel vidí, kterou knihu vlastně vybral, a zůstanou v poli i tehdy,
 * když dohledání podle samotného čísla nic nevrátí.
 */
function otevriNabidku(isbn, zHledani = null) {
  poradiNabidky++;
  nabizenaKniha = Object.fromEntries(POLE_O_KNIZE.map((pole) => [pole, zHledani?.[pole] || '']));
  poleNabidky.isbn.value = naFormat(isbn);
  poleNabidky.poznamka.value = '';
  vyplnNabidku(zHledani || {});
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
async function vyhledejDoNabidky(isbn, zHledani = null) {
  const moje = poradiNabidky;
  const cislo = jmenoCisla(rozpoznej(isbn)?.druh);
  const platna = () => jeNabidkaOtevrena() && poradiNabidky === moje;

  btnPridat.disabled = true;
  btnZnovu.disabled = true;
  nastavNabidkuStav(`Hledám ${naFormat(isbn)} …`);

  try {
    const kniha = doplnChybejici(await najdiKnihu(isbn), zHledani || {});
    if (!platna()) return;          // nabídka se mezitím zahodila nebo vyměnila

    nabizenaKniha = Object.fromEntries(POLE_O_KNIZE.map((pole) => [pole, kniha[pole] || '']));
    vyplnNabidku(kniha);

    if (kniha.nalezeno) {
      nastavNabidkuStav(`Nalezeno v: ${kniha.zdroj}. Zkontrolujte údaje a knihu přidejte.`);
    } else if (kniha.nedostupne) {
      nastavNabidkuStav(
        `${cislo} ${naFormat(isbn)}: žádná databáze neodpověděla ` +
        `(${kniha.selhalyZdroje.join(', ')}). ` +
        'Zkontrolujte připojení a vyhledejte znovu, nebo údaje dopište ručně.'
      );
    } else {
      const selhaly = kniha.selhalyZdroje?.length
        ? ` Neodpověděly: ${kniha.selhalyZdroje.join(', ')}.`
        : '';
      nastavNabidkuStav(
        `${cislo} ${naFormat(isbn)} databáze neznají.${selhaly} ` +
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
  const rozpoznane = rozpoznej(poleNabidky.isbn.value);
  if (!rozpoznane) {
    const navrh = navrhniOpravu(poleNabidky.isbn.value);
    if (navrh) {
      poleNabidky.isbn.value = naFormat(navrh);
      zkontrolujDuplicitu();
      return oznam('Číslo neprošlo kontrolou — v poli je návrh opravy.', 'varovani');
    }
    return oznam('To není platné ISBN ani ISSN — zkontrolujte číslice.', 'chyba');
  }

  const isbn = rozpoznane.kod;

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

/**
 * Doplní do dohledaného záznamu údaje, které se podle čísla nenašly.
 *
 * Uplatní se u titulů vybraných z nabídky hledání podle názvu: tam už název
 * a autor známí jsou, takže i když se dotaz podle samotného čísla nechytí,
 * řádek nezůstane prázdný.
 */
function doplnChybejici(kniha, zHledani) {
  const doplnena = { ...kniha };
  for (const pole of POLE_O_KNIZE) {
    if (!doplnena[pole] && zHledani[pole]) doplnena[pole] = zHledani[pole];
  }
  // Doplněný název znamená, že řádek o titulu něco ví — i když sám dotaz
  // podle čísla nic nevrátil.
  return { ...doplnena, nalezeno: !!doplnena.nazev };
}

async function zpracujKod(vstupniKod, zHledani = null) {
  const rozpoznane = rozpoznej(vstupniKod);

  if (!rozpoznane) {
    nastavStav(
      `Kód ${vstupniKod} nevypadá na knihu ani na časopis — čekají se čísla ` +
      'začínající 978 nebo 979 (ISBN), případně 977 (ISSN). Zkuste jiný kód.'
    );
    return;
  }
  if (jeNabidkaOtevrena()) {
    nastavStav('Nejdřív dořešte načtenou knihu — přidejte ji, nebo zahoďte.');
    return;
  }

  const { kod } = rozpoznane;
  skener.potvrzeniSkenu();
  otevriNabidku(kod, zHledani);
  nastavStav(`Načteno ${naFormat(kod)} — potvrďte přidání.`);
  await vyhledejDoNabidky(kod, zHledani);
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
  const isbn = rozpoznej(poleNabidky.isbn.value)?.kod;
  zavriNabidku();
  nastavStav(
    isbn
      ? `Titul ${naFormat(isbn)} zahozen — nic se neuložilo. Můžete skenovat dál.`
      : 'Zahozeno — nic se neuložilo.'
  );
});

btnZnovu.addEventListener('click', async () => {
  const rozpoznane = rozpoznej(poleNabidky.isbn.value);
  if (!rozpoznane) {
    // Poslední číslice je kontrolní, takže jde spočítat, jak by číslo vypadalo,
    // kdyby byl přehmat právě v ní. Návrh čeká v poli na potvrzení.
    const navrh = navrhniOpravu(poleNabidky.isbn.value);
    if (navrh) {
      poleNabidky.isbn.value = naFormat(navrh);
      zkontrolujDuplicitu();
      return oznam('Číslo neprošlo kontrolou — v poli je návrh opravy.', 'varovani');
    }
    return oznam('To není platné ISBN ani ISSN — zkontrolujte číslice.', 'chyba');
  }
  poleNabidky.isbn.value = naFormat(rozpoznane.kod);
  await vyhledejDoNabidky(rozpoznane.kod);
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

  if (!rozpoznej(hodnota)) {
    // Poslední číslice je kontrolní, takže jde spočítat, jak by číslo vypadalo,
    // kdyby byl přehmat právě v ní. Návrh se vloží do pole — uživatel ho porovná
    // s knihou a stačí mu potvrdit.
    const navrh = navrhniOpravu(hodnota);

    if (navrh) {
      vstup.value = naFormat(navrh);
      oznam('Číslo neprošlo kontrolou — v poli je návrh opravy.', 'varovani');
      nastavStav(
        `U ${hodnota} nesedí poslední číslice, která je kontrolní. Podle zbytku čísla ` +
        `by mělo být ${naFormat(navrh)} — porovnejte to s knihou a když to sedí, ` +
        'klepněte na Vyhledat. Jinak číslo přepište.'
      );
      return;
    }

    oznam('To není platné ISBN ani ISSN — zkontrolujte číslice.', 'chyba');
    nastavStav(
      `Číslo ${hodnota} neprošlo kontrolou. Přepište ho přesně tak, jak je v knize — ` +
      'včetně koncového X. Písmeno napíšete po přepnutí klávesnice tlačítkem „X“.'
    );
    return;
  }
  vstup.value = '';
  await zpracujKod(hodnota);
});

/**
 * Přepínač klávesnice u polí s číslem.
 *
 * Ve výchozím stavu je číselná — třináct číslic se na ní ťuká rychleji než na
 * klávesnici s písmeny. Starší desetimístná ISBN i některá ISSN ale končí
 * písmenem X, které na číselné klávesnici není; tenhle přepínač je proto
 * jediná cesta, jak takové číslo na telefonu zadat.
 *
 * Klávesnici vybírá prohlížeč podle atributu inputmode a přepočítá si ji, až
 * když pole znovu dostane zaměření — proto to blur a focus hned po přepnutí.
 */
function pripojPrepinacKlavesnice(vstup, tlacitko) {
  let sPismeny = false;

  tlacitko.addEventListener('click', () => {
    sPismeny = !sPismeny;

    vstup.setAttribute('inputmode', sPismeny ? 'text' : 'numeric');
    tlacitko.textContent = sPismeny ? '123' : 'X';
    tlacitko.setAttribute('aria-pressed', String(sPismeny));
    tlacitko.classList.toggle('aktivni', sPismeny);
    tlacitko.title = sPismeny
      ? 'Zpět na číselnou klávesnici'
      : 'Přepnout na klávesnici s písmeny — pro čísla končící X';

    vstup.blur();
    vstup.focus();
  });
}

pripojPrepinacKlavesnice(prvek('vstup-isbn'), prvek('btn-klavesnice'));
pripojPrepinacKlavesnice(poleNabidky.isbn, prvek('btn-klavesnice-nabidka'));

/* ------------------------------------------- hledání podle názvu a autora */

/**
 * Nabídka knih nalezených podle názvu a autora.
 *
 * Vybraná kniha se do tabulky nepřidá rovnou z nabídky — pošle se do stejné
 * cesty jako naskenovaný kód, takže se otevře okno k potvrzení a údaje se
 * ještě dohledají podle ISBN. V nabídce je jen to hlavní, kdežto dohledání
 * podle čísla poskládá úplnější záznam ze všech zdrojů. Co by nevrátilo,
 * zůstane vyplněné z nabídky.
 */
function polozkaNalezu(nalez) {
  const polozka = document.createElement('li');
  const tlacitko = document.createElement('button');
  tlacitko.type = 'button';
  tlacitko.className = 'vysledek';

  const radek = (trida, text) => {
    const cast = document.createElement('span');
    cast.className = trida;
    cast.textContent = text;
    tlacitko.appendChild(cast);
    return cast;
  };

  radek('vysledek-nazev', nalez.nazev);
  const popis = [nalez.autor, nalez.rok, nalez.vydavatel].filter(Boolean).join(' · ');
  if (popis) radek('vysledek-popis', popis);
  radek('vysledek-isbn', `${naFormat(nalez.isbn)} · ${nalez.zdroj}`);
  const stavPolozky = radek('vysledek-stav', '');

  // Napříč poličkami: tentýž titul může stát na několika místech.
  const obnovStav = () => {
    const vytisky = ulozne.vsudePodleIsbn(nalez.isbn);
    const kusu = vytisky.reduce((soucet, k) => soucet + (Number(k.kusu) || 1), 0);
    const mista = [...new Set(vytisky.map((k) => ulozne.upravNazevPolicky(k.policka)))]
      .filter(Boolean);
    stavPolozky.textContent = vytisky.length
      ? `✓ už v knihovně (${kusu}×)${mista.length ? ` — ${mista.join(', ')}` : ''}`
      : '';
  };

  // Kniha se ukládá až potvrzením v nabídce, takže tenhle popisek nemá cenu
  // obnovovat hned po klepnutí — přihlásí se k překreslení tabulky.
  obnovyNalezu.push(obnovStav);

  tlacitko.addEventListener('click', async () => {
    tlacitko.disabled = true;
    try {
      await zpracujKod(nalez.isbn, nalez);
    } finally {
      tlacitko.disabled = false;
    }
  });

  obnovStav();
  polozka.appendChild(tlacitko);
  return polozka;
}

function vykresliNalezy(nalezy, poznamka) {
  obnovyNalezu.length = 0;
  panelNalezu.replaceChildren();
  panelNalezu.hidden = !nalezy.length;
  if (!nalezy.length) return;

  const zahlavi = document.createElement('div');
  zahlavi.className = 'zahlavi-vysledku';

  const nadpis = document.createElement('strong');
  nadpis.textContent = `Nabídka: ${pocetSlovem(nalezy.length, 'kniha', 'knihy', 'knih')}`;
  zahlavi.appendChild(nadpis);

  const zavrit = document.createElement('button');
  zavrit.type = 'button';
  zavrit.className = 'ikona-tlacitko';
  zavrit.textContent = '✕';
  zavrit.title = 'Skrýt nabídku';
  zavrit.setAttribute('aria-label', 'Skrýt nabídku nalezených knih');
  zavrit.addEventListener('click', () => vykresliNalezy([]));
  zahlavi.appendChild(zavrit);

  panelNalezu.appendChild(zahlavi);

  const seznam = document.createElement('ul');
  seznam.className = 'seznam-vysledku';
  seznam.replaceChildren(...nalezy.map(polozkaNalezu));
  panelNalezu.appendChild(seznam);

  if (poznamka) {
    const text = document.createElement('p');
    text.className = 'napoveda';
    text.textContent = poznamka;
    panelNalezu.appendChild(text);
  }
}

prvek('form-podle-nazvu').addEventListener('submit', async (udalost) => {
  udalost.preventDefault();
  const nazev = prvek('vstup-nazev').value.trim();
  const autor = prvek('vstup-autor').value.trim();

  if (!nazev && !autor) {
    oznam('Vyplňte název knihy, autora, nebo obojí.', 'varovani');
    return;
  }

  const tlacitko = udalost.target.querySelector('button[type=submit]');
  const puvodniPopis = tlacitko.textContent;
  tlacitko.disabled = true;
  tlacitko.textContent = '⏳ Hledám…';
  vykresliNalezy([]);
  nastavStav('Hledám v databázích knih …');

  try {
    const { vysledky, selhalyZdroje, nedostupne, bezCisla } =
      await hledejPodleTextu({ nazev, autor });

    // Záznamy bez čísla se nenabízejí a u starších titulů je to častý případ —
    // bez vysvětlení by prázdná nebo krátká nabídka vypadala jako chyba.
    const poznamky = [];
    if (bezCisla) {
      poznamky.push(
        `${pocetSlovem(bezCisla, 'nález', 'nálezy', 'nálezů')} bez ISBN i ISSN se nenabízí — ` +
        'aplikace vede tabulku podle čísla.'
      );
    }
    if (selhalyZdroje.length) poznamky.push(`Neodpověděly: ${selhalyZdroje.join(', ')}.`);
    const poznamka = poznamky.join(' ');

    vykresliNalezy(vysledky, poznamka);

    if (vysledky.length) {
      // Poznámky patří k nabídce, ne sem — pod ní je uživatel má rovnou u očí.
      oznam(`Nalezeno: ${pocetSlovem(vysledky.length, 'kniha', 'knihy', 'knih')}.`, 'uspech');
      nastavStav('Vyberte z nabídky svou knihu — klepnutím se přidá do tabulky.');
    } else if (nedostupne) {
      oznam('Databáze knih neodpověděly.', 'chyba');
      nastavStav(`Hledání se nepodařilo (${selhalyZdroje.join(', ')}). Zkontrolujte připojení.`);
    } else {
      oznam('Nic se nenašlo.', 'varovani');
      nastavStav(
        'Databáze takovou knihu neznají. Zkuste jen část názvu, samotné příjmení autora, ' +
        `nebo jiný zápis jména. ${poznamka}`.trim()
      );
    }
  } catch (chyba) {
    console.error(chyba);
    oznam('Hledání selhalo — zkontrolujte připojení.', 'chyba');
    nastavStav('Nepodařilo se spojit s databázemi knih.');
  } finally {
    tlacitko.disabled = false;
    tlacitko.textContent = puvodniPopis;
  }
});

/* ------------------------------------------------------- export a import */

function casovaZnacka() {
  return zaloha.znacka();
}

/** Vrátí knihy k zálohování, nebo null (a zahlásí to), když není co zálohovat. */
function knihyKZaloze() {
  const knihy = ulozne.vsechny();
  if (!knihy.length) {
    oznam('Tabulka je prázdná.', 'varovani');
    return null;
  }
  return knihy;
}

function stahniCsv(knihy) {
  ulozne.stahni(ulozne.doCsv(knihy), `knihovna-${casovaZnacka()}.csv`, 'text/csv;charset=utf-8');
}

function stahniJson(knihy) {
  ulozne.stahni(ulozne.doJson(knihy), `knihovna-${casovaZnacka()}.json`, 'application/json');
}

prvek('btn-csv').addEventListener('click', () => {
  const knihy = knihyKZaloze();
  if (!knihy) return;
  stahniCsv(knihy);
  zaloha.zaznamenejExport(knihy);
  vykresliStavZalohy();
});

prvek('btn-json').addEventListener('click', () => {
  const knihy = knihyKZaloze();
  if (!knihy) return;
  stahniJson(knihy);
  zaloha.zaznamenejExport(knihy);
  vykresliStavZalohy();
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

/* ---------------------------------------------- záloha mimo zařízení */

const btnSdilet = prvek('btn-sdilet');
const btnEmail = prvek('btn-email');
const btnSlozka = prvek('btn-slozka');
const btnSlozkaVypnout = prvek('btn-slozka-vypnout');
const stavZalohy = prvek('stav-zalohy');

/** Popis stavu zálohy — kdy se zálohovalo naposledy a kam se ukládá automaticky. */
async function vykresliStavZalohy() {
  const vety = [zaloha.popisPosledniZalohy()];
  const slozka = await zaloha.stavSlozky();

  btnSlozka.hidden = !slozka.podporovano;
  btnSlozkaVypnout.hidden = !slozka.jmeno;
  btnSlozka.classList.toggle('aktivni', slozka.povoleno);

  if (!slozka.jmeno) {
    btnSlozka.textContent = '📁 Zálohovat do složky…';
  } else if (slozka.povoleno) {
    btnSlozka.textContent = `📁 Složka: ${slozka.jmeno}`;
    vety.push(`Automatická záloha běží do složky ${slozka.jmeno}.`);
  } else {
    btnSlozka.textContent = '📁 Povolit zápis do složky';
    vety.push(
      `Automatická záloha do složky ${slozka.jmeno} čeká — prohlížeč se po ` +
      'novém otevření aplikace musí na zápis znovu zeptat.'
    );
  }

  stavZalohy.textContent = vety.join(' ');
}

btnSdilet.hidden = !zaloha.lzeSdilet();
btnSdilet.addEventListener('click', async () => {
  const knihy = knihyKZaloze();
  if (!knihy) return;
  try {
    await zaloha.sdilej(knihy);
    oznam('Záloha odeslána.', 'uspech');
  } catch (chyba) {
    // Zavřenou nabídku sdílení hlásí prohlížeč jako chybu — uživatel ji ale
    // jen zrušil a hláška by ho zbytečně strašila.
    if (chyba?.name === 'AbortError') return;
    console.error(chyba);
    oznam('Odeslání se nepodařilo.', 'chyba');
  } finally {
    vykresliStavZalohy();
  }
});

btnEmail.addEventListener('click', () => {
  const knihy = knihyKZaloze();
  if (!knihy) return;

  const adresa = prompt('Na jakou adresu zálohu poslat?', zaloha.adresaProZalohu());
  if (adresa === null) return;          // zrušeno
  if (adresa.trim()) zaloha.ulozAdresu(adresa.trim());

  // Nejdřív soubory, pak zpráva — otevření pošty přepne aplikaci a stahování
  // by se v tu chvíli mohlo přerušit.
  stahniCsv(knihy);
  stahniJson(knihy);
  zaloha.posliEmailem(knihy, adresa.trim());
  oznam('Zpráva je rozepsaná, soubory zálohy se stáhly — přiložte je.', 'uspech');
  vykresliStavZalohy();
});

btnSlozka.addEventListener('click', async () => {
  try {
    const { jmeno, povoleno } = await zaloha.stavSlozky();

    // Když složka vybraná je a chybí jen povolení k zápisu, nemá smysl
    // otravovat s vybíráním znovu — stačí se zeptat na povolení.
    if (jmeno && !povoleno) {
      if (!(await zaloha.obnovPovoleni())) {
        oznam('Zápis do složky nebyl povolen.', 'varovani');
        return;
      }
      oznam(`Automatická záloha do složky ${jmeno} pokračuje.`, 'uspech');
    } else {
      const nova = await zaloha.vyberSlozku();
      oznam(`Zálohy se budou ukládat do složky ${nova}.`, 'uspech');
    }

    zaloha.synchronizuj({ hned: true });
  } catch (chyba) {
    if (chyba?.name === 'AbortError') return;   // zavřené vybírání složky
    console.error(chyba);
    oznam('Složku se nepodařilo nastavit.', 'chyba');
  } finally {
    vykresliStavZalohy();
  }
});

btnSlozkaVypnout.addEventListener('click', async () => {
  await zaloha.vypniSlozku();
  oznam('Automatická záloha do složky vypnuta.', 'varovani');
  vykresliStavZalohy();
});

// Zápis do složky si řídí modul sám po každé změně tabulky; sem se hlásí
// jen výsledek, aby šlo poznat, že záloha opravdu proběhla.
zaloha.priZapisu((vysledek) => {
  if (vysledek.ok) {
    oznam(`Záloha uložena do složky ${vysledek.kam}.`, 'uspech');
  } else {
    oznam('Zápis zálohy do složky selhal — zkontrolujte, že složka pořád existuje.', 'chyba');
  }
  vykresliStavZalohy();
});

ulozne.priZmene(() => zaloha.synchronizuj());

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

// Starší verze uměla nechtěně zapsat odznak s počtem kusů do názvu („3×“).
const opraveneNazvy = ulozne.uklidNazvy();
if (opraveneNazvy) {
  oznam(
    `U ${opraveneNazvy} knih${opraveneNazvy === 1 ? 'y' : ''} se z názvu odstranil ` +
    'počet kusů — název prosím doplňte.',
    'varovani'
  );
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
vykresliStavZalohy();
