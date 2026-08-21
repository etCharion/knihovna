/**
 * Propojení celé aplikace: kamera → vyhledání knihy → knihovna.
 *
 * Logika appky (skener, OCR, dohledávání údajů, úložiště, zálohy) je beze
 * změny v ostatních modulech — tenhle soubor jen jinak kreslí obrazovku:
 * tři záložky dole (Skenovat / Knihovna / Záloha), pevné skenovací okénko
 * a poličky místo tabulky se sloupci.
 */

import { naFormat, navrhniOpravu, rozpoznej } from './isbn.js';
import { hledejPodleTextu, najdiKnihu, nahradniObalka } from './lookup.js';
import * as ocr from './ocr.js';
import * as skener from './scanner.js';
import * as ulozne from './storage.js';
import * as zaloha from './zaloha.js';

const prvek = (id) => document.getElementById(id);

/* ------------------------------------------------------------ obálky knih */

/** Stejná paleta jako v návrhu — barva se počítá z názvu a autora, ať je stálá. */
const BARVY = ['#2F4A3C', '#7A4B2A', '#3A4A66', '#6B3242', '#4A5B33', '#5A4B7A', '#8A5A22', '#2E5157'];

function barvaZeSlova(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 997;
  return BARVY[h % BARVY.length];
}

function iniciala(nazev) {
  return (nazev || '?').trim().charAt(0).toUpperCase() || '?';
}

/** Obálka, nebo — když žádná není (nebo se nenačte) — barevný štítek s iniciálou. */
function vytvorObalku(kniha, trida) {
  const seed = (kniha.nazev || '') + (kniha.autor || '');
  if (kniha.obalka) {
    const img = document.createElement('img');
    img.className = trida;
    img.loading = 'lazy';
    img.alt = '';
    img.src = kniha.obalka;
    img.onerror = () => img.replaceWith(vytvorIniciala(trida, seed, kniha.nazev));
    return img;
  }
  return vytvorIniciala(trida, seed, kniha.nazev);
}

function vytvorIniciala(trida, seed, nazev) {
  const span = document.createElement('span');
  span.className = trida;
  span.style.background = barvaZeSlova(seed);
  span.textContent = iniciala(nazev);
  return span;
}

/** Text čísla pro zobrazení — ISBN/ISSN naformátované, nebo „bez čísla“. */
function cisloProZobrazeni(kniha) {
  const cislo = ulozne.cisloZaznamu(kniha);
  return cislo ? naFormat(cislo) : 'bez čísla';
}

/* ------------------------------------------------------------ prvky */

const video = prvek('video');
const kamera = prvek('kamera');
const btnSkenovat = prvek('btn-skenovat');
const btnSvetlo = prvek('btn-svetlo');
const btnCislo = prvek('btn-cislo');
const btnKod = prvek('btn-kod');
const hledacek = prvek('hledacek');
const kameraPlaceholder = prvek('kamera-placeholder');
const skenerCara = prvek('skener-cara');
const stavovaTecka = prvek('stavova-tecka');
const ctecka = prvek('ctecka');
const cteckaPruh = prvek('ctecka-pruh');
const cteckaUchyt = prvek('ctecka-uchyt');
const stav = prvek('stav');
const hlaska = prvek('hlaska');
const hlaskaText = prvek('hlaska-text');
const btnZpet = prvek('btn-zpet');
const hledat = prvek('hledat');
const panelNalezu = prvek('vysledky-hledani');
const pocetInfoSken = prvek('pocet-info-sken');
const seznamNedavnych = prvek('seznam-nedavnych');
const prazdnoNedavne = prvek('prazdno-nedavne');
const btnCelaKnihovna = prvek('btn-cela-knihovna');

const btnPolickaOtevrit = prvek('btn-policka-otevrit');
const popisekPolicky = prvek('popisek-policky');
const sheetPolicky = prvek('sheet-policky');
const polickyVyberSeznam = prvek('policky-vyber-seznam');
const seznamPolicek = prvek('seznam-policek');

const pocetEl = prvek('pocet');
const vysledekTextEl = prvek('vysledek-text');
const filtrStav = prvek('filtr-stav');
const razeniSloupecVyber = prvek('razeni-sloupec');
const prazdno = prvek('prazdno');
const skupinyPolicek = prvek('skupiny-policek');
const btnVarianta = { radky: prvek('btn-varianta-radky'), karty: prvek('btn-varianta-karty') };
const btnRozbalitVse = prvek('btn-rozbalit-vse');
const btnVyberRezim = prvek('btn-vyber-rezim');

const listaVyberu = prvek('lista-vyberu');
const pocetVyberu = prvek('pocet-vyberu');
const hromadnaPolicka = prvek('hromadna-policka');
const btnVybratVseLista = prvek('btn-vybrat-vse-lista');
const akceVyberu = [prvek('btn-vyber-odeslano'), prvek('btn-vyber-neodeslano'), prvek('btn-vyber-smazat')];

const prekryv = prvek('prekryv');
const btnPridat = prvek('btn-pridat');
const btnPridatHledat = prvek('btn-pridat-hledat');
const btnZahodit = prvek('btn-zahodit');
const btnZpetHledat = prvek('btn-zpet-hledat');
const btnZnovu = prvek('btn-znovu');
const nabidkaStav = prvek('nabidka-stav');
const nabidkaUpozorneni = prvek('nabidka-upozorneni');
const nabidkaObalka = prvek('nabidka-obalka');
const nabidkaIniciala = prvek('nabidka-iniciala');
const nabidkaZdroj = prvek('nabidka-zdroj');
const shrnuti = prvek('shrnuti');
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

const sheetDetail = prvek('sheet-detail');
const detailShrnuti = prvek('detail-shrnuti');
const detailObalka = prvek('detail-obalka');
const detailIniciala = prvek('detail-iniciala');
const detailShrnutiNazev = prvek('detail-shrnuti-nazev');
const detailShrnutiAutor = prvek('detail-shrnuti-autor');
const detailShrnutiCislo = prvek('detail-shrnuti-cislo');
const poleDetailu = {
  nazev: prvek('detail-nazev'),
  autor: prvek('detail-autor'),
  isbn: prvek('detail-isbn'),
  rok: prvek('detail-rok'),
  vydavatel: prvek('detail-vydavatel'),
  misto: prvek('detail-misto'),
  policka: prvek('detail-policka'),
  poznamka: prvek('detail-poznamka'),
};
const detailKusuEl = prvek('detail-kusu');

const sheetRucne = prvek('sheet-rucne');
const rucneNadpis = prvek('rucne-nadpis');
const rezimIsbn = prvek('rucne-rezim-isbn');
const rezimNazev = prvek('rucne-rezim-nazev');

let razeni = { sloupec: null, sestupne: false };

/**
 * Popisky „už v knihovně“ u knih nabídnutých hledáním podle názvu.
 * Visí na překreslení, protože kniha se ukládá až potvrzením v nabídce.
 */
const obnovyNalezu = [];
let cekaSeNaVyhledani = new Set();

/** Zaškrtnuté řádky pro hromadné akce. Drží se i přes překreslení. */
const vybrane = new Set();
let rezimVyberu = false;

/** Filtr podle toho, jestli řádek už šel do knihovního systému. */
let zobrazenyStav = 'vse';

/** Otevřené/sbalené poličky v Knihovně. Nový název se ve výchozím stavu rozbalí. */
const otevrenePolicky = {};

/** Naposledy přidané knihy (nejnovější první) — pro záložku Skenovat. */
let nedavnoPridane = [];

/** Poslední volba v rozbalovátku, která místo výběru založí novou poličku. */
const NOVA_POLICKA = '\u0000nova';

/* ------------------------------------------------------------ záložky */

const OBRAZOVKY = ['skener', 'knihovna', 'vic'];
let aktivniZalozka = 'skener';

function prepniZalozku(cil) {
  aktivniZalozka = cil;
  for (const nazev of OBRAZOVKY) {
    prvek(`obrazovka-${nazev === 'vic' ? 'zaloha' : nazev}`).hidden = nazev !== cil;
    prvek(`nav-${nazev === 'vic' ? 'zaloha' : nazev}`).classList.toggle('aktivni', nazev === cil);
  }
}

for (const tlacitko of document.querySelectorAll('.nav-tlacitko')) {
  tlacitko.addEventListener('click', () => prepniZalozku(tlacitko.dataset.cil));
}

prepniZalozku('skener');

/* ------------------------------------------------------------ varianta seznamu */

const KLIC_VARIANTY = 'knihovna.varianta.v1';
let varianta = localStorage.getItem(KLIC_VARIANTY) === 'karty' ? 'karty' : 'radky';

