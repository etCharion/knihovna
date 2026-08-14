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
- **Export do CSV připravený pro import** do školního knihovního systému
  (otevře se rovnou v Excelu) a **zálohu do JSON**.
- **Zálohu mimo telefon** — odeslání na Disk Google či do e-mailu přes systémovou
  nabídku sdílení, rozepsaný e-mail se seznamem, nebo **automatický zápis do
  složky** v počítači (viz [Zálohování](#zálohování--jak-dostat-seznam-mimo-telefon)).
- **Počítání kusů** — druhý sken téže knihy nevytvoří duplicitu, jen přičte kus.
  Duplicity, které se do tabulky dostaly jinudy (ze zálohy z jiného telefonu
  nebo ze starší verze), se při načtení sloučí a kusy se sečtou.
- **ISBN se správnými pomlčkami** — `978-80-7335-506-7`, ne `9788073355067`.
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
6. Na konci klepněte na **Export CSV** a máte tabulku v Excelu — se sloupci
   pojmenovanými tak, jak je čeká import do knihovního systému.
7. Aby seznam přežil ztrátu telefonu, pošlete si ho z karty **Záloha** na Disk
   Google nebo e-mailem — viz [Zálohování](#zálohování--jak-dostat-seznam-mimo-telefon).

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

## Export do CSV a import do knihovního systému

Sloupce v exportu se jmenují **přesně jako pole, která nabízí knihovní systém
při importu**, takže se při párování sloupců nemusí nic dohledávat:

| Sloupec v CSV | Odkud se bere |
|---|---|
| Unikátní identifikátor definice knihy (ISBN) | z čárového kódu nebo z tištěného čísla |
| Autor | dohledáno podle ISBN |
| Název | dohledáno podle ISBN |
| Rok vydání (titul) | dohledáno podle ISBN |
| Vydavatelství (titul) | dohledáno podle ISBN |
| Počet | kolikrát se kniha naskenovala |
| Poznámka | co si k řádku napíšete v tabulce |

Pořadí je dané: **ISBN, autor, název**, pak zbytek.

Další pole, která systém při importu nabízí — cena, signatura, umístění,
kategorie, přírůstkové číslo, způsob pořízení a podobně — v exportu **nejsou**.
Z ISBN se dohledat nedají a prázdný sloupec by při párování polí jen mátl; kdo
je potřebuje, dopíše si je v Excelu. Počet stran, jazyk a zdroj údajů aplikace
zná, ale odpovídající pole importu nemají — zůstávají proto jen v záloze do
JSON, ve které je uložené úplně všechno.

### Zápis ISBN

V tabulce i v CSV se ISBN píše s pomlčkami tak, jak je vytištěné v knize —
`978-80-7335-506-7`. Kam pomlčky patří, se u každého nakladatele liší a řídí
se to oficiálními rozsahy agentury ISBN; aplikace je má přibalené, takže
nehádá.

Má to i praktický důvod: **holé třináctimístné číslo si Excel vyloží jako
číslo** a zobrazí `9,78807E+12`. Se pomlčkami je to text a zůstane čitelné.

Do databází knih se naopak posílá vždy holých 13 číslic bez pomlček — v tomhle
tvaru je vyhledávání očekává. V záloze do JSON jsou také holé číslice, aby se
s nimi dalo dál pracovat.

## Kde se údaje o knihách berou

Aplikace se zeptá **všech zdrojů naráz** a odpovědi složí dohromady: jeden zná
název a autora, jiný má obálku. Výpadek jednoho zdroje tak nezastaví ostatní.

| Zdroj | K čemu je nejlepší |
|---|---|
| [Knihovny.cz](https://www.knihovny.cz/) | **české knihy** — katalogy zhruba stovky českých knihoven včetně Národní knihovny |
| [Google Books](https://developers.google.com/books) | zahraniční tituly (viz limit dotazů níže) |
| [Open Library](https://openlibrary.org/dev/docs/api/books) | starší a anglicky psané knihy, obálky |

České zdroje jsou v pořadí první, takže když má knihu víc katalogů, přednost
dostane český záznam — se správnou diakritikou a českým názvem. Knihovnické
záznamy se přitom upraví pro běžné čtení: z názvu se odstraní katalogizační
interpunkce (`Název : podtitul /`) a autor se z tvaru `Novák, Jan, 1970-`
převede na `Jan Novák`.

Všechny jsou veřejné a bez klíče. U Google Books se navíc, když strukturované
hledání podle ISBN nic nevrátí, zkusí totéž číslo ještě jako obyčejné klíčové
slovo — řada českých titulů má ISBN jen v popisu a jinak by se nenašla.

Když kniha nikde není, řádek se do tabulky přesto založí s vyplněným ISBN —
název a autora dopíšete klepnutím do buňky. Aplikace přitom rozlišuje dvě
situace a napíše, o kterou jde:

- **databáze knihu neznají** — typicky starší nebo malonákladová česká vydání;
- **databáze neodpověděly** — vypadlé připojení, vyčerpaný limit dotazů, nebo
  server, který se prohlížeče nepustí; tady má smysl to za chvíli zkusit znovu.

Hláška vždy jmenuje, který zdroj selhal a proč (`nedostupný`, `nestihl
odpovědět`, `vyčerpaný limit dotazů`), takže jde poznat, jestli je problém na
straně knihy, sítě, nebo konkrétní služby. Podrobnosti jsou i v konzoli
prohlížeče.

### Google Books a limit dotazů

Bez vlastního klíče Google Books často odpovídá `vyčerpaný limit dotazů`
(HTTP 429) — kvóta je sdílená a bývá vyčerpaná. **Českých knih se to skoro
netýká**, ty najde Knihovny.cz; u zahraničních titulů to ale znamená, že
Google občas nepomůže.

Trvale se to řeší vlastním klíčem, který je zdarma:

1. V [Google Cloud Console](https://console.cloud.google.com/) založte projekt.
2. Zapněte **Books API**.
3. V *Credentials* vytvořte **API key**.
4. U klíče nastavte **Application restrictions → Websites** a povolte jen
   svou adresu (`https://<vaše-jméno>.github.io/*`). Bez tohoto omezení
   to nedělejte — klíč bude v repozitáři veřejně vidět.
5. Klíč vložte do konstanty `GOOGLE_KLIC` na začátku `js/lookup.js`.

Aplikace funguje i bez klíče, jen se u zahraničních knih spoléhá víc na
Open Library.

### Proč tu nejsou Obálky knih

Česká databáze [obalkyknih.cz](https://www.obalkyknih.cz/) by se jako zdroj
nabízela, ale z běžné webové stránky se z ní číst nedá: neposílá hlavičku
CORS, odpovídá ve formátu JSONP a přístup pouští jen registrovaným knihovnám
(`Unknown referer. You need to sign up and provide your catalog URL`). Je
určená knihovnám s vlastním katalogem. U českých knih proto někdy chybí
obálka, i když se název a autor najdou.

Když se kniha nenajde, zkontrolujte i samotné číslo — skener se občas splete
a klepnutím na ISBN v tabulce ho opravíte.

---

## Kam se data ukládají

**Nikam se neodesílají.** Tabulka žije v paměti prohlížeče (`localStorage`)
v daném telefonu. Z toho plyne pár praktických věcí:

- Údaje se **nesynchronizují** mezi telefonem a počítačem.
- Vymazání dat prohlížeče smaže i tabulku → **dělejte si zálohy** (viz níže).
- Na internet odchází jen samotné ISBN, a to do výše uvedených databází.

---

## Zálohování — jak dostat seznam mimo telefon

Karta **Záloha** pod tabulkou nabízí čtyři cesty. Všechny fungují bez serveru,
bez registrace a bez API klíče — aplikace je pořád jen statická stránka, data
tedy putují výhradně tam, kam je pošlete sami. Nahoře na kartě je vždy vidět,
**kdy záloha proběhla naposledy** a jestli se od té doby tabulka změnila.

| Tlačítko | Co udělá | Kde funguje |
|---|---|---|
| **📤 Odeslat zálohu** | otevře systémovou nabídku sdílení — Disk Google, Gmail, WhatsApp, Soubory… Tabulka jde jako **skutečná příloha** (CSV i JSON). | telefony (Android, iPhone); na počítači se tlačítko nezobrazí |
| **✉️ Poslat e-mailem** | otevře rozepsanou zprávu se **seznamem knih přímo v textu** a stáhne oba soubory, abyste je mohli přiložit. | všude |
| **📁 Zálohovat do složky** | jednou vyberete složku a aplikace do ní **sama po každé změně** zapíše zálohu. | Chrome a Edge na počítači |
| **⬇️ Export CSV / Záloha JSON** | stáhne soubor do zařízení. | všude |

### Na Disk Google

**Z telefonu:** *Odeslat zálohu* → v nabídce sdílení vyberte **Disk**. Zvolíte
složku a je hotovo. Stejnou cestou jde záloha poslat do Gmailu jako příloha.

**Z počítače:** mějte nainstalovaný *Disk Google pro počítač* (nebo OneDrive,
Dropbox — cokoliv, co synchronizuje složku) a v aplikaci klepněte na
**📁 Zálohovat do složky**. Vyberete synchronizovanou složku a od té chvíle se
záloha zapisuje sama po každé změně tabulky — do cloudu ji pak vynese
synchronizace. Ve složce vzniknou:

```
knihovna-zaloha.json     aktuální stav, přepisuje se
knihovna-zaloha.csv      totéž pro Excel
zalohy/knihovna-2026-08-13.json   jedna kopie na každý den
```

Denní kopie tam jsou schválně: kdyby se tabulka poškodila nebo omylem vymazala,
přepisovaná záloha by tu chybu jen věrně zkopírovala. Ze stejného důvodu se
**prázdná tabulka nikdy nezapisuje** — kdyby prohlížeč sám uklidil úložiště,
aplikace by se spustila prázdná a jinak by tím zálohu přepsala.

> Po každém novém otevření aplikace se prohlížeč jednou zeptá, jestli smí do
> složky psát — je to jeho bezpečnostní pojistka, kterou stránka obejít nemůže.
> Tlačítko v takovém případě říká *Povolit zápis do složky*.

### Proč aplikace neumí poslat e-mail sama

Odeslat poštu z prohlížeče bez serveru nejde a **přílohu k `mailto:` zprávě
webová stránka přidat nesmí** — je to bezpečnostní pravidlo prohlížečů, ne
opomenutí. Proto *Poslat e-mailem* vypíše seznam do textu zprávy (i ten je
plnohodnotná záloha, dá se z něj přečíst, co v knihovně bylo) a soubory zároveň
stáhne, abyste je přiložili klepnutím.

Kdyby měla záloha odcházet na e-mail **sama, bez ťuknutí** (třeba každý večer),
musela by aplikace mít kam poslat data — nejlevněji vlastní *Google Apps
Script* nasazený jako webová aplikace, který zprávu odešle za vás. Znamená to
ale jednu službu navíc a přístup k datům mimo telefon; proto to tu není a
plánovanou zálohu zastává složka synchronizovaná Diskem.

### Obnovení ze zálohy

**Načíst zálohu** vezme soubor **JSON** (ten z tlačítka *Záloha JSON*,
z nabídky sdílení, nebo `knihovna-zaloha.json` ze složky) a sloučí ho se
stávající tabulkou — podle ISBN pozná, co už v ní je, takže se starší záloha dá
nahrát bez obav. CSV je určené ke čtení v Excelu, zpátky se nenačítá.

---

## Podpora prohlížečů

| Zařízení | Stav |
|---|---|
| Android — Chrome, Edge | plná podpora, čtení kódů zajišťuje přímo prohlížeč; záloha přes nabídku sdílení |
| iPhone / iPad — Safari 15+ | funguje; na čtení kódů se stáhne knihovna ZXing; záloha přes nabídku sdílení |
| Počítač — Chrome, Edge | funguje s webkamerou i ručním zadáním; navíc **automatická záloha do složky** |
| Počítač — Firefox, Safari | funguje; zálohuje se stažením souboru nebo e-mailem |

Tlačítka, která prohlížeč neumí, se nezobrazují — nabídne se vždy jen to, co
v daném zařízení opravdu funguje.

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
js/zaloha.js             sdílení, e-mail a automatická záloha do složky
sw.js                    offline režim
manifest.webmanifest     nastavení pro přidání na plochu
vendor/zxing.min.js      čtečka kódů pro prohlížeče bez vlastní podpory
vendor/isbn3.min.js      oficiální rozsahy pro dělení ISBN pomlčkami
vendor/tesseract/        rozpoznávání textu (načítá se až při použití)
tests/jednotky.mjs       rychlé testy bez prohlížeče
tests/e2e.mjs            automatický test v prohlížeči
tests/aktualizace.mjs    test, že se nová verze dostane k uživateli
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

Testy jsou tři sady. `tests/jednotky.mjs` běží v Node během vteřiny a kontroluje
dělení ISBN, vytahování čísla z rozpoznaného textu, slučování duplicit,
sestavení e-mailové zálohy a chování při výpadku zdrojů. `tests/e2e.mjs` projede celou aplikaci ve
skutečném prohlížeči včetně obojího skenování: Chromiu se místo kamery
podstrčí jednou video s opravdovým čárovým kódem, podruhé video s vytištěným
číslem ISBN. `tests/aktualizace.mjs` hlídá, že se nová verze aplikace opravdu
dostane k uživateli a že přitom nepřestane fungovat offline režim. Dotazy do
databází knih se podvrhují, testy proto nezávisí na připojení.

```bash
npm install          # jen poprvé, kvůli Playwrightu
npm run test:jednotky   # rychlé testy, prohlížeč nepotřebují

npm start            # pro test v prohlížeči: v jednom okně
npm test             # a ve druhém (spustí obě sady)
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
