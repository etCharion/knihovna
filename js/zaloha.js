/**
 * Kdy naposledy proběhla záloha tabulky.
 *
 * Tabulka sama žije v paměti jednoho prohlížeče (localStorage). Když se
 * telefon ztratí nebo se smažou data stránky, je bez zálohy nenávratně po ní.
 * Aplikace je přitom pouhá statická stránka bez serveru, takže data sama od
 * sebe nikam neposílá — záloha je vždycky soubor, který si člověk stáhne
 * (CSV pro Excel a knihovní systém, JSON pro návrat zpět do aplikace)
 * a uloží si ho jinam: na Disk, do e-mailu, na flashku.
 *
 * Tenhle modul si k tomu pamatuje jedinou věc — kdy a s kolika knihami se
 * zálohovalo naposledy — a umí z toho složit větu pro uživatele. Bez ní by se
 * dalo snadno přehlédnout, že se od poslední zálohy tabulka změnila.
 */

import * as ulozne from './storage.js';

const KLIC_STAVU = 'knihovna.zaloha.v1';

export function znacka(datum = new Date()) {
  return datum.toISOString().slice(0, 10);
}

function sklonuj(pocet, jedna, dve, vic) {
  if (pocet === 1) return jedna;
  return pocet >= 2 && pocet <= 4 ? dve : vic;
}

function zapamatuj(kam, knihy = ulozne.vsechny()) {
  try {
    localStorage.setItem(KLIC_STAVU, JSON.stringify({
      kdy: new Date().toISOString(),
      pocet: knihy.length,
      kam,
    }));
  } catch {
    /* bez zápisu se jen nezobrazí datum poslední zálohy */
  }
}

/** Export do souboru je záloha — hlásí se sem z obsluhy tlačítek. */
export function zaznamenejExport(knihy = ulozne.vsechny()) {
  zapamatuj('soubor v zařízení', knihy);
}

export function posledniZaloha() {
  try {
    const stav = JSON.parse(localStorage.getItem(KLIC_STAVU) || 'null');
    return stav && stav.kdy ? stav : null;
  } catch {
    return null;
  }
}

/**
 * Věta pro uživatele o tom, jak je na tom se zálohou. Záměrně říká i to,
 * že se tabulka od zálohy změnila — jinak by se dala snadno přehlédnout.
 */
export function popisPosledniZalohy(pocetNyni = ulozne.vsechny().length) {
  const stav = posledniZaloha();
  if (!stav) {
    return pocetNyni
      ? 'Zálohu jste ještě nedělali — tabulka je jen v tomhle zařízení.'
      : 'Tabulka je prázdná, zálohovat není co.';
  }

  const kdy = new Date(stav.kdy).toLocaleString('cs-CZ', {
    day: 'numeric', month: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });
  const kolik = `${stav.pocet} ${sklonuj(stav.pocet, 'kniha', 'knihy', 'knih')}`;
  const zmena = pocetNyni !== stav.pocet
    ? ` Od té doby se tabulka změnila — teď má ${pocetNyni} ` +
      `${sklonuj(pocetNyni, 'knihu', 'knihy', 'knih')}.`
    : '';

  return `Poslední záloha: ${kdy} — ${kolik}, ${stav.kam}.${zmena}`;
}
