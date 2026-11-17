# Weather Global 1.0 — build a nahrání na web

Tento návod popisuje sestavení kompletní veřejné části Weather Global 1.0
a bezpečné předání souborů na PHP webhosting. Veřejné balení ověřených
datových pohledů bylo schváleno správcem projektu 7. 11. 2026.

## Co se změnilo oproti neúplnému buildu

Původní build obsahoval jen frontend a PHP vstupy, takže nové grafy na hostingu
vracely `Catalogue HTTP 404`. Příčinou nebylo soukromé `storage/`.
Nyní `npm run build` automaticky přidává katalogy i kompletní balíčky všech
devíti schválených datových API jako statické JSON soubory.

Původní archivní artefakty s `publication_allowed: false` se nepřepisují.
Build nejprve ověří jejich kontrolní součty, kontrakty, numerické výsledky
a piny příslušných implementací. Veřejná kopie dostane stav
`publication_allowed: true`, identifikaci `weather-global-1.0.0` a SHA-256
původního souboru; nový katalog uvádí SHA-256 veřejné kopie. Data a metodické
limity zůstávají zachovány. Při balení se nespouští import do PHP úložiště.

Staré evropské technické piloty s chybnou geografií nebo nevyřešenou agregací
zůstávají pouze lokální. Antarktické teplotní blokátory, mezery, nejistoty
a neúplné roky nejsou schválením publikace zrušeny.

## 1. Předpoklady

- Node.js `>=22.23.4` a npm `>=9.6.5` (požadavky instalovaného Astro 7.4.5).
- PHP 8.2 nebo novější pro `api.php` a případný `cron.php`.
- PHP rozšíření cURL pro import dat; JSON je součástí běžného PHP runtime.
- SFTP nebo FTPS přístup k webhostingu.
- Veřejná cesta webu v tomto nastavení je `/weather_global/`.

## 2. Testy a produkční build

Spusťte z kořene repozitáře v PowerShellu:

```powershell
Set-Location .\prototype
npm test
npm run build
```

Na čistém buildovacím počítači nejprve obnovte přesně uzamčené závislosti:

```powershell
npm ci
```

Build je úspěšný, pokud `npm run build` skončí kódem 0. Výstup je v
`prototype/dist/`; jde o obsah veřejné části webu, nikoli o zdrojový projekt.
Výstup musí obsahovat `index.html`, `_astro/`, `styles.css`, `api.php` a
`cron.php`, `attribution.txt`, `release-manifest.json` a následující adresáře:

```text
continents-api/v1/
history-comparison-api/v1/
sea-ice-api/v1/
ice-sheets-api/v1/
snow-cover-api/v1/
precipitation-api/v1/
drought-api/v1/
carbon-budget-api/v1/
atmospheric-gases-api/v1/
```

Každý obsahuje `catalog.json`, `bundle.json` a `.htaccess` s vypnutým výpisem
adresáře a nastavením HTTP hlaviček pro Apache. Nahrajte i skryté `.htaccess`.
Tyto adresáře jsou součástí veřejného webu, nikoli soukromého `storage/`.
Na hostingu je pouze čte webserver; Node.js ani Astro middleware se nespouští.
Celý veřejný build má přibližně 45 MB; největší JSON je úplná databáze sucha.
Nenahrazujte ji zkráceným vzorkem: grafy i nabídka úplné upravené databáze
pracují s kompletním balíčkem.
Do veřejného balíčku nekopírujte `node_modules/`, zdrojové soubory,
testy, `data_samples/`, `config.php` ani soukromé úložiště.

Volitelná kontrola opakovatelnosti lokálních zdrojových balíčků:

```powershell
node .\scripts\build-carbon-budget.mjs --check
node .\scripts\build-atmospheric-gases.mjs --check
```

Tyto kontroly ověřují opakovatelnost archivních souborů. Publikační metadata
přidává až hostingový build; archiv zůstává historickým lokálním artefaktem.

## 3. Příprava hostingu

### Veřejná část

