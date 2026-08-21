# Dokumentace pro vývojáře

Tahle složka popisuje, **jak je aplikace udělaná uvnitř** — pro toho, kdo ji
chce upravovat, rozšiřovat nebo převzít po někom jiném.

Návod k používání (skenování, poličky, export do knihovního systému, časté
potíže) je v [hlavním README](../README.md).

---

## Kudy začít

| Chci… | Přečíst |
|---|---|
| pochopit, jak to celé drží pohromadě | [Architektura](architektura.md) |
| najít, kde se co dělá | [Moduly](moduly.md) |
| vědět, co přesně se ukládá | [Datový model](datovy-model.md) |
| rozjet to u sebe a pustit testy | [Vývoj](vyvoj.md) |
| přidat pole, zdroj, sloupec, barvu | [Kuchařka úprav](upravy.md) |
| poslat změnu zpátky | [Jak přispívat](../CONTRIBUTING.md) |

**Nováčkovi doporučujeme pořadí:** Architektura → Vývoj (rozjet a pustit testy)
→ Kuchařka úprav. Moduly a Datový model jsou referenční, čtou se podle potřeby.

---

## Aplikace ve třech větách

Statická stránka na GitHub Pages přečte kamerou čárový kód knihy, dohledá
o ní údaje ve čtyřech veřejných katalozích naráz a po potvrzení uživatelem ji
uloží do `localStorage` prohlížeče. Odtud se data dostanou ven jedině
souborem, který si člověk sám stáhne — CSV pro školní knihovní systém a Excel,
JSON pro návrat zpět do aplikace. Není tu žádný server, žádný build a žádná
knihovna z cizího CDN.

```
index.html + css/style.css     rozhraní
js/app.js                      propojení a vykreslení    ← jediný modul, který sahá na DOM
js/scanner.js                  kamera a čárové kódy
js/ocr.js                      čtení ISBN z tištěného čísla
js/lookup.js                   dohledání údajů v katalozích
js/isbn.js                     ověření a převody ISBN, ISSN, ČNB
js/storage.js                  uložení, poličky, export CSV/JSON
js/zaloha.js                   evidence poslední zálohy
sw.js                          offline režim
vendor/                        ZXing, Tesseract, isbn3, písma IBM Plex
tests/                         tři sady testů
.github/workflows/pages.yml    nasazení na GitHub Pages
```

---

## Pravidla, která drží zbytek pohromadě

Když si z dokumentace odnesete jen tohle, bude to stačit na většinu úprav:

1. **Žádný build.** V repozitáři je přesně to, co běží v prohlížeči.
2. **`app.js` zná ostatní moduly, ony jeho ne.** Logika jde proto testovat
   v Node bez prohlížeče.
3. **Co je platné číslo, se rozhoduje jedině v `isbn.js`.** Nikde jinde se
   kontrolní číslice nepočítá.
4. **Nic se neuloží bez potvrzení uživatelem** a každá destruktivní akce jde
   vzít zpět (`snimek()` / `obnovSnimek()`).
5. **Kniha = číslo + polička.** Tentýž titul na dvou poličkách jsou dva
   záznamy; druhý sken na téže poličce jen přičte kus.
6. **Komentáře vysvětlují „proč“.** Většina z nich popisuje chybu, která
   k danému rozhodnutí vedla — než něco „zjednodušíte“, přečtěte si je.
