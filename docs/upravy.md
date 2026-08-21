# Kuchařka úprav

Postupy pro nejčastější zásahy — v každém receptu je seznam míst, na která se
musí sáhnout, aby změna prošla celou aplikací a nezůstala jen napůl.

Předpokládá se znalost [Architektury](architektura.md) a
[Datového modelu](datovy-model.md).

---

## Přidání nového údaje o knize

Příklad: chceme u knihy vést **edici**.

Údaj musí projít celou cestou — od katalogu přes nabídku a úložiště až do
exportu. Body 1–4 jsou povinné, zbytek podle toho, kde má být údaj vidět.

**1. `js/lookup.js` — odkud se bere**

```js
const POLE = ['nazev', 'autor', 'vydavatel', 'misto', 'rok', 'stran', 'jazyk', 'obalka', 'edice'];
```

a doplnit ho do všech převodních funkcí (`zGoogleBooks`, `zKnihovnyCz`,
`zCrossref`, mapování v `openLibrary…`). Když ho zdroj nezná, vraťte `''` —
klíč tam ať je, aby bylo z kódu vidět, že se na to myslelo.

**2. `js/app.js` — aby se údaj neztratil mezi hledáním a uložením**

```js
const POLE_O_KNIZE = ['nazev', 'autor', 'rok', 'vydavatel', 'misto', 'stran',
                      'jazyk', 'obalka', 'zdroj', 'edice'];
```

Bez tohohle kroku se údaj dohledá, ale při potvrzení knihy zahodí — `nabizenaKniha`
se skládá právě z `POLE_O_KNIZE`.

**3. `index.html` + `js/app.js` — pole v nabídce a v detailu**

Do nabídky (`#prekryv`) i do detailu (`#sheet-detail`) přidat `<input>`
s `id="nabidka-edice"` / `id="detail-edice"` a zapsat je do map `poleNabidky`
a `poleDetailu`. Do `pridejZNabidky()` přidat `edice: poleNabidky.edice.value.trim()`.

Ukládání v detailu i `Enter` na poli fungují samy — obojí se odvíjí od mapy
`poleDetailu`.

**4. `js/storage.js` — export a import**

```js
export const SLOUPCE = [
  …
  { klic: 'edice', popis: 'Edice' },
];

const NAZVY_SLOUPCU = [
  …
  ['edice', ['edice', 'řada']],
];
```

⚠️ **Na pořadí v `NAZVY_SLOUPCU` záleží** — hledá se první shoda podle
podřetězce. Nové slovo, které je součástí jiného (jako „místo“ vs. „umístění“),
patří **před** ten obecnější řádek.

**5. Nepovinně**

- hledání v knihovně: seznam polí ve `vyfiltrovane()` v `app.js`,
- řazení: `<select id="razeni-sloupec">` v `index.html`,
- zobrazení v řádku/kartě: `vytvorRadekKnihovny()`, `vytvorKartuKnihovny()`,
- test do `tests/jednotky.mjs` — aspoň že údaj projde exportem a zpět.

**Migrace se řešit nemusí**: starým záznamům pole prostě chybí a všude se čte
přes `|| ''`.

---

## Přidání dalšího katalogu

Zdroj je objekt v poli `ZDROJE` v `js/lookup.js`. Potřebuje dvě funkce:

```js
/** Hledání podle čísla: vrátí objekt s poli z POLE, nebo null. */
async function mujKatalog(kod) {
  const data = await ziskej(`https://api.mujkatalog.cz/v1/isbn/${encodeURIComponent(kod)}`);
  if (!data?.title) return null;
  return {
    nazev: data.title,
    autor: (data.authors || []).join(', '),
    vydavatel: data.publisher || '',
    misto: data.place || '',
    rok: rok(data.year),
    stran: data.pages ? String(data.pages) : '',
    jazyk: data.language || '',
    obalka: data.cover || '',
  };
}

/** Hledání podle údajů: vrátí pole nálezů (i prázdné). */
async function mujKatalogPodleTextu({ nazev, autor, vydavatel, rok }) { … }

