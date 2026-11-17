# Klima v měřítku planety: co nám říkají globální grafy a co už ne

> **První pracovní verze českého článku — fáze 4**
>
> Text vychází z inventáře, auditu metod a schválené osnovy v dokumentu
> `clanek_cz.md`. Není recenzovanou studií ani novým výzkumným výsledkem.
> Odkazy vedou do českého rozhraní Weather Global. Data atlasu mají různé
> zdroje, prostorová měřítka, časové rozsahy a metody; jejich společné čtení
> proto není totéž co jejich sloučení do jedné řady.

## Abstrakt

Klimatickou změnu nelze popsat jediným grafem. Emise vyjadřují toky uhlíku
do atmosféry, koncentrace skleníkových plynů stav atmosféry, teplotní
anomálie změnu vůči zvolené referenci a oceánské či kryosférické ukazatele
další části odezvy zemského systému. Regionální průměry a modelové scénáře
pak odpovídají na jiné otázky než globální pozorovací řady.

Tento článek provází čtenáře grafy atlasu Weather Global od uhlíkového
rozpočtu a atmosférických koncentrací přes teplotu, oceány, led a vodní
režim až k modelovým projekcím. Ukazuje, jak mohou různé ukazatele poskytnout
vzájemně doplňující kontext, a současně upozorňuje na meze jejich
srovnávání. Minulost, modelová simulace a scénář budoucnosti nejsou
zaměnitelné typy důkazů. Stejně tak globální průměr sám o sobě neurčuje,
jaké podmínky budou panovat v konkrétním městě či regionu.

**Klíčová slova:** klimatická změna, uhlíkový rozpočet, skleníkové plyny,
teplotní anomálie, oceán, kryosféra, klimatické scénáře, nejistota

## 1. Jak číst atlas klimatických signálů

Klimatické grafy často sdílejí časovou osu, přesto nemusí měřit stejný
proces. Jedna křivka může popisovat množství emisí za rok, jiná koncentraci
plynu v atmosféře, další teplotní odchylku od historického průměru. K tomu
přistupují prostorové rozdíly: globální průměr, světadílová agregace,
regionální index nebo měření družicové mise představují odlišné pohledy.

Atlas proto nejlépe funguje jako soubor navzájem se doplňujících oken.
Začít lze otázkou, kolik uhlíku vstupuje do bilance a jak se mění jeho
rozložení mezi atmosférou a dalšími zásobníky. Poté lze sledovat
koncentrace skleníkových plynů a teplotní signál, následně se podívat na
oceány, led a vodní režim. Modelové scénáře přidávají podmíněný pohled
do budoucnosti.

Takové pořadí vytváří souvislý příběh, ale nikoli samo o sobě důkaz
příčinnosti mezi každými dvěma sousedními křivkami. Každý ukazatel má svůj
zdroj, referenční období, geografii, časové rozlišení a nejistoty. Článek
proto rozlišuje převzatou zdrojovou řadu, projektovou agregaci, modelovou
simulaci a scénář. Jejich rozdíly jsou součástí výkladu, ne překážkou,
kterou by bylo možné odstranit prostým sjednocením os.

## 2. Globální pohled

### 2.1 Uhlíkový rozpočet: vstupy, úložiště a bilance