Vytvořte adresář odpovídající URL `/weather_global/`, například
`public_html/weather_global/`. Nahrajte do něj **obsah** `prototype/dist/`, ne
nadřazený adresář `dist`. Zachovejte strukturu a malá písmena názvů souborů.
Konfigurace Astro má `base: '/weather_global/'`; nasazení do jiné URL cesty
vyžaduje změnu `base` a nový build.

Přenos dělejte přes SFTP (případně FTPS), ideálně do nové/staging složky.
Před přepsáním existujícího webu pořiďte zálohu veřejného adresáře. Nepřepisujte
soukromou konfiguraci nebo úložiště při aktualizaci frontendového buildu.

### Soukromá část a PHP API

Ve výchozím nastavení hledají `api.php` a `cron.php` soukromou složku
`weather_global-private` mimo veřejný webroot. Umístění lze přepsat proměnnou
prostředí `WEATHER_GLOBAL_PRIVATE_DIR`; konfiguraci lze určit přes
`WEATHER_GLOBAL_CONFIG`.

1. Vytvořte `weather_global-private` mimo `public_html`.
2. Nahrajte potřebné soubory PHP backendu z `prototype/backend/private/` do této
   soukromé složky; soubory zůstávají v malých písmenech a jejich cesty se
   nesmějí změnit.
3. Vytvořte soukromý `config.php` podle `config.example.php`. Nastavte
   `storage_directory` na absolutní cestu mimo webroot. Zachovejte existující
   hostitelský `config.php` a `storage/`; nikdy je nenahrazujte obsahem
   pracovního počítače.
4. Do soukromého úložiště připravte pouze validované produkční datové vydání
   podle postupu backendu. Bez něj API vrací chybu konfigurace/služby; testujte
   endpoint až po jeho instalaci.
5. `cron_token` ponechte prázdný, pokud správce výslovně neaktivuje plánovaný
   import. Aktivace vyžaduje nový náhodný token nejméně 32 znaků, bezpečné
   uložení a ověření podpory autorizační hlavičky hostitelským plánovačem.

Konfigurace a datové úložiště nesmějí být dostupné přes HTTP. Neposílejte
tajemství do repozitáře, veřejné složky ani query stringu cron URL.

## Obnova po nechtěném přepsání `storage/`

Tento postup se týká pouze soukromého úložiště uvedeného v
`weather_global-private/config.php` jako `storage_directory`. Nezaměňujte ho
za veřejnou složku webu ani za lokální
`prototype/backend/private/storage/`.

1. Pozastavte plánovaný import a další nahrávání souborů do soukromého
   úložiště.
2. Na hostingu nejdřív stáhněte a zazálohujte **vše, co v něm nyní zůstalo**.
   Nic nemažte ani nepřejmenovávejte; `current.json` a adresář `releases/`
   mohou stále obsahovat obnovitelné části.
3. Ověřte v soukromém `config.php` přesnou absolutní hodnotu
   `storage_directory`. Zachovejte `config.php` i celou existující adresářovou
   strukturu mimo webroot.
4. Pokud máte zálohu z hostingu, obnovte z ní `storage/` jako celek do této
   cesty. Poté ověřte, že `current.json` odkazuje na existující adresář
   `releases/<release>/` a jeho `climate.json` i `manifest.json` jsou přítomné.
5. Bez zálohy lze původní klimatický datový release znovu sestavit z
   checksumem ověřeného archivu `data_samples/2026-11-04/`. Importér vyžaduje
   PHP CLI, místní `prototype/backend/private/data/` a soukromou konfiguraci
   směřující do **nového prázdného obnovovacího adresáře**, nikoli přímo do
   živého úložiště:

   ```powershell
   Set-Location .\prototype
   $env:WEATHER_GLOBAL_CONFIG = 'C:\private\weather-global-restore\config.php'
   php .\backend\private\bin\import.php --from-snapshot --force
   ```

   V uvedeném souboru `config.php` nastavte `storage_directory` na jiné nové
   umístění, než je produkční úložiště. Nepřepisujte konfiguraci hostingu
   lokálním souborem. Importér ověřuje soubory archivu a sestaví samostatnou
   neměnnou verzi. Výstup nejdřív otestujte lokálně; na hosting přeneste pouze
   ověřenou strukturu `storage/` do potvrzené soukromé cesty.
