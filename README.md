# 📚 Knihovna — skener knih

Webová aplikace, která přes kameru telefonu přečte čárový kód na knize, sama
na internetu dohledá **ISBN, autora, název a další údaje** a uloží je do
tabulky. Běží jako statická stránka na GitHub Pages — žádný server, žádná
registrace, žádný API klíč.

**Živá aplikace:** `https://etcharion.github.io/knihovna/`
*(odkaz začne fungovat po zapnutí Pages — viz Zprovoznění níže)*

---

## Co aplikace umí

- **Skenování kamerou** — namíříte na čárový kód (EAN-13) na zadní straně knihy.
- **Přečtení ISBN z vytištěného čísla** — pro knihy, které čárový kód nemají:
  zaměříte řádek s číslem a klepnete na *Přečíst číslo ISBN*.
- **Automatické dohledání údajů** — název, autor, vydavatel, rok, počet stran,
  jazyk i obálka.
- **Tabulka knih** s hledáním a řazením podle sloupců.
- **Ruční zadání ISBN**, když je kód poškozený nebo chybí.
- **Úpravy přímo v tabulce** — klepnutím na název, autora, poznámku i **ISBN**.
  Když skener přečte číslo špatně, přepíšete ho a údaje o knize se dohledají
  znovu.
- **Export do CSV** (otevře se rovnou v Excelu) a **zálohu do JSON**.
- **Počítání kusů** — druhý sken téže knihy nevytvoří duplicitu, jen přičte kus.
- **Chod bez signálu** — po prvním načtení funguje aplikace i offline
  (dohledávání údajů pochopitelně internet potřebuje) a jde ji přidat na
  plochu telefonu jako běžnou appku.

---

## Zprovoznění (jednorázově, ~2 minuty)

1. V repozitáři na GitHubu otevřete **Settings → Pages**.
2. V sekci **Build and deployment** nastavte **Source** na **GitHub Actions**.
3. Přejděte do záložky **Actions**, vyberte poslední běh *Nasazení na GitHub
   Pages* a klepněte na **Re-run all jobs**.

Adresa aplikace pak bude `https://<vaše-jméno>.github.io/knihovna/`.
Od té chvíle se stránka po každé změně nasadí sama.

> **Než Pages zapnete, bude nasazení v Actions červené** — hlásí
> „Get Pages site failed“. Není to chyba v projektu: zapnout Pages může jen
> majitel repozitáře přes nastavení, workflow to za vás udělat nesmí.
> Po kroku 2 už vše proběhne.

Publikuje se vždy jen **výchozí větev** repozitáře, ať už se jmenuje `main`,
nebo jinak. Pushe do vedlejších větví se na živý web nedostanou.

### Přidání na plochu telefonu

- **Android (Chrome):** nabídka ⋮ → *Přidat na plochu*
- **iPhone (Safari):** tlačítko Sdílet → *Přidat na plochu*

Aplikace se pak spouští jako samostatná ikona bez adresního řádku.

---

## Jak se to používá

1. Otevřete stránku v telefonu a klepněte na **Spustit skenování**.
2. Prohlížeč se poprvé zeptá na **přístup ke kameře** — je potřeba povolit.
3. Namiřte čárový kód knihy do rámečku. Po přečtení telefon pípne a zavibruje.
4. Kniha se během chvilky objeví v tabulce i s údaji.
5. Skenujte dál — knihovnu tak projdete kus po kuse.
6. Na konci klepněte na **Export CSV** a máte tabulku v Excelu.

### Kniha bez čárového kódu

Starší tituly čárový kód často nemají, číslo ISBN ale bývá vytištěné v tiráži
nebo na zadní straně. Zaměřte řádek s číslem do rámečku a klepněte na
**🔢 Přečíst číslo ISBN** — aplikace číslo přečte z obrázku.

Rozpoznaný text nebývá dokonalý, ale ISBN má kontrolní číslici, takže se
špatně přečtené číslo pozná a neuloží. Když to nevyjde, jděte blíž, přisviťte
🔦 a zkuste to znovu, nebo číslo zadejte ručně.

> Rozpoznávání textu si při **prvním** použití stáhne asi 7 MB (na Wi-Fi
> pár vteřin). Pak už se používá z paměti telefonu a funguje i offline.
> Kdo skenuje jen čárové kódy, nestáhne z toho nic.

### Špatně přečtené ISBN

Klepněte na číslo v tabulce, přepište ho a potvrďte (Enter, nebo klepnutí
jinam). Údaje o knize se dohledají znovu podle opraveného čísla — poznámka
a počet kusů zůstanou zachované. Klávesa Esc úpravu zruší.

