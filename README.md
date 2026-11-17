# Weather Global 1.0

Dvojjazyčný klimatický atlas pro prohlížení dlouhých klimatických řad,
srovnání regionů, oceánů a podmíněných klimatických scénářů. Aplikace odděluje
pozorování, zdrojové odhady a modelové scénáře a uvádí metodiku, jednotky i
omezení grafů.

## Stav verze

Zdrojová aplikace je označena jako **1.0.0**. Veřejné balení bylo schváleno
správcem projektu 7. 11. 2026. `npm run build` vytváří kompletní veřejnou část:
web, PHP vstupy a devět statických datových API pro světadíly, historická
srovnání, mořský a pevninský led, sníh, srážky, sucho, uhlíkový rozpočet a plyny.
Každé datové API obsahuje `catalog.json` i úplný `bundle.json`; Node.js na
hostingu není potřeba.

Build ověřuje původní kontrolní součty, datové kontrakty a dostupné nezávislé
numerické kontroly. Archivní soubory s `publication_allowed: false` zůstávají
nezměněné; veřejné kopie mají `publication_allowed: true`, identifikaci vydání
a kontrolní součet původního souboru. Numerická data se při balení nepřepočítávají.
Soukromé PHP `storage/`, konfigurace a cron se při buildu nemění.

Antarktické teplotní blokátory a chybějící hodnoty jsou zachovány. Starší
evropské technické piloty s chybnou geografií nebo neuzavřenou metodikou
zůstávají lokální a nejsou do veřejného buildu přidány.

Build, rozdělení veřejných a soukromých souborů, nasazení, ověření a rollback
popisuje [implementace.md](./implementace.md).

## Technologie a lokální vývoj

- Astro vytváří statický web, ECharts vykresluje grafy.
- PHP 8.2+ poskytuje historické datové API; import a úložiště patří mimo
  veřejný webroot.
- Závislosti aplikace a její příkazy jsou v `prototype/`. Název této pracovní
  složky je historický; produkt a jeho verze jsou Weather Global 1.0.

V PowerShellu z kořene repozitáře:

```powershell
Set-Location .\prototype
npm test
npm run build
```

Výstup webu vzniká v `prototype/dist/`. Konfigurace Astro používá základní cestu
`/weather_global/`; na hostingu proto nahrajte **obsah** této složky do veřejné
složky `weather_global`. Pokud má být web na jiné cestě, změňte Astro `base`,
znovu sestavte a ověřte výsledné odkazy.

## Kontroly před vydáním

1. `npm test` a `npm run build` musí skončit úspěšně.
2. Ověřit veřejnou cestu webu a PHP endpointu na cílovém hostingu.
3. Nastavit PHP soubory, konfiguraci i úložiště mimo veřejný webroot.
4. Nahrát také všech devět datových adresářů, `attribution.txt` a
   `release-manifest.json`; ověřit jejich katalogy a JSON balíčky.
5. Cron nechat vypnutý, dokud jej správce výslovně nenakonfiguruje.

Historické a fázové podklady zůstávají v kořenových souborech repozitáře a v
`data_samples/`; nejde o součást veřejného webového balíčku.
