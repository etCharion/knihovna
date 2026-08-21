# Moduly — co která funkce dělá

Referenční přehled veřejného rozhraní (`export`) každého modulu. Podrobné
zdůvodnění „proč zrovna takhle“ je v komentářích přímo ve zdrojácích —
tenhle soubor je mapa, ne náhrada za ně.

Souvislosti mezi moduly popisuje [Architektura](architektura.md).

---

## `js/isbn.js` — čísla knih a časopisů

Jediné místo v aplikaci, kde se rozhoduje, co je platné číslo. Žádný jiný
modul si kontrolní číslici nepočítá sám.

| Funkce | Vrací | Poznámka |
|---|---|---|
| `ocisti(kod)` | `string` | vyhodí pomlčky, mezery a vše kromě číslic a `X` |
| `jeIsbn13(kod)` | `boolean` | včetně ověření kontrolní číslice |
| `jeIsbn10(kod)` | `boolean` | zvládá i koncové `X` |
| `isbn10Na13(kod)` | `string \| null` | prefix 978 + nová kontrolní číslice |
| `normalizuj(kod)` | `string \| null` | cokoliv → ISBN-13 bez pomlček |
| `jeKnizniKod(kod)` | `boolean` | první filtr proti EAN od potravin |
| `jeIssn(kod)`, `normalizujIssn(kod)` | `boolean` / `string \| null` | osmimístné ISSN |
| `issnZKodu(kod)` | `string \| null` | ISSN z čárového kódu s prefixem 977 |
| `jeCnb(kod)`, `normalizujCnb(kod)` | `boolean` / `string \| null` | `cnb000123456`, jen tvar — ČNB kontrolní číslici nemá |
| **`rozpoznej(kod)`** | `{ kod, cislo } \| null` | **hlavní vstupní bod**; `cislo` je `'ISBN'`, `'ISSN'` nebo `'ČNB'` |
| `navrhniOpravu(kod)` | `string \| null` | jak by číslo vypadalo s opravenou kontrolní číslicí |
| `naFormat(isbn13)` | `string` | zápis s pomlčkami pro zobrazení a CSV |

`rozpoznej()` je funkce, kterou volá zbytek aplikace. Díky ní se nikde jinde
nemusí řešit, jestli přišlo ISBN, ISSN nebo ČNB.

Pomlčky v `naFormat()` počítá přibalená knihovna `vendor/isbn3.min.js` podle
oficiálních rozsahů agentury ISBN — odhadovat je by znamenalo tisknout ISBN
špatně.

---

## `js/scanner.js` — kamera a čárové kódy

Dva postupy podle toho, co prohlížeč umí: nativní `BarcodeDetector`
(Chrome na Androidu — rychlý, nic se nestahuje), jinak ZXing z `vendor/`
(typicky Safari). Přepnutí je automatické a nastane i tehdy, když se prohlížeč
k `BarcodeDetector` hlásí, ale selže.

| Funkce | Popis |
|---|---|
| `spust(video, onKod)` | zapne zadní kameru a začne hlídat kódy; `onKod` dostane přečtený řetězec |
| `zastav(video)` | vypne dekódování i kameru (jinak svítí kontrolka a ubývá baterka) |
| `jeSpusten()` | běží skenování? |
| `zapomenPosledniKod()` | zruší tlumení opakování — po zavření nabídky |
| `potvrzeniSkenu()` | pípnutí a vibrace |
| `maSvetlo()`, `prepniSvetlo(zapnout)` | přisvícení, pokud ho zařízení umí |

**Tlumení opakování:** kameře se tentýž kód přečte klidně třicetkrát za
vteřinu, proto `omezOpakovani()` propustí stejný kód nejvýš jednou za 2,5 s.
Po potvrzení knihy je ale další stejný kód **záměr** (druhý výtisk téhož
titulu), ne zákmit — proto `zapomenPosledniKod()`.

Kamera jde v prohlížeči zapnout jen přes HTTPS (nebo na `localhost`).

---

## `js/ocr.js` — přečtení ISBN z vytištěného čísla

Pro knihy bez čárového kódu. Tesseract z `vendor/tesseract/` se načítá **až
při prvním použití** — kdo skenuje jen kódy, nestáhne z něj ani bajt.

| Export | Popis |
|---|---|
| `prectiIsbnZObrazu(video, onPrubeh, prouzek)` | `{ isbn, text }` — `isbn` je `null`, když nic neprošlo kontrolou |
| `najdiIsbnVTextu(text)` | všechna platná ISBN v rozpoznaném textu |
| `VYCHOZI_PROUZEK`, `omezProuzek(p)`, `OKRAJ_PROUZKU` | čtecí proužek: `{ stred, vyska }` jako podíly obrazu |
| `uklid()` | ukončí Tesseract worker a uvolní paměť |