function nastavVariantu(nova) {
  varianta = nova;
  try { localStorage.setItem(KLIC_VARIANTY, nova); } catch { /* varianta seznamu není kritická */ }
  btnVarianta.radky.classList.toggle('aktivni', nova === 'radky');
  btnVarianta.karty.classList.toggle('aktivni', nova === 'karty');
  vykresli();
}

btnVarianta.radky.addEventListener('click', () => nastavVariantu('radky'));
btnVarianta.karty.addEventListener('click', () => nastavVariantu('karty'));
btnVarianta.radky.classList.toggle('aktivni', varianta === 'radky');
btnVarianta.karty.classList.toggle('aktivni', varianta === 'karty');

/* ------------------------------------------------------------ pomůcky */

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

/** České skloňování po číslovce: 1 kniha, 2 knihy, 5 knih, 0 knih. */
function pocetSlovem(kolik, jedna, dve, pet) {
  return `${kolik} ${kolik === 1 ? jedna : kolik >= 2 && kolik <= 4 ? dve : pet}`;
}

function jeNejakySheetOtevreny() {
  return !prekryv.hidden || !sheetDetail.hidden || !sheetRucne.hidden || !sheetPolicky.hidden;
}

/* ------------------------------------------------------------ poličky */

/**
 * Naplní rozbalovátko poličkami. Prázdná hodnota znamená „bez poličky“ —
 * platné zařazení, které se nabízí všude. Volba „nová polička“ se přidá,
 * kde má smysl rovnou zakládat.
 */
function naplnVyberPolicek(vyber, vybrana, { sNovou = false } = {}) {
  const seznam = ulozne.policky();
  const moznosti = [['', 'Bez poličky']];
  for (const nazev of seznam) moznosti.push([nazev, nazev]);
  if (vybrana && !seznam.includes(vybrana)) moznosti.push([vybrana, vybrana]);
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
 * Vrátí vybranou poličku, nebo null, když uživatel zakládání zrušil.
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

function pocetNaPolicce(nazev) {
  return ulozne.vsechny().filter((k) => ulozne.upravNazevPolicky(k.policka) === nazev).length;
}

function aktualizujPopisekPolicky() {
  popisekPolicky.textContent = ulozne.aktivniPolicka() || 'Bez poličky';
}

/**
 * Znovu vykreslí všechna místa, kde se poličky nabízejí.
 *
 * V otevřených nabídkách se drží to, co v nich uživatel vybral — obnova
 * seznamu poliček nesmí volbu přepsat zpátky na tu, do které se skenuje.
 */
function obnovPolicky() {
  naplnVyberPolicek(
    poleNabidky.policka,
    jeNabidkaOtevrena() ? poleNabidky.policka.value : ulozne.aktivniPolicka(),
    { sNovou: true }
  );
  naplnVyberPolicek(poleDetailu.policka, poleDetailu.policka.value, { sNovou: true });
  aktualizujPopisekPolicky();
  vykresliSpravuPolicek();
}

function vykresliSpravuPolicek() {
  const seznam = ulozne.policky();

  if (!seznam.length) {
    const prazdnyRadek = document.createElement('p');
    prazdnyRadek.className = 'napoveda';
    prazdnyRadek.textContent = 'Zatím žádná polička. Založte první tlačítkem níže.';
    seznamPolicek.replaceChildren(prazdnyRadek);
    return;
  }

  seznamPolicek.replaceChildren(...seznam.map((nazev) => {
    const { titulu, kusu } = ulozne.obsahPolicky(nazev);
    const radek = document.createElement('div');
    radek.className = 'policka-radek';

    const popis = document.createElement('span');
    popis.className = 'policka-nazev';
    popis.textContent = nazev;
    radek.appendChild(popis);

    const pocty = document.createElement('span');
    pocty.className = 'policka-pocet';
    pocty.textContent = titulu === kusu ? `${titulu} tit.` : `${titulu} tit. / ${kusu} ks`;
    radek.appendChild(pocty);

    const prejmenovat = document.createElement('button');
    prejmenovat.type = 'button';
    prejmenovat.className = 'policka-upravit';
    prejmenovat.textContent = 'upravit';
    prejmenovat.setAttribute('aria-label', `Přejmenovat poličku ${nazev}`);
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
    radek.appendChild(prejmenovat);

    const smazat = document.createElement('button');
    smazat.type = 'button';
    smazat.className = 'policka-smazat';
    smazat.textContent = '✕';
    smazat.setAttribute('aria-label', `Zrušit poličku ${nazev}`);
    smazat.addEventListener('click', () => {
      const otazka = titulu
        ? `Zrušit poličku „${nazev}“? ${titulu} knih na ní zůstane v knihovně bez zařazení.`
        : `Zrušit prázdnou poličku „${nazev}“?`;
      if (!confirm(otazka)) return;
      ulozne.smazPolicku(nazev);
      obnovPolicky();
      vykresli();
      oznam(`Polička „${nazev}“ zrušena.`, 'varovani');
    });
    radek.appendChild(smazat);

    return radek;
  }));
}

prvek('btn-nova-policka').addEventListener('click', () => {
  const nazev = prompt('Jak se polička jmenuje? (třeba „Obývák — horní řada“)');
  if (nazev === null) return;
  const vytvorena = ulozne.pridejPolicku(nazev);
  if (!vytvorena) return oznam('Polička musí mít název.', 'varovani');
  obnovPolicky();
  oznam(`Polička „${vytvorena}“ založena.`, 'uspech');
});

/* ------------------------------------------- výběr poličky pro skenování */

function otevriSheetPolicky() {
  vykresliVyberPolicek();
  sheetPolicky.hidden = false;
  document.body.classList.add('bez-posunu');
}

function zavriSheetPolicky() {
  sheetPolicky.hidden = true;
  if (!jeNejakySheetOtevreny()) document.body.classList.remove('bez-posunu');
}

function vykresliVyberPolicek() {
  const aktivni = ulozne.aktivniPolicka();
  const seznam = [...ulozne.policky(), ''];
  polickyVyberSeznam.replaceChildren(...seznam.map((nazev) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'policka-vyber' + (nazev === aktivni ? ' vybrana' : '');

    const jmeno = document.createElement('span');
    jmeno.className = 'policka-vyber-nazev';
    jmeno.textContent = nazev || 'Bez poličky';
    const pocet = document.createElement('span');
    pocet.className = 'policka-vyber-label';
    pocet.textContent = pocetSlovem(pocetNaPolicce(nazev), 'kniha', 'knihy', 'knih');
    const znak = document.createElement('span');
    znak.className = 'policka-vyber-znak';
    znak.textContent = nazev === aktivni ? '✓' : '';
    btn.append(jmeno, pocet, znak);

    btn.addEventListener('click', () => {
      ulozne.nastavAktivniPolicku(nazev);
      aktualizujPopisekPolicky();
      zavriSheetPolicky();
      nastavStav(nazev
        ? `Nové knihy se budou nabízet na poličku „${nazev}“.`
        : 'Nové knihy se budou nabízet bez poličky.');
    });

    return btn;
  }));
}

btnPolickaOtevrit.addEventListener('click', otevriSheetPolicky);
prvek('btn-policky-zavrit').addEventListener('click', zavriSheetPolicky);

prvek('btn-nova-policka-sken').addEventListener('click', () => {
  const nazev = prompt('Jak se polička jmenuje? (třeba „Obývák — horní řada“)');
  if (nazev === null) return;
  const vytvorena = ulozne.pridejPolicku(nazev);
  if (!vytvorena) return oznam('Polička musí mít název.', 'varovani');
  ulozne.nastavAktivniPolicku(vytvorena);
  obnovPolicky();
  zavriSheetPolicky();
  oznam(`Polička „${vytvorena}“ založena a nastavená pro skenování.`, 'uspech');
});

/* ------------------------------------------------------------ knihovna */

function vyfiltrovane() {
  const dotaz = hledat.value.trim().toLowerCase();
  let knihy = ulozne.vsechny();

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
      const poradi = String(a[sloupec] ?? '')
        .localeCompare(String(b[sloupec] ?? ''), 'cs', { numeric: true, sensitivity: 'base' });
      return sestupne ? -poradi : poradi;
    });
  }

  return knihy;
}

/** Titul, který jde přepsat přímo v řádku — zbytek údajů je v detailu knihy. */
function vytvorEditovatelnyNazev(kniha) {
  const span = document.createElement('div');
  span.contentEditable = 'plaintext-only';
  span.className = 'kniha-nazev';
  span.textContent = kniha.nazev || '';
  span.addEventListener('blur', () => {
    const nove = span.textContent.trim();
    if (nove !== (kniha.nazev || '')) {
      ulozne.uprav(kniha.id, { nazev: nove });
      vykresliNedavne();
    }
  });
  span.addEventListener('click', (u) => u.stopPropagation());
  span.addEventListener('keydown', (u) => {
    if (u.key === 'Enter') { u.preventDefault(); span.blur(); }
  });
  return span;
}

