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
const btnKod = prvek('btn-kod');
const hledacek = prvek('hledacek');
const ctecka = prvek('ctecka');
const cteckaPruh = prvek('ctecka-pruh');
const cteckaUchyt = prvek('ctecka-uchyt');
const stav = prvek('stav');
const hlaska = prvek('hlaska');
const hlaskaText = prvek('hlaska-text');
const btnZpet = prvek('btn-zpet');
const telo = prvek('telo-tabulky');
const tabulka = prvek('tabulka');
const prazdno = prvek('prazdno');
const pocet = prvek('pocet');
const hledat = prvek('hledat');
const panelNalezu = prvek('vysledky-hledani');

const vyberPolicka = prvek('vyber-policka');
const filtrPolicka = prvek('filtr-policka');
const filtrStav = prvek('filtr-stav');
const seznamPolicek = prvek('seznam-policek');

const listaVyberu = prvek('lista-vyberu');
const pocetVyberu = prvek('pocet-vyberu');
const hromadnaPolicka = prvek('hromadna-policka');
const vybratVse = prvek('vybrat-vse');

const prekryv = prvek('prekryv');
const btnPridat = prvek('btn-pridat');
const btnZahodit = prvek('btn-zahodit');
const btnZnovu = prvek('btn-znovu');
const nabidkaStav = prvek('nabidka-stav');
const nabidkaUpozorneni = prvek('nabidka-upozorneni');
const nabidkaUpravy = prvek('nabidka-upravy');
const nabidkaObalka = prvek('nabidka-obalka');
const shrnutiNazev = prvek('shrnuti-nazev');
const shrnutiAutor = prvek('shrnuti-autor');
const shrnutiCislo = prvek('shrnuti-cislo');
const poleNabidky = {
  isbn: prvek('nabidka-isbn'),
  nazev: prvek('nabidka-nazev'),
  autor: prvek('nabidka-autor'),
  rok: prvek('nabidka-rok'),
  vydavatel: prvek('nabidka-vydavatel'),
  misto: prvek('nabidka-misto'),
  policka: prvek('nabidka-policka'),
  kusu: prvek('nabidka-kusu'),
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

/** Zaškrtnuté řádky pro hromadné akce. Drží se i přes překreslení tabulky. */
const vybrane = new Set();

/** Filtr podle toho, jestli řádek už šel do knihovního systému. */
let zobrazenyStav = 'vse';
// Zvolený filtr se drží v proměnné, ne v rozbalovátku: „bez poličky“ je
// prázdný řetězec a od dosud nenaplněného <select> by se nedal odlišit.
let zobrazenaPolicka = VSECHNY_POLICKY;

/** Poslední volba v rozbalovátku, která místo výběru založí novou poličku. */
const NOVA_POLICKA = '\u0000nova';

/* ------------------------------------------------------------ pomůcky */

/**
 * Hláška ve spodní liště, volitelně s krokem zpět.
 *
 * `zpet` je popis akce, kterou jde vzít zpátky. Snímek tabulky se pořizuje
 * před akcí a drží se jen po dobu, co je hláška vidět — je to pojistka pro
 * omyl, který se pozná hned (naskenovaná sousední kniha, ukliknuté smazání),
 * ne plnohodnotná historie úprav.
 */
let casovacHlasky = null;
let vratitSnimek = null;

function schovejHlasku() {
  hlaska.hidden = true;
  btnZpet.hidden = true;
  vratitSnimek = null;
}

function oznam(text, druh = 'info', zpet = null) {
  hlaskaText.textContent = text;
  hlaska.className = `hlaska ${druh}`;
  hlaska.hidden = false;
  vratitSnimek = zpet;
  btnZpet.hidden = !zpet;
  clearTimeout(casovacHlasky);
  casovacHlasky = setTimeout(schovejHlasku, zpet ? 10000 : 3500);
}

btnZpet.addEventListener('click', () => {
  const snimek = vratitSnimek;
  if (!snimek) return;
  clearTimeout(casovacHlasky);
  schovejHlasku();

  if (!ulozne.obnovSnimek(snimek)) {
    return oznam('Krok zpět se nepodařil.', 'chyba');
  }
  vybrane.clear();
  obnovPolicky();
  vykresli();
  oznam('Vráceno zpět.', 'uspech');
});

function nastavStav(text) {
  stav.textContent = text;
}

/** České skloňování po číslovce: 1 kniha, 2 knihy, 5 knih. */
function pocetSlovem(kolik, jedna, dve, pet) {
  return `${kolik} ${kolik === 1 ? jedna : kolik < 5 ? dve : pet}`;
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

  if (zobrazenyStav === 'nove') knihy = knihy.filter((k) => !ulozne.jeOdeslana(k));
  else if (zobrazenyStav === 'odeslane') knihy = knihy.filter((k) => ulozne.jeOdeslana(k));

  if (dotaz) {
    knihy = knihy.filter((k) =>
      ['nazev', 'autor', 'isbn', 'cnb', 'vydavatel', 'misto', 'poznamka', 'rok', 'policka']
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
const POLE_O_KNIZE = ['nazev', 'autor', 'rok', 'vydavatel', 'misto', 'stran', 'jazyk',
                      'obalka', 'zdroj'];

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

  // Kniha z doby před ISBN. Číslo ČNB se ukáže vedle prázdného pole, ne v něm:
  // ISBN to není, do sloupce ISBN nepatří a v exportu tam taky nebude. Pole
  // zůstává k dispozici, kdyby se ISBN později přece jen dohledalo.
  if (kniha.cnb) {
    const odznak = document.createElement('span');
    odznak.className = 'odznak-cnb';
    odznak.textContent = kniha.cnb;
    odznak.title = 'Číslo České národní bibliografie — kniha vyšla před zavedením ISBN';
    td.appendChild(document.createTextNode(' '));
    td.appendChild(odznak);
  }

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

    // Prázdné pole je v pořádku — stejně jako v nabídce. Kniha bez čísla je
    // běžná věc a špatně naskenované číslo u ní musí jít odstranit, aniž by
    // se mazal celý řádek.
    if (!zadane) {
      if (!kniha.isbn && !kniha.cnb) return;
      ulozne.uprav(kniha.id, { isbn: '', cnb: '' });
      kniha.isbn = '';
      kniha.cnb = '';
      oznam('Číslo odstraněno — kniha zůstala bez něj.', 'varovani');
      nastavStav('Bez čísla se u knihy nepočítají kusy: každé další přidání založí nový řádek.');
      return vykresli();
    }

    if (!rozpoznane) {
      const navrh = navrhniOpravu(zadane);
      oznam('To není platné ISBN, ISSN ani ČNB — zkontrolujte číslice.', 'chyba');
      nastavStav(navrh
        ? `U ${zadane} nesedí kontrolní číslice — podle zbytku čísla by mělo být ${naFormat(navrh)}.`
        : `Číslo ${zadane} neprošlo kontrolou, v tabulce zůstalo původní.`);
      return vratPuvodni();
    }

    const { kod: nove, cislo } = rozpoznane;
    if (nove === kniha.isbn) return vratPuvodni();
    if (ulozne.podleIsbn(nove, kniha.policka)) {
      oznam(`Titul s tímto ${cislo} už na téhle poličce je.`, 'varovani');
      return vratPuvodni();
    }

    const prazdneUdaje = Object.fromEntries(POLE_O_KNIZE.map((pole) => [pole, '']));
    ulozne.uprav(kniha.id, {
      isbn: cislo === 'ČNB' ? '' : nove,
      cnb: cislo === 'ČNB' ? nove : '',
      ...prazdneUdaje,
    });
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

/**
 * Buňka s počtem kusů.
 *
 * Třídní sada učebnic je ve školní knihovně nejběžnější položka vůbec —
 * dvacet pět kusů jedné čítanky se nedá pořizovat dvaceti pěti skeny.
 * Změna počtu zároveň vrací knihu mezi neodeslané: v knihovním systému
 * je od té chvíle zastaralá.
 */
function bunkaKusu(kniha) {
  const td = document.createElement('td');
  td.className = 'sloupec-kusu';

  const vstup = document.createElement('input');
  vstup.type = 'number';
  vstup.min = '1';
  vstup.max = '9999';
  vstup.step = '1';
  vstup.inputMode = 'numeric';
  vstup.value = String(Number(kniha.kusu) || 1);
  vstup.setAttribute('aria-label', `Počet kusů knihy ${kniha.nazev || naFormat(kniha.isbn)}`);

  const uloz = () => {
    const novy = ulozne.upravPocetKusu(vstup.value);
    vstup.value = String(novy);
    if (novy === (Number(kniha.kusu) || 1)) return;
    ulozne.nastavKusu(kniha.id, novy);
    kniha.kusu = novy;
    vykresli();
  };

  vstup.addEventListener('change', uloz);
  vstup.addEventListener('keydown', (udalost) => {
    if (udalost.key === 'Enter') {
      udalost.preventDefault();
      vstup.blur();
    }
  });

  td.appendChild(vstup);
  return td;
}

/** Zaškrtávátko pro hromadné akce. */
function bunkaVyberu(kniha) {
  const td = document.createElement('td');
  td.className = 'sloupec-vyber';

  const vstup = document.createElement('input');
  vstup.type = 'checkbox';
  vstup.checked = vybrane.has(kniha.id);
  vstup.setAttribute('aria-label', `Vybrat ${kniha.nazev || naFormat(kniha.isbn)}`);
  vstup.addEventListener('change', () => {
    if (vstup.checked) vybrane.add(kniha.id);
    else vybrane.delete(kniha.id);
    vykresliListuVyberu();
  });

  td.appendChild(vstup);
  return td;
}

function radek(kniha) {
  const tr = document.createElement('tr');
  if (cekaSeNaVyhledani.has(kniha.isbn)) tr.classList.add('nacita-se');
  if (ulozne.jeOdeslana(kniha)) {
    tr.classList.add('odeslana');
    tr.title = `Odesláno do knihovního systému ${kniha.odeslano}`;
  }

  tr.appendChild(bunkaVyberu(kniha));

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
  tr.appendChild(bunka(kniha.misto));
  tr.appendChild(bunkaIsbn(kniha));
  tr.appendChild(bunkaKusu(kniha));
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
    // Potvrzovací okno tu není: mazání jde vzít zpátky a dvě potvrzení za
    // sebou by jen zdržovala. Zpět je v hlášce deset vteřin.
    const snimek = ulozne.snimek();
    ulozne.smaz(kniha.id);
    vybrane.delete(kniha.id);
    vykresli();
    oznam(`Smazáno: ${kniha.nazev || naFormat(kniha.isbn) || 'kniha bez čísla'}.`, 'varovani', snimek);
  });
  tdAkce.appendChild(smazat);
  tr.appendChild(tdAkce);

  return tr;
}

/** Lišta hromadných akcí — ukáže se, až je něco zaškrtnuté. */
function vykresliListuVyberu(zobrazene = vyfiltrovane()) {
  // Zaškrtnutý řádek mohl mezitím zmizet (smazání, sloučení kusů).
  const zname = new Set(ulozne.vsechny().map((k) => k.id));
  for (const id of vybrane) if (!zname.has(id)) vybrane.delete(id);

  listaVyberu.hidden = vybrane.size === 0;
  if (vybrane.size) {
    pocetVyberu.textContent = `Vybráno ${pocetSlovem(vybrane.size, 'kniha', 'knihy', 'knih')}`;
    naplnVyberPolicek(hromadnaPolicka, '', { sNovou: true });
    // Rozbalovátko je tu příkaz, ne zobrazení stavu — proto nahoře výzva,
    // aby se „Bez poličky“ nedalo splést s tím, kde knihy zrovna stojí.
    const vyzva = document.createElement('option');
    vyzva.value = '';
    vyzva.textContent = 'Přesunout na poličku…';
    vyzva.disabled = true;
    vyzva.selected = true;
    hromadnaPolicka.prepend(vyzva);
  }

  vybratVse.checked = zobrazene.length > 0 && zobrazene.every((k) => vybrane.has(k.id));
  vybratVse.indeterminate = !vybratVse.checked && zobrazene.some((k) => vybrane.has(k.id));
}

function vykresli() {
  const knihy = vyfiltrovane();
  const vsechny = ulozne.vsechny();
  const { titulu, kusu, novych } = ulozne.souhrn(vsechny);
  const filtrovanaPolicka = zobrazenaPolicka !== VSECHNY_POLICKY;

  telo.replaceChildren(...knihy.map(radek));

  // Řádek je titul na jedné poličce, kusů může být na řádku víc — u knihovny
  // se čeká odpověď na „kolik máme knih“, což jsou kusy.
  pocet.textContent = titulu === kusu ? String(titulu) : `${titulu} / ${kusu} ks`;
  pocet.title = `${pocetSlovem(titulu, 'titul', 'tituly', 'titulů')}, ` +
    `${pocetSlovem(kusu, 'kus', 'kusy', 'kusů')}`;

  tabulka.hidden = knihy.length === 0;
  prazdno.hidden = knihy.length !== 0;
  prazdno.textContent = titulu === 0
    ? 'Zatím tu nic není. Naskenujte první knihu.'
    : zobrazenyStav === 'nove'
      ? 'Všechno už je odeslané do knihovního systému.'
      : zobrazenyStav === 'odeslane'
        ? 'Zatím nebylo odeslané nic.'
        : filtrovanaPolicka
          ? 'Na téhle poličce nic takového není.'
          : 'Hledání nic nenašlo.';

  vykresliListuVyberu(knihy);
  vykresliStavExportu(novych, titulu);

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

/**
 * Pole, do kterých uživatel v otevřené nabídce sám psal.
 *
 * Údaje teď chodí průběžně, jak jednotlivé databáze odpovídají — a co si
 * uživatel mezitím opsal z knihy, mu pozdější odpověď přepsat nesmí.
 */
const rucneUpravena = new Set();

/** Kolik kusů se má přidat. */
function kusuZNabidky() {
  return ulozne.upravPocetKusu(poleNabidky.kusu.value);
}

/** Liší se něco v polích od toho, co už je uložené? Kvůli nabídce oprav. */
function udajeSeLisi(ulozena) {
  return ['nazev', 'autor', 'rok', 'vydavatel', 'misto'].some(
    (pole) => poleNabidky[pole].value.trim() && poleNabidky[pole].value.trim() !== (ulozena[pole] || '')
  );
}

/** Ukáže, jestli tenhle titul v knihovně už někde je — ať se omylem nezdvojí. */
function zkontrolujDuplicitu() {
  const isbn = rozpoznej(poleNabidky.isbn.value)?.kod || '';
  const policka = ulozne.upravNazevPolicky(poleNabidky.policka.value);
  const kusu = kusuZNabidky();
  const kusuNavic = kusu === 1 ? 'další kus' : `dalších ${kusu} kusů`;

  const naPolicce = isbn ? ulozne.podleIsbn(isbn, policka) : null;
  const jinde = isbn ? ulozne.vsudePodleIsbn(isbn).filter((k) => k !== naPolicce) : [];

  // Bez čísla se duplicita poznat nedá — a je poctivější to říct, než mlčet.
  if (!isbn) {
    nabidkaUpozorneni.textContent =
      'Kniha nemá ISBN ani jiné číslo. Uložit se dá, ale nejde poznat, jestli ji ' +
      'v knihovně už nemáte — každé přidání proto založí nový řádek.';
    nabidkaUpozorneni.hidden = false;
    btnPridat.textContent = '✓ Přidat do knihovny';
    return;
  }

  if (naPolicce) {
    const kde = policka ? `na poličce „${policka}“` : 'v knihovně';
    const prepsat = udajeSeLisi(naPolicce);
    nabidkaUpozorneni.textContent = prepsat
      ? `Tenhle titul už ${kde} máte (${naPolicce.kusu || 1}×). Přibude ${kusuNavic} ` +
        'a údaje se přepíšou těmi z nabídky.'
      : `Tenhle titul už ${kde} máte (${naPolicce.kusu || 1}×). Přibude ${kusuNavic}.`;
    nabidkaUpozorneni.hidden = false;
    btnPridat.textContent = prepsat ? '➕ Přidat kus a opravit údaje' : `➕ Přidat ${kusuNavic}`;
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

/** Shrnutí nahoře v nabídce — jediná část, kterou uživatel u většiny knih čte. */
function vykresliShrnuti() {
  const nazev = poleNabidky.nazev.value.trim();
  const cislo = poleNabidky.isbn.value.trim();

  shrnutiNazev.textContent = nazev || 'Zatím bez názvu';
  shrnutiNazev.closest('.shrnuti').classList.toggle('hleda-se', !nazev);
  shrnutiAutor.textContent = poleNabidky.autor.value.trim();

  const rok = poleNabidky.rok.value.trim();
  const vydavatel = poleNabidky.vydavatel.value.trim();
  const misto = poleNabidky.misto.value.trim();
  shrnutiCislo.textContent = [cislo || 'bez čísla', vydavatel, misto, rok]
    .filter(Boolean).join(' · ');

  const obalka = nabizenaKniha?.obalka;
  nabidkaObalka.hidden = !obalka;
  if (obalka) nabidkaObalka.src = obalka;
}

/**
 * Vyplní formulář dohledanými údaji.
 *
 * `jenChybejici` se použije u průběžných odpovědí: přepisovat se smí jen to,
 * co je prázdné a čeho se uživatel nedotkl. Až doběhne poslední zdroj,
 * složí se záznam znovu v pořadí zdrojů (český katalog má přednost) a pole
 * se dorovnají — proto tam `jenChybejici` neplatí pro nedotčená pole.
 */
function vyplnNabidku(kniha, { jenChybejici = false } = {}) {
  for (const pole of ['nazev', 'autor', 'rok', 'vydavatel', 'misto']) {
    if (rucneUpravena.has(pole)) continue;
    if (jenChybejici && poleNabidky[pole].value.trim()) continue;
    poleNabidky[pole].value = kniha[pole] || '';
  }
  vykresliShrnuti();
}

/**
 * `zHledani` jsou údaje z nabídky hledání podle údajů o knize. Ukážou se hned,
 * ať uživatel vidí, kterou knihu vlastně vybral, a zůstanou v poli i tehdy,
 * když dohledání podle samotného čísla nic nevrátí.
 */
function otevriNabidku(isbn, zHledani = null) {
  poradiNabidky++;
  rucneUpravena.clear();
  nabizenaKniha = Object.fromEntries(POLE_O_KNIZE.map((pole) => [pole, zHledani?.[pole] || '']));
  poleNabidky.isbn.value = naFormat(isbn);
  poleNabidky.poznamka.value = '';
  poleNabidky.kusu.value = '1';
  vyplnNabidku(zHledani || {});
  naplnVyberPolicek(poleNabidky.policka, ulozne.aktivniPolicka(), { sNovou: true });
  // Pole k úpravě jsou zavřená: u drtivé většiny knih se do nich nesahá
  // a rolovat kvůli nim k potvrzení by se muselo u každé.
  nabidkaUpravy.open = false;
  prekryv.hidden = false;
  document.body.classList.add('bez-posunu');
  // Že je kniha už v knihovně, se ví hned — nemusí se čekat na dohledání údajů.
  zkontrolujDuplicitu();
  // Zaměření na potvrzení: Enter tím knihu přidá, aniž by se muselo klepat.
  btnPridat.focus();
}

function zavriNabidku() {
  prekryv.hidden = true;
  nabizenaKniha = null;
  rucneUpravena.clear();
  document.body.classList.remove('bez-posunu');
  // Další stejný kód je od téhle chvíle záměr (druhý výtisk), ne zákmit
  // kamery — čekat s knihou v ruce na doběhnutí prodlevy nedává smysl.
  skener.zapomenPosledniKod();
}

/** Dohledá údaje k číslu v nabídce a vyplní jimi formulář. */
async function vyhledejDoNabidky(isbn, zHledani = null) {
  const moje = poradiNabidky;
  const cislo = rozpoznej(isbn)?.cislo || 'ISBN';
  const platna = () => jeNabidkaOtevrena() && poradiNabidky === moje;

  // Bez čísla není podle čeho se ptát. Údaje z nabídky hledání ale v poli už
  // jsou, takže je co potvrdit — jen se u takové knihy nebudou počítat kusy.
  if (!rozpoznej(isbn)) {
    nastavNabidkuStav(
      'Kniha nemá ISBN ani jiné číslo. Údaje zkontrolujte a doplňte ručně; ' +
      'uloží se tak, jak je necháte.'
    );
    zkontrolujDuplicitu();
    return;
  }

  // Tlačítko „Přidat“ zůstává živé: kniha jde potvrdit i dřív, než dohledání
  // doběhne. Dřív se čekalo na poslední odpověď a jedna mlčící databáze
  // držela uživatele u zamčeného tlačítka — u každé knihy zvlášť.
  btnZnovu.disabled = true;
  nastavNabidkuStav(`Hledám ${naFormat(isbn)} …`);

  try {
    // Průběžné odpovědi vyplňují jen to, co je prázdné; poslední složení
    // v pořadí zdrojů pak případně přepíše, co dorazilo z rychlejšího,
    // ale méně důvěryhodného zdroje (anglický název u české knihy).
    const prubezne = (castecna) => {
      if (!platna()) return;
      nabizenaKniha = Object.fromEntries(
        POLE_O_KNIZE.map((pole) => [pole, castecna[pole] || nabizenaKniha?.[pole] || ''])
      );
      vyplnNabidku(castecna, { jenChybejici: true });
      if (castecna.nazev) nastavNabidkuStav(`Nalezeno v: ${castecna.zdroj}. Ostatní zdroje ještě dobíhají…`);
    };

    const kniha = doplnChybejici(await najdiKnihu(isbn, { prubezne }), zHledani || {});
    if (!platna()) return;          // nabídka se mezitím zahodila nebo vyměnila

    nabizenaKniha = Object.fromEntries(POLE_O_KNIZE.map((pole) => [pole, kniha[pole] || '']));
    vyplnNabidku(kniha);

    // Když se nic nenašlo, pole k úpravě se rozbalí sama — název a autora
    // bude stejně potřeba dopsat ručně.
    if (!kniha.nalezeno) nabidkaUpravy.open = true;

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
      btnZnovu.disabled = false;
      zkontrolujDuplicitu();
    }
  }
}

/** Uloží knihu z nabídky do tabulky. */
function pridejZNabidky() {
  const zadane = poleNabidky.isbn.value.trim();
  const rozpoznane = rozpoznej(zadane);

  // Prázdné pole je v pořádku: starší knihy žádné číslo nemají a uložit
  // se přesto musí dát. Nesmysl v poli je ale pořád nesmysl.
  if (!rozpoznane && zadane) {
    const navrh = navrhniOpravu(zadane);
    if (navrh) {
      poleNabidky.isbn.value = naFormat(navrh);
      zkontrolujDuplicitu();
      return oznam('Číslo neprošlo kontrolou — v poli je návrh opravy.', 'varovani');
    }
    return oznam(
      'To není platné ISBN, ISSN ani ČNB. Opravte ho, nebo pole nechte prázdné.',
      'chyba'
    );
  }

  // ČNB má vlastní pole; sloupec ISBN u takové knihy zůstává prázdný.
  const jeCnbCislo = rozpoznane?.cislo === 'ČNB';
  const isbn = rozpoznane?.kod || '';

  const policka = ulozne.upravNazevPolicky(poleNabidky.policka.value);
  const kusu = kusuZNabidky();
  const stavajici = isbn ? ulozne.podleIsbn(isbn, policka) : null;
  const prepsatUdaje = !!stavajici && udajeSeLisi(stavajici);

  // Snímek před uložením — omyl (naskenovaná sousední kniha) se pozná hned
  // a musí jít vzít zpátky jedním klepnutím.
  const snimek = ulozne.snimek();

  let zaznam;
  let duplicita;
  let pribylo;
  try {
    ({ zaznam, duplicita, pribylo } = ulozne.pridej({
      ...nabizenaKniha,
      isbn: jeCnbCislo ? '' : isbn,
      cnb: jeCnbCislo ? isbn : '',
      nazev: poleNabidky.nazev.value.trim(),
      autor: poleNabidky.autor.value.trim(),
      rok: poleNabidky.rok.value.trim(),
      vydavatel: poleNabidky.vydavatel.value.trim(),
      misto: poleNabidky.misto.value.trim(),
      poznamka: poleNabidky.poznamka.value.trim(),
      policka,
    }, { kusu, prepsatUdaje }));
  } catch (chyba) {
    console.error(chyba);
    return oznam(chyba.message, 'chyba');
  }

  ulozne.nastavAktivniPolicku(policka);
  zavriNabidku();
  obnovPolicky();
  vykresli();

  const kde = policka ? ` na poličku „${policka}“` : '';
  const nazevKnihy = zaznam.nazev || naFormat(isbn) || 'kniha bez čísla';
  if (duplicita) {
    oznam(
      `„${nazevKnihy}“ už tam byla — teď je ${pocetSlovem(zaznam.kusu, 'kus', 'kusy', 'kusů')}.`,
      'varovani', snimek
    );
    const sloveso = pribylo === 1 ? 'Přibyl' : pribylo < 5 ? 'Přibyly' : 'Přibylo';
    nastavStav(`${sloveso} ${pocetSlovem(pribylo, 'kus', 'kusy', 'kusů')}${kde}. Můžete skenovat dál.`);
  } else {
    oznam(`✓ ${nazevKnihy}${zaznam.autor ? ' — ' + zaznam.autor : ''}`, 'uspech', snimek);
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

  // Kniha vybraná z nabídky se smí přidat i bez čísla — starší tituly žádné
  // nemají. U skenu a ručního zadání je nečitelné číslo pořád chyba.
  if (!rozpoznane && !zHledani) {
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

  const kod = rozpoznane?.kod || '';
  skener.potvrzeniSkenu();
  otevriNabidku(kod, zHledani);
  nastavStav(kod
    ? `Načteno ${naFormat(kod)} — potvrďte přidání.`
    : 'Kniha bez čísla — zkontrolujte údaje a potvrďte přidání.');
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
    btnKod.hidden = true;
    rezimCisla = false;
    ctecka.hidden = true;
    hledacek.hidden = false;
    btnCislo.textContent = '🔢 Číst tištěné číslo';
    btnCislo.classList.remove('hlavni');
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
    nastavStav('Namiřte čárový kód do rámečku. Kniha žádný nemá? Klepněte na „Číst tištěné číslo“.');
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
    if (!poleNabidky.isbn.value.trim()) {
      return oznam('Bez čísla není podle čeho hledat — údaje dopište ručně.', 'varovani');
    }
    // Poslední číslice je kontrolní, takže jde spočítat, jak by číslo vypadalo,
    // kdyby byl přehmat právě v ní. Návrh čeká v poli na potvrzení.
    const navrh = navrhniOpravu(poleNabidky.isbn.value);
    if (navrh) {
      poleNabidky.isbn.value = naFormat(navrh);
      zkontrolujDuplicitu();
      return oznam('Číslo neprošlo kontrolou — v poli je návrh opravy.', 'varovani');
    }
    return oznam('To není platné ISBN, ISSN ani ČNB — zkontrolujte číslice.', 'chyba');
  }
  poleNabidky.isbn.value = naFormat(rozpoznane.kod);
  await vyhledejDoNabidky(rozpoznane.kod);
});

// Upozornění na duplicitu i popisek tlačítka závisí na čísle v poli, takže
// se přepočítají při každé úpravě — číslo se tu opravuje i maže.
poleNabidky.isbn.addEventListener('input', () => {
  zkontrolujDuplicitu();
  vykresliShrnuti();
});

// Co uživatel napsal sám, mu odpověď databáze, která dorazí později,
// přepsat nesmí.
for (const pole of ['nazev', 'autor', 'rok', 'vydavatel', 'misto']) {
  poleNabidky[pole].addEventListener('input', () => {
    rucneUpravena.add(pole);
    vykresliShrnuti();
    zkontrolujDuplicitu();
  });
}

poleNabidky.kusu.addEventListener('input', zkontrolujDuplicitu);

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

filtrStav.addEventListener('change', () => {
  zobrazenyStav = filtrStav.value;
  vykresli();
});

/* --------------------------------------------------------- hromadné akce */

vybratVse.addEventListener('change', () => {
  const zobrazene = vyfiltrovane();
  for (const kniha of zobrazene) {
    if (vybratVse.checked) vybrane.add(kniha.id);
    else vybrane.delete(kniha.id);
  }
  vykresli();
});

prvek('btn-vyber-zrusit').addEventListener('click', () => {
  vybrane.clear();
  vykresli();
});

hromadnaPolicka.addEventListener('change', () => {
  const nova = vyresVolbuPolicky(hromadnaPolicka);
  if (nova === null) return;

  const snimek = ulozne.snimek();
  const { dotcenych, slouceno } = ulozne.presunVice([...vybrane], nova);
  vybrane.clear();
  obnovPolicky();
  vykresli();

  if (!dotcenych) return oznam('Vybrané knihy už tam stály.', 'info');
  oznam(
    `Přesunuto ${pocetSlovem(dotcenych, 'kniha', 'knihy', 'knih')} na „${nova || 'bez poličky'}“.` +
    (slouceno ? ' Některé se slily a kusy se sečetly.' : ''),
    slouceno ? 'varovani' : 'uspech',
    snimek
  );
});

prvek('btn-vyber-odeslano').addEventListener('click', () => {
  const snimek = ulozne.snimek();
  const dotcenych = ulozne.oznacOdeslane([...vybrane]);
  vybrane.clear();
  vykresli();
  oznam(`Označeno za odeslané: ${pocetSlovem(dotcenych, 'kniha', 'knihy', 'knih')}.`, 'uspech', snimek);
});

prvek('btn-vyber-neodeslano').addEventListener('click', () => {
  const snimek = ulozne.snimek();
  const dotcenych = ulozne.zrusOdeslani([...vybrane]);
  vybrane.clear();
  vykresli();
  oznam(`Vráceno mezi nové: ${pocetSlovem(dotcenych, 'kniha', 'knihy', 'knih')}.`, 'uspech', snimek);
});

prvek('btn-vyber-smazat').addEventListener('click', () => {
  const kolik = vybrane.size;
  if (!kolik) return;
  const snimek = ulozne.snimek();
  ulozne.smazVice([...vybrane]);
  vybrane.clear();
  vykresli();
  oznam(`Smazáno ${pocetSlovem(kolik, 'kniha', 'knihy', 'knih')}.`, 'varovani', snimek);
});

/* ------------------------------------------------- přečtení ISBN z čísla */

/**
 * Čtení tištěného čísla má vlastní režim, ne jen tlačítko.
 *
 * Rámeček na čárový kód je velký, a když se z něj četlo tištěné ISBN,
 * pletla se do čísla řádka nad ním i pod ním — rok vydání, cena, číslo
 * publikace. OCR nedodrží pořadí řádků, takže výsledek pak neprošel
 * kontrolní číslicí, i když bylo samotné ISBN přečtené dobře.
 *
 * V režimu čtení čísla je proto vidět úzký proužek na jeden řádek, který
 * jde tahem posunout a spodním úchytem mu změnit výšku. Čte se přesně
 * z něj — co uživatel ohraničí, to se přečte.
 */
const KLIC_PROUZKU = 'knihovna.prouzek.v1';
let rezimCisla = false;

function nactiProuzek() {
  try {
    return ocr.omezProuzek(JSON.parse(localStorage.getItem(KLIC_PROUZKU) || 'null') || {});
  } catch {
    return ocr.omezProuzek({});
  }
}

let prouzek = nactiProuzek();

function ulozProuzek() {
  try {
    localStorage.setItem(KLIC_PROUZKU, JSON.stringify(prouzek));
  } catch {
    /* nastavení proužku není nic, kvůli čemu by se mělo cokoliv zastavit */
  }
}

function vykresliProuzek() {
  const okraj = ocr.OKRAJ_PROUZKU * 100;
  cteckaPruh.style.left = `${okraj}%`;
  cteckaPruh.style.right = `${okraj}%`;
  cteckaPruh.style.top = `${(prouzek.stred - prouzek.vyska / 2) * 100}%`;
  cteckaPruh.style.height = `${prouzek.vyska * 100}%`;
}

function nastavRezimCisla(zapnout) {
  rezimCisla = zapnout;
  ctecka.hidden = !zapnout;
  hledacek.hidden = zapnout;
  btnKod.hidden = !zapnout;
  btnCislo.textContent = zapnout ? '📖 Přečíst číslo' : '🔢 Číst tištěné číslo';
  btnCislo.classList.toggle('hlavni', zapnout);
  if (zapnout) {
    vykresliProuzek();
    nastavStav(
      'Zaměřte proužek přesně na řádek s číslem ISBN — tahem ho posunete, ' +
      'spodním úchytem změníte výšku. Pak klepněte na „Přečíst číslo“.'
    );
  } else {
    nastavStav('Namiřte čárový kód do rámečku.');
  }
}

/**
 * Posun a změna výšky proužku prstem.
 *
 * Počítá se v podílech výšky obrazu, protože v nich pracuje i výřez pro OCR —
 * proužek na obrazovce a čtená oblast tak zůstávají tatáž věc.
 */
function pripojTahani() {
  let druh = null;
  let zacatekY = 0;
  let zacatekHodnota = 0;

  const vyskaObrazu = () => kamera.getBoundingClientRect().height || 1;

  const zacni = (udalost, novyDruh) => {
    druh = novyDruh;
    zacatekY = udalost.clientY;
    zacatekHodnota = novyDruh === 'posun' ? prouzek.stred : prouzek.vyska;
    try {
      // Prst může sjet mimo proužek; se zachyceným ukazatelem tah pokračuje.
      udalost.currentTarget.setPointerCapture?.(udalost.pointerId);
    } catch {
      /* zachycení není nutné, tah funguje i bez něj */
    }
    cteckaPruh.classList.add('tahne-se');
    udalost.preventDefault();
  };

  const tahni = (udalost) => {
    if (!druh) return;
    const posun = (udalost.clientY - zacatekY) / vyskaObrazu();
    // Úchyt je na spodní hraně, takže tah dolů zvětšuje výšku na obě strany.
    prouzek = ocr.omezProuzek(druh === 'posun'
      ? { stred: zacatekHodnota + posun, vyska: prouzek.vyska }
      : { stred: prouzek.stred, vyska: zacatekHodnota + posun * 2 });
    vykresliProuzek();
    udalost.preventDefault();
  };

  const skonci = () => {
    if (!druh) return;
    druh = null;
    cteckaPruh.classList.remove('tahne-se');
    ulozProuzek();
  };

  cteckaPruh.addEventListener('pointerdown', (u) => zacni(u, 'posun'));
  cteckaUchyt.addEventListener('pointerdown', (u) => {
    u.stopPropagation();          // úchyt mění výšku, neposouvá
    zacni(u, 'vyska');
  });

  for (const prvek of [cteckaPruh, cteckaUchyt]) {
    prvek.addEventListener('pointermove', tahni);
    prvek.addEventListener('pointerup', skonci);
    prvek.addEventListener('pointercancel', skonci);
  }
}

pripojTahani();

btnKod.addEventListener('click', () => nastavRezimCisla(false));

btnCislo.addEventListener('click', async () => {
  if (!skener.jeSpusten()) return;

  // První klepnutí režim zapne, teprve druhé čte — proužek se nejdřív musí
  // dát zaměřit.
  if (!rezimCisla) return nastavRezimCisla(true);

  btnCislo.disabled = true;
  const puvodniPopis = btnCislo.textContent;
  btnCislo.textContent = '⏳ Čtu…';

  try {
    const { isbn, text } = await ocr.prectiIsbnZObrazu(video, nastavStav, prouzek);

    if (isbn) {
      await zpracujKod(isbn);
    } else if (text) {
      oznam('Číslo ISBN se v proužku nenašlo.', 'varovani');
      nastavStav(
        `Přečteno „${text.replace(/\s+/g, ' ').slice(0, 40)}“, ale platné ISBN v tom není. ` +
        'Zkuste proužek zaměřit přesněji jen na řádek s číslem, jít blíž, přisvítit 🔦, ' +
        'nebo číslo zadat ručně.'
      );
    } else {
      oznam('Z proužku se nepodařilo nic přečíst.', 'varovani');
      nastavStav('Namiřte proužek na řádek s číslem, držte telefon v klidu a zkuste to znovu.');
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

    oznam('To není platné ISBN, ISSN ani ČNB — zkontrolujte číslice.', 'chyba');
    nastavStav(
      `Číslo ${hodnota} neprošlo kontrolou. Přepište ho přesně tak, jak je v knize — ` +
      'včetně koncového X. Písmeno napíšete po přepnutí klávesnice tlačítkem „X“. ' +
      'Kniha z doby před rokem 1989 ISBN nemá; tam pomůže hledání podle názvu.'
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

/* --------------------------------------- hledání podle údajů o knize */

/**
 * Nabídka knih nalezených podle údajů o knize.
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

  // Číslo nálezu je ISBN, ISSN, nebo — u knih z doby před ISBN — ČNB.
  const cislo = ulozne.cisloZaznamu(nalez);

  radek('vysledek-nazev', nalez.nazev);
  const popis = [nalez.autor, nalez.rok, nalez.vydavatel, nalez.misto]
    .filter(Boolean).join(' · ');
  if (popis) radek('vysledek-popis', popis);
  radek('vysledek-isbn', `${naFormat(cislo)} · ${nalez.zdroj}`);
  const stavPolozky = radek('vysledek-stav', '');

  // Napříč poličkami: tentýž titul může stát na několika místech.
  const obnovStav = () => {
    const vytisky = ulozne.vsudePodleIsbn(cislo);
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
      await zpracujKod(cislo, nalez);
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

/**
 * Pole, podle kterých se hledá v databázích.
 *
 * Nakladatelství a rok jsou tu pro případ, kdy stejný titul vyšel několikrát:
 * podle nich jde v nabídce poznat právě to vydání, které stojí v poličce.
 */
const poleHledani = {
  nazev: prvek('vstup-nazev'),
  autor: prvek('vstup-autor'),
  vydavatel: prvek('vstup-vydavatel'),
  rok: prvek('vstup-rok'),
};

/**
 * Vyprázdní všechna pole hledání najednou a schová nabídku.
 *
 * Mazat čtyři pole po jednom je před každým novým hledáním otrava — a zapomenuté
 * nakladatelství z minulého dotazu navíc tiše zúží ten další.
 */
function vymazPoleHledani() {
  for (const pole of Object.values(poleHledani)) pole.value = '';
  vykresliNalezy([]);
}

prvek('btn-vymazat-hledani').addEventListener('click', () => {
  vymazPoleHledani();
  poleHledani.nazev.focus();
  nastavStav('Pole hledání jsou prázdná — můžete zadat nový dotaz.');
});

prvek('form-podle-nazvu').addEventListener('submit', async (udalost) => {
  udalost.preventDefault();
  const dotaz = Object.fromEntries(
    Object.entries(poleHledani).map(([klic, pole]) => [klic, pole.value.trim()])
  );

  if (!Object.values(dotaz).some(Boolean)) {
    oznam('Vyplňte aspoň jedno pole — název, autora, nakladatelství, nebo rok.', 'varovani');
    return;
  }
  // Zdroje umí jen čtyřmístný letopočet; „90. léta“ by se tiše ignorovalo
  // a uživatel by si myslel, že se podle toho hledalo.
  if (dotaz.rok && !/^\d{4}$/.test(dotaz.rok)) {
    oznam('Rok zadejte jako čtyři číslice, třeba 1998.', 'varovani');
    nastavStav(`„${dotaz.rok}“ není rok. Napište letopočet čtyřmi číslicemi, nebo pole nechte prázdné.`);
    return;
  }

  const tlacitko = udalost.target.querySelector('button[type=submit]');
  const puvodniPopis = tlacitko.textContent;
  tlacitko.disabled = true;
  tlacitko.textContent = '⏳ Hledám…';
  vykresliNalezy([]);
  nastavStav('Hledám v databázích knih …');

  try {
    const { vysledky, selhalyZdroje, nedostupne, mimoRok } = await hledejPodleTextu(dotaz);

    const poznamky = [];
    if (selhalyZdroje.length) poznamky.push(`Neodpověděly: ${selhalyZdroje.join(', ')}.`);
    // Jinak by uživatel viděl jen podivně krátkou nabídku a nevěděl proč.
    if (mimoRok) {
      poznamky.push(
        `Dalších ${pocetSlovem(mimoRok, 'nález', 'nálezy', 'nálezů')} vyšlo v jiném roce ` +
        `než ${dotaz.rok} — do nabídky se nedostaly. Bez roku se ukážou všechny.`
      );
    }
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
      // Čím víc polí je vyplněných, tím spíš je na vině právě jedno z nich —
      // rada proto zní jinak, než když se hledalo podle samotného názvu.
      const vyplnenych = Object.values(dotaz).filter(Boolean).length;
      const rada = vyplnenych > 1
        ? 'Databáze nic takového neznají. Zkuste některé pole nechat prázdné — ' +
          'nakladatelství i rok se u vydání zapisují všelijak.'
        : 'Databáze takovou knihu neznají. Zkuste jen část názvu, samotné příjmení autora, ' +
          'nebo jiný zápis jména.';
      nastavStav(`${rada} ${poznamka}`.trim());
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

/**
 * Kolik knih ještě nešlo do knihovního systému — a co s tím jde dělat.
 *
 * Katalogizace police trvá týdny a export se dělá opakovaně. Bez téhle
 * evidence zbývají dvě špatné možnosti: naimportovat pokaždé celou tabulku
 * a knihovnu zdvojit, nebo v Excelu ručně vybírat, co je nové.
 */
function vykresliStavExportu(novych, titulu) {
  const btnNove = prvek('btn-csv-nove');
  const napoveda = prvek('napoveda-export');

  btnNove.hidden = novych === 0;
  btnNove.textContent = `⬇️ Export jen nových (${novych})`;

  if (!titulu) {
    napoveda.textContent = '';
  } else if (!novych) {
    napoveda.textContent = 'Všechny knihy už byly odeslané do knihovního systému.';
  } else if (novych === titulu) {
    napoveda.textContent =
      'Do knihovního systému zatím nešlo nic. Po prvním exportu se odeslané knihy ' +
      'označí a další export nabídne jen to, co přibylo.';
  } else {
    napoveda.textContent =
      `Od posledního exportu ${novych === 1 ? 'přibyl' : novych < 5 ? 'přibyly' : 'přibylo'} ` +
      `${pocetSlovem(novych, 'záznam', 'záznamy', 'záznamů')}. ` +
      'Do EduPage stačí poslat je — celá tabulka by knihovnu zdvojila.';
  }
}

prvek('btn-csv').addEventListener('click', () => {
  const knihy = knihyKZaloze();
  if (!knihy) return;
  stahniCsv(knihy);
  zaloha.zaznamenejExport(knihy);
  vykresliStavZalohy();
});

prvek('btn-csv-nove').addEventListener('click', () => {
  const nove = ulozne.neodeslane();
  if (!nove.length) return oznam('Nové knihy tu nejsou — všechno už bylo odeslané.', 'varovani');

  stahniCsv(nove);
  zaloha.zaznamenejExport(nove);

  // Označí se až po stažení: kdyby stahování selhalo, zůstanou knihy mezi
  // novými a export jde zopakovat.
  const snimek = ulozne.snimek();
  ulozne.oznacOdeslane(nove.map((k) => k.id));
  vykresli();
  vykresliStavZalohy();
  oznam(
    `Staženo ${pocetSlovem(nove.length, 'nová kniha', 'nové knihy', 'nových knih')} ` +
    'a označeno za odeslané.',
    'uspech', snimek
  );
});

prvek('btn-json').addEventListener('click', () => {
  const knihy = knihyKZaloze();
  if (!knihy) return;
  stahniJson(knihy);
  zaloha.zaznamenejExport(knihy);
  vykresliStavZalohy();
});

prvek('btn-import').addEventListener('click', () => prvek('soubor-import').click());

/**
 * Načte zálohu JSON i tabulku CSV.
 *
 * CSV je tu kvůli tomu, aby šlo do aplikace dostat, co knihovna už má —
 * pak se při skenování rovnou pozná, které knihy jsou opravdu nové. Zvládne
 * vlastní export i soubor odjinud; sloupce se poznají podle názvu.
 */
prvek('soubor-import').addEventListener('change', async (udalost) => {
  const soubor = udalost.target.files?.[0];
  if (!soubor) return;

  const snimek = ulozne.snimek();
  try {
    const text = await soubor.text();
    const jeCsv = /\.csv$/i.test(soubor.name) || !text.trim().startsWith('[');

    let data;
    if (jeCsv) {
      data = ulozne.zCsv(text);
      if (!data.length) {
        throw new Error('V CSV se nenašly rozpoznatelné sloupce ani řádky.');
      }
    } else {
      data = JSON.parse(text);
      if (!Array.isArray(data)) throw new Error('Soubor nemá očekávaný tvar.');
    }

    const pridano = ulozne.importuj(data);
    const slouceno = ulozne.uklidDuplicity();
    obnovPolicky();
    vykresli();
    oznam(
      `Načteno ${pocetSlovem(pridano, 'nová kniha', 'nové knihy', 'nových knih')}` +
      `${slouceno ? `, sloučeno ${slouceno} duplicit` : ''}.`,
      'uspech', snimek
    );
  } catch (chyba) {
    console.error(chyba);
    oznam(`Soubor se nepodařilo načíst. ${chyba.message || ''}`.trim(), 'chyba');
  } finally {
    udalost.target.value = '';
  }
});

prvek('btn-smazat-vse').addEventListener('click', () => {
  const kolik = ulozne.vsechny().length;
  if (!kolik) return;
  if (!confirm(`Opravdu smazat celou tabulku (${kolik} řádků)? Poličky zůstanou.`)) return;

  const snimek = ulozne.snimek();
  ulozne.smazVse();
  vybrane.clear();
  obnovPolicky();
  vykresli();
  oznam('Tabulka vymazána. Poličky zůstaly.', 'varovani', snimek);
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

// Bez tohohle smí prohlížeč úložiště při nedostatku místa sám vyhodit —
// a katalogizace police se táhne týdny. Odpověď se neřeší: povolení nedá
// každý prohlížeč a zálohy to stejně nenahrazuje.
ulozne.zajistiTrvaleUloziste().then(({ podporovano, trvale }) => {
  if (podporovano && !trvale) {
    console.info('Prohlížeč zatím nepřidělil trvalé úložiště — dělejte si zálohy.');
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {
      /* aplikace funguje i bez offline režimu */
    });
  });
}

vykresli();
vykresliStavZalohy();
