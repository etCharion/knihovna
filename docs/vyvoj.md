# Vývoj — spuštění, testy, nasazení

Praktická příručka: co si nainstalovat, jak aplikaci rozjet u sebe, jak ověřit,
že se nic nerozbilo, a jak se změna dostane na živý web.

---

## Co je potřeba

| Nástroj | Na co | Nutné? |
|---|---|---|
| jakýkoliv HTTP server | otevřít aplikaci (přes `file://` ES moduly ani service worker nefungují) | ano |
| Node.js 18+ | testy | pro testy |
| Python 3 | zabudovaný server (`npm start`) a generování testovacího videa | pro testy |
| Playwright + Chromium | testy v prohlížeči | pro testy v prohlížeči |

Aplikace samotná **nic z toho nepotřebuje** — je to prostý HTML, CSS a
JavaScript, který prohlížeč spustí tak, jak leží v repozitáři. Nic se nekompiluje,
`node_modules/` je jen kvůli testům.

## Spuštění u sebe

```bash
git clone https://github.com/etCharion/knihovna.git
cd knihovna
npm start                  # python3 -m http.server 8765
# a otevřít http://localhost:8765
```

Poslouží jakýkoliv jiný statický server (`npx serve`, `php -S`, rozšíření
Live Server ve VS Code) — jen pozor na port, testy počítají s `8765`.

**Kamera na `localhost` funguje**, protože ho prohlížeče berou jako bezpečný
původ. Na jiném počítači v síti (`http://192.168.…`) už ne — tam je potřeba
HTTPS, jinak `getUserMedia` selže.

**Skenování jde vyzkoušet i bez knihy:** čárový kód se dá vygenerovat na
monitoru druhého zařízení, nebo použít tlačítko *Hledat ručně*, které jde
stejnou cestou (`zpracujKod`) jako skener.

### Service worker při vývoji

Service worker ukládá soubory do cache a při vývoji umí zmást. Pomůže:

- v DevTools → **Application → Service Workers** zaškrtnout *Update on reload*,
  nebo *Bypass for network*,
- tvrdé načtení (Ctrl+Shift+R / Cmd+Shift+R),
- v nejhorším **Application → Storage → Clear site data** (pozor, smaže
  i naskenované knihy — nejdřív si udělejte zálohu do JSON).

Vlastní soubory aplikace se berou nejdřív ze sítě, takže obvyklá změna v `js/`
se projeví hned. Změna ve `vendor/` se bez vyčištění cache neprojeví —
tam se čte nejdřív z cache.

---

## Testy

Tři sady, každá hlídá něco jiného:

```bash
npm install             # jen poprvé, kvůli Playwrightu
npx playwright install chromium   # pokud Chromium ještě nemáte

npm run test:jednotky   # rychlé testy, prohlížeč nepotřebují (~1 s)

npm start               # pro testy v prohlížeči: v jednom okně
npm test                # a ve druhém (spustí všechny tři sady)
```

### `tests/jednotky.mjs` — logika bez prohlížeče

Běží v Node za vteřinu a nepotřebuje síť ani kameru. `localStorage` zastupuje
drobná náhrada nad `Map` (proto se `storage.js` a `zaloha.js` načítají až za ní
dynamickým `await import`) a dotazy do katalogů se podvrhují přepsáním
`globalThis.fetch`.

Pokrývá dělení ISBN, čísla končící `X`, ISSN i čárové kódy časopisů, ČNB,
knihy bez čísla, návrh opravy kontrolní číslice, vytahování čísla
z rozpoznaného textu, slučování duplicit, poličky, hledání podle údajů,
čtení místa vydání ze všech zdrojů, hlášení o poslední záloze, chování při
výpadku zdrojů, průběžné hlášení výsledků (a to, že český katalog přebije
rychlejší cizí zdroj), počítání kusů, evidenci odeslaných, krok zpět,
hromadné akce, čtení CSV oběma směry a ochranu buněk před vzorci v Excelu.

**Tuhle sadu spouštějte při každé změně** — je zdarma a chytí většinu chyb.

### `tests/e2e.mjs` — celá aplikace ve skutečném prohlížeči

Playwright s plným Chromiem (`channel: 'chromium'`; „headless shell“ neumí
kameru). Místo kamery se prohlížeči podstrčí video:

- `tests/vytvor-testovaci-video.py` vyrobí Y4M video se **skutečným čárovým
  kódem EAN-13** (generuje se v Pythonu, bez knihoven),
