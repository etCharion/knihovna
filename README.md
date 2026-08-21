# 📚 Knihovna — skener knih

Webová aplikace, která přes kameru telefonu přečte čárový kód na knize, sama
na internetu dohledá **ISBN, autora, název a další údaje**, ukáže je ke kontrole
a po potvrzení uloží do tabulky. Běží jako statická stránka na GitHub Pages —
žádný server, žádná registrace, žádný API klíč.

**Živá aplikace:** `https://etcharion.github.io/knihovna/`
*(odkaz začne fungovat po zapnutí Pages — viz Zprovoznění níže)*

---

## Co aplikace umí

- **Skenování kamerou** — namíříte na čárový kód (EAN-13) na zadní straně knihy.
- **Přečtení ISBN z vytištěného čísla** — pro knihy, které čárový kód nemají:
  zaměříte na řádek s číslem posuvný čtecí proužek a klepnete na
  *Přečíst číslo*.
- **Rozhraní dělané pro hromadnou katalogizaci** — skenovací okénko se při
  procházení seznamu neposouvá pryč, tři záložky drží věci po ruce a na iPadu
  i počítači stojí skenování a knihovna vedle sebe.
- **Automatické dohledání údajů** — název, autor, vydavatel, **místo vydání**,
  rok, počet stran, jazyk i obálka.
- **Potvrzení u každé knihy** — nic se neuloží samo. Načtená kniha se ukáže
  v nabídce, kde jde opravit ISBN a vyhledat znovu, upravit údaje, vybrat
  poličku — a teprve pak ji přidat, nebo zahodit.
- **Poličky** — kniha se ukládá s místem, kde stojí, takže jde zpětně dohledat.
  V knihovně jsou knihy podle poliček seskupené do sbalitelných sekcí a knihu
  jde kdykoliv přeřadit jinam.
- **Seznam knih** ve dvou zobrazeních — úsporné *řádky*, nebo *karty s obálkou* —
  s řazením a hledáním, které projde všechna pole najednou: název, autora, rok,
  vydavatele, místo vydání, číslo, poličku i poznámku.
- **Ruční zadání ISBN**, když je kód poškozený nebo chybí — včetně starších
  desetimístných čísel končících písmenem **X**.
- **Časopisy podle ISSN** — zadané ručně, nebo naskenované z čárového kódu
  s prefixem 977.
- **Knihy bez ISBN** — starší tituly žádné nemají. Vedou se pod číslem České
  národní bibliografie (ČNB), a když ho katalog neuvádí, uloží se i úplně
  bez čísla.
- **Hledání podle názvu, autora, nakladatelství a roku** pro knihy, které ISBN
  vytištěné nemají: vyplníte kterákoliv pole, z nabídky vyberete tu svou a přidá
  se do tabulky. Jedno tlačítko všechna pole zase vyprázdní.
- **Návrh opravy**, když číslo neprojde kontrolou — poslední číslice ISBN je
  kontrolní, takže aplikace umí spočítat, jak mělo číslo nejspíš vypadat.
- **Úpravy na dvou úrovních** — název se přepíše rovnou v řádku, zbytek údajů
  (autor, rok, vydavatel, místo, poznámka, polička i **ISBN**) v detailu knihy.
  Když skener přečte číslo špatně, přepíšete ho a údaje se dohledají znovu.
- **Export do CSV připravený pro import** do školního knihovního systému
  (otevře se rovnou v Excelu) a **zálohu do JSON**.