Postup stojí na tom, že **ISBN má kontrolní číslici**. Z rozpoznaného textu se
vytáhnou všichni kandidáti posuvným oknem a projde jen ten, kterému kontrolní
číslice sedí — nesmysly z OCR tím propadnou sítem. Proto je bezpečné zkusit
obrázek přečíst několikrát různě upravený a vzít první výsledek, který obstojí:

1. práh podle **Otsuovy metody** (spočítá se z každého snímku zvlášť, takže
   funguje i na bílé číslo na tmavé obálce nebo na slabý tisk),
2. tentýž práh obráceně (odhad polarity nemusí sedět, druhá se zkusí vždy),
3. holé stupně šedi bez prahování,
4. nakonec ještě jednou v režimu „souvislý blok“ — pro číslo zalomené na dva řádky.

**Čtecí proužek je úzký záměrně.** Z většího výřezu se do ISBN pletl rok vydání
nebo cena z vedlejších řádků a výsledek pak neprošel kontrolní číslicí, i když
bylo samotné ISBN přečtené dobře.

ČNB se z OCR nikdy nebere — nemá kontrolní číslici, takže by se překlep nepoznal.

---

## `js/lookup.js` — dohledání údajů online

Čtyři veřejné katalogy, všechny bez API klíče a s CORS hlavičkami, takže se
dají volat rovnou z prohlížeče:

| Zdroj | Umí čísla | Silný v |
|---|---|---|
| **Knihovny.cz** | ISBN, ISSN, ČNB | české tituly, správná diakritika, ČNB |
| **Google Books** | ISBN | zahraniční tituly, obálky |
| **Crossref** | ISBN, ISSN | odborné publikace |
| **Open Library** | ISBN | starší a anglické knihy, obálky |

| Export | Popis |
|---|---|
| `najdiKnihu(kod, { prubezne })` | hledá podle čísla; `prubezne` se volá s každou použitelnou odpovědí |
| `hledejPodleTextu({ nazev, autor, vydavatel, rok })` | nabídka nálezů podle údajů o knize |
| `nahradniObalka(isbn)` | URL obálky z Open Library (`default=false`, jinak vrací průhledný 1×1 px) |

Návratová hodnota `najdiKnihu()`:

```js
{
  isbn, cnb,                    // číslo záznamu (ČNB má vlastní pole)
  nazev, autor, vydavatel, misto, rok, stran, jazyk, obalka,
  nalezeno,                     // našel se název?
  nedostupne,                   // hotovo a přitom neodpověděl vůbec nikdo
  zdroj,                        // které zdroje k záznamu přispěly
  selhalyZdroje,                // ['Google Books (vyčerpaný limit dotazů)', …]
  hotovo,                       // false u průběžného hlášení, true u konečného
}
```

Rozdíl mezi `nedostupne: true` a `nalezeno: false` je důležitý: první znamená
„nikdo neodpověděl“ (výpadek sítě, vyčerpaný limit), druhé „katalogy tu knihu
neznají“. Uživatel k tomu potřebuje jinou radu.

Časový limit je 8 s (`TIMEOUT_MS`) a rozhoduje jen o tom, kdy se mlčící zdroj
ohlásí jako nedostupný — na nabídku se nečeká, ta se plní průběžně.

`GOOGLE_KLIC` je prázdný řetězec; vyplněním se použije vlastní kvóta Google
Books místo sdílené (viz README, sekce *Google Books a limit dotazů*).