function vytvorCheckboxVyberu(kniha) {
  const zaskrtavatko = document.createElement('input');
  zaskrtavatko.type = 'checkbox';
  zaskrtavatko.className = 'kniha-vyber-checkbox';
  zaskrtavatko.checked = vybrane.has(kniha.id);
  zaskrtavatko.setAttribute('aria-label', `Vybrat ${kniha.nazev || cisloProZobrazeni(kniha)}`);
  zaskrtavatko.addEventListener('click', (u) => u.stopPropagation());
  zaskrtavatko.addEventListener('change', () => {
    if (zaskrtavatko.checked) vybrane.add(kniha.id);
    else vybrane.delete(kniha.id);
    vykresliListuVyberu();
  });
  return zaskrtavatko;
}

function prepniVyberKnihy(kniha) {
  if (vybrane.has(kniha.id)) vybrane.delete(kniha.id);
  else vybrane.add(kniha.id);
  vykresli();
}

/**
 * Zelený proužek u kraje na knihách, které už šly do knihovního systému.
 * Bez něj by nešlo poznat, co je v systému a co ještě čeká — a přesně to
 * u dvojího exportu rozhoduje.
 */
function oznacOdeslanou(prvekSeznamu, kniha) {
  if (!ulozne.jeOdeslana(kniha)) return;
  prvekSeznamu.classList.add('odeslana');
  prvekSeznamu.title = `Odesláno do knihovního systému ${kniha.odeslano}`;
}

function vytvorRadekKnihovny(kniha) {
  const radek = document.createElement('div');
  radek.className = 'polozka-radky';
  if (cekaSeNaVyhledani.has(kniha.isbn)) radek.classList.add('nacita-se');
  oznacOdeslanou(radek, kniha);

  if (rezimVyberu) radek.appendChild(vytvorCheckboxVyberu(kniha));
  radek.appendChild(vytvorObalku(kniha, 'obalka-mala'));

  const info = document.createElement('div');
  info.style.flex = '1 1 auto';
  info.style.minWidth = '0';
  info.appendChild(vytvorEditovatelnyNazev(kniha));

  const meta = document.createElement('div');
  meta.className = 'kniha-autor';
  meta.textContent = [kniha.autor, kniha.rok, kniha.vydavatel].filter(Boolean).join(' · ');
  info.appendChild(meta);

  const cislo = document.createElement('div');
  cislo.className = 'kniha-cislo';
  cislo.textContent = cisloProZobrazeni(kniha);
  info.appendChild(cislo);

  radek.appendChild(info);

  if (Number(kniha.kusu) > 1) {
    const odznak = document.createElement('span');
    odznak.className = 'odznak-kusu-radky';
    odznak.textContent = `${kniha.kusu}×`;
    radek.appendChild(odznak);
  }

  if (!rezimVyberu) {
    const sipka = document.createElement('button');
    sipka.type = 'button';
    sipka.className = 'kniha-otevrit-sipka';
    sipka.textContent = '›';
    sipka.setAttribute('aria-label', `Detail knihy ${kniha.nazev || cisloProZobrazeni(kniha)}`);
    sipka.addEventListener('click', () => otevriDetail(kniha.id));
    radek.appendChild(sipka);
  }

  return radek;
}

function vytvorKartuKnihovny(kniha) {
  const karta = document.createElement('div');
  karta.className = 'polozka-karty';
  karta.tabIndex = 0;
  karta.setAttribute('role', 'button');
  if (cekaSeNaVyhledani.has(kniha.isbn)) karta.classList.add('nacita-se');
  oznacOdeslanou(karta, kniha);

  if (rezimVyberu) karta.appendChild(vytvorCheckboxVyberu(kniha));
  karta.appendChild(vytvorObalku(kniha, 'obalka-stredni'));

  const info = document.createElement('div');
  info.className = 'kniha-info';

  const nazev = document.createElement('span');
  nazev.className = 'kniha-nazev';
  nazev.textContent = kniha.nazev || 'Bez názvu';
  info.appendChild(nazev);

  if (kniha.autor) {
    const autor = document.createElement('span');
    autor.className = 'kniha-autor';
    autor.textContent = kniha.autor;
    info.appendChild(autor);
  }

  const meta = document.createElement('span');
  meta.className = 'kniha-meta-karta';
  meta.textContent = [kniha.rok, kniha.vydavatel, cisloProZobrazeni(kniha)].filter(Boolean).join(' · ');
  info.appendChild(meta);

  const odznaky = document.createElement('span');
  odznaky.className = 'odznaky-karty';
  const policka = document.createElement('span');
  policka.className = 'odznak-policka';
  policka.textContent = ulozne.upravNazevPolicky(kniha.policka) || 'Bez poličky';
  odznaky.appendChild(policka);
  if (Number(kniha.kusu) > 1) {
    const kusy = document.createElement('span');
    kusy.className = 'odznak-kusu';
    kusy.textContent = `${kniha.kusu}×`;
    odznaky.appendChild(kusy);
  }
  info.appendChild(odznaky);

  karta.appendChild(info);

  karta.addEventListener('click', (u) => {
    if (u.target.closest('.kniha-vyber-checkbox')) return;
    if (rezimVyberu) return prepniVyberKnihy(kniha);
    otevriDetail(kniha.id);
  });

  return karta;
}

function vytvorSkupinuPolicky(nazev, knihy, otevrena) {
  const kusu = knihy.reduce((n, k) => n + (Number(k.kusu) || 1), 0);
  const obal = document.createElement('div');
  obal.className = 'skupina-policky';

  const hlavicka = document.createElement('button');
  hlavicka.type = 'button';
  hlavicka.className = 'skupina-hlavicka';
  const sipka = document.createElement('span');
  sipka.className = 'skupina-sipka';
  sipka.textContent = otevrena ? '▾' : '▸';
  const jmeno = document.createElement('span');
  jmeno.className = 'skupina-nazev';
  jmeno.textContent = nazev || 'Bez poličky';
  const label = document.createElement('span');
  label.className = 'skupina-pocet';
  label.textContent = knihy.length === kusu ? `${kusu} ks` : `${knihy.length} / ${kusu} ks`;
  hlavicka.append(sipka, jmeno, label);
  hlavicka.addEventListener('click', () => {
    otevrenePolicky[nazev] = !otevrena;
    vykresliKnihovnu();
  });
  obal.appendChild(hlavicka);

  if (otevrena) {
    const obsah = document.createElement('div');
    obsah.className = 'skupina-obsah';
    obsah.append(...knihy.map((k) => (varianta === 'karty' ? vytvorKartuKnihovny(k) : vytvorRadekKnihovny(k))));
    obal.appendChild(obsah);
  }

  return obal;
}

function vykresliKnihovnu() {
  const dotaz = hledat.value.trim();
  const filtrAktivni = !!dotaz || zobrazenyStav !== 'vse';
  const vsechny = ulozne.vsechny();
  const filtrovane = vyfiltrovane();
  const { titulu, kusu, novych } = ulozne.souhrn(vsechny);

  pocetEl.textContent = titulu === kusu
    ? pocetSlovem(titulu, 'titul', 'tituly', 'titulů')
    : `${titulu} / ${kusu} ks`;
  vysledekTextEl.textContent = filtrAktivni
    ? `${filtrovane.length} nalezeno`
    : `${pocetSlovem(kusu, 'kus', 'kusy', 'kusů')} celkem`;

  // Hláška se ukáže i tehdy, když knihy sice jsou, ale filtr ani hledání
  // z nich nic nenechají — jinak by po nenalezeném dotazu zůstala jen
  // prázdná obrazovka bez vysvětlení.
  const nicKVideni = vsechny.length === 0 || filtrovane.length === 0;
  prazdno.hidden = !nicKVideni;
  prazdno.textContent = vsechny.length === 0
    ? 'Zatím tu nic není. Naskenujte první knihu.'
    : dotaz
      ? 'Hledání nic nenašlo.'
      : zobrazenyStav === 'nove'
        ? 'Všechno už je odeslané do knihovního systému.'
        : zobrazenyStav === 'odeslane'
          ? 'Zatím nebylo odeslané nic.'
          : 'Hledání nic nenašlo.';

  skupinyPolicek.hidden = vsechny.length === 0;

  const nazvySkupin = [...ulozne.policky(), ''];
  const skupiny = nazvySkupin.map((nazev) => {
    const knihyNaPolicce = filtrovane.filter((k) => ulozne.upravNazevPolicky(k.policka) === nazev);
    if (!(nazev in otevrenePolicky)) otevrenePolicky[nazev] = true;
    const otevrena = filtrAktivni ? knihyNaPolicce.length > 0 : otevrenePolicky[nazev];
    return { nazev, knihy: knihyNaPolicce, otevrena };
  }).filter((s) => {
    if (s.knihy.length) return true;
    // Prázdná polička zůstane vidět — uživatel ji založil a bude do ní skenovat.
    // Prázdné „Bez poličky“ je ale jen zbytková kolonka, tu není proč ukazovat.
    return !filtrAktivni && s.nazev !== '';
  });

  skupinyPolicek.replaceChildren(...skupiny.map((s) => vytvorSkupinuPolicky(s.nazev, s.knihy, s.otevrena)));

  const vsechnyOtevrene = nazvySkupin.every((n) => otevrenePolicky[n]);
  btnRozbalitVse.textContent = vsechnyOtevrene ? 'Sbalit vše' : 'Rozbalit vše';

  vykresliListuVyberu(filtrovane);
  vykresliStavExportu(novych, titulu);
  for (const obnov of obnovyNalezu) obnov();
}