> **Kameru pouští prohlížeč jen na HTTPS.** Na GitHub Pages to platí
> automaticky. Při zkoušení na počítači musí adresa být `localhost`,
> jinak kamera nenaskočí.

---

## Kde se údaje o knihách berou

Zdroje se zkoušejí popořadě, dokud některý knihu nenajde:

| Zdroj | K čemu je nejlepší |
|---|---|
| [Google Books](https://developers.google.com/books) | nejširší záběr, zahraniční i mnoho českých titulů |
| [Open Library](https://openlibrary.org/dev/docs/api/books) | starší a anglicky psané knihy |
| [Obálky knih](https://www.obalkyknih.cz/) | české tituly, hlavně regionální vydání |

Všechny jsou veřejné a bez klíče. Když kniha nikde není (týká se hlavně
starších českých vydání před rokem 1990), řádek se do tabulky přesto založí
s vyplněným ISBN — název a autora dopíšete klepnutím do buňky.

---

## Kam se data ukládají

**Nikam se neodesílají.** Tabulka žije v paměti prohlížeče (`localStorage`)
v daném telefonu. Z toho plyne pár praktických věcí:

- Údaje se **nesynchronizují** mezi telefonem a počítačem.
- Vymazání dat prohlížeče smaže i tabulku → **dělejte si zálohy** tlačítkem
  *Záloha JSON*. Zpátky ji nahrajete přes *Načíst zálohu*.
- Na internet odchází jen samotné ISBN, a to do výše uvedených databází.

---

## Podpora prohlížečů

| Zařízení | Stav |
|---|---|
| Android — Chrome, Edge | plná podpora, čtení kódů zajišťuje přímo prohlížeč |
| iPhone / iPad — Safari 15+ | funguje; na čtení kódů se stáhne knihovna ZXing |
| Počítač — Chrome, Edge, Firefox, Safari | funguje s webkamerou i ručním zadáním |

---

## Struktura projektu

```
index.html               rozhraní aplikace
css/style.css            vzhled (mobil na prvním místě, světlý i tmavý režim)
js/app.js                propojení všech částí a obsluha tabulky
js/scanner.js            kamera a čtení čárových kódů
js/ocr.js                čtení ISBN z vytištěného čísla
js/lookup.js             dohledání knihy v online databázích
js/isbn.js               ověření a převody ISBN
js/storage.js            ukládání, export do CSV a JSON
sw.js                    offline režim
manifest.webmanifest     nastavení pro přidání na plochu
vendor/zxing.min.js      čtečka kódů pro prohlížeče bez vlastní podpory
vendor/tesseract/        rozpoznávání textu (načítá se až při použití)
tests/e2e.mjs            automatický test v prohlížeči
.github/workflows/       automatické nasazení na GitHub Pages
```

Aplikace se nikam nekompiluje — je to prostý HTML, CSS a JavaScript, který
prohlížeč spustí tak, jak leží v repozitáři. Pro místní vyzkoušení stačí:

```bash
python3 -m http.server 8000
# a otevřít http://localhost:8000
```

Čtečka kódů (ZXing) i rozpoznávání textu (Tesseract) jsou uložené přímo
v repozitáři ve `vendor/`, ne načítané z cizího CDN — aplikace tak funguje
offline a při skenování nic neodchází na servery třetích stran. ZXing (330 kB)
se načítá rovnou, Tesseract (7 MB) až když si někdo řekne o čtení čísla.

### Testy

Sada testů projede celou aplikaci ve skutečném prohlížeči, včetně obojího
skenování: Chromiu se místo kamery podstrčí jednou video s opravdovým čárovým
kódem, podruhé video s vytištěným číslem ISBN. Dotazy do databází knih se
podvrhují, test proto nezávisí na připojení.

```bash
npm install          # jen poprvé, kvůli Playwrightu
npm start            # v jednom okně
npm test             # ve druhém
```

---

## Časté potíže

**Kamera se nespustí.** Zkontrolujte, že adresa začíná `https://`, a v nastavení
prohlížeče u této stránky povolte kameru. Na iPhonu musí jít o Safari —
kamera v jiných prohlížečích na iOS bývá omezená.

**Kód se nedaří přečíst.** Zkuste zapnout **🔦 Světlo**, jít o kousek dál
(zhruba 15–20 cm) a vyhnout se odleskům na lesklé obálce.

**Kniha se nenašla.** Zkontrolujte ISBN v tabulce; když sedí, kniha v databázích
prostě není — dopište název a autora ručně.
