# Datový model

Co přesně se ukládá, kam a v jakém tvaru. Kdo sahá na data — ať už kvůli nové
vlastnosti, nebo kvůli obnově něčí zálohy — začíná tady.

---

## Záznam knihy

Jeden objekt v poli pod klíčem `knihovna.knihy.v1`:

```json
{
  "id": "3f1c…-…-…",
  "isbn": "9788073355067",
  "cnb": "",
  "nazev": "Kobra a lasička",
  "autor": "Novák, Jan",
  "rok": "2015",
  "vydavatel": "Karolinum",
  "misto": "Praha",
  "stran": "312",
  "jazyk": "cs",
  "obalka": "https://…/obalka.jpg",
  "zdroj": "Knihovny.cz, Google Books",
  "kusu": 3,
  "policka": "Kabinet dějepisu",
  "poznamka": "",
  "pridano": "2026-03-14",
  "odeslano": "2026-03-20"
}
```

| Pole | Typ | Poznámka |
|---|---|---|
| `id` | string | `crypto.randomUUID()`, přiděluje se při vzniku a nikdy se nemění |
| `isbn` | string | **13 číslic bez pomlček**, nebo `''` |
| `cnb` | string | `cnb000123456`, nebo `''` |
| `nazev`, `autor`, `rok`, `vydavatel`, `misto`, `stran`, `jazyk` | string | i čísla jsou řetězce — tak přicházejí z katalogů |
| `obalka` | string | URL obrázku |
| `zdroj` | string | které katalogy záznam poskládaly (jen pro informaci) |
| `kusu` | number | 1–9999 |
| `policka` | string | normalizovaný text, max 60 znaků, `''` = bez poličky |
| `poznamka` | string | uživatelův text |
| `pridano` | string | `YYYY-MM-DD` |
| `odeslano` | string \| chybí | datum posledního exportu do knihovního systému |

### Číslo záznamu

Kniha se vede pod **jedním** číslem — `cisloZaznamu()` vrátí `isbn`, jinak
`cnb`, jinak prázdný řetězec:

| Případ | `isbn` | `cnb` |
|---|---|---|
| kniha po roce 1989 | `9788073355067` | `''` |
| časopis (ISSN) | `03785955` | `''` |
| starší česká kniha | `''` | `cnb000123456` |
| kniha úplně bez čísla | `''` | `''` |

ISSN se ukládá do pole `isbn` — z pohledu tabulky je to prostě číslo záznamu.
ČNB má **vlastní pole schválně**: aby zůstalo poznat, že to ISBN není, a aby
sloupec ISBN v exportu zůstal u takové knihy prázdný. Knihovní systém by číslo
ČNB ve sloupci ISBN jen zmátlo.

### Totožnost záznamu

Klíč je **číslo + polička** (`klicZaznamu`). Z toho plyne chování, na které
se dá spolehnout:

- Tentýž titul na **téže poličce** = jeden řádek, druhý sken jen přičte kus.
- Tentýž titul na **jiné poličce** = druhý řádek. Jsou to dva výtisky na dvou
  místech a přesně o to při značení poliček jde.
- **Kniha bez čísla klíč nemá.** Nikdy se s ničím neslučuje a každé přidání
  zakládá nový řádek — dva záznamy se stejným názvem totiž klidně můžou být dvě
  různé knihy. To je cena za to, že jdou takové knihy vůbec uložit.

Při importu se navíc na knihu bez čísla použije její `id` (`klicImportu`), takže
nahrání téže zálohy podruhé nezdvojí ani takové řádky.

### Značka `odeslano`

Katalogizace police trvá týdny a export do knihovního systému se dělá
opakovaně. Bez téhle značky zbývají dvě špatné možnosti: naimportovat pokaždé
celou tabulku a knihovnu zdvojit, nebo v Excelu ručně vybírat, co je nové.

Značka **se ruší sama** v `pridej` (přibyl kus), `nastavKusu`, `uprav`,
`presunVice`. Kdo přidá další funkci, která mění řádek, měl by udělat totéž —
změněný záznam je v knihovním systému zastaralý.

---

## Klíče v `localStorage`

| Klíč | Obsah | Modul |
|---|---|---|
| `knihovna.knihy.v1` | pole záznamů knih | `storage.js` |
| `knihovna.policky.v1` | pole názvů poliček (řazené česky, bez opakování) | `storage.js` |
| `knihovna.policka-aktivni.v1` | polička, na kterou se skenuje | `storage.js` |
| `knihovna.zaloha.v1` | `{ kdy, pocet, kam }` — poslední záloha | `zaloha.js` |
| `knihovna.varianta.v1` | `radky` \| `karty` | `app.js` |
| `knihovna.prouzek.v1` | `{ stred, vyska }` — nastavení čtecího proužku | `app.js` |