btnRozbalitVse.addEventListener('click', () => {
  const nazvySkupin = [...ulozne.policky(), ''];
  const vsechnyOtevrene = nazvySkupin.every((n) => otevrenePolicky[n]);
  for (const n of nazvySkupin) otevrenePolicky[n] = !vsechnyOtevrene;
  vykresliKnihovnu();
});

hledat.addEventListener('input', vykresli);
filtrStav.addEventListener('change', () => { zobrazenyStav = filtrStav.value; vykresli(); });
razeniSloupecVyber.addEventListener('change', () => {
  const volba = razeniSloupecVyber.value;
  const sestupne = volba.endsWith('-sestupne');
  razeni = { sloupec: volba.replace('-sestupne', '') || null, sestupne };
  vykresli();
});

/* ------------------------------------------------------- režim výběru a hromadné akce */

btnVyberRezim.addEventListener('click', () => {
  rezimVyberu = !rezimVyberu;
  btnVyberRezim.textContent = rezimVyberu ? 'Hotovo' : 'Vybrat';
  if (!rezimVyberu) vybrane.clear();
  vykresli();
});

/**
 * Lišta hromadných akcí. Stojí v režimu výběru pořád — i než je něco
 * zaškrtnuté, protože právě v ní je „Vybrat vše“. Dokud výběr prázdný je,
 * jsou akce jen zašedlé.
 */
function vykresliListuVyberu(zobrazene = vyfiltrovane()) {
  const zname = new Set(ulozne.vsechny().map((k) => k.id));
  for (const id of vybrane) if (!zname.has(id)) vybrane.delete(id);

  listaVyberu.hidden = !rezimVyberu;
  if (listaVyberu.hidden) return;

  const neco = vybrane.size > 0;
  pocetVyberu.textContent = neco
    ? `Vybráno ${pocetSlovem(vybrane.size, 'kniha', 'knihy', 'knih')}`
    : 'Nic nevybráno';

  const vseVybrane = zobrazene.length > 0 && zobrazene.every((k) => vybrane.has(k.id));
  btnVybratVseLista.textContent = vseVybrane ? 'Odznačit vše' : 'Vybrat vše';
  btnVybratVseLista.disabled = zobrazene.length === 0;

  for (const tlacitko of akceVyberu) tlacitko.disabled = !neco;
  hromadnaPolicka.disabled = !neco;

  naplnVyberPolicek(hromadnaPolicka, '', { sNovou: true });
  const vyzva = document.createElement('option');
  vyzva.value = '';
  vyzva.textContent = 'Přesunout na poličku…';
  vyzva.disabled = true;
  vyzva.selected = true;
  hromadnaPolicka.prepend(vyzva);
}

btnVybratVseLista.addEventListener('click', () => {
  const zobrazene = vyfiltrovane();
  const vseVybrane = zobrazene.length > 0 && zobrazene.every((k) => vybrane.has(k.id));
  for (const kniha of zobrazene) {
    if (vseVybrane) vybrane.delete(kniha.id);
    else vybrane.add(kniha.id);
  }
  vykresli();
});

prvek('btn-vyber-zrusit').addEventListener('click', () => { vybrane.clear(); vykresli(); });

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

/* ------------------------------------------------------------ nedávno přidané */

function pridatDoNedavnych(id) {
  nedavnoPridane = [id, ...nedavnoPridane.filter((x) => x !== id)].slice(0, 8);
}

function vytvorPolozkuNedavne(kniha) {
  const tlacitko = document.createElement('button');
  tlacitko.type = 'button';
  tlacitko.className = 'kniha-radek';
  tlacitko.appendChild(vytvorObalku(kniha, 'obalka-mala'));

  const info = document.createElement('span');
  info.className = 'kniha-info';
  const nazev = document.createElement('span');
  nazev.className = 'kniha-nazev';
  nazev.textContent = kniha.nazev || cisloProZobrazeni(kniha) || 'Bez názvu';
  const autor = document.createElement('span');
  autor.className = 'kniha-autor';
  autor.textContent = kniha.autor || '';
  const policka = document.createElement('span');
  policka.className = 'kniha-policka-popisek';
  policka.textContent = ulozne.upravNazevPolicky(kniha.policka) || 'Bez poličky';
  info.append(nazev, autor, policka);
  tlacitko.appendChild(info);

  const odznak = document.createElement('span');
  odznak.className = 'kniha-stav-odznak';
  odznak.textContent = ulozne.jeOdeslana(kniha) ? 'odesláno' : 'uloženo';
  tlacitko.appendChild(odznak);

  tlacitko.addEventListener('click', () => otevriDetail(kniha.id));
  return tlacitko;
}

function vykresliNedavne() {
  const vsechny = ulozne.vsechny();
  const knihy = nedavnoPridane.map((id) => vsechny.find((k) => k.id === id)).filter(Boolean);
  prazdnoNedavne.hidden = knihy.length !== 0;
  btnCelaKnihovna.hidden = knihy.length === 0;
  seznamNedavnych.replaceChildren(...knihy.map(vytvorPolozkuNedavne));

  const { titulu, kusu } = ulozne.souhrn(vsechny);
  pocetInfoSken.textContent = `${pocetSlovem(titulu, 'kniha', 'knihy', 'knih')} · ${pocetSlovem(kusu, 'kus', 'kusy', 'kusů')}`;
}

btnCelaKnihovna.addEventListener('click', () => prepniZalozku('knihovna'));

/* ------------------------------------------------------------ hlavní překreslení */

function vykresli() {
  vykresliKnihovnu();
  vykresliNedavne();
}

/* ----------------------------------------- nabídka před přidáním knihy */

let nabizenaKniha = null;
let poradiNabidky = 0;
/** Odkud se nabídka otevřela: 'sken' | 'isbn' | 'nazev'. Podle toho se vrací hledání. */
let puvodNabidky = 'sken';

function jeNabidkaOtevrena() {
  return !prekryv.hidden;
}

function nastavNabidkuStav(text) {
  nabidkaStav.textContent = text;
}

const rucneUpravena = new Set();

function kusuZNabidky() {
  return ulozne.upravPocetKusu(poleNabidky.kusu.value);
}

function udajeSeLisi(ulozena) {
  return ['nazev', 'autor', 'rok', 'vydavatel', 'misto'].some(
    (pole) => poleNabidky[pole].value.trim() && poleNabidky[pole].value.trim() !== (ulozena[pole] || '')
  );
}

/**
 * Popisy obou tlačítek, která knihu ukládají. Podrobnost — přibývá kus?
 * přepíšou se údaje? — nese hlavní tlačítko; to druhé k tomu jen dodává
 * „a zpátky na hledání“, takže mu stačí stejná značka.
 */
function nastavPopisyPridani(popis, znacka = '✓') {
  btnPridat.textContent = popis;
  btnPridatHledat.textContent = `${znacka} Přidat a hledat dál`;
}

function zkontrolujDuplicitu() {
  const isbn = rozpoznej(poleNabidky.isbn.value)?.kod || '';
  const policka = ulozne.upravNazevPolicky(poleNabidky.policka.value);
  const kusu = kusuZNabidky();
  const kusuNavic = kusu === 1 ? 'další kus' : `dalších ${kusu} kusů`;

  const naPolicce = isbn ? ulozne.podleIsbn(isbn, policka) : null;
  const jinde = isbn ? ulozne.vsudePodleIsbn(isbn).filter((k) => k !== naPolicce) : [];

  if (!isbn) {
    nabidkaUpozorneni.textContent =
      'Kniha nemá ISBN ani jiné číslo. Uložit se dá, ale nejde poznat, jestli ji ' +
      'v knihovně už nemáte — každé přidání proto založí nový řádek.';
    nabidkaUpozorneni.hidden = false;
    nastavPopisyPridani('✓ Přidat');
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
    nastavPopisyPridani(prepsat ? '➕ Přidat kus a opravit údaje' : `➕ Přidat ${kusuNavic}`, '➕');
    return;
  }

  if (jinde.length) {
    const mista = [...new Set(jinde.map((k) => ulozne.upravNazevPolicky(k.policka) || 'bez poličky'))];
    nabidkaUpozorneni.textContent = `Tenhle titul už máte: ${mista.join(', ')}. Přibude jako další výtisk.`;
    nabidkaUpozorneni.hidden = false;
  } else {
    nabidkaUpozorneni.hidden = true;
  }
  nastavPopisyPridani('✓ Přidat');
}