6. Po obnově ověřte
   `https://VAŠE-DOMÉNA/weather_global/api.php?dataset=climate` a zkontrolujte
   HTTP 200, platný JSON a grafy původních klimatických řad. Pokud se obnovený
   archiv použije, snapshot je datovaný **2026-11-04**, nejde o aktuální živá
   data.
7. Plánovaný import znovu povolte až po ověření konfigurace a výsledků.

Nikdy nekopírujte celý místní `prototype/backend/private/storage/` do produkce
bez kontroly: lokální kopie může být prázdná, neúplná nebo odpovídat jinému
datovému snapshotu. Pokud nejsou k dispozici ani hostingová záloha, ani
ověřené zdrojové soubory, zastavte obnovu a vyžádejte si zálohu od poskytovatele
hostingu; neimprovizujte ruční obsah `current.json`.

### Oceány nejsou publikovány, přestože API vrací HTTP 200

Starší platné vydání může obsahovat pouze `series` a `projections`. Pro
oceánské indikátory musí odpověď obsahovat také `oceans`; pro scénáře hladiny
moře `ocean_projections`. Samotné HTTP 200 ani datum snapshotu nestačí.

Při kontrole 7. 11. 2026 hosting po vynuceném ověření odpovědi vracel starý
balíček s SHA-256
`3eb0218caab2c9767e55694eecbc92a5a9d5c5ab6f9aeb4d88fc5f4fbe175269`,
bez obou oceánských částí. Mezipaměť jiného prohlížeče současně obsahovala
novější balíček, takže výsledky kontrol se lišily.

Ověřená místní kopie `X:\Weather_Global\zaloha\storage\current.json` odkazuje
na vydání
`aae2fff060266a000fcbf8a0c5c7978fa6be604e5b432c6c988934ed7deefe0e`.
Jeho `climate.json` obsahuje obě oceánské části a odpovídá kontrolnímu součtu
`4fe41f85fdead1f3e5c7edba766f8717d1cbe8e04f846b1ce1394c66a02f2ca7`
v ukazateli.

Po záloze hostingu a potvrzení skutečné soukromé cesty:

1. Nahrajte celý tento adresář vydání z místní zálohy do soukromého
   `storage/releases/`, včetně `manifest.json` a `sources/`.
2. Teprve po dokončení přenosu nahraďte soukromý `storage/current.json`
   ověřenou místní kopií. Ostatní vydání nemažte a `config.php` neměňte.
3. Vyprázdněte případnou hostingovou/CDN mezipaměť pro klimatické API.
   V prohlížeči ověřte odpověď s vypnutou mezipamětí v panelu Network:
   musí obsahovat `oceans` i `ocean_projections`.
4. Znovu otevřete `#ocean/sst?lang=cs`, `#ocean/gmsl?lang=cs` a
   `#ocean-future?lang=cs`. Veřejný build kvůli této obnově neměňte.

## 4. Nahrání a základní ověření

Pro aktualizaci již fungujícího hostingu:

1. Spusťte nový build. Nahrajte **celý obsah** `dist/` do staging adresáře,
   včetně všech devíti datových složek, nikoli jen JavaScript `_astro/`.
2. Ověřte vlastnictví a oprávnění souborů podle pravidel hostingu; veřejný
   server potřebuje pouze čtení buildu. Zápis povolte jen soukromému úložišti
   procesu PHP.
3. Přesuňte nebo synchronizujte obsah staging složky do
   `public_html/weather_global/`.