[Grafy uhlíkového rozpočtu](https://oubrix.eu/weather_global/index.html#carbon-budget?lang=cs)
začínají hlavní globální bilancí za období 1959–2024. Její význam nespočívá
jen v jediné hodnotě „emisí“. Rozpočet propojuje fosilní emise a emise
ze změn využití půdy s růstem uhlíku v atmosféře a odhady oceánského
a pevninského propadu. Zbývající nerovnováha je účetní diagnostika:
ukazuje, že součet vykázaných zdrojů a změn zásobníků není dokonale
uzavřen. Není to další samostatný zdroj emisí.

Pro zdrojovou konvenci GCB lze vztah zapsat:

$$
B_{\mathrm{IM}}
= E_{\mathrm{FOS}} + E_{\mathrm{LUC}}
- \left(G_{\mathrm{ATM}} + S_{\mathrm{OCEAN}} + S_{\mathrm{LAND}}\right).
$$

Symboly označují fosilní emise \(E_{\mathrm{FOS}}\), emise ze změn využití
půdy \(E_{\mathrm{LUC}}\), růst atmosférického uhlíku \(G_{\mathrm{ATM}}\),
oceánský propad \(S_{\mathrm{OCEAN}}\), pevninský propad
\(S_{\mathrm{LAND}}\) a neuzavřenost bilance \(B_{\mathrm{IM}}\). Jde
o účetní vztah konkrétního zdroje, nikoli o nový výpočet provedený
atlasem. Znaménka a definice je třeba vždy číst podle citovaného vydání.

Delší [historický přehled od roku 1750](https://oubrix.eu/weather_global/index.html#carbon-budget?lang=cs)
pomáhá ukázat, jak hluboko do minulosti některé řady sahají. Ne všechny
složky však mají v celém období stejnou dostupnost a metodickou oporu.
Rok 1959 vyznačuje začátek hlavní souvislé bilance, nikoli okamžik, od
kterého by byly všechny starší odhady bezcenné nebo všechny novější
hodnoty bez nejistoty.

Samostatný [pohled na fosilní emise podle kategorií](https://oubrix.eu/weather_global/index.html#carbon-budget?lang=cs)
rozkládá souhrn podle zdrojů, například uhlí, ropy, plynu či cementu.
Jednotlivé kategorie jsou částmi celku, a proto se nesmějí znovu přičíst
k celkové řadě. Podobně jsou emise ze změn využití půdy samostatnou
složkou bilance, nikoli synonymem pro veškeré odlesňování.

Odhady růstu atmosférického CO₂, oceánského propadu, pevninského propadu
a karbonatace cementu jsou v atlasu k dispozici také v oddělených
podhledech. Alternativní produkty nebo modely v nich představují různé
odhady téže složky. Jejich rozpětí není další tok, který by bylo možné
přičíst k bilanci; modelové řady BLUE, OSCAR a LUCE zůstávají oddělené.

### 2.2 CO₂, CH₄ a N₂O: stav atmosféry, nikoli emise

[Globální měsíční řada CO₂](https://oubrix.eu/weather_global/index.html#indicator/co2?lang=cs)
od NOAA GML zachycuje koncentraci v ppm v suchém vzduchu. Jde o průměr
ze sítě mořských povrchových míst, nikoli o samotnou stanici Mauna Loa.
Časová řada v tomto vydání pokrývá období od ledna 1979 do července 2026.
Graf zobrazuje měsíční hodnoty; sezónní kolísání proto nelze zaměnit
za meziroční trend.

[Řady CH₄ a N₂O](https://oubrix.eu/weather_global/index.html#atmospheric-gases?lang=cs)
doplňují obraz o další skleníkové plyny. Metan je v daném datovém balíčku
pokryt od července 1983 a oxid dusný od ledna 2001; obě řady končí
v červnu 2026. Jednotkou je ppb. NOAA uvádí vedle měsíčního průměru
i vlastní vyhlazený trend a zdrojové nejistoty, které graf sám nevykresluje.

Koncentrace popisuje množství plynu v atmosféře, zatímco emise jsou tok
za časové období. Tyto veličiny spolu věcně souvisejí, ale jedna není
náhradou za druhou. Uhlíkový rozpočet a atmosférická měření se proto
doplňují: první třídí toky podle účetních kategorií, druhá sledují
koncentraci ve vzduchu.

### 2.3 Globální teplotní anomálie

[Globální teplotní graf](https://oubrix.eu/weather_global/index.html#indicator/temperature?lang=cs)
zobrazuje měsíční anomálii NASA GISTEMP v4, ukazatel L-OTI, který spojuje
teplotu vzduchu nad pevninou a mořským ledem s teplotou povrchu vody nad
nezamrzlým oceánem. Nula v tomto grafu znamená průměr referenčního období
1951–1980. Neznamená absolutní teplotu nula stupňů ani změnu vůči
předindustriálnímu období.

GISTEMP může být zpětně revidován a jeho měsíční odchylka je jiná veličina
než koncentrace CO₂ či roční emise v GtC. Když se tato křivka čte vedle
uhlíkové bilance, jde o propojení různých částí klimatického obrazu, nikoli
o odečítání jedné řady od druhé.

### 2.4 RONI a meziroční variabilita

[Relativní index RONI](https://oubrix.eu/weather_global/index.html#indicator/roni?lang=cs)
poskytuje kontext pro krátkodobou proměnlivost v tropickém Tichém oceánu.
Jde o relativní index oblasti Niño 3.4 vůči tropům, nikoli o globální
teplotní anomálii. Jednotlivý bod pokrývá tříměsíční sezónu a je umístěn
do jejího prostředního měsíce. Sousední body se tedy časově překrývají
a nejsou nezávislými měsíčními měřeními.

Takový index připomíná, že na dlouhodobý trend nasedá přirozená
proměnlivost. Při výkladu jednotlivých roků je proto vhodné rozlišovat
dlouhodobou změnu od krátkodobých výkyvů a nepovažovat každý souběh
dvou křivek za přímou příčinnou vazbu.

### 2.5 Globální modelové scénáře teploty

[Globální scénáře CMIP6](https://oubrix.eu/weather_global/index.html#projections?lang=cs)
ukazují modelovanou historickou simulaci za roky 1850–2014 a čtyři
scénářové experimenty SSP1-2.6, SSP2-4.5, SSP3-7.0 a SSP5-8.5 pro roky
2015–2100. Zobrazené teplotní anomálie jsou v každém modelu vztaženy
k jeho vlastnímu průměru 1850–1900.

V tomto výběru je zahrnuto 19 úplných dvojic model–realizace; deset
neúplných z původních 29 společných dvojic bylo vyřazeno ze všech
experimentů. Čára označuje medián a pásmo min–max vybraných modelů.
Nejde o pravděpodobnostní interval ani reprezentativní vzorek všech
modelů CMIP6. Modelovaná minulost není pozorování a hodnoty scénářů po
roce 2015 nejsou předpovědí skutečně nastalých podmínek.

Scénář je podmíněný experiment: ukazuje, jak se modely chovají při
konkrétních předpokladech. Teplotní graf sám neříká, jaká bude budoucí
spotřeba energie, jaká politika bude přijata ani která trajektorie se
uskuteční. Propojení s emisními grafy pomáhá klást tyto otázky, ale
neodstraňuje podmíněnou povahu scénářů.

## 3. Světadíly: globální signál v regionálním měřítku

### 3.1 Historická teplota podle světadílů

[Historické kontinentální pohledy](https://oubrix.eu/weather_global/index.html#continental-history?lang=cs)
agregují analýzu NASA GISTEMP GHCNv4 s prostorovým vyhlazením 1200 km.
Každý kontinent je zobrazen jako souhrnná anomálie; barva mapy proto
nepředstavuje místní teplotu v každém bodě. Společné úplné období šesti
světadílů je v tomto produktu 1926–2025, zatímco regionální začátky
záznamu se liší.

Rozhraní odděluje konzervativní řadu bez vlastního doplňování od
explorativní varianty, která omezeně odhaduje některé vnitřní mezery.
Tyto varianty nejsou dvě nezávislá pozorování. Rozdíl mezi nimi je
informací o citlivosti na metodu. Antarktida má v tomto pohledu
předběžnou geografii a nemá být vydávána za plně ověřený srovnatelný
kontinentální výsledek.

### 3.2 Kontinentální teplotní scénáře

[Modelové scénáře pro světadíly](https://oubrix.eu/weather_global/index.html#continents?lang=cs)
počítají s modely ACCESS-CM2 a CanESM5. Historická simulace pokrývá
1850–2014 a scénáře SSP období 2015–2100. Každý model se zpracovává
samostatně a používá vlastní referenci 1981–2010; teploty jsou váženy
plochou pevniny v modelové mřížce.

Rozpětí dvou modelů ukazuje rozdíl mezi právě těmito dvěma simulacemi.
Není to úplná míra nejistoty klimatických projekcí. Pozorovací
kontinentální historie a modelové scénáře zůstávají odděleny, protože
mají jiný původ, referenci i metodiku. Antarktida je v tomto teplotním
produktu blokována.

### 3.3 Srážky

[Kontinentální srážkové řady](https://oubrix.eu/weather_global/index.html#precipitation?lang=cs)
vycházejí z měsíční analýzy DWD/GPCC na mřížce 2,5°. Plošné agregace
využívají pevnou společnou podporu buněk dostupných v celém sledovaném
období; projekt nepoužívá variantu `precip_infill`. Měsíční hodnoty
jsou v milimetrech a roční hodnota vzniká součtem dvanácti měsíčních
úhrnů. Neúplný rok proto nemá úplný roční úhrn.

Referenční průměr 1981–2010 slouží k výpočtu odchylek a rozlišuje se
podle kalendářního měsíce, případně podle roku. Jde o srážkovou výšku
nad pevninou, ne o odtok, zásobu vody v nádržích nebo množství vody
dostupné obyvatelstvu. Analýza kombinuje srážkoměrná pozorování; její
mřížka není zárukou místního rozlišení. Antarktida leží mimo zdrojovou
doménu GPCC.

### 3.4 Sucho a vlhko podle SPEI

[Pohledy SPEI-3 a SPEI-12](https://oubrix.eu/weather_global/index.html#drought?lang=cs)
ukazují podíl dostupné pevninské plochy v kategoriích sucha, normálních
podmínek a vlhka. SPEI-3 a SPEI-12 představují různé délky časového
akumulačního okna. Kategorie jsou odvozeny z hodnot indexu SPEI;
nejde o přímé měření půdní vlhkosti ani o úplné hodnocení dopadů sucha.

Jmenovatelem je pro každý region a měsíc plocha s dostupnou platnou
hodnotou. Měnící se pokrytí proto patří k interpretaci výsledku.
Roční podíl je průměrem dvanácti měsíčních podílů a počítá se pouze
pro úplný rok. Začátek některých řad postrádá hodnoty kvůli časovému
oknu indexu; atlas je nenahrazuje nulami.

### 3.5 Národní emise jako další měřítko účetnictví

V [národních pohledech uhlíkového rozpočtu](https://oubrix.eu/weather_global/index.html#carbon-budget?lang=cs)
se setkáme s územními fosilními emisemi za roky 1850–2024, spotřebními
emisemi a přenosy za roky 1990–2020 a se třemi modely národních emisí
ze změn využití půdy (BLUE, OSCAR a LUCE). Tyto řady odpovídají na
různé účetní otázky.

Územní emise přiřazují emise místu jejich vzniku; spotřební účetnictví
zohledňuje emise vtělené do obchodovaných výrobků a služeb. Přenosy
vyjadřují rozdíl mezi perspektivami, nejsou dalšími emisemi k přičtení.
Ani národní grafy samy neurčují osobní uhlíkovou stopu nebo příčinu
změny emisí. Tvrzení o oddělení emisí od ekonomického růstu by vyžadovalo
srovnatelná data o HDP, období, cenovou bázi a zohlednění dovozu;
samotné emisní řady k takovému závěru nestačí.

## 4. Oceány: povrch, uložené teplo a hladina moře

### 4.1 Teplota povrchu oceánu

[HadSST4](https://oubrix.eu/weather_global/index.html#ocean/sst?lang=cs)
zobrazuje měsíční anomálii teploty povrchu oceánu od roku 1850 vůči
období 1961–1990. SST je teplota povrchové vody, nikoli teplota vzduchu
nad oceánem. Zdroj poskytuje nejistotní složky, které atlas nepřevádí
na vlastní pásmo.

Tento pohled doplňuje globální teplotní anomálii, ale není s ní totožný:
GISTEMP L-OTI zahrnuje pevninu i oceán a kombinuje různé teplotní
veličiny, zatímco HadSST4 sleduje povrchovou teplotu oceánu. Rozdílné
základny také znamenají, že číselné hodnoty nelze přímo odečítat.

### 4.2 Teplo uložené v oceánu

[Tepelný obsah oceánu](https://oubrix.eu/weather_global/index.html#ocean/ohc?lang=cs)
pokrývá vrstvu 0–2000 m a v dostupném balíčku je čtvrtletní od roku
2005 do druhého čtvrtletí 2026. Zdrojovou jednotkou je \(10^{22}\) J;
atlas ji převádí na zettajouly:

$$
1\times 10^{22}\,\mathrm{J}=10\,\mathrm{ZJ}.
$$

OHC zachycuje teplo uložené v určité hloubce oceánu; SST sleduje povrchovou
teplotní anomálii. Jde o dvě odlišné veličiny a jejich význam se může
doplňovat, nelze však odečítat jejich křivky nebo zaměňovat jejich
jednotky. Zdrojová standardní chyba není automaticky pravděpodobnostní
interval a časový soubor neuvádí výslovnou kalendářní základnu.

### 4.3 Družicová hladina moře a projekce

[Družicová řada globální hladiny moře](https://oubrix.eu/weather_global/index.html#ocean/gmsl?lang=cs)
vychází z altimetrie a pokrývá nepravidelné časové značky od prosince
1992 do února 2025. Atlas zachovává samostatné družicové mise a jejich
body neprůměruje. Zobrazená globální anomálie není místní pobřežní
hladinou; regionální relativní hladinu ovlivňuje i místní geografie
a další procesy.

[Projekce hladiny moře IPCC AR6](https://oubrix.eu/weather_global/index.html#ocean-future?lang=cs)
jsou jiný typ informace. Jde o podmíněné scénáře s publikovanými body
po dekádách do roku 2150, vztažené k období 1995–2014. Graf uvádí
medián a kvantilové meze podle zdrojového produktu. Spojnice mezi body
jsou grafickým vodítkem; nejde o další roční výsledky ani o mapu
zaplavení konkrétního pobřeží.

Měřená výška hladiny a její projekce tak odpovídají na rozdílné otázky:
první popisuje historický družicový záznam, druhá ukazuje, jaké globální
trajektorie vycházejí z vybraných emisních scénářů a předpokladů.

### 4.4 Mořský led

[Měsíční rozsah mořského ledu](https://oubrix.eu/weather_global/index.html#sea-ice?lang=cs)
zobrazuje Arktidu a Antarktidu odděleně podle definice NSIDC, která
započítává plochu buněk při koncentraci ledu alespoň 15 %. Rozsah není
totéž co plocha souvislé vrstvy ledu, objem ani hmotnost. Měsíční
vzorky také neurčují přesná denní maxima nebo minima.

Pro každou polokouli atlas vypočítává anomálii vůči dostupnému průměru
stejného kalendářního měsíce v období 1981–2010. Chybějící měsíce
zůstávají označené jako chybějící. Oddělené řady brání tomu, aby se
odlišné sezónní průběhy obou pólů skryly v jediném součtu.

## 5. Sníh a pevninský led: další části kryosféry

### 5.1 Hmotnost ledových štítů

[Grafy Grónska a Antarktidy](https://oubrix.eu/weather_global/index.html#ice-sheets?lang=cs)
zobrazují změnu hmotnosti ledových štítů v gigatunách podle veřejných
grafových dat NASA navazujících na měření GRACE a GRACE-FO. Jde
o gravitačně odvozenou veličinu, ne přímé měření tloušťky ledu.
Zdrojová nula a publikované meze jsou převzaty bez projektového
přebázování.

Časová osa obsahuje mezery mezi družicovými misemi; atlas body
neinterpoluje a při delších mezerách odděluje úseky čáry. Zdrojové
dolní a horní meze nemají v tomto grafovém souboru přiřazenou
konfidenční hladinu, a proto je nelze označit například jako 95%
interval.

### 5.2 Sněhová pokrývka

[Severopolokoulový rozsah sněhové pokrývky](https://oubrix.eu/weather_global/index.html#snow-cover?lang=cs)
obsahuje celou severní polokouli i několik regionálních pohledů. Jarní
průměr MAM se počítá z března, dubna a května s váhou podle počtu dní
měsíce:

$$
S_{\mathrm{MAM}}
= \frac{31S_{\mathrm{Mar}}+30S_{\mathrm{Apr}}+31S_{\mathrm{May}}}{92}.
$$

Tento jarní souhrn je odlišný od jednotlivých měsíčních hodnot. Rozsah
sněhové pokrývky neříká přímo, kolik vody je ve sněhu uloženo, jaká
je jeho výška nebo jaká část vody bude dostupná v konkrétní povodí.
Podobně jako u ledových štítů jde o další ukazatel kryosféry, nikoli
náhradu za ostatní měření.

## 6. Minulost: souvislosti bez falešného sjednocení

Při společném pohledu na minulost lze sestavit posloupnost otázek.
Jaké zdroje uhlíku vstupují do rozpočtu? Jak se mění koncentrace plynů
v atmosféře? Jakou teplotní anomálii ukazuje globální analýza? Jak se
vedle toho vyvíjí teplo oceánu, hladina moře, led, sníh a regionální
vodní ukazatele?

Uhlíkový rozpočet třídí roční toky a odhady; atmosférické řady ukazují
koncentrace; GISTEMP a HadSST4 pracují s teplotními odchylkami od různých
referencí. OHC je množství energie, GMSL výška hladiny, mořský led jeho
rozsah a SPEI kategoriální index. Časová souvislost mezi jejich vývojem
pomáhá vytvářet kontext, ale nepřevádí tyto veličiny na jednu společnou
metrickou osu.

Obdobně kontinentální průměr může odhalit rozdílné regionální trajektorie,
neříká však, jak se změnila teplota v každém místě kontinentu. Srážková
výška není odtok ani dostupnost vody a podíl plochy v kategorii SPEI
není úplným ukazatelem sucha pro obyvatele. Rozdíly mezi datovými
produkty je třeba zkoumat jednotlivě podle zdroje, období, prostoru
a metody.

Takto opatrná syntéza neumenšuje význam grafů. Naopak umožňuje přesněji
říci, co každý z nich přidává: jeden popisuje zdroj uhlíku, druhý
koncentraci, další odezvu či regionální rozdílnost. Zároveň brání tomu,
aby byl souběh křivek prezentován jako důkaz, že jediný faktor vysvětluje
každou změnu v každém regionu.

## 7. Budoucnost: scénáře nejsou předpovědi

Modelové scénáře CMIP6 a projekce hladiny moře AR6 ukazují budoucí
výsledky za podmínek definovaných scénářem. Neříkají, který scénář
se uskuteční. Nejde ani o prosté prodloužení pozorované křivky: scénářové
simulace začínají v určeném období a jsou podmíněny předpoklady o budoucím
vývoji.

Pro výklad je důležité odlišit tři pracovní příběhy. První může zkoumat
trajektorii s překročením hranice 1,5 °C a otázku adaptace. Druhý může
ukázat nízkoemisní cestu a možné podmínky stabilizace pod 2 °C. Třetí
může použít vysokoemisní experiment jako kontrast. Tyto názvy jsou
interpretační rámce článku, nikoli oficiální názvy SSP nebo pravděpodobnosti.

SSP1-2.6, SSP2-4.5, SSP3-7.0 a SSP5-8.5 nelze bez kontroly konkrétního
výsledku jednoduše přejmenovat na „pod 1,5 °C“, „pod 2 °C“ či „selhání“.
Například SSP2-4.5 není automaticky zárukou udržení oteplení pod 2 °C.
Při přiřazování scénářů je třeba uvést model, referenční období,
teplotní metriku a to, zda se mluví o dočasném překročení nebo dlouhodobé
úrovni oteplení.

Global Carbon Budget 2025 odhaduje, že od ledna 2026 zbývá přibližně
170 GtCO₂ pro 50% pravděpodobnost omezení oteplení na 1,5 °C; při
současné úrovni emisí to odpovídá zhruba čtyřem rokům. Nejde o přesné
datum vyčerpání ani o jistou hranici: odhad závisí na definici
teplotního cíle, pravděpodobnosti, emisích dalších skleníkových plynů
a dalších předpokladech. Jde o aktualizovaný odhad, nikoli hodnotu,
kterou lze přímo vyčíst z historické řady atlasu. GCB zároveň uvádí,
že lineární snižování emisí CO₂ asi o 1,7 Gt ročně až k čisté nule
v roce 2050 odpovídá přibližně cíli 1,7 °C, nikoli samo o sobě cíli
1,5 °C. Ani toto tempo proto nelze vydávat za univerzální trajektorii
pro 1,5 °C.

Zpráva *State of Climate Action 2025* konstatuje, že žádný ze 45
hodnocených ukazatelů nebyl na trajektorii potřebné pro cíle sladěné
s 1,5 °C do roku 2030. Toto souhrnné zjištění je kontextem pro scénáře,
nikoli předpovědí jejich výsledku. Teplotní pozorování je třeba číst
podobně opatrně: WMO vyhodnotila rok 2024 na přibližně 1,55 °C nad
průměrem 1850–1900, ale jediný kalendářní rok nad 1,5 °C není totéž
co dlouhodobé překročení teplotního cíle Pařížské dohody.

## 8. Uhlíková stopa, hybatelé a otázky k ověření

### 8.1 Fosilní emise, energie a ekonomický růst

Grafy GCB a národních emisí umožňují sledovat historické emise podle
kategorie a účetního pohledu. Neobsahují však samostatnou řadu energetické
poptávky ani ekonomického výkonu. IEA ve *Global Energy Review 2026*
uvádí, že světová energetická poptávka v roce 2025 vzrostla o 1,3 %
(oproti 2 % v roce 2024), zatímco energetické emise CO₂ vzrostly
o 0,4 % neboli asi 145 Mt na přibližně 38,4 Gt; globální HDP podle
téže zprávy vzrostl asi o 3,1 %. Jde o relativní oddělení růstu emisí
od růstu HDP v daném roce, nikoli o absolutní pokles emisí ani důkaz
trvalého globálního decouplingu. Rozsah emisí IEA se navíc nemusí krýt
s ukazatelem fosilních emisí v GCB, proto tyto hodnoty nelze bez
metodického převodu spojovat do jedné časové řady.

Roli sehrály i krátkodobé vlivy počasí. IEA odhaduje, že počasím
podmíněné změny včetně slabší výroby z vodních elektráren a větru zvýšily
emise z fosilního spalování v roce 2025 zhruba o 90 Mt, tedy přibližně
polovinu jejich meziročního přírůstku. Sucho v Evropě a částech Ameriky
omezilo vodní výrobu; slabší vítr dále zvýšil potřebu výroby z fosilních
zdrojů v Evropě. Tato čísla popisují odhadované vlivy v konkrétním roce,
nikoli samostatné dlouhodobé trendy.

Oddělení emisí od ekonomického růstu lze zkoumat i u jednotlivých států.
GCB uvádí, že během posledního desetiletí 35 zemí významně snížilo
fosilní emise CO₂ při současném růstu ekonomik; dohromady představovaly
asi 27 % globálních fosilních emisí za toto období. Jde o důležitý
příklad absolutního decouplingu na úrovni těchto zemí, nikoli důkaz,
že se tak vyvíjí svět jako celek. Pro úplné hodnocení je navíc třeba
zohlednit emise vtělené do dovozu a přesně určit účetní hranici.

### 8.2 Využívání půdy a přirozené propady

Globální emise ze změn využití půdy a samostatné modely BLUE, OSCAR
a LUCE ukazují, že tento příspěvek má vlastní odhadovou nejistotu
a metodiku. Emise z využití půdy ale nejsou totožné s rozlohou odlesnění.
Systems Change Lab v *State of Climate Action 2025* uvádí, že pokrok
v zastavení trvalé ztráty lesů je výrazně mimo trajektorii a tempo
potřebného snižování této ztráty by se muselo zrychlit devětkrát.
Jde o ukazatel vztahovaný ke konkrétnímu cíli pro rok 2030, nikoli
o univerzální koeficient pro všechny druhy změn krajinného pokryvu.

Zpráva *10 New Insights in Climate Science 2025/2026* upozorňuje na
výrazný pokles globálního pevninského propadu v roce 2023 a na zátěž
severních ekosystémů včetně požárů a tání permafrostu. Zároveň shrnuje
rostoucí důkazy o tom, že oteplování povrchu oceánu a mořské vlny veder
oslabují roli oceánu jako propadu uhlíku. Tyto poznatky jsou důvodem
ke sledování zranitelnosti přirozených propadů; jeden slabý rok však
sám o sobě neprokazuje trvalé oslabení a atlasová historická řada
nedokládá konkrétní zpětnovazební mechanismus.

Technologické odstraňování CO₂ (CDR) nemá nahrazovat rychlé snižování
emisí. *State of Climate Action 2025* hodnotí potřebné rozšiřování
technologického CDR jako výrazně mimo trajektorii a uvádí, že jeho tempo
musí do roku 2030 vzrůst více než desetkrát. Tento ukazatel se týká
škálování technologie a není srovnatelný s celkovým odstraňováním
uhlíku v modelových scénářích; nelze z něj samotného odvodit konkrétní
roční objem pro rok 2050. Proto zde nejsou převzaty hodnoty 3,6 či
14 GtCO₂ ročně bez přesné definice scénáře, kategorie CDR a metriky.

## 9. Co znamená globální změna pro obyvatelnost

Globální průměr ukazuje souhrnný signál, nikoli rozložení místního
rizika. Světadílový průměr zase není popisem každé obce, povodí nebo
části pobřeží. Mezi klimatickou veličinou a dopadem na člověka leží
expozice, zranitelnost, infrastruktura, zdravotní a ekonomické podmínky
i možnosti adaptace.

Při budoucí práci s místními dopady bude proto nutné spojit klimatické
projekce s regionálními daty a studiemi zaměřenými na konkrétní oblast
a typ rizika. Zde prezentované grafy samy nevyčíslují obyvatelnost,
nepředpovídají migraci a neurčují, která místa budou obyvatelná.
Mohou však pomoci formulovat, proč je důležité sledovat různé části
zemského systému a proč globální souhrn nenahrazuje regionální analýzu.

## 10. Závěr

Grafy atlasu skládají obraz z různých měřítek: od emisních toků a
atmosférických koncentrací přes globální a regionální teplotní změny
po oceány, led, sníh, srážky a kategoriální ukazatele sucha. Jejich
společná interpretace je nejsilnější tehdy, když se zachová rozdíl
mezi zdrojovými veličinami, jejich referencemi a metodami.

Historické řady pomáhají popsat minulý vývoj, modelové simulace nabízejí
podmíněné pohledy do budoucnosti a národní emisní účty otevírají otázky
odpovědnosti. Žádná z těchto částí však sama neurčuje budoucí výsledek,
zbývající uhlíkový rozpočet ani místní dopady. Pro konkrétní tvrzení
o energetické poptávce, decouplingu, propadech, 1,5 °C, rychlosti redukcí,
požárech, CDR či obyvatelnosti je třeba doplnit další odborné zdroje.

Smyslem syntézy tedy není vytvořit jedinou univerzální křivku. Je jím
ukázat, jak jednotlivé, metodicky odlišné signály společně popisují
části klimatického systému — a kde končí jejich výpovědní schopnost.

## Metodická poznámka

Číselné rozsahy v textu odpovídají inventáři lokálního vydání atlasu,
jehož hosting je podle potvrzení autora totožný s lokálním vydáním.
Jde o konkrétní snapshoty a verze popsané v `clanek_cz.md`; zdrojové
produkty se mohou aktualizovat nebo revidovat. Regionální teploty,
srážkové agregace, SPEI podíly a sezonní souhrny obsahují projektové
transformace, které nejsou součástí původních zdrojových dat.

Jednotky uhlíkových grafů zůstávají v uhlíku (GtC/rok, MtC/rok nebo
TgC/rok). Nejsou zaměňovány za CO₂. Pokud by se převod použil, odpovídá
stechiometrickému vztahu:

$$
m_{\mathrm{CO_2}}
= m_{\mathrm C}\frac{M_{\mathrm{CO_2}}}{M_{\mathrm C}}
\approx m_{\mathrm C}\frac{44}{12}.
$$

Převod není v tomto článku aplikován na jednotlivé grafové hodnoty.
Nejistota neuvedená v grafu se nepovažuje za nulovou a rozpětí modelů
se nepovažuje za pravděpodobnostní interval, pokud to zdroj výslovně
neuvádí.

## Zdroje a odkazy

### Studie a datové produkty

- Friedlingstein, P., et al. (2026). *Global Carbon Budget 2025*.
  *Earth System Science Data*. [https://doi.org/10.5194/essd-18-3211-2026](https://doi.org/10.5194/essd-18-3211-2026).
- Global Carbon Project. *Global Carbon Budget 2025, version 1.0*.
  Datový záznam: [https://doi.org/10.18160/GCP-2025](https://doi.org/10.18160/GCP-2025).
- Global Carbon Project. *Key targets 2025: Are global emissions on track to meet climate goals?*
  [https://globalcarbonbudget.org/key-targets-2025/](https://globalcarbonbudget.org/key-targets-2025/).
- International Energy Agency (2026). *Global Energy Review 2026*,
  části [CO₂ emissions](https://www.iea.org/reports/global-energy-review-2026/co2-emissions)
  a [Global trends](https://www.iea.org/reports/global-energy-review-2026/global-trends).
- Systems Change Lab (2025). *State of Climate Action 2025*.
  [https://systemschangelab.org/state-climate-action-2025](https://systemschangelab.org/state-climate-action-2025).
- Future Earth, The Earth League & World Climate Research Programme (2025).
  *10 New Insights in Climate Science 2025/2026*.
  [https://doi.org/10.5281/zenodo.17496348](https://doi.org/10.5281/zenodo.17496348).
- World Meteorological Organization (2025). *WMO confirms 2024 as warmest year
  on record at about 1.55°C above pre-industrial level*.
  [https://wmo.int/news/media-centre/wmo-confirms-2024-warmest-year-record-about-155degc-above-pre-industrial-level](https://wmo.int/news/media-centre/wmo-confirms-2024-warmest-year-record-about-155degc-above-pre-industrial-level).
- Lan, X., Tans, P. & Thoning, K. W. *Trends in globally-averaged CO₂*.
  NOAA GML. [https://doi.org/10.15138/9N0H-ZH07](https://doi.org/10.15138/9N0H-ZH07).
- Lenssen, N. J. L., et al. (2024). *Improvements in the GISTEMP uncertainty model*.
  [https://doi.org/10.1029/2023JD040179](https://doi.org/10.1029/2023JD040179).
- Iturbide, M., et al. (2022). *An update of IPCC climate reference regions
  for subcontinental analysis of climate model data: definition and aggregated
  datasets*. [https://doi.org/10.1038/s41597-022-01739-y](https://doi.org/10.1038/s41597-022-01739-y).
- IPCC. (2023). *Climate Change 2021: The Physical Science Basis*.
  [https://doi.org/10.1017/9781009157896.021](https://doi.org/10.1017/9781009157896.021).
- Fetterer, F., et al. (2025). *Sea Ice Index (G02135, Version 4)*.
  NSIDC. [https://doi.org/10.7265/a98x-0f50](https://doi.org/10.7265/a98x-0f50).
- NOAA NCEI. *Global Ocean Heat Content CDR, 0–2000 m*.
  [Produktová stránka](https://www.ncei.noaa.gov/products/climate-data-records/global-ocean-heat-content).
- Met Office Hadley Centre. *HadSST.4.2.0.0, monthly GLOBE time series*.
- NOAA Laboratory for Satellite Altimetry. *Global mean sea-level time series,
  RADS 4.7.1*.
- IPCC AR6 / NASA Sea Level Change Team. *Sea Level Projection Tool / FACTS*,
  vydání 20210809; Zenodo record 6382554.
- NOAA CDR Program. *Northern Hemisphere Snow Cover Extent, Version 1*.
  [https://doi.org/10.7289/V5N014G9](https://doi.org/10.7289/V5N014G9).
- Rustemeier, E., et al. (2025). *GPCC Precipitation Analysis Monthly Version
  2025 at 2.5 degrees*. [https://doi.org/10.5676/DWD_GPCC/MONTHLY_V2025_250](https://doi.org/10.5676/DWD_GPCC/MONTHLY_V2025_250).
- Vicente-Serrano, S. M., Beguería, S. & López-Moreno, J. I. (2010).
  *A Multiscalar Drought Index Sensitive to Global Warming: The Standardized
  Precipitation Evapotranspiration Index*. [https://doi.org/10.1175/2009JCLI2909.1](https://doi.org/10.1175/2009JCLI2909.1).
- Beguería, S., et al. (2014). *Standardized precipitation
  evapotranspiration index (SPEI) revisited*. [https://doi.org/10.1002/joc.3887](https://doi.org/10.1002/joc.3887).
- Wiese, D. N., et al. (2024). *Tellus Level-4 Greenland/Antarctica Mass
  Anomaly Time Series, RL06.3Mv04*. PO.DAAC.
  [Grónsko](https://doi.org/10.5067/TEMSC-GT634) ·
  [Antarktida](https://doi.org/10.5067/TEMSC-AT634).

### Data Weather Global

Přesné verze, období, projektové transformace, licenční údaje a omezení
grafů jsou inventarizovány v průvodním pracovním dokumentu
[`clanek_cz.md`](./clanek_cz.md). Vydání atlasu je nezávislý prohlížeč
vybraných dat a není oficiálním produktem NASA, NOAA, IPCC, DWD/GPCC,
NSIDC ani jiného poskytovatele.

## Redakční poznámky k další revizi

1. Rozhodnout, zda budou národní emise a změny využití půdy v hlavním
   textu, nebo v samostatném kontextovém boxu.
2. Pro tvrzení o požárním riziku lesů a místních dopadech doplnit další
   konkrétní primární či autoritativní zdroje.
3. Při finalizaci bibliografie potvrdit citační metadata odborného článku
   GCB; datový DOI a DOI studie jsou odlišné záznamy.
4. Zkontrolovat všechny odkazy na grafy, aktuální hodnoty a případné
   změny datových snapshotů před publikací.

## Slovníček pojmů, zkratek a jednotek

### Pojmy a zkratky

- **Absolutní decoupling (absolutní oddělení)** — situace, kdy ekonomika
  roste, zatímco celkové emise klesají. Na rozdíl od relativního
  decouplingu nejde pouze o pomalejší růst emisí než HDP.
- **Anomálie** — odchylka hodnoty od stanovené referenční hodnoty nebo
  průměru. Význam závisí na zvoleném referenčním období.
- **AR6** — šestá hodnoticí zpráva Mezivládního panelu pro změnu klimatu
  (IPCC), vydaná v letech 2021–2023.
- **BLUE, OSCAR a LUCE** — názvy samostatných modelů používaných pro
  odhad emisí ze změn využití půdy. Jejich výsledky se v článku drží
  odděleně.
- **CDR (Carbon Dioxide Removal)** — odstraňování oxidu uhličitého
  z atmosféry a jeho ukládání v geologických, suchozemských či oceánských
  úložištích nebo v produktech. V kontextu NOAA se zkratka CDR používá
  také pro **Climate Data Record**, tedy dlouhodobý klimatický datový
  záznam; význam určuje příslušný zdroj.
- **CMIP6** — šestá fáze projektu Coupled Model Intercomparison Project,
  v jejímž rámci jsou porovnávány klimatické modely.
- **Decoupling (oddělení emisí od ekonomického růstu)** — vztah, při němž
  se emise a ekonomický výkon vyvíjejí rozdílným tempem. Relativní
  decoupling znamená pomalejší růst emisí než ekonomiky; absolutní
  decoupling znamená pokles emisí při růstu ekonomiky.
- **DWD/GPCC** — Německá meteorologická služba (Deutscher Wetterdienst)
  a její Globální centrum klimatologie srážek (Global Precipitation
  Climatology Centre).
- **GCB (Global Carbon Budget)** — každoroční globální uhlíková bilance
  projektu Global Carbon Project; shrnuje odhady zdrojů, propadů
  a změn uhlíku v atmosféře.
- **GISTEMP** — GISS Surface Temperature Analysis, globální teplotní
  analýza NASA Goddard Institute for Space Studies (GISS).
- **GRACE a GRACE-FO** — družicové mise Gravity Recovery and Climate
  Experiment a její pokračování Follow-On, které mimo jiné umožňují
  odhadovat změny hmotnosti ledových štítů.
- **GML** — Global Monitoring Laboratory amerického Národního úřadu
  pro oceán a atmosféru (NOAA), který sleduje mimo jiné skleníkové plyny.
- **HDP** — hrubý domácí produkt, peněžní vyjádření hodnoty finálních
  statků a služeb vytvořených na daném území za určité období.
- **IEA** — Mezinárodní energetická agentura (International Energy
  Agency).
- **IPCC** — Mezivládní panel pro změnu klimatu (Intergovernmental Panel
  on Climate Change).
- **L-OTI** — Land–Ocean Temperature Index, ukazatel NASA GISTEMP, který
  kombinuje teplotní údaje nad pevninou a oceánem podle metodiky zdroje.
- **LU (Land Use)** — využívání půdy; v emisním účetnictví zahrnuje
  emise a propady související se změnami jejího využití.
- **NASA** — americký Národní úřad pro letectví a vesmír (National
  Aeronautics and Space Administration).
- **Niño 3.4** — oblast tropického Tichého oceánu používaná při
  sledování teplotních změn spojených s ENSO.
- **NOAA** — americký Národní úřad pro oceán a atmosféru (National
  Oceanic and Atmospheric Administration).
- **NSIDC** — americké Národní centrum pro údaje o sněhu a ledu
  (National Snow and Ice Data Center).
- **OHC (Ocean Heat Content)** — tepelný obsah oceánu, tedy množství
  tepla uloženého v určené vrstvě oceánské vody.
- **Propad uhlíku** — proces nebo zásobník, který odnímá více uhlíku,
  než do atmosféry uvolňuje, za období a hranic vymezených konkrétní
  metodikou.
- **RONI (Relative Oceanic Niño Index)** — relativní index teploty
  v oblasti Niño 3.4 vztažený k tropům; zachycuje část meziroční
  variability tropického Tichého oceánu.
- **SPEI (Standardized Precipitation Evapotranspiration Index)** —
  standardizovaný index srážek a potenciální evapotranspirace používaný
  k charakterizaci suchých a vlhkých podmínek.
- **SPEI-3 / SPEI-12** — SPEI vypočtený z tříměsíčního, respektive
  dvanáctiměsíčního akumulačního okna.
- **SST (Sea Surface Temperature)** — teplota povrchu moře.
- **SSP (Shared Socioeconomic Pathway)** — společná socioekonomická
  trajektorie používaná jako soubor předpokladů pro klimatické scénáře.
  Číslo za pomlčkou, například v SSP2-4.5, označuje přibližné radiační
  působení pro rok 2100 ve W/m².
- **WMO** — Světová meteorologická organizace (World Meteorological
  Organization).

### Jednotky a značky

- **CO₂, CH₄, N₂O** — oxid uhličitý, metan a oxid dusný.
- **GMSL (Global Mean Sea Level)** — globální průměrná hladina moře.
- **Gt, Mt, Tg** — gigatuna (\(10^9\) tun), megatuna (\(10^6\) tun)
  a teragram (\(10^{12}\) gramů); všechny tři jednotky odpovídají
  hmotnosti.
- **GtC, MtC, TgC** — gigatuna, megatuna a teragram uhlíku. Nejde
  o jednotky hmotnosti CO₂; pro stechiometrický převod z uhlíku na CO₂
  se násobí poměrem \(44/12\).
- **GtCO₂, MtCO₂** — gigatuna a megatuna oxidu uhličitého.
- **J a ZJ** — joule a zettajoule (\(10^{21}\) J), jednotky energie.
- **ppb (parts per billion)** — počet částic na miliardu částic směsi.
- **ppm (parts per million)** — počet částic na milion částic směsi.
- **W/m²** — watt na metr čtvereční, jednotka toku energie na plochu;
  v kontextu scénářů SSP se používá pro radiační působení.

Ve vzorci uhlíkové bilance označují \(E_{\mathrm{FOS}}\) fosilní emise,
\(E_{\mathrm{LUC}}\) emise ze změn využití půdy, \(G_{\mathrm{ATM}}\)
růst uhlíku v atmosféře, \(S_{\mathrm{OCEAN}}\) oceánský propad,
\(S_{\mathrm{LAND}}\) pevninský propad a \(B_{\mathrm{IM}}\)
neuzavřenost bilance.