function vykresliShrnuti() {
  const nazev = poleNabidky.nazev.value.trim();
  const cislo = poleNabidky.isbn.value.trim();

  shrnutiNazev.textContent = nazev || 'Zatím bez názvu';
  shrnuti.classList.toggle('hleda-se', !nazev);
  shrnutiAutor.textContent = poleNabidky.autor.value.trim();

  const rok = poleNabidky.rok.value.trim();
  const vydavatel = poleNabidky.vydavatel.value.trim();
  const misto = poleNabidky.misto.value.trim();
  shrnutiCislo.textContent = [cislo || 'bez čísla', vydavatel, misto, rok].filter(Boolean).join(' · ');

  const obalka = nabizenaKniha?.obalka;
  nabidkaObalka.hidden = !obalka;
  nabidkaIniciala.hidden = !!obalka;
  if (obalka) {
    nabidkaObalka.src = obalka;
    nabidkaObalka.onerror = () => { nabidkaObalka.hidden = true; nabidkaIniciala.hidden = false; };
  } else {
    nabidkaIniciala.textContent = iniciala(nazev);
    nabidkaIniciala.style.background = barvaZeSlova(nazev + poleNabidky.autor.value);
  }

  nabidkaZdroj.textContent = nabizenaKniha?.zdroj || '';
  nabidkaZdroj.hidden = !nabizenaKniha?.zdroj;
}

/** Pole, která patří ke knize samotné — po opravě čísla se dohledávají znovu. */
const POLE_O_KNIZE = ['nazev', 'autor', 'rok', 'vydavatel', 'misto', 'stran', 'jazyk', 'obalka', 'zdroj'];

function vyplnNabidku(kniha, { jenChybejici = false } = {}) {
  for (const pole of ['nazev', 'autor', 'rok', 'vydavatel', 'misto']) {
    if (rucneUpravena.has(pole)) continue;
    if (jenChybejici && poleNabidky[pole].value.trim()) continue;
    poleNabidky[pole].value = kniha[pole] || '';
  }
  vykresliShrnuti();
}

function otevriNabidku(isbn, zHledani = null, puvod = 'sken') {
  poradiNabidky++;
  puvodNabidky = puvod;
  rucneUpravena.clear();
  nabizenaKniha = Object.fromEntries(POLE_O_KNIZE.map((pole) => [pole, zHledani?.[pole] || '']));
  poleNabidky.isbn.value = naFormat(isbn);
  poleNabidky.poznamka.value = '';
  poleNabidky.kusu.value = '1';
  vyplnNabidku(zHledani || {});
  naplnVyberPolicek(poleNabidky.policka, ulozne.aktivniPolicka(), { sNovou: true });
  prekryv.hidden = false;
  document.body.classList.add('bez-posunu');
  zkontrolujDuplicitu();
  btnPridat.focus();
}

/**
 * Zpátky na hledání. Vrací se tam, odkud kniha přišla: po ručně zadaném čísle
 * se otevře pole na další ISBN, jinak hledání podle názvu — i s nálezy
 * z minulého dotazu, aby šlo rovnou klepnout na další knihu ze stejné nabídky.
 * Do vyplněného seznamu nálezů se schválně nezaostřuje: na telefonu by přes
 * něj vyskočila klávesnice.
 */
function zpetNaHledani() {
  const rezim = puvodNabidky === 'isbn' ? 'isbn' : 'nazev';
  otevriRucne(rezim, { zaostri: rezim === 'isbn' || panelNalezu.hidden });
}

function zavriNabidku() {
  prekryv.hidden = true;
  nabizenaKniha = null;
  rucneUpravena.clear();
  if (!jeNejakySheetOtevreny()) document.body.classList.remove('bez-posunu');
  skener.zapomenPosledniKod();
}