4. Ověřte z prohlížeče:
   - `https://VAŠE-DOMÉNA/weather_global/` — stránka se načte bez chyby
     prostředků;
   - `https://VAŠE-DOMÉNA/weather_global/api.php?dataset=climate` — po
     nakonfigurování validovaného úložiště vrátí HTTP 200 a JSON;
   - `https://VAŠE-DOMÉNA/weather_global/cron.php` — má zůstat neaktivní
     (výchozí HTTP 503), pokud správce plánovaný import výslovně nezapnul.
   - `https://VAŠE-DOMÉNA/weather_global/ice-sheets-api/v1/catalog.json`
     a `.../ice-sheets-api/v1/bundle.json` — HTTP 200 a platný JSON;
   - obdobně katalog a balíček všech ostatních osmi API z výše uvedeného
     seznamu.
5. Obnovte stránku bez cache (Ctrl+F5), přepněte češtinu/angličtinu a otevřete
   led, sníh, srážky, sucho, koncentrace plynů, uhlíkovou bilanci i světadíly.
   Prohlédněte síťové a PHP logy. Katalogy nesmějí vracet 404 ani HTML místo JSON.

Pokud se nadále objeví 404 u `catalog.json`, chybí na hostingu příslušná veřejná
složka nebo byla nahrána pod jinou cestu. Obnova soukromého `storage/` to
neopraví. U již funkčních původních grafů ponechte soukromý backend a úložiště
zcela beze změny.

`attribution.txt` je veřejně odkazován v patičce a zachovává citace i oddělené
licence: GCB/GPCC CC BY 4.0, úpravy CMIP6 CC BY-SA 4.0, NASA/NOAA/NSIDC vlastní
podmínky a citace. Úplná oddělená upravená databáze SPEI je zveřejněna jako
`drought-api/v1/bundle.json` pod ODbL 1.0 s DbCL 1.0 pro obsah; zachovejte odkaz
ke stažení a neuplatňujte na ni technologická omezení. Nejde o společnou
licenci celého atlasu.

`api.php` může bez soukromé konfigurace nebo platného aktuálního datového
vydání vrátit HTTP 503. To není úspěšné ověření nasazení.

## 5. Aktualizace a návrat zpět

- Před aktualizací zazálohujte veřejný web.
- Nahrajte pouze nový obsah `dist/`; nikdy při tomto kroku nemažte ani
  nepřepisujte `weather_global-private/config.php` a soukromé `storage/`.
- Po nahrání zopakujte HTTP kontroly a ověřte stránku i API.
- Při chybě obnovte předchozí veřejný build ze zálohy. Datové úložiště měňte
  pouze samostatným validovaným postupem backendu.

## 6. Co do hostingu nepatří

- `.env`, `config.php`, tokeny a přihlašovací údaje;
- `node_modules/`, `.astro/`, testy a vývojové skripty;
- `data_samples/`, pracovní sešity a neveřejné JSON balíčky;
- lokální vývojové `backend/private/storage/`;
- jakékoli soubory, které hosting nebo správce neschválil pro veřejné čtení.

Build pouze připraví soubory. Nasazení na doménu provádí správce a poté ověří
všechny hlavní grafy. Soukromou konfiguraci, tokeny a již obnovené úložiště
při této aktualizaci nenahrávejte ani neměňte.

## Ověření sestaveného vydání 7. 11. 2026

- 140 JavaScriptových testů a testy PHP prošly; hostingový build byl dokončen.
- Všech 18 statických JSON endpointů (9 katalogů a 9 balíčků) prošlo kontrolou
  HTTP GET/HEAD, JSON a SHA-256; manifest odpovídá veřejným souborům.
- Ze statického buildu byly v prohlížeči ověřeny všechna nová témata a oba
  světadílové pohledy v češtině i angličtině, všech 7 uhlíkových pod-pohledů,
  roční klimatický kontext sucha a odkaz na úplnou ODbL databázi.
- Na šířce 390 px byly ověřeny led, sucho a světadíly bez horizontálního
  přetečení stránky; antarktický teplotní blokátor zůstává aktivní.
- Testování proběhlo lokálně; nešlo o nahrání nebo potvrzení nasazení na doméně.