- **Zálohu mimo telefon** — stažený soubor JSON (nebo CSV) si uložíte na Disk,
  do e-mailu nebo na flashku; aplikace nahoře na kartě píše, kdy záloha proběhla
  naposledy (viz [Zálohování](#zálohování--jak-dostat-seznam-mimo-telefon)).
- **Počítání kusů** — druhý sken téže knihy na téže poličce nevytvoří duplicitu,
  jen přičte kus. Počet jde i **zadat rovnou** — při potvrzování knihy i v jejím
  detailu, takže se třídní sada dvaceti pěti čítanek pořídí jedním skenem. Duplicity, které se do tabulky dostaly jinudy (ze zálohy z jiného
  telefonu nebo ze starší verze), se při načtení sloučí a kusy sečtou.
- **Export jen toho, co je nové** — po exportu si aplikace pamatuje, které
  knihy do knihovního systému už šly. Katalogizovat se tak dá na několikrát,
  aniž by druhý import knihovnu zdvojil.
- **Načtení CSV** — kromě vlastní zálohy JSON přečte i tabulku CSV, takže jde
  do aplikace dostat, co knihovna už má.
- **Krok zpět** — omylem přidanou nebo smazanou knihu vrátí jedno klepnutí.
- **Hromadné akce** — tlačítko *Vybrat* zapne zaškrtávátka a vybrané knihy jde
  naráz přesunout na poličku, smazat nebo označit za odeslané.
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

## Rozvržení

Na telefonu jsou dole **tři záložky**:

| Záložka | Co je v ní |
|---|---|
| **Skenovat** | kamera, výběr poličky, ruční zadání a seznam *Právě přidané* |
| **Knihovna** | hledání, filtry a knihy seskupené do sbalitelných poliček |
| **Záloha** | export, zálohy a správa poliček |

Skenovací okénko, výběr poličky i tlačítko *Spustit skenování* drží **horní část
obrazovky a neposouvají se** — pod nimi roluje jen seznam právě přidaných knih,
takže při skenování hledáček nikdy nezmizí.

Na iPadu a počítači se záložky neskrývají do lišty: **skenování zůstane v levém
sloupci a knihovna se prohlíží vpravo**, obojí naráz.

## Jak se to používá

1. Otevřete stránku v telefonu a klepněte na **Spustit skenování**.
2. Prohlížeč se poprvé zeptá na **přístup ke kameře** — je potřeba povolit.
3. Namiřte čárový kód knihy do rámečku. Po přečtení telefon pípne a zavibruje.
4. Objeví se **nabídka s dohledanými údaji**. Zkontrolujte je, u víc výtisků
   přepište *Kusů* a klepněte na *Přidat* (nebo zmáčkněte Enter) — teprve tím
   se kniha uloží.
5. Skenujte dál — knihovnu tak projdete kus po kuse. Co právě přibylo, je
   vidět pod skenovacím okénkem.
6. Na kartě **Záloha** klepněte na **Export jen nových** a máte tabulku
   v Excelu — se sloupci pojmenovanými tak, jak je čeká import do knihovního
   systému. Až budete pokračovat, nabídne se zase jen to, co mezitím přibylo.
7. Aby seznam přežil ztrátu telefonu, stáhněte si ze stejné karty **Zálohu
   JSON** a uložte si soubor jinam — na Disk, do e-mailu, na flashku. Viz
   [Zálohování](#zálohování--jak-dostat-seznam-mimo-telefon).

### Potvrzení u každé knihy

Skener se občas splete: přečte kód sousední knihy nebo číslo, které knize vůbec
nepatří. Proto se **nic neukládá samo**. Po každém načtení se otevře nabídka:

- Nahoře **karta s nálezem** — obálka, název, autor, číslo a odznak se
  **zdrojem údajů**. U drtivé většiny knih je to jediné, co je potřeba přečíst.
- Pod ní **pole k úpravě**: ISBN, název, autor, rok, vydavatel, místo vydání,
  polička, počet kusů a poznámka. Hodí se hlavně u knih, které databáze
  neznají, a u míst vydání, která zdroje často neuvádějí vůbec.
- **ISBN** — když je číslo špatně, přepište ho a klepněte na *Vyhledat*.
  Údaje se dohledají znovu podle opraveného čísla.
- Dole jsou **čtyři tlačítka** — drží na obrazovce, ať se k nim nemusí rolovat:

  | Tlačítko | Co udělá |
  |---|---|
  | **Zavřít** | nabídku zavře a nic neuloží (totéž udělá klávesa Esc) |
  | **↩ Hledat dál** | nic neuloží a vrátí se na hledání, ze kterého kniha přišla |
  | **✓ Přidat** | knihu uloží a nabídku zavře (totéž udělá klávesa Enter) |
  | **✓ Přidat a hledat dál** | knihu uloží a rovnou se vrátí na hledání |

  Po *Přidat* se dá skenovat dál, obě tlačítka *hledat dál* jsou pro chvíli,
  kdy knihy nepřibývají skenováním, ale z nabídky nálezů — viz
  [hledání podle údajů o knize](#kniha-bez-isbn--hledání-podle-údajů-o-knize).

Údaje se do nabídky vyplňují **průběžně**, jak jednotlivé databáze odpovídají:
nečeká se na tu nejpomalejší. Co si mezitím opíšete z knihy sami, vám pozdější
odpověď nepřepíše. Až doběhnou všechny, poskládá se záznam ještě jednou
v pořadí zdrojů — český katalog má přednost, takže u české knihy nevyhraje
anglický název jen proto, že cizí server odpověděl dřív.

Když tentýž titul na dané poličce už máte, nabídka to napíše a místo nové knihy
přičte kusy. Pokud jste přitom údaje ručně opravili, tlačítko nabídne
*Přidat kus a opravit údaje* — oprava se tak neztratí.

### Poličky

Aby šlo zpětně dohledat, **kde která kniha stojí**, ukládá se ke knize polička —
prostý název místa, třeba *Obývák — horní řada* nebo *Ložnice*.

- Poličku pro skenování vyberete řádkem **Do poličky** pod okénkem kamery;
  nová se založí přímo v něm nebo na kartě **Záloha**.
- Volba se pamatuje, takže celou polici projdete jedním skenem za druhým.
  U každé knihy jde v nabídce ještě změnit.
- V **Knihovně** jsou knihy seskupené do poliček — sekce se klepnutím sbalí
  a rozbalí, *Rozbalit vše* / *Sbalit vše* je přepne najednou.
- Přeřazení knihy jinam je v **detailu knihy**, hromadně pak přes *Vybrat*.
- Tentýž titul na dvou poličkách jsou **dva záznamy** — dva výtisky na dvou
  místech. Opakovaný sken na téže poličce přičte kus, jako dřív.
- Zrušení poličky knihy nemaže, jen je nechá bez zařazení. Přejmenování se
  promítne i do knih. Poličky přežijí i *Vymazat celou tabulku*.
- Polička jde i do exportu CSV a do zálohy JSON.

### Práce s knihovnou

- **Název** se přepíše přímo v řádku, **zbytek údajů** v detailu knihy
  (klepnutí na šipku vpravo, nebo na kartu).
- **Počet kusů** je v detailu tlačítky − a +. Třídní sada učebnic se pořídí
  jedním skenem místo pětadvaceti — počet se dá zadat i rovnou při potvrzování.
- **Řádky / Karty s obálkou** přepnou zobrazení. Karty ukážou obálku větší
  a víc údajů, řádky se jich vejde na obrazovku víc.
- **Vybrat** zapne zaškrtávátka a lištu hromadných akcí: přesunout vybrané na
  poličku, smazat je, označit za odeslané nebo je vrátit mezi nové.
- **Filtr** *Odeslané i nové / Jen nové / Jen odeslané* a **řazení** jsou nad
  seznamem. Řadit jde podle názvu, autora, roku, vydavatele, místa vydání,
  čísla i počtu kusů — a u názvu, autora i roku obojím směrem. Řadí se uvnitř
  poličky, aby zůstalo vidět, kde která kniha stojí.
- **Vrátit** se objeví v hlášce po přidání, smazání i hromadné akci a deset
  vteřin počká. Špatně naskenovaná sousední kniha má platné ISBN, takže ji
  kontrolní číslice nechytí — tohle je na ni ta pojistka.
- **Číslo jde v detailu i vymazat.** U knihy, která žádné nemá, tam špatně
  přečtené ISBN nemusí zůstat viset.
- Počítadlo v záhlaví ukazuje **tituly i kusy** (`412 / 530 ks`), protože
  u knihovny se čeká odpověď na „kolik máme knih“.

### Kniha bez čárového kódu

Starší tituly čárový kód často nemají, číslo ISBN ale bývá vytištěné v tiráži
nebo na zadní straně. Klepněte v okénku kamery na **Číslo z tiráže** — místo rámečku na
čárový kód se objeví úzký **čtecí proužek**. Zaměřte ho na řádek s číslem
a klepněte na **Přečíst číslo**.

**Proužek jde posunout tahem** a spodním úchytem se mu mění výška, takže si
přesně určíte, který řádek se přečte. Právě o to jde: v tiráži bývají hned nad
ISBN nebo pod ním další čísla — rok vydání, cena, číslo publikace — a když se
četlo z velkého rámečku, pletla se do výsledku. Poloha proužku se pamatuje,
takže se nastavuje jednou.

Rozpoznaný text nebývá dokonalý, ale ISBN má kontrolní číslici, takže se
špatně přečtené číslo pozná a neuloží. Právě proto si aplikace může dovolit
zkusit obrázek přečíst několikrát po sobě různě upravený a vzít první výsledek,
který kontrolou projde:

1. **práh spočítaný ze snímku** — místo napevno nastavených mezí se pro každý
   snímek dopočítá, co je ještě písmo a co už papír. Slabě vytištěné číslo
   i nerovnoměrně nasvícená stránka tím projdou;
2. **obrácená polarita** — pro **bílé číslo na tmavé obálce**, které dřív
   propadlo celé;
3. **bez prahování** — u fontů s tenkými tahy si Tesseract poradí líp se
   stupni šedi než s čímkoliv, co se rozhodlo za něj.

Výřez se navíc zvětšuje tak, aby řádek vyšel vysoký aspoň 110 bodů. To je
u neobvyklých fontů (psací stroj, Courier) obvykle podstatnější než samotný
tvar písma — drobný tisk je pro rozpoznávání ten největší problém.

Když to pořád nevyjde, zaměřte proužek přesněji jen na řádek s číslem, jděte
blíž, přisviťte 🔦, nebo číslo zadejte ručně.

> Rozpoznávání textu si při **prvním** použití stáhne asi 7 MB (na Wi-Fi
> pár vteřin). Pak už se používá z paměti telefonu a funguje i offline.
> Kdo skenuje jen čárové kódy, nestáhne z toho nic.

### Kniha bez ISBN — hledání podle údajů o knize

Tituly vydané před rokem 1989 často ISBN vůbec nemají. Rozbalte **Zadat ISBN
ručně nebo hledat podle údajů o knize**, vyplňte cokoliv z toho, co o knize
víte — **název**, **autora**, **nakladatelství**, **rok** — a klepněte na
**🔎 Hledat v databázích**. Stačí jediné pole; vyplněná se sčítají. Aplikace se
zeptá stejných databází jako u čárového kódu a nabídne, co našla — u každé knihy
je autor, rok, vydavatel, místo vydání a ISBN, aby šlo poznat, které vydání
je to vaše.

Nakladatelství a rok jsou tu právě pro chvíli, kdy stejný titul vyšel
několikrát: *Babička* má vydání od Vitalisu, Odeonu i Albatrosu a bez nich by
se z nabídky nedalo poznat, které z nich stojí v poličce.

> **Rok** pište čtyřmi číslicemi (`1998`). Jiný zápis aplikace odmítne, místo
> aby ho tiše ignorovala a tvářila se, že podle něj hledala.

Tlačítkem **✕ Vymazat pole** se všechna čtyři pole vyprázdní najednou a nabídka
z minulého hledání zmizí. Bez něj je snadné zapomenout v poli nakladatelství
z předchozího dotazu — a to pak další hledání tiše zúží.

Klepnutím na knihu z nabídky se otevře stejné okno k potvrzení jako po skenu —
předvyplněné údaji z nálezu. Ty se přitom ještě jednou dohledají podle ISBN,
takže záznam vyjde stejně úplný, jako kdyby se kniha naskenovala; doplníte
poličku a knihu potvrdíte. Kniha, kterou knihovna už má, je v nabídce
označená i s tím, na kterých poličkách stojí.

**Z potvrzení vedou dvě cesty zpátky k nálezům:** *↩ Hledat dál* se vrátí
bez uložení, *✓ Přidat a hledat dál* knihu nejdřív uloží. Nabídka nálezů
zůstane, jak byla — jen u právě přidané knihy hned přiskočí značka *už
v knihovně*, takže z jednoho dotazu jde pobrat všechna vydání za sebou, aniž
by se hledání pokaždé otevíralo znovu. Po ručně zadaném ISBN vrátí tatáž
tlačítka rovnou pole na další číslo.

> **Nabízí se všechno, co se najde** — i knihy úplně bez čísla. Ty se dají
> uložit stejně jako ostatní, jen se u nich nepočítají kusy; viz *Kniha úplně
> bez čísla* níže.

### Staré ISBN končící písmenem X

Desetimístná ISBN mají kontrolní číslici počítanou modulo 11, takže jí občas
vyjde deset — a ta se tiskne jako **X**: `80-7203-068-X`. Takové číslo zadejte
i s tím písmenem, aplikace si ho převede na dnešní třináctimístný tvar
(`978-80-7203-068-2`) a v tabulce i v exportu už bude v něm.

Klávesnice u ručního zadání je číselná, protože ISBN je skoro celé z číslic.
Písmeno X na ní ale není — od toho je **tlačítko X vedle pole**: klepnutím se
klávesnice přepne na písmena, druhým klepnutím zpátky na číslice.

### Když číslo neprojde kontrolou

Poslední číslice ISBN i ISSN je **kontrolní** — dopočítává se z těch před ní
tak, aby vážený součet vyšel beze zbytku. Právě proto aplikace pozná špatně
opsané nebo špatně naskenované číslo dřív, než ho začne hledat.

Když zadané číslo neprojde, aplikace spočítá, jak by vypadalo, kdyby byl
překlep zrovna v té kontrolní číslici, a **vloží návrh do pole** — v ručním
zadání i v nabídce ke schválení. Porovnáte ho s knihou a buď potvrdíte
tlačítkem *Vyhledat*, nebo číslo přepíšete.

Příklad: `0-8006-0773-3` neprojde, protože kontrolní číslice u `0-8006-0773`
musí být **2**. Aplikace nabídne `978-0-8006-0773-9`, což je totéž číslo
převedené na ISBN-13. Nejde tedy o starý formát, který by aplikace neuměla —
jen o jednu nesedící číslici.

> Občas má i vytištěné ISBN chybu od nakladatele. Takové číslo neznají ani
> databáze knih, takže se stejně nic nedohledá. Knihu v tom případě přidejte
> **hledáním podle údajů o knize** a číslo z obálky si opište do poznámky.

### Knihy vydané před rokem 1989

Do systému ISBN se Československo zapojilo až **v roce 1989**. Všechno starší
ISBN prostě nemá a nikdy mít nebude — v tiráži bývá jen číslo publikace
a tematická skupina, což jsou čísla vydavatelská, ne celostátně jedinečná.

Národní knihovna ale takovým knihám přiděluje **číslo České národní
bibliografie** (`cnb000123456`). Je jedinečné, stálé a katalogy pod ním starší
tituly vedou. Aplikace ho proto bere jako náhradní číslo, když ISBN chybí:

- najdete knihu **hledáním podle údajů o knize**, ČNB se vezme z katalogu
  a kniha jde přidat úplně stejně jako každá jiná;
- číslo jde i **zadat ručně** do stejného pole jako ISBN;
- řádek se pod ním počítá — druhý sken téže knihy přidá kus, ne nový řádek —
  a funguje u něj polička i všechno ostatní.

> **Sloupec ISBN u takové knihy zůstává prázdný** a prázdný jde i do exportu.
> ČNB tam nepatří: knihovní systém čeká v tom sloupci ISBN a cizí číslo by ho
> jen zmátlo. V tabulce ČNB uvidíte jako šedý odznak vedle prázdného pole,
> v záloze do JSON je uložené taky. Kdyby se ISBN později přece jen našlo,
> stačí ho do pole dopsat.

Údaje k ČNB dohledávají **jen Knihovny.cz** — je to české číslo a zahraniční
databáze ho neznají.

### Kniha úplně bez čísla

ČNB má jen část záznamů: přiděluje ho Národní knihovna, takže záznamy, které
se do katalogu dostaly odjinud (od nakladatele, od e-knihovny), ho nemají.
A zahraniční databáze ho nemají nikdy.

**Takovou knihu jde přidat i tak.** V nabídce ke schválení stačí nechat pole
s číslem prázdné — název, autora, rok, vydavatele, poličku i poznámku vyplníte
a kniha se uloží. Sloupec ISBN u ní zůstane prázdný, ostatní údaje ne.

> **Jedna věc kvůli tomu nefunguje: počítání kusů.** Bez čísla nejde poznat,
> jestli je to táž kniha, jakou už v tabulce máte — dva záznamy se stejným
> názvem klidně můžou být dvě různá vydání. Každé přidání proto zakládá nový
> řádek a nabídka na to předem upozorní. Když chcete mít u takové knihy víc
> kusů, přepište si počet v exportu, nebo jí dejte poznámku.

Ze zálohy se takové knihy vracejí spolehlivě — poznají se podle svého
vnitřního čísla řádku, takže ani opakované načtení téže zálohy je nezdvojí.

### Časopisy a ISSN

Periodika ISBN nemají, mají osmimístné **ISSN** (`1234-5678`). Zadat ho jde do
stejného pole jako ISBN — aplikace pozná, o co jde. Časopisy mají i vlastní
čárový kód, který začíná prefixem **977**; ten stačí naskenovat a ISSN se
z něj dopočítá. Různá čísla téhož časopisu mají v kódu různé dvojčíslí, ale
ISSN vyjde stejné, takže se v tabulce nedělají duplicitní řádky — jen přibývají
kusy.

ISSN se ukládá do stejného sloupce jako ISBN (v tabulce se jmenuje
*ISBN / ISSN*) a do stejného sloupce jde i do exportu. Když ho knihovní systém
při importu čeká jinde, přesuňte sloupec v Excelu.

> Údaje k ISSN dohledávají jen Knihovny.cz a Crossref — Google Books ani
> Open Library periodika nevedou, takže se jich aplikace na ISSN ani neptá.
> Stejně tak se jen českého katalogu ptá na ČNB.

### Špatně přečtené ISBN u už uložené knihy

Nejjednodušší je opravit číslo hned v nabídce, ještě než se kniha uloží.
U knihy, která už v tabulce je, klepněte na číslo, přepište ho a potvrďte
(Enter, nebo klepnutí jinam). Údaje o knize se dohledají znovu podle opraveného
čísla — poznámka, polička i počet kusů zůstanou zachované. Klávesa Esc
úpravu zruší.

> **Kameru pouští prohlížeč jen na HTTPS.** Na GitHub Pages to platí
> automaticky. Při zkoušení na počítači musí adresa být `localhost`,
> jinak kamera nenaskočí.

---

## Export do CSV a import do knihovního systému

Sloupce v exportu se jmenují **přesně jako pole, která nabízí knihovní systém
při importu**, takže se při párování sloupců nemusí nic dohledávat:

| Sloupec v CSV | Odkud se bere |
|---|---|
| Unikátní identifikátor definice knihy (ISBN) | z čárového kódu nebo z tištěného čísla; u časopisů sem jde ISSN |
| Autor | dohledáno podle ISBN |
| Název | dohledáno podle ISBN |
| Rok vydání (titul) | dohledáno podle ISBN |
| Vydavatelství (titul) | dohledáno podle ISBN |
| Místo vydání (titul) | dohledáno podle ISBN, pokud ho zdroj uvádí |
| Počet | kolikrát se kniha naskenovala, nebo kolik kusů jste zadali |
| Polička | kam jste ji při skenování zařadili |
| Poznámka | co si k řádku napíšete v tabulce |

Pořadí je dané: **ISBN, autor, název**, pak zbytek.

### Katalogizace na několikrát

Police se neprojde za jedno odpoledne, ale export se dělá pokaždé celý — a druhý
import do knihovního systému by knihovnu zdvojil. Aplikace si proto pamatuje,
**co už odeslané bylo**:

- **⬇️ Export jen nových** stáhne jen knihy, které do systému ještě nešly,
  a označí je za odeslané. U tlačítka je vidět, kolik jich je.
- **⬇️ Export CSV** pošle celou tabulku, jako dřív.
- V **Knihovně** jde filtrovat na *Jen nové* nebo *Jen odeslané* a odeslaná
  kniha je poznat podle zeleného proužku u kraje.
- Když se u odeslané knihy něco změní — přibude kus, opraví se počet nebo
  údaje — **vrátí se sama mezi nové**. V knihovním systému je od té chvíle
  zastaralá.
- Kdyby import selhal, označení jde vzít zpátky: vyberte řádky a klepněte na
  *↩ Vrátit mezi nové*.

Značka o odeslání je jen v aplikaci, do CSV nejde — v importu by neměla co dělat.

Sloupec **Polička** se nejmenuje po poli systému — jak přesně se umístění
v importu jmenuje, se liší, takže si ho při párování buď vyberete ručně, nebo
sloupec přeskočíte. Totéž platí pro **Místo vydání (titul)**: pojmenované je
ve stejném duchu jako rok a vydavatelství, ale jestli takové pole váš import
nabízí, se u každého systému liší.

Další pole, která systém při importu nabízí — cena, signatura, kategorie,
přírůstkové číslo, způsob pořízení a podobně — v exportu **nejsou**. Z ISBN se
dohledat nedají a prázdný sloupec by při párování polí jen mátl; kdo je
potřebuje, dopíše si je v Excelu. Počet stran, jazyk a zdroj údajů aplikace
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

| Zdroj | K čemu je nejlepší | Rozumí číslům |
|---|---|---|
| [Knihovny.cz](https://www.knihovny.cz/) | **české knihy** — katalogy zhruba stovky českých knihoven včetně Národní knihovny | ISBN, ISSN, ČNB |
| [Google Books](https://developers.google.com/books) | zahraniční tituly (viz limit dotazů níže) | ISBN |
| [Crossref](https://api.crossref.org/) | zahraniční tituly, hlavně odborné — metadata od samotných vydavatelů, bez kvóty | ISBN, ISSN |
| [Open Library](https://openlibrary.org/dev/docs/api/books) | starší a anglicky psané knihy, obálky | ISBN |

České zdroje jsou v pořadí první, takže když má knihu víc katalogů, přednost
dostane český záznam — se správnou diakritikou a českým názvem. Knihovnické
záznamy se přitom upraví pro běžné čtení: z názvu se odstraní katalogizační
interpunkce (`Název : podtitul /`) a autor se z tvaru `Novák, Jan, 1970-`
převede na `Jan Novák`.

Tytéž zdroje obsluhují i hledání podle údajů o knize. Každý má na to vlastní
způsob dotazu:

| Pole | Knihovny.cz | Google Books | Crossref | Open Library |
|---|---|---|---|---|
| Název | `type=Title` | `intitle:` | `query.bibliographic` | `title` |
| Autor | `type=Author` | `inauthor:` | `query.author` | `author` |
| Nakladatelství | napříč poli | `inpublisher:` | `query.publisher-name` | `publisher` |
| Rok | napříč poli | — | `filter=from-pub-date…until-pub-date` | — |

Rejstřík jen pro název, respektive jen pro autora, se použije tehdy, když je
vyplněné právě to jedno pole. Jakmile jsou vyplněná dvě a víc, hledá katalog
napříč všemi poli (`AllFields`) — samostatný rejstřík na kombinaci není.

Nálezy o téže knize se pak podle čísla slučují, aby se jeden titul v nabídce
neopakoval čtyřikrát.

**Rok** umí přesně omezit jen Crossref. Google Books na něj nemá operátor
a Open Library zná `first_publish_year` — rok, kdy dílo vyšlo *poprvé*, ne rok
konkrétního vydání, takže by filtrování podle něj u dotisků zahodilo právě ty
správné nálezy. Rok se proto uplatní ještě jednou na hotové nabídce: nález
z jiného roku se do ní nedostane, nález, který rok vůbec neuvádí, ano —
chybějící údaj není nesouhlas. Kolik nálezů kvůli roku vypadlo, se napíše pod
nabídku, aby podivně krátký seznam nebyl záhadou.

Z Crossrefu se přitom berou jen záznamy typu kniha (`monograph`, `book`
a podobné). Je to hlavně rejstřík článků a bez toho filtru by se do nabídky
pletly jednotlivé studie z časopisů.

> Open Library odpovídá na úrovni díla, ne konkrétního vydání — rok
> a nakladatel u jejího nálezu tedy nemusí patřit k uvedenému ISBN. Právě
> proto se po výběru knihy z nabídky údaje dohledávají ještě jednou podle
> samotného čísla.

**Místo vydání** hlásí každý zdroj jinak a Google Books vůbec: Knihovny.cz ho
mají v katalogizačním poli `placesOfPublication` (MARC 260$a), Crossref jako
`publisher-location`, Open Library jako `publish_places`. Skládá se stejně jako
ostatní údaje — vyhrává první zdroj, který ho vyplnil, takže u českých knih
většinou katalog. Z knihovnického zápisu se ještě odstraní oddělovací
interpunkce (`Praha :` → `Praha`). Když ho neuvádí nikdo, zůstane sloupec
prázdný a doplnit se dá ručně v nabídce před přidáním knihy.

Všechny jsou veřejné a bez klíče. U Google Books se navíc, když strukturované
hledání podle ISBN nic nevrátí, zkusí totéž číslo ještě jako obyčejné klíčové
slovo — řada českých titulů má ISBN jen v popisu a jinak by se nenašla.

Když kniha nikde není, nabídka se přesto otevře s vyplněným ISBN — název
a autora dopíšete rovnou v ní (nebo později klepnutím do buňky v tabulce).
Aplikace přitom rozlišuje dvě situace a napíše, o kterou jde:

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

Právě kvůli tomu je mezi zdroji **Crossref**: kvótu nemá, klíč nepotřebuje
a jeho záznamy pocházejí přímo od vydavatelů, takže nakladatel a rok bývají
přesné. Je nejsilnější u odborných knih — u beletrie a učebnic je Google Books
pořád nejširší, takže když se zahraniční tituly nedaří dohledávat, vyplatí se
udělat těch pět minut navíc a klíč si pořídit.

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

Když se kniha nenajde, zkontrolujte i samotné číslo — skener se občas splete.
Opravit ho jde přímo v nabídce, ještě než se kniha uloží.

---

## Kam se data ukládají

**Nikam se neodesílají.** Tabulka žije v paměti prohlížeče (`localStorage`)
v daném telefonu. Z toho plyne pár praktických věcí:

- Údaje se **nesynchronizují** mezi telefonem a počítačem.
- Vymazání dat prohlížeče smaže i tabulku a poličky → **dělejte si zálohy**
  (viz níže). Zpátky je nahrajete tlačítkem *Načíst*; poličky se ze zálohy
  obnoví spolu s knihami.
- Aplikace si při spuštění řekne prohlížeči o **trvalé úložiště**, aby data
  nevyhodil, když bude potřebovat místo. Povolení ale nedá každý prohlížeč
  a zálohy to nenahrazuje — jen to ubírá jeden způsob, jak o práci přijít.
- Když je úložiště plné, aplikace to **napíše** místo aby kniha tiše zmizela.
- Na internet odchází jen samotné ISBN, a to do výše uvedených databází.
  Názvy poliček zůstávají v telefonu.

---

## Zálohování — jak dostat seznam mimo telefon

Záložka **Záloha** stahuje soubory — nic víc a nic jiného. Aplikace je pořád
jen statická stránka bez serveru, takže data putují výhradně tam, kam je
odnesete sami. Nahoře na kartě je vždy vidět, **kdy záloha proběhla naposledy**
a jestli se od té doby tabulka změnila.

| Tlačítko | Co udělá |
|---|---|
| **⬇️ Export jen nových** | stáhne CSV jen s knihami, které do knihovního systému ještě nešly, a označí je za odeslané. |
| **⬇️ Export CSV** | stáhne celou tabulku jako CSV pro Excel a pro import do knihovního systému. |
| **⬇️ Záloha JSON** | stáhne úplnou zálohu pro aplikaci samotnou — s poličkami, poznámkami i počty kusů. |
| **⬆️ Načíst** | vrátí do aplikace zálohu JSON, nebo načte tabulku CSV. |

> Dřív tu byla ještě tlačítka *Odeslat zálohu* (systémová nabídka sdílení),
> *E-mailem* (`mailto:` s rozepsanou zprávou) a *Zálohovat do složky*
> (automatický zápis přes File System Access API). V praxi se ukázala jako
> nepoužitelná — buď je prohlížeč nenabídl, nebo skončila u dialogu, který
> zálohu stejně nedokončil. Zůstalo tedy jen stažení souboru, které funguje
> všude stejně.

### Kam si zálohu uložit

Stažený soubor leží ve složce *Stažené soubory* — a tam ho ztráta telefonu
zastihne stejně jako tabulku v prohlížeči. Přesuňte ho proto ještě jednou:

- **V telefonu:** otevřete *Soubory* (Android) nebo *Files* (iPhone), u souboru
  `knihovna-*.json` klepněte na **Sdílet** a vyberte **Disk**, Gmail nebo
  cokoliv, co soubor odnese z telefonu.
- **Na počítači:** soubor přetáhněte do složky, kterou synchronizuje *Disk
  Google pro počítač*, OneDrive nebo Dropbox — do cloudu ho vynese
  synchronizace sama.

Zálohu má smysl dělat po každé větší dávce skenování. Že jste na ni dlouho
nesáhli, je vidět na kartě: věta nahoře řekne datum poslední zálohy i to,
o kolik knih tabulka mezitím povyrostla.

### Proč aplikace nezálohuje sama

Odeslat data z prohlížeče bez serveru nejde a **přílohu k `mailto:` zprávě
webová stránka přidat nesmí** — je to bezpečnostní pravidlo prohlížečů, ne
opomenutí. Kdyby měla záloha odcházet sama, bez ťuknutí (třeba každý večer),
musela by aplikace mít kam poslat data — nejlevněji vlastní *Google Apps
Script* nasazený jako webová aplikace. Znamená to ale jednu službu navíc
a přístup k datům mimo telefon; proto to tu není.

### Obnovení ze zálohy

**Načíst** vezme soubor **JSON** (ten z tlačítka *Záloha JSON*) a sloučí ho se
stávající tabulkou — podle ISBN pozná, co už v ní je, takže se starší záloha dá
nahrát bez obav.

Přečte i **CSV** — vlastní export i tabulku odjinud. Sloupce se poznají podle
názvu, takže projde i soubor s jinou hlavičkou, s čárkou místo středníku
a s ISBN psaným s pomlčkami. Hodí se to ke dvěma věcem: obnovit tabulku, když
zbylo jen CSV, a hlavně **načíst do aplikace to, co knihovna už má** — u dalších
skenů pak nabídka rovnou napíše, že takový titul v seznamu je.

> Z CSV se vrátí jen to, co v něm je. Číslo ČNB, počet stran, jazyk ani značka
> o odeslání do knihovního systému v exportu nejsou — na úplnou obnovu tabulky
> je určená záloha JSON. Knihy bez čísla se navíc při opakovaném načtení téhož
> CSV přidají znovu: není podle čeho poznat, že už tam jsou.

---

## Podpora prohlížečů

| Zařízení | Stav |
|---|---|
| Android — Chrome, Edge | plná podpora, čtení kódů zajišťuje přímo prohlížeč |
| iPhone / iPad — Safari 15+ | funguje; na čtení kódů se stáhne knihovna ZXing |
| Počítač — Chrome, Edge | funguje s webkamerou i ručním zadáním |
| Počítač — Firefox, Safari | funguje; kódy čte stažená knihovna ZXing |

Záloha se stahuje jako soubor, takže funguje ve všech uvedených prohlížečích
stejně. Co prohlížeč neumí — třeba kameru — aplikace nenabízí: tlačítka, která
by nikam nevedla, se nezobrazují.

---

## Struktura projektu

```
index.html               rozhraní aplikace
css/style.css            vzhled (mobil na prvním místě, světlý i tmavý režim);
                         akcentní barva je nahoře v jedné proměnné
js/app.js                propojení všech částí a vykreslení obrazovek
js/scanner.js            kamera a čtení čárových kódů
js/ocr.js                čtení ISBN z vytištěného čísla
js/lookup.js             dohledání knihy v online databázích (podle ISBN i podle údajů)
js/isbn.js               ověření a převody ISBN a ISSN
js/storage.js            ukládání, poličky, export do CSV a JSON
js/zaloha.js             evidence toho, kdy záloha proběhla naposledy
sw.js                    offline režim
manifest.webmanifest     nastavení pro přidání na plochu
vendor/zxing.min.js      čtečka kódů pro prohlížeče bez vlastní podpory
vendor/isbn3.min.js      oficiální rozsahy pro dělení ISBN pomlčkami
vendor/tesseract/        rozpoznávání textu (načítá se až při použití)
vendor/fonts/            písma IBM Plex (nadpisy a text rozhraní)
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

Čtečka kódů (ZXing), rozpoznávání textu (Tesseract) i písma (IBM Plex) jsou
uložené přímo v repozitáři ve `vendor/`, ne načítané z cizího CDN — aplikace tak
funguje offline a při skenování nic neodchází na servery třetích stran. ZXing
(330 kB) a písma (190 kB) se načítají rovnou, Tesseract (7 MB) až když si někdo
řekne o čtení čísla.

### Testy

Testy jsou tři sady. `tests/jednotky.mjs` běží v Node během vteřiny a kontroluje
dělení ISBN, čísla končící X, ISSN i čárové kódy časopisů, ČNB i knihy úplně
bez čísla, návrh opravy kontrolní číslice, vytahování čísla z rozpoznaného
textu, slučování duplicit,
práci s poličkami, hledání podle údajů o knize včetně nakladatelství a roku,
čtení místa vydání ze všech zdrojů, hlášení o poslední záloze
a chování při výpadku zdrojů. Dál hlídá věci, na kterých stojí rychlost
a bezpečnost pořizování: že se údaje hlásí **průběžně** a že přitom český
katalog přebije rychlejší cizí zdroj, počítání a ruční opravu kusů, evidenci
toho, **co už šlo do knihovního systému**, krok zpět, hromadné akce, načtení
CSV oběma směry i ochranu buněk před tím, aby je Excel vyhodnotil jako vzorec.
`tests/e2e.mjs` projede celou aplikaci ve
skutečném prohlížeči včetně obojího skenování a potvrzovací nabídky: Chromiu
se místo kamery podstrčí jednou video s opravdovým čárovým kódem, podruhé
video s vytištěným číslem ISBN, které se čte z posuvného čtecího proužku.
`tests/aktualizace.mjs` hlídá, že se nová verze aplikace opravdu
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

**Tištěné číslo se čte špatně.** Zaměřte **čtecí proužek** jen na řádek s ISBN —
když do něj zasahuje rok vydání nebo cena, čísla se pletou dohromady a výsledek
neprojde kontrolní číslicí. Proužek posunete tahem a spodním úchytem mu
zmenšíte výšku. Bílé číslo na tmavé obálce i písmo psacího stroje aplikace
zvládá, ale drobný tisk je pro rozpoznávání pořád nejtěžší — pomáhá jít blíž.

**Kniha se nenašla.** Zkontrolujte ISBN v nabídce a případně vyhledejte znovu;
když číslo sedí, kniha v databázích prostě není — dopište název a autora ručně
a přidejte ji, nebo ji zkuste najít podle názvu.

**Nejde naskenovat další knihu.** Nejdřív dořešte tu načtenou — přidejte ji,
nebo zahoďte. Dokud je nabídka otevřená, další kódy se ignorují, aby se
rozdělaná kniha neztratila.

**„To není platné ISBN“ u čísla, které je v knize vytištěné.** Poslední číslice
je kontrolní a nesedí s těmi před ní — buď je jedna špatně opsaná, nebo se dvě
přehodily. Aplikace nabídne, jak by číslo vypadalo s opravenou kontrolní
číslicí; porovnejte návrh s knihou. Viz *Když číslo neprojde kontrolou* výše.

**Zahraniční kniha se nedohledá.** Google Books má bez vlastního klíče sdílenou
kvótu, která bývá vyčerpaná — v hlášce to poznáte podle `vyčerpaný limit
dotazů`. Crossref zaskočí u odborných titulů, u beletrie ale ne vždy. Trvale to
řeší vlastní klíč, viz *Google Books a limit dotazů*.

**Stará česká kniha se nedá přidat.** Knihy vydané před rokem 1989 ISBN nemají.
Najděte je hledáním podle údajů o knize — vezme se jim číslo ČNB, a když ho
katalog neuvádí, přidají se i bez čísla. Viz *Knihy vydané před rokem 1989*
a *Kniha úplně bez čísla* výše.

**Hledání podle názvu nic nenajde.** Zkuste jen část názvu bez podtitulu,
u autora samotné příjmení. České katalogy vedou jména ve tvaru `Novák, Jan`,
takže pořadí jmen ničemu nevadí, ale na diakritice záleží.

**Do pole s ISBN nejde napsat X.** Klepněte na tlačítko **X** vedle pole —
přepne klávesnici na písmena. Je u ručního zadání i v nabídce ke schválení.