async function vyhledejDoNabidky(isbn, zHledani = null) {
  const moje = poradiNabidky;
  const cislo = rozpoznej(isbn)?.cislo || 'ISBN';
  const platna = () => jeNabidkaOtevrena() && poradiNabidky === moje;

  if (!rozpoznej(isbn)) {
    nastavNabidkuStav(
      'Kniha nemá ISBN ani jiné číslo. Údaje zkontrolujte a doplňte ručně; ' +
      'uloží se tak, jak je necháte.'
    );
    zkontrolujDuplicitu();
    return;
  }

  btnZnovu.disabled = true;
  nastavNabidkuStav(`Hledám ${naFormat(isbn)} …`);

  try {
    const prubezne = (castecna) => {
      if (!platna()) return;
      nabizenaKniha = Object.fromEntries(
        POLE_O_KNIZE.map((pole) => [pole, castecna[pole] || nabizenaKniha?.[pole] || ''])
      );
      vyplnNabidku(castecna, { jenChybejici: true });
      if (castecna.nazev) nastavNabidkuStav(`Nalezeno v: ${castecna.zdroj}. Ostatní zdroje ještě dobíhají…`);
    };

    const kniha = doplnChybejici(await najdiKnihu(isbn, { prubezne }), zHledani || {});
    if (!platna()) return;

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
      const selhaly = kniha.selhalyZdroje?.length ? ` Neodpověděly: ${kniha.selhalyZdroje.join(', ')}.` : '';
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

function pridejZNabidky({ potomHledat = false } = {}) {
  const zadane = poleNabidky.isbn.value.trim();
  const rozpoznane = rozpoznej(zadane);

  if (!rozpoznane && zadane) {
    const navrh = navrhniOpravu(zadane);
    if (navrh) {
      poleNabidky.isbn.value = naFormat(navrh);
      zkontrolujDuplicitu();
      return oznam('Číslo neprošlo kontrolou — v poli je návrh opravy.', 'varovani');
    }
    return oznam('To není platné ISBN, ISSN ani ČNB. Opravte ho, nebo pole nechte prázdné.', 'chyba');
  }

  const jeCnbCislo = rozpoznane?.cislo === 'ČNB';
  const isbn = rozpoznane?.kod || '';

  const policka = ulozne.upravNazevPolicky(poleNabidky.policka.value);
  const kusu = kusuZNabidky();
  const stavajici = isbn ? ulozne.podleIsbn(isbn, policka) : null;
  const prepsatUdaje = !!stavajici && udajeSeLisi(stavajici);

  const snimek = ulozne.snimek();

  let zaznam, duplicita, pribylo;
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
  pridatDoNedavnych(zaznam.id);
  zavriNabidku();
  // Nálezy z hledání překreslí až vykresli() níž — u právě přidané knihy se tím
  // rovnou objeví značka „už v knihovně“.
  if (potomHledat) zpetNaHledani();
  obnovPolicky();
  vykresli();

  const kde = policka ? ` na poličku „${policka}“` : '';
  const dal = potomHledat
    ? ' Vyberte z nabídky další knihu, nebo hledejte znovu.'
    : ' Můžete skenovat dál.';
  const nazevKnihy = zaznam.nazev || naFormat(isbn) || 'kniha bez čísla';
  if (duplicita) {
    oznam(`„${nazevKnihy}“ už tam byla — teď je ${pocetSlovem(zaznam.kusu, 'kus', 'kusy', 'kusů')}.`, 'varovani', snimek);
    const sloveso = pribylo === 1 ? 'Přibyl' : pribylo < 5 ? 'Přibyly' : 'Přibylo';
    nastavStav(`${sloveso} ${pocetSlovem(pribylo, 'kus', 'kusy', 'kusů')}${kde}.${dal}`);
  } else {
    oznam(`✓ ${nazevKnihy}${zaznam.autor ? ' — ' + zaznam.autor : ''}`, 'uspech', snimek);
    nastavStav(`Přidáno${kde}.${dal}`);
  }
}

/* ------------------------------------------------- zpracování jednoho kódu */

function doplnChybejici(kniha, zHledani) {
  const doplnena = { ...kniha };
  for (const pole of POLE_O_KNIZE) {
    if (!doplnena[pole] && zHledani[pole]) doplnena[pole] = zHledani[pole];
  }
  return { ...doplnena, nalezeno: !!doplnena.nazev };
}

async function zpracujKod(vstupniKod, zHledani = null, puvod = null) {
  const rozpoznane = rozpoznej(vstupniKod);

  if (!rozpoznane && !zHledani) {
    nastavStav(
      `Kód ${vstupniKod} nevypadá na knihu ani na časopis — čekají se čísla ` +
      'začínající 978 nebo 979 (ISBN), případně 977 (ISSN). Zkuste jiný kód.'
    );
    return;
  }
  if (jeNabidkaOtevrena()) {
    nastavStav('Nejdřív dořešte načtenou knihu — přidejte ji, nebo zavřete nabídku.');
    return;
  }

  zavriRucne();
  const kod = rozpoznane?.kod || '';
  skener.potvrzeniSkenu();
  otevriNabidku(kod, zHledani, puvod || (zHledani ? 'nazev' : 'sken'));
  nastavStav(kod
    ? `Načteno ${naFormat(kod)} — potvrďte přidání.`
    : 'Kniha bez čísla — zkontrolujte údaje a potvrďte přidání.');
  await vyhledejDoNabidky(kod, zHledani);
}

btnPridat.addEventListener('click', () => pridejZNabidky());
btnPridatHledat.addEventListener('click', () => pridejZNabidky({ potomHledat: true }));

btnZahodit.addEventListener('click', () => {
  const isbn = rozpoznej(poleNabidky.isbn.value)?.kod;
  zavriNabidku();
  nastavStav(isbn
    ? `Titul ${naFormat(isbn)} jsme nepřidali — nic se neuložilo. Můžete skenovat dál.`
    : 'Zavřeno — nic se neuložilo.');
});

btnZpetHledat.addEventListener('click', () => {
  const isbn = rozpoznej(poleNabidky.isbn.value)?.kod;
  zavriNabidku();
  zpetNaHledani();
  nastavStav(isbn
    ? `Titul ${naFormat(isbn)} jsme nepřidali. Vyberte z nabídky jiný, nebo hledejte znovu.`
    : 'Kniha se nepřidala. Vyberte z nabídky jinou, nebo hledejte znovu.');
});

btnZnovu.addEventListener('click', async () => {
  const rozpoznane = rozpoznej(poleNabidky.isbn.value);
  if (!rozpoznane) {
    if (!poleNabidky.isbn.value.trim()) {
      return oznam('Bez čísla není podle čeho hledat — údaje dopište ručně.', 'varovani');
    }
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

poleNabidky.isbn.addEventListener('input', () => { zkontrolujDuplicitu(); vykresliShrnuti(); });

for (const pole of ['nazev', 'autor', 'rok', 'vydavatel', 'misto']) {
  poleNabidky[pole].addEventListener('input', () => {
    rucneUpravena.add(pole);
    vykresliShrnuti();
    zkontrolujDuplicitu();
  });
}

poleNabidky.kusu.addEventListener('input', zkontrolujDuplicitu);

poleNabidky.isbn.addEventListener('keydown', (u) => {
  if (u.key !== 'Enter') return;
  u.preventDefault();
  btnZnovu.click();
});

for (const [nazev, pole] of Object.entries(poleNabidky)) {
  if (nazev === 'isbn' || pole.tagName === 'SELECT') continue;
  pole.addEventListener('keydown', (u) => {
    if (u.key !== 'Enter') return;
    u.preventDefault();
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

/* ------------------------------------------------------------ detail knihy */

let aktualniDetailId = null;

function ziskejDetailKnihu() {
  return ulozne.vsechny().find((k) => k.id === aktualniDetailId) || null;
}

function vykresliDetailShrnuti() {
  const kniha = ziskejDetailKnihu();
  const nazev = poleDetailu.nazev.value.trim();
  const autor = poleDetailu.autor.value.trim();
  const cislo = poleDetailu.isbn.value.trim();
  const rok = poleDetailu.rok.value.trim();
  const vydavatel = poleDetailu.vydavatel.value.trim();

  detailShrnutiNazev.textContent = nazev || 'Bez názvu';
  detailShrnutiAutor.textContent = autor;
  detailShrnutiCislo.textContent = [cislo || 'bez čísla', vydavatel, rok].filter(Boolean).join(' · ');

  const obalka = kniha?.obalka;
  detailObalka.hidden = !obalka;
  detailIniciala.hidden = !!obalka;
  if (obalka) {
    detailObalka.src = obalka;
    detailObalka.onerror = () => { detailObalka.hidden = true; detailIniciala.hidden = false; };
  } else {
    detailIniciala.textContent = iniciala(nazev);
    detailIniciala.style.background = barvaZeSlova(nazev + autor);
  }
}

function otevriDetail(id) {
  const kniha = ulozne.vsechny().find((k) => k.id === id);
  if (!kniha) return;
  aktualniDetailId = id;

  poleDetailu.nazev.value = kniha.nazev || '';
  poleDetailu.autor.value = kniha.autor || '';
  poleDetailu.isbn.value = naFormat(ulozne.cisloZaznamu(kniha));
  poleDetailu.rok.value = kniha.rok || '';
  poleDetailu.vydavatel.value = kniha.vydavatel || '';
  poleDetailu.misto.value = kniha.misto || '';
  poleDetailu.poznamka.value = kniha.poznamka || '';
  detailKusuEl.textContent = String(Number(kniha.kusu) || 1);

  naplnVyberPolicek(poleDetailu.policka, ulozne.upravNazevPolicky(kniha.policka), { sNovou: true });
  vykresliDetailShrnuti();

  sheetDetail.hidden = false;
  document.body.classList.add('bez-posunu');
}

/**
 * Zapíše, co je zrovna v polích detailu.
 *
 * Pole se jinak ukládají až při odchodu z nich (událost change). Zavřít
 * detail jde ale i klávesou Esc, a ta z pole neodchází — rozepsaná poznámka
 * by se tím ztratila. ISBN se tudy záměrně neukládá: to má vlastní pravidla
 * (platnost, kolize na poličce, nové dohledání údajů) a řeší si je samo.
 */
function ulozRozepsanaPoleDetailu() {
  const kniha = ziskejDetailKnihu();
  if (!kniha) return;
  const zmeny = {};
  for (const [pole, vstup] of Object.entries(poleDetailu)) {
    if (pole === 'isbn' || pole === 'policka') continue;
    const nova = vstup.value.trim();
    if (nova !== (kniha[pole] || '')) zmeny[pole] = nova;
  }
  if (Object.keys(zmeny).length) {
    ulozne.uprav(kniha.id, zmeny);
    vykresli();
  }
}

function zavriDetail() {
  ulozRozepsanaPoleDetailu();
  sheetDetail.hidden = true;
  aktualniDetailId = null;
  if (!jeNejakySheetOtevreny()) document.body.classList.remove('bez-posunu');
}

prvek('btn-detail-hotovo').addEventListener('click', zavriDetail);

for (const [pole, vstup] of Object.entries(poleDetailu)) {
  if (pole === 'isbn' || pole === 'policka') continue;
  vstup.addEventListener('input', vykresliDetailShrnuti);
  vstup.addEventListener('change', () => {
    const kniha = ziskejDetailKnihu();
    if (!kniha) return;
    const nova = vstup.value.trim();
    if (nova === (kniha[pole] || '')) return;
    ulozne.uprav(kniha.id, { [pole]: nova });
    vykresli();
  });
}

poleDetailu.policka.addEventListener('change', () => {
  const nova = vyresVolbuPolicky(poleDetailu.policka);
  if (nova === null) return;
  const kniha = ziskejDetailKnihu();
  if (!kniha) return;
  const puvodni = ulozne.upravNazevPolicky(kniha.policka);
  if (nova === puvodni) return;

  const vysledek = ulozne.presunNaPolicku(kniha.id, nova);
  obnovPolicky();
  vykresli();
  oznam(
    vysledek?.slouceno
      ? `Na poličce „${nova || 'bez poličky'}“ už tenhle titul byl — kusy se sečetly.`
      : `Přesunuto na „${nova || 'bez poličky'}“.`,
    vysledek?.slouceno ? 'varovani' : 'uspech'
  );
  if (vysledek?.slouceno) zavriDetail();
});

/** Úprava ISBN v detailu — stejná pravidla jako u potvrzování: platné číslo,
 *  bez kolize s jiným titulem na téže poličce, po opravě dohledání znovu. */
async function upravIsbnKnihy(kniha, zadaneRaw, { vzdy = false } = {}) {
  const zadane = zadaneRaw.trim();
  const rozpoznane = rozpoznej(zadane);

  if (!zadane) {
    if (!kniha.isbn && !kniha.cnb) return;
    ulozne.uprav(kniha.id, { isbn: '', cnb: '' });
    oznam('Číslo odstraněno — kniha zůstala bez něj.', 'varovani');
    vykresli();
    if (aktualniDetailId === kniha.id) otevriDetail(kniha.id);
    return;
  }

  if (!rozpoznane) {
    const navrh = navrhniOpravu(zadane);
    oznam('To není platné ISBN, ISSN ani ČNB — zkontrolujte číslice.', 'chyba');
    if (navrh) {
      poleDetailu.isbn.value = naFormat(navrh);
      nastavStav(`U ${zadane} nesedí kontrolní číslice — podle zbytku čísla by mělo být ${naFormat(navrh)}.`);
    } else {
      poleDetailu.isbn.value = naFormat(ulozne.cisloZaznamu(kniha));
    }
    return;
  }

  const { kod: nove, cislo } = rozpoznane;
  if (!vzdy && nove === kniha.isbn) return;

  const shoda = ulozne.podleIsbn(nove, kniha.policka);
  if (shoda && shoda.id !== kniha.id) {
    oznam(`Titul s tímto ${cislo} už na téhle poličce je.`, 'varovani');
    poleDetailu.isbn.value = naFormat(ulozne.cisloZaznamu(kniha));
    return;
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
    } else {
      oznam(`${cislo} opraveno, titul se ale nenašel — doplňte údaje ručně.`, 'varovani');
    }
  } finally {
    cekaSeNaVyhledani.delete(nove);
    vykresli();
    if (aktualniDetailId === kniha.id) otevriDetail(kniha.id);
  }
}

const btnKlavesniceDetail = prvek('btn-klavesnice-detail');

poleDetailu.isbn.addEventListener('blur', (u) => {
  // Odchod z pole na přepínač klávesnice se nepočítá — číslo je v tu chvíli
  // rozepsané právě proto, že k němu má přibýt koncové X.
  if (u.relatedTarget === btnKlavesniceDetail) return;
  if (poleDetailu.isbn.dataset.prepinamKlavesnici) return;
  const kniha = ziskejDetailKnihu();
  if (kniha) upravIsbnKnihy(kniha, poleDetailu.isbn.value);
});

poleDetailu.isbn.addEventListener('keydown', (u) => {
  if (u.key === 'Enter') { u.preventDefault(); poleDetailu.isbn.blur(); }
});

prvek('btn-detail-znovu').addEventListener('click', () => {
  const kniha = ziskejDetailKnihu();
  if (kniha) upravIsbnKnihy(kniha, poleDetailu.isbn.value, { vzdy: true });
});

prvek('btn-detail-plus').addEventListener('click', () => {
  const kniha = ziskejDetailKnihu();
  if (!kniha) return;
  const novy = (Number(kniha.kusu) || 1) + 1;
  ulozne.nastavKusu(kniha.id, novy);
  detailKusuEl.textContent = String(novy);
  vykresli();
});

prvek('btn-detail-minus').addEventListener('click', () => {
  const kniha = ziskejDetailKnihu();
  if (!kniha) return;
  const novy = Math.max(1, (Number(kniha.kusu) || 1) - 1);
  ulozne.nastavKusu(kniha.id, novy);
  detailKusuEl.textContent = String(novy);
  vykresli();
});

prvek('btn-detail-smazat').addEventListener('click', () => {
  const kniha = ziskejDetailKnihu();
  if (!kniha) return;
  const snimek = ulozne.snimek();
  ulozne.smaz(kniha.id);
  vybrane.delete(kniha.id);
  nedavnoPridane = nedavnoPridane.filter((id) => id !== kniha.id);
  zavriDetail();
  vykresli();
  oznam(`Smazáno: ${kniha.nazev || naFormat(kniha.isbn) || 'kniha bez čísla'}.`, 'varovani', snimek);
});

/* ------------------------------------------------------------ skenování */

async function prepniSkenovani() {
  if (skener.jeSpusten()) {
    skener.zastav(video);
    ocr.uklid();
    kameraPlaceholder.hidden = false;
    btnSvetlo.hidden = true;
    btnCislo.hidden = true;
    btnKod.hidden = true;
    rezimCisla = false;
    ctecka.hidden = true;
    hledacek.hidden = true;
    skenerCara.hidden = true;
    stavovaTecka.hidden = true;
    btnCislo.textContent = 'Číslo z tiráže';
    btnCislo.classList.remove('aktivni');
    btnSkenovat.textContent = '📷 Spustit skenování';
    nastavStav('Skenování zastaveno.');
    return;
  }

  btnSkenovat.disabled = true;
  nastavStav('Zapínám kameru …');

  try {
    kameraPlaceholder.hidden = true;
    await skener.spust(video, zpracujKod);
    btnSkenovat.textContent = '⏹ Zastavit skenování';
    btnSvetlo.hidden = !skener.maSvetlo();
    btnCislo.hidden = false;
    hledacek.hidden = false;
    skenerCara.hidden = false;
    stavovaTecka.hidden = false;
    nastavStav('Namiřte čárový kód do rámečku. Kniha žádný nemá? Klepněte na „Číslo z tiráže“.');
  } catch (chyba) {
    kameraPlaceholder.hidden = false;
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

/* ------------------------------------------------- přečtení ISBN z čísla */

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
  } catch { /* nastavení proužku není nic kritického */ }
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
  skenerCara.hidden = zapnout || !skener.jeSpusten();
  btnKod.hidden = !zapnout;
  btnCislo.textContent = zapnout ? 'Přečíst číslo' : 'Číslo z tiráže';
  btnCislo.classList.toggle('aktivni', zapnout);
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

function pripojTahani() {
  let druh = null;
  let zacatekY = 0;
  let zacatekHodnota = 0;

  const vyskaObrazu = () => kamera.getBoundingClientRect().height || 1;

  const zacni = (u, novyDruh) => {
    druh = novyDruh;
    zacatekY = u.clientY;
    zacatekHodnota = novyDruh === 'posun' ? prouzek.stred : prouzek.vyska;
    try { u.currentTarget.setPointerCapture?.(u.pointerId); } catch { /* funguje i bez zachycení */ }
    cteckaPruh.classList.add('tahne-se');
    u.preventDefault();
  };

  const tahni = (u) => {
    if (!druh) return;
    const posun = (u.clientY - zacatekY) / vyskaObrazu();
    prouzek = ocr.omezProuzek(druh === 'posun'
      ? { stred: zacatekHodnota + posun, vyska: prouzek.vyska }
      : { stred: prouzek.stred, vyska: zacatekHodnota + posun * 2 });
    vykresliProuzek();
    u.preventDefault();
  };

  const skonci = () => {
    if (!druh) return;
    druh = null;
    cteckaPruh.classList.remove('tahne-se');
    ulozProuzek();
  };

  cteckaPruh.addEventListener('pointerdown', (u) => zacni(u, 'posun'));
  cteckaUchyt.addEventListener('pointerdown', (u) => { u.stopPropagation(); zacni(u, 'vyska'); });

  for (const p of [cteckaPruh, cteckaUchyt]) {
    p.addEventListener('pointermove', tahni);
    p.addEventListener('pointerup', skonci);
    p.addEventListener('pointercancel', skonci);
  }
}

pripojTahani();

btnKod.addEventListener('click', () => nastavRezimCisla(false));

btnCislo.addEventListener('click', async () => {
  if (!skener.jeSpusten()) return;
  if (!rezimCisla) return nastavRezimCisla(true);

  btnCislo.disabled = true;
  const puvodniPopis = btnCislo.textContent;
  btnCislo.textContent = 'Čtu…';

  try {
    const { isbn, text } = await ocr.prectiIsbnZObrazu(video, nastavStav, prouzek);

    if (isbn) {
      await zpracujKod(isbn);
    } else if (text) {
      oznam('Číslo ISBN se v proužku nenašlo.', 'varovani');
      nastavStav(
        `Přečteno „${text.replace(/\s+/g, ' ').slice(0, 40)}“, ale platné ISBN v tom není. ` +
        'Zkuste proužek zaměřit přesněji jen na řádek s číslem, jít blíž, přisvítit, ' +
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

/* ------------------------------------------------------------ ruční zadání a hledání */

function otevriRucne(rezim, { zaostri = true } = {}) {
  rezimIsbn.hidden = rezim !== 'isbn';
  rezimNazev.hidden = rezim !== 'nazev';
  rucneNadpis.textContent = rezim === 'nazev' ? 'Hledat podle názvu' : 'Zadat ISBN ručně';
  sheetRucne.hidden = false;
  document.body.classList.add('bez-posunu');
  if (zaostri) (rezim === 'nazev' ? prvek('vstup-nazev') : prvek('vstup-isbn')).focus();
}

function zavriRucne() {
  if (sheetRucne.hidden) return;
  sheetRucne.hidden = true;
  if (!jeNejakySheetOtevreny()) document.body.classList.remove('bez-posunu');
}

prvek('btn-rucne-otevrit').addEventListener('click', () => otevriRucne('isbn'));
prvek('btn-nazev-otevrit').addEventListener('click', () => otevriRucne('nazev'));
prvek('btn-rucne-zavrit').addEventListener('click', zavriRucne);

prvek('form-rucne').addEventListener('submit', async (u) => {
  u.preventDefault();
  const vstup = prvek('vstup-isbn');
  const hodnota = vstup.value.trim();
  if (!hodnota) return;

  if (!rozpoznej(hodnota)) {
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
  await zpracujKod(hodnota, null, 'isbn');
});

/**
 * Přepínač klávesnice u polí s číslem — pro čísla končící písmenem X.
 *
 * Klávesnici na telefonu nejde přepnout jinak než odklepnutím a novým
 * zaostřením pole. Přepínač se proto na okamžik odhlásí z pole — a protože
 * v detailu knihy visí na odchodu z pole uložení ISBN, dá o té chvilce vědět
 * příznakem. Bez něj by se rozepsané číslo („80-7203-068“ těsně předtím, než
 * k němu přibude X) vyhodnotilo jako neplatné a smazalo — tedy přesně
 * v okamžiku, kvůli kterému tlačítko existuje.
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
    vstup.dataset.prepinamKlavesnici = '1';
    vstup.blur();
    vstup.focus();
    delete vstup.dataset.prepinamKlavesnici;
  });
}

pripojPrepinacKlavesnice(prvek('vstup-isbn'), prvek('btn-klavesnice'));
pripojPrepinacKlavesnice(poleNabidky.isbn, prvek('btn-klavesnice-nabidka'));
pripojPrepinacKlavesnice(poleDetailu.isbn, prvek('btn-klavesnice-detail'));

/* --------------------------------------- hledání podle údajů o knize */

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

  const cislo = ulozne.cisloZaznamu(nalez);

  radek('vysledek-nazev', nalez.nazev);
  const popis = [nalez.autor, nalez.rok, nalez.vydavatel, nalez.misto].filter(Boolean).join(' · ');
  if (popis) radek('vysledek-popis', popis);
  radek('vysledek-isbn', `${naFormat(cislo)} · ${nalez.zdroj}`);
  const stavPolozky = radek('vysledek-stav', '');

  const obnovStav = () => {
    const vytisky = ulozne.vsudePodleIsbn(cislo);
    const kusu = vytisky.reduce((soucet, k) => soucet + (Number(k.kusu) || 1), 0);
    const mista = [...new Set(vytisky.map((k) => ulozne.upravNazevPolicky(k.policka)))].filter(Boolean);
    stavPolozky.textContent = vytisky.length
      ? `✓ už v knihovně (${kusu}×)${mista.length ? ` — ${mista.join(', ')}` : ''}`
      : '';
  };
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
  zavrit.className = 'odkaz-tlacitko';
  zavrit.textContent = 'Skrýt';
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

const poleHledani = {
  nazev: prvek('vstup-nazev'),
  autor: prvek('vstup-autor'),
  vydavatel: prvek('vstup-vydavatel'),
  rok: prvek('vstup-rok'),
};

function vymazPoleHledani() {
  for (const pole of Object.values(poleHledani)) pole.value = '';
  vykresliNalezy([]);
}

prvek('btn-vymazat-hledani').addEventListener('click', () => {
  vymazPoleHledani();
  poleHledani.nazev.focus();
  nastavStav('Pole hledání jsou prázdná — můžete zadat nový dotaz.');
});

prvek('form-podle-nazvu').addEventListener('submit', async (u) => {
  u.preventDefault();
  const dotaz = Object.fromEntries(Object.entries(poleHledani).map(([klic, pole]) => [klic, pole.value.trim()]));

  if (!Object.values(dotaz).some(Boolean)) {
    oznam('Vyplňte aspoň jedno pole — název, autora, nakladatelství, nebo rok.', 'varovani');
    return;
  }
  if (dotaz.rok && !/^\d{4}$/.test(dotaz.rok)) {
    oznam('Rok zadejte jako čtyři číslice, třeba 1998.', 'varovani');
    nastavStav(`„${dotaz.rok}“ není rok. Napište letopočet čtyřmi číslicemi, nebo pole nechte prázdné.`);
    return;
  }

  const tlacitko = u.target.querySelector('button[type=submit]');
  const puvodniPopis = tlacitko.textContent;
  tlacitko.disabled = true;
  tlacitko.textContent = 'Hledám…';
  vykresliNalezy([]);
  nastavStav('Hledám v databázích knih …');

  try {
    const { vysledky: nalezy, selhalyZdroje, nedostupne, mimoRok } = await hledejPodleTextu(dotaz);

    const poznamky = [];
    if (selhalyZdroje.length) poznamky.push(`Neodpověděly: ${selhalyZdroje.join(', ')}.`);
    if (mimoRok) {
      poznamky.push(
        `Dalších ${pocetSlovem(mimoRok, 'nález', 'nálezy', 'nálezů')} vyšlo v jiném roce ` +
        `než ${dotaz.rok} — do nabídky se nedostaly. Bez roku se ukážou všechny.`
      );
    }
    const poznamka = poznamky.join(' ');
    vykresliNalezy(nalezy, poznamka);

    if (nalezy.length) {
      oznam(`Nalezeno: ${pocetSlovem(nalezy.length, 'kniha', 'knihy', 'knih')}.`, 'uspech');
      nastavStav('Vyberte z nabídky svou knihu — klepnutím se přidá do knihovny.');
    } else if (nedostupne) {
      oznam('Databáze knih neodpověděly.', 'chyba');
      nastavStav(`Hledání se nepodařilo (${selhalyZdroje.join(', ')}). Zkontrolujte připojení.`);
    } else {
      oznam('Nic se nenašlo.', 'varovani');
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

/* ------------------------------------------------------- klávesa Escape */

document.addEventListener('keydown', (u) => {
  if (u.key !== 'Escape') return;
  if (jeNabidkaOtevrena()) return btnZahodit.click();
  if (!sheetDetail.hidden) return zavriDetail();
  if (!sheetRucne.hidden) return zavriRucne();
  if (!sheetPolicky.hidden) return zavriSheetPolicky();
});

/* ------------------------------------------------------- export a import */

function casovaZnacka() {
  return zaloha.znacka();
}

function knihyKZaloze() {
  const knihy = ulozne.vsechny();
  if (!knihy.length) {
    oznam('Knihovna je prázdná.', 'varovani');
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
      'Do knihovního systému stačí poslat je — celá tabulka by knihovnu zdvojila.';
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

  const snimek = ulozne.snimek();
  ulozne.oznacOdeslane(nove.map((k) => k.id));
  vykresli();
  vykresliStavZalohy();
  oznam(
    `Staženo ${pocetSlovem(nove.length, 'nová kniha', 'nové knihy', 'nových knih')} a označeno za odeslané.`,
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

prvek('soubor-import').addEventListener('change', async (u) => {
  const soubor = u.target.files?.[0];
  if (!soubor) return;

  const snimek = ulozne.snimek();
  try {
    const text = await soubor.text();
    const jeCsv = /\.csv$/i.test(soubor.name) || !text.trim().startsWith('[');

    let data;
    if (jeCsv) {
      data = ulozne.zCsv(text);
      if (!data.length) throw new Error('V CSV se nenašly rozpoznatelné sloupce ani řádky.');
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
    u.target.value = '';
  }
});

prvek('btn-smazat-vse').addEventListener('click', () => {
  const kolik = ulozne.vsechny().length;
  if (!kolik) return;
  if (!confirm(`Opravdu smazat celou knihovnu (${kolik} záznamů)? Poličky zůstanou.`)) return;

  const snimek = ulozne.snimek();
  ulozne.smazVse();
  vybrane.clear();
  nedavnoPridane = [];
  obnovPolicky();
  vykresli();
  oznam('Knihovna vymazána. Poličky zůstaly.', 'varovani', snimek);
});

/* ---------------------------------------------- kdy se zálohovalo */

const stavZalohy = prvek('stav-zalohy');

function vykresliStavZalohy() {
  stavZalohy.textContent = zaloha.popisPosledniZalohy();
}

/* ------------------------------------------------------------ start */

document.addEventListener('visibilitychange', () => {
  if (document.hidden && skener.jeSpusten()) prepniSkenovani();
});

const slouceneNaStartu = ulozne.uklidDuplicity();
if (slouceneNaStartu) {
  oznam(`Sloučeno ${slouceneNaStartu} duplicitních záznamů podle ISBN.`, 'varovani');
}

const opraveneNazvy = ulozne.uklidNazvy();
if (opraveneNazvy) {
  oznam(
    `U ${opraveneNazvy} knih${opraveneNazvy === 1 ? 'y' : ''} se z názvu odstranil ` +
    'počet kusů — název prosím doplňte.',
    'varovani'
  );
}

ulozne.uklidPolicky();
obnovPolicky();

ulozne.zajistiTrvaleUloziste().then(({ podporovano, trvale }) => {
  if (podporovano && !trvale) {
    console.info('Prohlížeč zatím nepřidělil trvalé úložiště — dělejte si zálohy.');
  }
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* aplikace funguje i bez offline režimu */ });
  });
}

vykresli();
vykresliStavZalohy();
