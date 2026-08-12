/**
 * Uložení tabulky knih do prohlížeče (localStorage).
 *
 * Data zůstávají v telefonu — nikam se neodesílají. Zálohu je potřeba
 * udělat exportem do CSV nebo JSON.
 */

const KLIC = 'knihovna.knihy.v1';

/** Sloupce tabulky — pořadí platí i pro export do CSV. */
export const SLOUPCE = [
  { klic: 'isbn', popis: 'ISBN' },
  { klic: 'nazev', popis: 'Název' },
  { klic: 'autor', popis: 'Autor' },
  { klic: 'rok', popis: 'Rok' },
  { klic: 'vydavatel', popis: 'Vydavatel' },
  { klic: 'stran', popis: 'Stran' },
  { klic: 'jazyk', popis: 'Jazyk' },
  { klic: 'poznamka', popis: 'Poznámka' },
  { klic: 'zdroj', popis: 'Zdroj údajů' },
  { klic: 'pridano', popis: 'Přidáno' },
];

function nacti() {
  try {
    const data = JSON.parse(localStorage.getItem(KLIC) || '[]');
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function uloz(knihy) {
  localStorage.setItem(KLIC, JSON.stringify(knihy));
  return knihy;
}

export function vsechny() {
  return nacti();
}

export function podleIsbn(isbn) {
  return nacti().find((k) => k.isbn === isbn) || null;
}

/**
 * Přidá knihu. Když už ISBN v tabulce je, jen zvýší počet kusů —
 * skenování stejného titulu podruhé tedy nedělá duplicity.
 */
export function pridej(kniha) {
  const knihy = nacti();
  const existujici = knihy.find((k) => k.isbn === kniha.isbn);

  if (existujici) {
    existujici.kusu = (Number(existujici.kusu) || 1) + 1;
    uloz(knihy);
    return { zaznam: existujici, duplicita: true };
  }

  const zaznam = {
    id: crypto.randomUUID(),
    kusu: 1,
    poznamka: '',
    pridano: new Date().toISOString().slice(0, 10),
    ...kniha,
  };
  knihy.unshift(zaznam);
  uloz(knihy);
  return { zaznam, duplicita: false };
}

export function uprav(id, zmeny) {
  const knihy = nacti();
  const kniha = knihy.find((k) => k.id === id);
  if (!kniha) return null;
  Object.assign(kniha, zmeny);
  uloz(knihy);
  return kniha;
}

export function smaz(id) {
  uloz(nacti().filter((k) => k.id !== id));
}

export function smazVse() {
  uloz([]);
}

/**
 * Sloučí importovaná data se stávajícími. Podle ISBN pozná, co už tam je,
 * takže se dá bez obav nahrát i starší záloha.
 */
export function importuj(polozky) {
  const knihy = nacti();
  const znama = new Set(knihy.map((k) => k.isbn));
  let pridano = 0;

  for (const polozka of polozky) {
    if (!polozka?.isbn || znama.has(polozka.isbn)) continue;
    knihy.push({
      id: polozka.id || crypto.randomUUID(),
      kusu: Number(polozka.kusu) || 1,
      poznamka: polozka.poznamka || '',
      pridano: polozka.pridano || new Date().toISOString().slice(0, 10),
      ...polozka,
    });
    znama.add(polozka.isbn);
    pridano++;
  }

  uloz(knihy);
  return pridano;
}

function bunkaCsv(hodnota) {
  const text = String(hodnota ?? '');
  return /[";\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * CSV se středníkem a BOM — v tomhle tvaru ho český Excel otevře
 * rovnou správně rozsloupcované a s diakritikou.
 */
export function doCsv(knihy = nacti()) {
  const hlavicka = [...SLOUPCE.map((s) => s.popis), 'Kusů'];
  const radky = knihy.map((k) => [...SLOUPCE.map((s) => k[s.klic]), k.kusu ?? 1]);
  const text = [hlavicka, ...radky].map((r) => r.map(bunkaCsv).join(';')).join('\r\n');
  return '﻿' + text;
}

export function doJson(knihy = nacti()) {
  return JSON.stringify(knihy, null, 2);
}

export function stahni(obsah, nazevSouboru, typ) {
  const odkaz = document.createElement('a');
  const url = URL.createObjectURL(new Blob([obsah], { type: typ }));
  odkaz.href = url;
  odkaz.download = nazevSouboru;
  document.body.appendChild(odkaz);
  odkaz.click();
  odkaz.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