- `tests/vytvor-video-s-cislem.mjs` vyrobí video s **vytištěným číslem ISBN**
  pro test čtení textu (OCR).

Obojí se vygeneruje samo při prvním běhu do dočasné složky. Testuje se celá
cesta včetně nabídky ke schválení, poliček, detailu, exportu i hromadných akcí.
Dotazy do katalogů se podvrhují (`page.route`), takže test nezávisí na
připojení ani na limitech cizích služeb.

**Vyžaduje běžící server na `http://localhost:8765`** (`npm start` v jiném okně).
Jinou adresu lze zadat proměnnou `ADRESA`.

### `tests/aktualizace.mjs` — dostane se nová verze k uživateli?

Kvůli chybě, která tu jednou byla: service worker bral soubory nejdřív z cache,
takže se jednou uložený soubor už nikdy nenahradil a na telefonu běžela stará
verze i dlouho po vydání oprav — a nešlo to poznat.

Test aplikaci nakopíruje do dočasné složky, spustí nad ní vlastní server,
načte stránku (service worker si ji uloží), pak soubor na serveru změní a
ověří, že se změna projeví. Nakonec server vypne a ověří, že offline režim
pořád funguje.

**Když saháte na `sw.js`, pusťte tuhle sadu.**

### Když test selže

Sady vypisují `✓` / `✗ SELHALO` a končí nenulovým návratovým kódem. U testů
v prohlížeči pomůže dočasně `chromium.launch({ headless: false })` a
`slowMo: 300` — je pak vidět, na čem to stojí.

---

## Nasazení

O nasazení se stará `.github/workflows/pages.yml`: po pushi do **výchozí větve**
se repozitář tak, jak je, nahraje na GitHub Pages. Nic se nekompiluje.

- Pushe do **vedlejších větví** se na živý web nedostanou (podmínka `if:` v jobu).
- Ručně jde nasazení spustit přes **Actions → Nasazení na GitHub Pages →
  Run workflow**.
- Pages musí být v repozitáři **jednou ručně zapnuté** (Settings → Pages →
  Source: **GitHub Actions**). Zapnout je z workflow nejde — token, se kterým
  Actions běží, na to záměrně nemá právo. Do té doby hlásí krok
  `configure-pages` chybu „Get Pages site failed“; je to návod, ne závada.

### Vydání nové verze

1. Změnu ověřte testy (aspoň `npm run test:jednotky`).
2. Když jste sáhli na `vendor/` nebo na seznam `ZAKLAD` v `sw.js`, **zvyšte
   `VERZE`** v `sw.js` (`knihovna-v9` → `knihovna-v10`). Tím se smažou staré
   cache. U běžné změny v `js/` to nutné není — vlastní soubory se stejně
   berou nejdřív ze sítě.
3. Push do výchozí větve. Za pár desítek vteřin je změna na
   `https://<jméno>.github.io/knihovna/`.
4. Na telefonu se nová verze projeví po zavření a otevření aplikace (service
   worker si soubory bere ze sítě, jakmile je připojení).

---

## Konvence kódu

Kód i komentáře jsou **česky** — aplikaci píše i používá česká škola a
konzistence je důležitější než zvyk psát identifikátory anglicky. Nové funkce
pojmenovávejte stejně (`najdiKnihu`, `upravNazevPolicky`, `slucDuplicity`).

- **ES moduly**, žádný build, žádné závislosti za běhu kromě `vendor/`.
- **Dvě mezery** odsazení, středníky, jednoduché uvozovky.
- **Komentář vysvětluje „proč“, ne „co“.** Většina komentářů v tomhle projektu
  popisuje rozhodnutí a chybu, která k němu vedla — to je jejich hlavní cena.
  Když měníte chování, upravte i komentář, jinak zůstane lhát.
- **DOM jen v `app.js`.** Ostatní moduly dostávají prvky jako parametr.
- **Pravidla nad čísly patří do `isbn.js`**, práce s daty do `storage.js`.
  Když `app.js` začne počítat kontrolní číslice, je něco špatně.
- **Chyby uživateli**: `oznam(text, druh, snimek)` pro hlášku, `nastavStav(text)`
  pro řádek pod skenerem. Do konzole `console.warn` / `console.error`, aby
  zůstala stopa.
- **Destruktivní akce** dávejte přes `snimek()` / `obnovSnimek()`, ať jdou vzít
  zpět.