Přípona `.v1` je připravená na případnou změnu tvaru dat: kdyby jednou musela
přijít migrace, zapíše se pod `.v2` a stará data se dají přečíst a převést.
Zatím žádná migrace neexistuje — data se od začátku jen doplňují o nová pole
a chybějící pole se všude čte přes `|| ''`.

Aplikace nepoužívá cookies, IndexedDB ani `sessionStorage`. Nic se neposílá na
server, protože žádný nemá.

### Co dělat, když je úložiště plné

`localStorage` má na doméně řádově 5 MB. Zápis, který se nevejde, vyhodí
`QuotaExceededError`; `zapisDoUloziste()` z toho udělá srozumitelnou chybu a —
což je důležitější — **nepřepíše stará data nedopsanou hodnotou**. Kdo přidává
nové místo, které zapisuje, ať jde přes `uloz()`, ne přímo přes `setItem`.

---

## Formát CSV

Pro import do školního knihovního systému a pro otevření v Excelu.

- oddělovač **středník**, na začátku **BOM** — takhle to český Excel otevře
  rovnou správně rozsloupcované a s diakritikou,
- konce řádků `\r\n`,
- **ISBN s pomlčkami** (`978-80-7335-506-7`). Holé třináctimístné číslo si Excel
  vyloží jako číslo a zobrazí `9,78807E+12`; s pomlčkami je to text.

Sloupce definuje pole `SLOUPCE` v `storage.js`. Jejich názvy jsou **přesně ty,
které nabízí školní knihovní systém při importu** — při párování sloupců pak
není co dohledávat:

| Klíč | Záhlaví v CSV |
|---|---|
| `isbn` | Unikátní identifikátor definice knihy (ISBN) |
| `autor` | Autor |
| `nazev` | Název |
| `rok` | Rok vydání (titul) |
| `vydavatel` | Vydavatelství (titul) |
| `misto` | Místo vydání (titul) |
| `kusu` | Počet |
| `policka` | Polička |
| `poznamka` | Poznámka |

V exportu jsou **jen údaje, které aplikace opravdu má**. Cenu, signaturu ani
přírůstkové číslo z ISBN dohledat nejde a prázdný sloupec by při importu jen
mátl.

**Ochrana proti vzorcům v Excelu:** buňka začínající `=`, `+`, `@`, tabulátorem
nebo `\r` dostane na začátek mezeru (`ZACATEK_VZORCE` v `storage.js`). Schválně
mezeru, a ne obvyklejší apostrof — apostrof by se do knihovního systému
naimportoval jako součást názvu, kdežto mezeru na začátku srovná skoro každý
systém sám. Pomlčka mezi hlídanými znaky **není**: názvy začínající pomlčkou
jsou běžné a Excel z nich nic nebezpečného neudělá.

### Čtení CSV zpátky

`zCsv()` přečte vlastní export i tabulku odjinud. Oddělovač si vybere podle
toho, čeho je v hlavičce víc (`;` vs `,`), zvládá uvozovky i zdvojené uvozovky
uvnitř nich. Sloupce se párují nejdřív přesným názvem z `SLOUPCE`, pak volnější
shodou podle klíčových slov (`NAZVY_SLOUPCU`); co se nepozná, se přeskočí.

Dvě pravidla v tom párování nejsou náhodná:

- **`misto` musí být před `policka`.** Slovo „Místo“ by se jinak chytlo na
  umístění knihy v regálu, a to je něco úplně jiného.
- **U volnější shody se zahazuje upřesnění v závorce.** Knihovní systém
  rozlišuje „Rok vydání (titul)“ od údajů exempláře, ale slovo „titul“
  v závorce by se chytlo na sloupec s názvem knihy.

Číslo se rozpozná stejně jako při ručním zadání (`rozpoznej`), takže projde
i ISBN s pomlčkami, staré desetimístné s `X` i číslo ČNB.

---

## Formát JSON

Přesně to, co je v `localStorage` — pole záznamů, `JSON.stringify(…, null, 2)`,
**ISBN jako holé číslice** (na rozdíl od CSV, aby se s nimi dalo dál počítat).

Načtení zpět (`importuj`) se řídí klíčem záznamu, takže se dá bez obav nahrát
i starší záloha: co už tam je, se nepřidá znovu.

Import podle přípony/obsahu pozná, jestli jde o JSON nebo CSV
(`js/app.js`, obsluha `#soubor-import`).

---

## Pravidla slučování

`slucDuplicity()` řeší záznamy, které se do tabulky dostaly jinudy než skenem —
ze zálohy z jiného telefonu nebo ze starší verze aplikace:

- **kusy se sečtou**,
- u ostatních polí **vyhrává první neprázdná hodnota** (ručně doplněný název
  tedy nepřebije prázdné místo z druhého záznamu),
- **poznámky se spojí** středníkem, aby se žádná neztratila,
- `id` a `kusu` se z druhého záznamu nepřebírají,
- **záznamy bez čísla se neslučují nikdy**.

Volá se při startu aplikace, po importu a po každém přesunu mezi poličkami.
