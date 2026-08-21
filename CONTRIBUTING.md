# Jak přispívat

Díky za zájem. Tohle je malý projekt jedné školní knihovny — pravidla jsou
proto krátká.

## Než začnete

Přečtěte si [dokumentaci pro vývojáře](docs/README.md), hlavně
[Architekturu](docs/architektura.md). Šest pravidel na konci
[rozcestníku](docs/README.md#pravidla-která-drží-zbytek-pohromadě) vysvětluje
většinu toho, co by jinak působilo jako zvláštní rozhodnutí.

## Postup

```bash
git clone https://github.com/etCharion/knihovna.git
cd knihovna
npm install                 # jen kvůli testům
npm start                   # http://localhost:8765
```

1. Založte větev z výchozí větve.
2. Změnu napište a **ověřte testy** (viz níž).
3. Pošlete pull request s popisem, **co se mění a proč**. Když je změna vidět
   na obrazovce, přiložte snímek.

Publikuje se jen výchozí větev — push do vedlejší větve se na živý web
nedostane, takže si můžete v klidu experimentovat.

## Testy

```bash
npm run test:jednotky   # rychlé, bez prohlížeče — pusťte vždycky
npm start               # v jednom okně
npm test                # ve druhém: všechny tři sady
```

- Sahali jste na `sw.js`, `vendor/` nebo na seznam souborů aplikace?
  Pusťte i `npm test` — hlídá offline režim a doručení nové verze.
- **Nová logika si zaslouží test v `tests/jednotky.mjs`.** Je to obyčejný
  skript s funkcí `t(podmínka, popis)`, běží za vteřinu a nepotřebuje síť.
- Testy nikdy nesmí sáhnout na internet — odpovědi katalogů se podvrhují.

## Konvence

- **Česky** — kód, komentáře, názvy funkcí i commity. Aplikaci píše a používá
  česká škola.
- **Bez závislostí.** Žádný build, žádné CDN, nic z npm do běhu aplikace.
  Knihovny se přidávají do `vendor/` i s licencí.
- Dvě mezery odsazení, středníky, jednoduché uvozovky.
- **Komentář vysvětluje „proč“, ne „co“.** Když měníte chování, upravte
  i komentář — jinak zůstane lhát.
- DOM jen v `js/app.js`; pravidla nad čísly v `js/isbn.js`; práce s daty
  v `js/storage.js`.
- Destruktivní akce dělejte vratné (`snimek()` / `obnovSnimek()`).

## Co se sem nehodí

- **Server, přihlašování, cloudová synchronizace.** Data zůstávají v telefonu;
  to je záměr, ne nedodělek.
- **Načítání knihoven nebo písem z CDN** — rozbilo by offline režim a posílalo
  by adresu telefonu cizím serverům.
- **Automatické ukládání bez potvrzení knihy.** Skener se plete a jediná
  pojistka je lidská pozornost.
- **Sběr dat o uživatelích, analytika, reklama.**

## Hlášení chyb

Do issue napište, co jste dělali, co se stalo a co jste čekali; u knihy
přidejte její **ISBN** a u problému s telefonem **prohlížeč a systém**.
Chyby ze skenování bývají specifické pro konkrétní zařízení, takže tohle je
často to nejdůležitější.
