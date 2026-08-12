import isbn3 from '../vendor/isbn3.min.js';

/**
 * Práce s ISBN / EAN kódy knih.
 *
 * Čárový kód na knize je téměř vždy EAN-13, který začíná prefixem 978 nebo 979
 * (tzv. Bookland). Takový kód je zároveň platné ISBN-13. Starší knihy mohou mít
 * na obálce ISBN-10, které se dá na ISBN-13 převést.
 */

/** Odstraní pomlčky, mezery a další balast. */
export function ocisti(kod) {
  return String(kod || '').toUpperCase().replace(/[^0-9X]/g, '');
}

/** Kontrolní číslice pro ISBN-13 / EAN-13 (prvních 12 číslic). */
function kontrolniCislice13(dvanact) {
  let soucet = 0;
  for (let i = 0; i < 12; i++) {
    soucet += Number(dvanact[i]) * (i % 2 === 0 ? 1 : 3);
  }
  return String((10 - (soucet % 10)) % 10);
}

/** Kontrolní číslice pro ISBN-10 (prvních 9 číslic). */
function kontrolniCislice10(devet) {
  let soucet = 0;
  for (let i = 0; i < 9; i++) {
    soucet += Number(devet[i]) * (10 - i);
  }
  const zbytek = (11 - (soucet % 11)) % 11;
  return zbytek === 10 ? 'X' : String(zbytek);
}

export function jeIsbn13(kod) {
  const k = ocisti(kod);
  if (!/^\d{13}$/.test(k)) return false;
  return kontrolniCislice13(k) === k[12];
}

export function jeIsbn10(kod) {
  const k = ocisti(kod);
  if (!/^\d{9}[0-9X]$/.test(k)) return false;
  return kontrolniCislice10(k) === k[9];
}

/** Převede ISBN-10 na ISBN-13 (prefix 978 + nová kontrolní číslice). */
export function isbn10Na13(kod) {
  const k = ocisti(kod);
  if (!jeIsbn10(k)) return null;
  const zaklad = '978' + k.slice(0, 9);
  return zaklad + kontrolniCislice13(zaklad);
}

/**
 * Vezme cokoliv, co přišlo ze skeneru nebo z ručního zadání, a vrátí
 * normalizované ISBN-13, nebo null když to kniha není.
 */
export function normalizuj(kod) {
  const k = ocisti(kod);
  if (jeIsbn13(k)) return k;
  if (jeIsbn10(k)) return isbn10Na13(k);
  return null;
}

/**
 * Je to vůbec knižní čárový kód? Skener chytá i EAN od potravin,
 * takže tohle je první filtr, než se začne něco vyhledávat.
 */
export function jeKnizniKod(kod) {
  const k = normalizuj(kod);
  return !!k && (k.startsWith('978') || k.startsWith('979'));
}

/**
 * Zápis ISBN s pomlčkami tak, jak se tiskne v knihách:
 * prefix – skupina země – nakladatel – titul – kontrolní číslice,
 * například 9788073355067 → 978-80-7335-506-7.
 *
 * Kde přesně pomlčky patří, se u každého nakladatele liší a řídí se to
 * oficiálními rozsahy agentury ISBN. Ty jsou v přibalené knihovně isbn3
 * (vendor/), protože odhadovat je by znamenalo tisknout ISBN špatně.
 *
 * Pomlčky mají i praktický vedlejší efekt: Excel takový zápis bere jako text,
 * kdežto holé třináctimístné číslo si přepíše na 9,78807E+12.
 */
export function naFormat(isbn13) {
  const k = ocisti(isbn13);
  if (!/^\d{13}$/.test(k)) return k;

  // Nová nebo dosud nepřidělená čísla (typicky prefix 979) v rozsazích být
  // nemusí. Pak se oddělí aspoň prefix, který platí vždy.
  return isbn3.hyphenate(k) || `${k.slice(0, 3)}-${k.slice(3)}`;
}
