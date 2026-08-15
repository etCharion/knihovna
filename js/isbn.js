import isbn3 from '../vendor/isbn3.min.js';

/**
 * Práce s čísly, kterými se knihy a časopisy rozlišují.
 *
 * Čárový kód na knize je téměř vždy EAN-13, který začíná prefixem 978 nebo 979
 * (tzv. Bookland). Takový kód je zároveň platné ISBN-13. Starší knihy mohou mít
 * na obálce ISBN-10, které se dá na ISBN-13 převést.
 *
 * Časopisy a jiná periodika mají místo ISBN osmimístné ISSN a jejich čárový
 * kód začíná prefixem 977. ISSN se z takového kódu dá dopočítat, viz níže.
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

/* ------------------------------------------------------------ periodika */

/**
 * Kontrolní číslice ISSN se počítá z prvních sedmi číslic stejnou úvahou
 * jako u ISBN-10 — modulo 11, takže jí i tady může vyjít deset a píše se X.
 */
function kontrolniCisliceIssn(sedm) {
  let soucet = 0;
  for (let i = 0; i < 7; i++) {
    soucet += Number(sedm[i]) * (8 - i);
  }
  const zbytek = (11 - (soucet % 11)) % 11;
  return zbytek === 10 ? 'X' : String(zbytek);
}

export function jeIssn(kod) {
  const k = ocisti(kod);
  if (!/^\d{7}[0-9X]$/.test(k)) return false;
  return kontrolniCisliceIssn(k) === k[7];
}

/** Osm znaků ISSN bez pomlčky, nebo null když to ISSN není. */
export function normalizujIssn(kod) {
  const k = ocisti(kod);
  return jeIssn(k) ? k : null;
}

/**
 * ISSN z čárového kódu periodika.
 *
 * Kód je EAN-13 s prefixem 977: 977 + prvních sedm číslic ISSN + dvojčíslí
 * varianty (u nás skoro vždy 00) + kontrolní číslice celého EAN. Kontrolní
 * číslice ISSN se do kódu netiskne, protože její místo zabralo to dvojčíslí —
 * dopočítá se ze sedmi číslic, které v kódu jsou.
 */
export function issnZKodu(kod) {
  const k = ocisti(kod);
  if (!/^\d{13}$/.test(k) || !k.startsWith('977')) return null;
  if (kontrolniCislice13(k.slice(0, 12)) !== k[12]) return null;
  const sedm = k.slice(3, 10);
  return sedm + kontrolniCisliceIssn(sedm);
}

/* --------------------------------------------- knihy z doby před ISBN */

/**
 * Číslo České národní bibliografie, například `cnb000123456`.
 *
 * Do systému ISBN se Československo zapojilo až v roce 1989, takže starší
 * knihy žádné ISBN nemají a nikdy mít nebudou. Národní knihovna jim ale
 * přiděluje číslo ČNB — celostátně jedinečné a stálé — a v katalozích jsou
 * pod ním. Pro takovou knihu je to jediné rozumné číslo, pod kterým ji
 * tabulka může vést.
 *
 * Kontrolní číslici ČNB nemá, takže se ověřuje jen tvar. Překlep se tu na
 * rozdíl od ISBN nepozná — proto se ČNB nikdy nebere z rozpoznávání textu
 * ani ze skeneru, jen z katalogu nebo z ručního opsání.
 */
export function jeCnb(kod) {
  return /^cnb\d{6,12}$/.test(String(kod || '').toLowerCase().replace(/[\s-]/g, ''));
}

export function normalizujCnb(kod) {
  const k = String(kod || '').toLowerCase().replace(/[\s-]/g, '');
  return jeCnb(k) ? k : null;
}

/**
 * Jediné místo, kde se rozhoduje, co vlastně přišlo ze skeneru, z katalogu
 * nebo z ručního zadání — a jak se tomu číslu říká.
 *
 * Aplikace vede knihy i časopisy v jedné tabulce, každý řádek pod jedním
 * číslem. Všechno ostatní si proto vystačí s vrácenou dvojicí a jednotlivé
 * druhy čísel rozlišovat nemusí.
 */
export function rozpoznej(kod) {
  if (jeKnizniKod(kod)) return { kod: normalizuj(kod), cislo: 'ISBN' };

  const zKodu = issnZKodu(kod);
  if (zKodu) return { kod: zKodu, cislo: 'ISSN' };

  const issn = normalizujIssn(kod);
  if (issn) return { kod: issn, cislo: 'ISSN' };

  const cnb = normalizujCnb(kod);
  if (cnb) return { kod: cnb, cislo: 'ČNB' };

  return null;
}

/* --------------------------------------------- když číslo neprojde kontrolou */

/**
 * Číslo má správný tvar, ale nesedí kontrolní číslice — čím to nejspíš mělo být?
 *
 * Poslední číslice ISBN i ISSN je kontrolní: dopočítává se z těch před ní tak,
 * aby vážený součet vyšel beze zbytku. Když číslo neprojde, je skoro vždycky
 * chyba jinde než v ní — přehozené dvě číslice, špatně opsaná jedna, nebo
 * překlep. Kontrolní číslice se ale dá z těch ostatních spočítat, takže jde
 * říct, jak by číslo vypadalo, kdyby byl přehmat právě v ní. Uživatel si to
 * pak porovná s knihou a nemusí hádat.
 *
 * Vrací návrh v normalizovaném tvaru, nebo null, když se nabídnout nedá nic —
 * třeba u kódů od zboží, kde by návrh jen mátl.
 */
export function navrhniOpravu(kod) {
  const k = ocisti(kod);

  if (/^\d{9}[0-9X]$/.test(k)) {
    const opravene = k.slice(0, 9) + kontrolniCislice10(k.slice(0, 9));
    return opravene === k ? null : isbn10Na13(opravene);
  }

  if (/^\d{13}$/.test(k) && /^97[789]/.test(k)) {
    const opravene = k.slice(0, 12) + kontrolniCislice13(k.slice(0, 12));
    if (opravene === k) return null;
    return k.startsWith('977') ? issnZKodu(opravene) : opravene;
  }

  if (/^\d{7}[0-9X]$/.test(k)) {
    const opravene = k.slice(0, 7) + kontrolniCisliceIssn(k.slice(0, 7));
    return opravene === k ? null : opravene;
  }

  return null;
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
 * ISSN je proti tomu jednoduché: dělí se vždy uprostřed na 1234-5678.
 *
 * Pomlčky mají i praktický vedlejší efekt: Excel takový zápis bere jako text,
 * kdežto holé třináctimístné číslo si přepíše na 9,78807E+12.
 */
export function naFormat(isbn13) {
  // ČNB se nedělí a `ocisti` by z něj vyhodilo písmena, takže rovnou stranou.
  const cnb = normalizujCnb(isbn13);
  if (cnb) return cnb;

  const k = ocisti(isbn13);
  if (jeIssn(k)) return `${k.slice(0, 4)}-${k.slice(4)}`;
  if (!/^\d{13}$/.test(k)) return k;

  // Nová nebo dosud nepřidělená čísla (typicky prefix 979) v rozsazích být
  // nemusí. Pak se oddělí aspoň prefix, který platí vždy.
  return isbn3.hyphenate(k) || `${k.slice(0, 3)}-${k.slice(3)}`;
}