Jak přidat další zdroj: [Úpravy](upravy.md#přidání-dalšího-katalogu).

---

## `js/storage.js` — data, poličky, export

Jediný modul, který sahá na `localStorage` s knihami. Tvar záznamu a klíče
popisuje [Datový model](datovy-model.md).

**Knihy**

| Funkce | Popis |
|---|---|
| `vsechny()` | všechny záznamy |
| `pridej(kniha, { kusu, prepsatUdaje })` | `{ zaznam, duplicita, pribylo }`; táž kniha na téže poličce jen přičte kusy |
| `uprav(id, zmeny)` | úprava řádku; ruší značku *odesláno* |
| `nastavKusu(id, kusu)` | ruční oprava počtu |
| `smaz(id)`, `smazVse()`, `smazVice(ids)` | mazání |
| `podleIsbn(isbn, policka)` | kniha s tímhle číslem **na téhle poličce** |
| `vsudePodleIsbn(isbn)` | tentýž titul napříč poličkami |
| `souhrn(knihy?)` | `{ titulu, kusu, novych }` |
| `upravPocetKusu(kusu)` | osekání na 1–9999 |
| `cisloZaznamu(kniha)` | ISBN, jinak ČNB, jinak `''` |

**Poličky**

`policky()`, `pridejPolicku(nazev)`, `prejmenujPolicku(stary, novy)`,
`smazPolicku(nazev)` (knihy zůstanou, jen bez poličky), `aktivniPolicka()`,
`nastavAktivniPolicku(nazev)`, `obsahPolicky(nazev)`, `uklidPolicky()`,
`upravNazevPolicky(nazev)`.

**Export, import, zálohy**

| Funkce | Popis |
|---|---|
| `doCsv(knihy?)` | CSV se středníkem a BOM (český Excel), ISBN s pomlčkami |
| `doJson(knihy?)` | záloha k pozdějšímu načtení zpět |
| `zCsv(text)` | přečte CSV z vlastního exportu i odjinud |
| `importuj(polozky)` | sloučí s daty, která už tu jsou; vrací počet přidaných |
| `stahni(obsah, nazev, typ)` | stáhne soubor |
| `snimek()` / `obnovSnimek(json)` | krok zpět |

**Značka „odesláno do knihovního systému“**

`jeOdeslana(kniha)`, `neodeslane(knihy?)`, `oznacOdeslane(ids?, datum?)`,
`zrusOdeslani(ids?)`. Značka se **ruší sama** všude, kde se řádek změní —
taková kniha je v knihovním systému zastaralá a patří do dalšího exportu.

**Údržba dat**

`slucDuplicity(knihy)`, `uklidDuplicity()`, `opravNazvySOdznakem(knihy)`,
`uklidNazvy()`, `zajistiTrvaleUloziste()`, `priZmene(posluchac)`.

Poslední dvě stojí za vysvětlení. `zajistiTrvaleUloziste()` si řekne
prohlížeči o trvalé úložiště — bez něj smí `localStorage` při nedostatku místa
sám uklidit, a katalogizace police se táhne týdny. `priZmene()` registruje
posluchače na každou změnu tabulky, takže se navazující práce (evidence zálohy)
nemusí dopisovat ke každému volání zvlášť.

---

## `js/zaloha.js` — kdy se naposledy zálohovalo

| Funkce | Popis |
|---|---|
| `zaznamenejExport(knihy?)` | zapíše, že proběhl export |
| `posledniZaloha()` | `{ kdy, pocet, kam }` nebo `null` |
| `popisPosledniZalohy(pocetNyni?)` | věta pro uživatele, včetně upozornění, že se tabulka od zálohy změnila |
| `znacka(datum?)` | `YYYY-MM-DD` do názvu souboru |

---

## `js/app.js` — propojení a vykreslení

Jediný modul, který sahá na DOM a drží stav obrazovek. Nic neexportuje —
načítá se jako `<script type="module">` z `index.html`.

Členění souboru (hledejte podle komentářových předělů):

| Sekce | Obsahuje |
|---|---|
| obálky knih | náhradní obálka z iniciály a barvy odvozené z názvu |
| prvky | odkazy na DOM (`const … = prvek('…')`) |
| záložky, varianta seznamu | přepínání obrazovek, řádky/karty |
| pomůcky | hlášky (`oznam`), stavový řádek, skloňování |
| poličky | výběr, správa, přejmenování |
| knihovna | filtrování, řazení, vykreslení řádků/karet/skupin |
| režim výběru | hromadné akce |
| nedávno přidané | seznam na skenovací záložce |
| nabídka před přidáním | schvalování knihy — jádro pořizování |
| zpracování jednoho kódu | `zpracujKod()` — sem vede skener, OCR i ruční zadání |
| detail knihy | úpravy včetně opravy ISBN |
| skenování | zapnutí/vypnutí kamery, světlo |
| přečtení ISBN z čísla | čtecí proužek, tahání, uložení nastavení |
| ruční zadání a hledání | ISBN ručně, hledání podle údajů |
| export a import | tlačítka na záložce Záloha |
| start | úklid dat, registrace service workeru, první vykreslení |

**`zpracujKod(vstupniKod, zHledani)` je společné hrdlo.** Ať kniha přišla ze
skeneru, z OCR, z ručně zadaného ISBN nebo z nabídky nálezů, projde tudy —
takže se pravidla (co je platné číslo, otevření nabídky, hlášky) nikde nedublují.