const ZDROJE = [
  { nazev: 'Můj katalog', cisla: ['ISBN', 'ČNB'], hledej: mujKatalog, hledejText: mujKatalogPodleTextu },
  … // ostatní
];
```

Na co si dát pozor:

- **Pořadí v `ZDROJE` rozhoduje při shodě** — u každého pole vyhraje první
  zdroj, který ho vyplnil. České katalogy patří dopředu: většina skenovaných
  knih je česká a jejich záznamy mají správnou diakritiku.
- **`cisla`** říká, na co se zdroje vůbec smí ptát. Kdo nezná ISSN, ať ho tam
  nemá — jinak jen zdrží a v hlášce se objeví jako zdroj, který nic nenašel.
- **Služba musí posílat CORS hlavičky** a fungovat bez API klíče, jinak ji
  prohlížeč na GitHub Pages nezavolá. Ověřte v konzoli, ne odhadem.
- **ISBN se posílá jako holých 13 číslic**, bez pomlček.
- Chybu nechte propadnout ven (`ziskej` ji vyhodí sama) — `najdiKnihu`
  ji zachytí a zdroj se ohlásí jako nedostupný, ostatní běží dál.
- Do `tests/jednotky.mjs` přidejte podvrženou odpověď — testy nesmí sáhnout
  na síť.

**Vypnout zdroj** jde jeho zakomentováním v `ZDROJE`; nikde jinde se
nevyskytuje.

---

## Vlastní klíč ke Google Books

`GOOGLE_KLIC` v `js/lookup.js`. Bez klíče spadají dotazy do sdílené kvóty,
která bývá vyčerpaná (`HTTP 429` → hláška *vyčerpaný limit dotazů*).

Klíč bude v repozitáři veřejně vidět, což je u klíčů pro prohlížeč běžné —
**bezpečné je to ale jedině tehdy, když se v Google Cloud omezí na vlastní
doménu** (HTTP referrer restriction). Návod krok za krokem je v README, sekce
*Google Books a limit dotazů*.

---

## Změna sloupců v exportu CSV

Všechno je v `SLOUPCE` v `js/storage.js` — pořadí sloupců, jejich záhlaví
i případný převod hodnoty:

```js
{ klic: 'isbn', popis: 'Unikátní identifikátor definice knihy (ISBN)', doCsv: naFormat }
```

`popis` je přesně to, co se objeví v hlavičce; názvy jsou zvolené tak, aby
seděly na pole školního knihovního systému při importu. Když píšete pro jiný
systém, přepište `popis` a **zároveň zkontrolujte `NAZVY_SLOUPCU`**, aby se
soubor dal načíst zpátky.

Nepřidávejte prázdné sloupce „pro jistotu“ (cena, signatura, přírůstkové
číslo) — při párování v importu jen matou.

---

## Změna vzhledu

Barvy jsou proměnné na začátku `css/style.css` v `:root` a znovu
v `@media (prefers-color-scheme: dark)`. **Akcentní barvu stačí změnit na
těchhle dvou místech** (`--hlavni`, `--hlavni-text`, `--hlavni-jemne`), zbytek
souboru sahá jen na proměnnou. Komentář u nich nabízí čtyři vyzkoušené varianty.

Výjimka: `--uspech` (zelená) je vyhrazená pro „odesláno do knihovního systému“
a s akcentem se schválně nemění — jinak by odznak odeslané knihy zanikl.

Písma jsou v `vendor/fonts/` a připojují se `@font-face` deklaracemi nahoře
v `style.css`; čeština potřebuje podmnožiny **latin i latin-ext**.

Rozvržení pro iPad a počítač (skener a knihovna vedle sebe) je jediná media
query na konci souboru.

---

## Přidání nového souboru do aplikace

Nový `js/*.js` nebo jiný soubor, bez kterého se aplikace nespustí, **musí do
seznamu `ZAKLAD` v `sw.js`** — jinak nebude fungovat offline režim.

Zároveň zvyšte `VERZE` (`knihovna-v9` → `knihovna-v10`), aby se smazaly staré
cache. Velké soubory (jednotky MB) do `ZAKLAD` nedávejte — načítejte je až
při použití, jak to dělá Tesseract v `ocr.js`.

Pokud jde o soubor s testovanou logikou, přidejte ho i do seznamu kopírovaných
částí v `tests/aktualizace.mjs`.

---

## Přidání nové obrazovky (záložky)

1. `index.html`: nová `<section class="obrazovka" id="obrazovka-…"
   data-obrazovka="…" hidden>` a tlačítko v `<nav class="spodni-nav">`
   s `data-cil="…"`.
2. `js/app.js`: doplnit název do `const OBRAZOVKY = ['skener', 'knihovna', 'vic']`.
3. `css/style.css`: mřížka spodní navigace počítá s počtem tlačítek — zkontrolujte
   sekci *spodní navigace* a media query pro široké displeje, kde se záložky
   chovají jinak.

---

## Výměna knihovny ve `vendor/`

Knihovny jsou nakopírované schválně (offline režim, žádné cizí CDN). Při výměně:

1. nahradit soubor a **aktualizovat licenční soubor** vedle něj
   (`vendor/*-LICENSE.txt` — jsou tam pro všechny čtyři),
2. zvýšit `VERZE` v `sw.js` (soubory ve `vendor/` se berou nejdřív z cache,
   bez nové verze by se stará kopie držela dál),
3. **pustit `npm test`** — hlavně u ZXingu. Komentář v `scanner.js` varuje před
   `TRY_HARDER`: v použité verzi ZXingu zabrání plynulému čtení EAN-13 z kamery
   úplně. Právě takové věci chytí jen test s nafilmovaným kódem.

---

## Přesun na vlastní repozitář nebo doménu

Všechny cesty v `index.html`, `manifest.webmanifest` i `sw.js` jsou **relativní**
(`./`, `../`), takže aplikace funguje v podadresáři i v kořeni domény bez úprav.

Po forku stačí zapnout Pages (Settings → Pages → Source: **GitHub Actions**)
a případně přepsat adresu v README. Vlastní doména se nastavuje v Pages běžným
způsobem; workflow se měnit nemusí.

---

## Když se přidává něco, co mění uložený řádek

Dvě věci, na které se snadno zapomene:

1. **Zrušit značku `odeslano`** (`delete kniha.odeslano`) — změněný záznam je
   v knihovním systému zastaralý a patří do dalšího exportu. Dělá to `pridej`,
   `uprav`, `nastavKusu` i `presunVice`.
2. **Nabídnout krok zpět** — před zásahem `const snimek = ulozne.snimek()`
   a ten pak předat jako třetí parametr do `oznam(…, druh, snimek)`.

A obecně: zapisujte přes `uloz()` v `storage.js`, ne přímo přes
`localStorage.setItem` — jen tak se ohlásí posluchači změn a správně se zachytí
zaplněné úložiště.
