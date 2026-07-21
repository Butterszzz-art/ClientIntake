# PT Intake & Overzicht

Statische web-app (vanilla HTML/CSS/JS, geen build-stap) voor personal trainers:
zet een cliënt-intake automatisch om in een trainings- en voedingsoverzicht.
Draait volledig client-side — data wordt opgeslagen in `localStorage` van de
browser, met JSON-export/import als portable back-up- en koppelformaat.

## Twee aparte pagina's — cliënt ziet nooit het coach-dashboard

Dit project bestaat uit **twee losstaande HTML-pagina's** die niets met elkaar
delen behalve de rekenlogica en het JSON-schema:

- **`index.html` (root) — het cliëntformulier.** Dit is de link die je naar
  cliënten stuurt. Hij bevat alléén de intake: geen cliëntenlijst, geen
  berekeningen, geen overzicht, geen data van andere cliënten. Het formulier
  spreekt de cliënt aan als **Arman Bahali persoonlijk** (ik-vorm), niet als
  een team of bedrijf. Na het versturen wordt de intake automatisch naar
  Arman gemaild (zie hieronder) én gedownload als `.json`-bestand voor de
  cliënt zelf.
- **`coach.html` — jouw dashboard.** Cliëntenlijst, "Importeer JSON" (voor
  bestanden die je los binnenkrijgt, bv. als de automatische mail een keer
  mislukt), de berekeningen-stap en het overzicht. Bookmark deze URL voor
  jezelf; deel hem niet met cliënten.

Omdat dit een statische site zonder server/login is, is er geen "echte"
toegangscontrole mogelijk — zie de sectie **Pincode-gate** hieronder voor wat
dat in de praktijk betekent en waarom dat voor dit gebruik voldoende is.

### Handoff-workflow: automatische e-mail via Web3Forms

Cliëntdata verlaat de browser van de cliënt op twee manieren tegelijk:

1. Coach deelt de link naar `index.html` met een (nieuwe) cliënt.
2. Cliënt vult het formulier in op zijn/haar eigen apparaat. Tussentijds wordt
   een concept lokaal in die browser bewaard (`pt-intake:client-draft:v1`),
   zodat een per ongeluk gesloten tabblad niets kost.
3. Cliënt klikt **Versturen**. Er gebeurt dan meteen twee dingen:
   - De browser **downloadt** `<naam>-intake.json` (altijd, ongeacht of de
     e-mail lukt) — de cliënt heeft dus zelf ook een kopie.
   - `client.js` **post** de intake naar [Web3Forms](https://web3forms.com),
     die het doorstuurt naar `armanbahali@pocketcoachcoms.org`. De e-mail
     bevat een leesbare samenvatting van alle velden in de body — **geen
     JSON-bijlage**, want Web3Forms' gratis tier weigert de hele inzending
     zodra er een bestand wordt meegestuurd ("Pro feature required"). Het
     JSON-bestand blijft dus alléén beschikbaar via de download in stap 3.
   - Het bedankt-scherm toont live of het versturen gelukt is. Lukt het niet
     (geen internet, Web3Forms plat, etc.), dan staat er expliciet dat de
     cliënt het gedownloade bestand zelf moet doorsturen.
4. Coach leest de mail voor een snel overzicht, en importeert — als hij de
   berekeningen/het overzicht in het dashboard wil — het door de cliënt
   toegestuurde `.json`-bestand via **Importeer JSON** op `coach.html`. De
   cliënt verschijnt in de lijst; berekeningen worden bij het openen
   automatisch gegenereerd.

**Beperking om te weten:** omdat het gratis Web3Forms-plan geen bijlagen
ondersteunt, komt het JSON-bestand nooit automatisch bij de coach terecht —
alleen de leesbare samenvatting doet dat. Wil je dat de cliënt niets meer
handmatig hoeft door te sturen, dan is de enige optie een betaald Web3Forms-
plan (zie hieronder).

**Bekend betrouwbaarheidsprobleem:** in de praktijk is gebleken dat Web3Forms
soms `success: true` teruggeeft (het bedankt-scherm toont dan "Verstuurd naar
Arman") terwijl de e-mail nooit aankomt — vermoedelijk stille spamfiltering
door Web3Forms zelf of door de ontvangende mailserver, getriggerd door de
inhoud van een specifieke inzending. Test-inzendingen met neutrale tekst
kwamen wél aan; een echte intake met gevoelige vrije tekst (blessures, PEDs,
dieet, motivatie) niet. Daarom is de app niet blind vertrouwd op deze status:
- De statustekst claimt nu alleen dat er verstuurd is, niet dat het is
  aangekomen.
- Er staat op het bedankt-scherm altijd (niet alleen bij een gemelde fout)
  een knop **"Mail dit bestand naar Arman"** — een `mailto:`-link naar
  `armanbahali@pocketcoachcoms.org`, volledig onafhankelijk van Web3Forms.
  De cliënt moet het gedownloade bestand daarbij nog wel zelf als bijlage
  toevoegen (`mailto:` kan dat niet automatisch).
- Check bij twijfel over een gemiste inzending het
  [Web3Forms-dashboard](https://web3forms.com) (inloggen met
  `armanbahali@pocketcoachcoms.org`) voor de inzendingsgeschiedenis, en de
  spamfolder van dat mailadres.

**Over de Web3Forms-koppeling:** `client.js` bevat een public **access key**
(`4e27ae27-18e9-4a54-bdc7-bd8c4e316a48`), aangemaakt op web3forms.com en
gekoppeld aan `armanbahali@pocketcoachcoms.org`. Dit is bewust een publieke
sleutel — Web3Forms is zo ontworpen dat deze sleutel zichtbaar in
client-side code mag staan; misbruik is alleen mogelijk als vervelende mail
náár dat ene adres, niet als toegang tot data. Wil je het versturen naar een
ander e-mailadres laten gaan, maak dan een nieuwe access key aan op
web3forms.com voor dat adres en vervang de waarde van `WEB3FORMS_ACCESS_KEY`
bovenaan `client.js`.

Wil je later JSON-bijlagen wél automatisch laten meesturen (zodat importeren
niet meer nodig is), dan moet het Web3Forms-account naar een betaald plan
(vanaf hun "Pro" tier); in `verstuurNaarArman()` in `client.js` voeg je dan
weer een `formData.append('attachment', blob, bestandsnaam)`-regel toe met
het JSON-bestand als `Blob` (zoals ook bij de lokale download gebeurt).

## Pincode-gate op het coach-dashboard

`coach.html` vraagt bij het eerste gebruik om een pincode in te stellen, en
daarna bij elk bezoek (per browsersessie) om die pincode in te voeren voordat
er iets van het dashboard zichtbaar wordt.

**Belangrijk om te beseffen: dit is geen echte beveiliging.** Er is geen
server, dus er is geen manier om een wachtwoord écht af te dwingen — iemand
met devtools-toegang tot deze browser kan de gate omzeilen of de opgeslagen
pincode-hash wissen. Het doel is puur om te voorkomen dat een cliënt die
toevallig de dashboard-link tegenkomt (of een voorbijganger op een gedeeld
apparaat) zomaar cliëntgegevens ziet. Zolang je de `coach.html`-link niet deelt
met cliënten, is de pincode een extra vangnet, geen vervanging daarvoor.

De pincode-hash (SHA-256, geen plaintext) staat lokaal in `localStorage`
(`pt-intake:coach-pin-hash:v1`); de ontgrendeling geldt per browsersessie
(`sessionStorage`). Er is geen "wachtwoord vergeten"-flow met herstel — de
enige uitweg is de knop **"Pincode vergeten? Reset alles"**, die expliciet
waarschuwt dat dit *alle* lokale cliëntgegevens op dat apparaat wist.

### Coach-toegang vanaf de rootURL

Omdat de rootURL (`index.html`) het cliëntformulier is — de link die je
overal deelt — heb je waarschijnlijk geen apart bladwijzer naar `coach.html`.
Onderaan het cliëntformulier staat daarom een klein, laagdrempelig
**"Coach"**-linkje (bewust onopvallend gestyled — een cliënt heeft geen
reden om het op te merken of erop te klikken). Klik je erop, dan verschijnt
een pincode-veldje: vul dezelfde pincode in als je op `coach.html` gebruikt,
en je komt direct in het ontgrendelde dashboard terecht (geen tweede prompt).
Is er nog geen pincode ingesteld, dan toont het paneeltje in plaats daarvan
een link om naar `coach.html` te gaan en er daar één aan te maken.

Deze pincode-verificatie hergebruikt exact dezelfde hash-logica als de gate
op `coach.html` (`hashPin`/`PIN_HASH_KEY` geëxporteerd vanuit
`coach-auth.js`) — er is dus maar één pincode om te onthouden, niet twee.

## Taal — nl / en / es / pt (alleen op het cliëntformulier)

`index.html` heeft een taalkeuze rechtsboven (Nederlands/English/Español/Português).
Bij het eerste bezoek wordt de browsertaal gebruikt als die een van de vier is,
anders Nederlands; de keuze van de cliënt wordt daarna onthouden
(`pt-intake:client-taal:v1` in `localStorage`) voor een volgend bezoek.

Alle labels, knoppen, hints en het bedankt-scherm vertalen mee. Twee dingen
vertalen bewust **niet**:
- **De e-mail naar Arman** (`bouwSamenvatting()` in `client.js`) staat altijd
  in het Nederlands, ongeacht de taal van de cliënt — Arman is de enige lezer.
- **Waardes die deel zijn van het schema** (`doel.categorie`, `geslacht`,
  `activityLevel`, `stressLevel`, `slaap.kwaliteit`) blijven de vaste
  Nederlandse enum-strings uit het schema (bv. `"vetverlies"`); alleen de
  zichtbare tekst in de `<option>` verandert mee met de taal.

`coach.html` is en blijft volledig Nederlandstalig — het is Armans eigen tool,
geen cliëntgerichte pagina.

**Schema-wijziging om te weten:** `intake.materiaal.apparatuur` bevatte
voorheen Nederlandse labels (bv. `"Squat rek"`) als waarde. Om dezelfde data
consistent te houden ongeacht de taal waarin een cliënt het formulier invult,
zijn dit nu vaste, onvertaalde sleutels (bv. `"squat_rack"`) — zie
`APPARATUUR_OPTIES` in `intake-form.js` voor de volledige lijst en
`i18n.js` voor de vertaalde labels per taal. Oudere geëxporteerde JSON-bestanden
met de vorige (Nederlandse) waarden blijven gewoon importeren, maar tonen dan
de rauwe oude labels in plaats van vertaalde labels.

## Bestandsstructuur

| Bestand | Rol |
|---|---|
| `index.html` | Cliëntformulier — het enige wat cliënten te zien krijgen |
| `client.js` | Logica voor `index.html`: concept-autosave, versturen (Web3Forms-mail + JSON-download), bedankt-scherm |
| `coach.html` | Coach-dashboard — cliëntenlijst, intake (handmatige invoer), berekeningen, overzicht |
| `app.js` | Logica voor `coach.html`: rendering, `localStorage`, export/import, pincode-gate |
| `coach-auth.js` | Lokale pincode-gate voor `coach.html` (zie hierboven) |
| `intake-form.js` | Gedeeld tussen `client.js` en `app.js`: schema-factory, formulier lezen/invullen, tag-input/kracht-tabel/apparatuur-widgets |
| `i18n.js` | Vertaalwoordenboek (nl/en/es/pt) en helpers, alleen gebruikt door `client.js` — `coach.html` blijft Nederlandstalig |
| `utils.js` | Kleine gedeelde helpers: `escapeHtml`, `fmt`, `num`, `downloadJson` |
| `calculations.js` | Pure rekenfuncties (geen DOM, geen side-effects) — het herbruikbare contract, alleen gebruikt door `app.js` |
| `styles.css` | Donker thema (zwart/donkergroen/lichtgroen), responsive, print-stylesheet |
| `README.md` | Dit bestand |

`index.html` en `coach.html` renderen dezelfde `<form id="intake-form">`
fieldsets (zelfde element-`id`'s), zodat `intake-form.js` één keer geschreven
kan worden en door beide pagina's hergebruikt wordt. Dat is bewust HTML-duplicatie
in ruil voor JS-hergebruik — een normale afweging bij een statische multi-page
site zonder build-stap/templating.

## Waarom dit zo is opgezet (toekomstige integratie)

Dit project is bewust zo gebouwd dat het later 1-op-1 gekoppeld kan worden aan
een backend/API of aan een andere fitness-app, zonder herschrijven:

- Alle cliëntdata volgt één vast **JSON-schema** (hieronder).
- `calculations.js` bevat **pure functies**: input → output, niets anders.
  Ze zijn direct te hergebruiken in Node/een backend of in een andere
  JS-codebase — kopieer het bestand en het werkt, want het raakt nooit de DOM.
- **Export/import** van cliënt-JSON zit al in de app (`app.js`), zodat een
  toekomstige integratie dezelfde envelope (`{ "client": { ... } }`) kan lezen
  en schrijven als een API request/response body.

## JSON-schema

Elke cliënt is één object met deze vorm (opgeslagen als array van dit soort
objecten in `localStorage`, en als `{ "client": {...} }` bij export):

```json
{
  "client": {
    "id": "uuid",
    "naam": "string",
    "createdAt": "ISO date",
    "intake": {
      "persoonsgegevens": {
        "naam": "string", "email": "string", "leeftijd": 0, "lengte": 0, "gewicht": 0,
        "vetpercentage": 0, "geslacht": "man|vrouw|anders", "trainingservaring": 0
      },
      "huidigeKracht": [
        { "oefening": "string", "kg": 0, "herhalingen": 0, "sets": 0 }
      ],
      "doel": {
        "tekst": "string",
        "categorie": "vetverlies|spieropbouw|onderhoud|krachttoename"
      },
      "motivatieMindset": { "motivatie": "string", "mentaleInstelling": "string" },
      "trainingsfrequentie": {
        "huidig": 0,
        "trainingsmomenten": ["string"],
        "baan": { "type": "string", "urenZittend": 0, "urenStaand": 0 }
      },
      "blessures": { "tekst": "string", "vermijdenOefeningen": ["string"] },
      "dieet": { "huidig": "string", "voorkeuren": ["string"], "afkeuren": ["string"] },
      "peds": { "gebruikt": false, "toelichting": "string" },
      "lifestyle": {
        "activityLevel": "sedentair|licht actief|actief",
        "stressLevel": "laag|gemiddeld|hoog",
        "slaap": { "uren": 0, "kwaliteit": "slecht|matig|goed" },
        "cafeine": 0
      },
      "vetpercentageMeting": { "huidplooimeter": false },
      "materiaal": { "laagstePlaat": 0, "dumbbellStapgrootte": 0, "apparatuur": ["squat_rack", "..."] },
      "supplementen": "string",
      "genen": { "polsomtrek": 0, "enkelomtrek": 0, "gewichtVoorheen": "string", "zwareBaby": false }
    },
    "instellingen": {
      "energiebalansFactor": 1.0, "eiwitFactor": 1.8, "percentageVetVanREE": 0.4,
      "trainingsdagenPerWeek": 3, "trainingsduurMinuten": 60, "MET": 5.7,
      "pal": 1.2, "tef": 1.1, "aantalMaaltijden": 4
    },
    "calculations": {
      "vetvrijeMassa": 0,
      "bmr": 0,
      "ee": 0,
      "ree": 0,
      "totaalTrainingsdag": 0,
      "onderhoudPerDag": 0,
      "beoogdeInnameRustdag": 0,
      "beoogdeInnameTrainingsdag": 0,
      "macros": { "eiwit": 0, "vet": 0, "koolhydratenRustdag": 0, "koolhydratenTrainingsdag": 0 },
      "maaltijdVerdeling": {
        "rustdag": [{ "maaltijd": 1, "postTraining": false, "eiwit": 0, "vet": 0, "koolhydraten": 0, "kcal": 0 }],
        "trainingsdag": [{ "maaltijd": 1, "postTraining": false, "eiwit": 0, "vet": 0, "koolhydraten": 0, "kcal": 0 }]
      },
      "frameSize": { "enkelomtrek": 0, "afwijking": 0, "binnenNorm": true },
      "rm": [{ "oefening": "string", "kg": 0, "herhalingen": 0, "sets": 0, "geschat1RM": 0 }],
      "instellingenGebruikt": { "...": "zelfde vorm als client.instellingen, met defaults ingevuld" },
      "advies": {
        "splitsdagen": { "naam": "string", "dagen": ["string"] },
        "blessureConflicten": [{ "oefening": "string", "reden": "string" }]
      },
      "rodeVlaggen": [{ "niveau": "rood|oranje|info", "bericht": "string" }]
    }
  }
}
```

`instellingen` en `calculations` zijn twee toevoegingen bovenop de door de
opdrachtgever aangeleverde schema-skelet: `instellingen` bewaart de door de
coach aangepaste knoppen (energiebalans, eiwitfactor, aantal maaltijden, ...),
`calculations` is exact zoals gespecificeerd plus een paar velden
(`maaltijdVerdeling`-items, `instellingenGebruikt`, `advies`, `rodeVlaggen`)
die nodig waren om het overzichtsscherm te vullen. Alle oorspronkelijk
gevraagde `calculations`-sleutels zijn ongewijzigd aanwezig.

## Rekenfuncties (`calculations.js`)

Alle functies zijn pure ES-module exports: zelfde input → altijd zelfde
output, geen DOM-toegang. `berekenClient(intake, instellingen)` is het enige
entrypoint dat de app zelf aanroept; de rest zijn de bouwstenen daaronder
(handig om los te hergebruiken, bijvoorbeeld om alleen een 1RM te herberekenen).

| Functie | Input | Output | Betekenis |
|---|---|---|---|
| `vetvrijeMassa(gewicht, vetpct)` | kg, % | kg | Vetvrije massa (VVM) |
| `katchMcArdleBMR(vvm)` | kg | kcal | Basaalmetabolisme via Katch-McArdle |
| `energieverbruikTrainingsdag(gewicht, duurMinuten, MET=5.7)` | kg, min, MET | kcal | Energieverbruik van de training zelf (EE) |
| `energieverbruikRustdag(bmr, pal, tef)` | kcal, factor, factor | kcal | Totaal energieverbruik op een rustdag (REE) |
| `totaalEnergieTrainingsdag(ree, ee, tef)` | kcal, kcal, factor | kcal | Totaal verbruik op een trainingsdag |
| `onderhoudsinnamePerDag(totaalTrainingsdag, ree, trainingsdagenPerWeek)` | kcal, kcal, dagen | kcal | Wekelijks gemiddelde onderhoudsinname/dag |
| `beoogdeInnameRustdag(onderhoudPerDag, energiebalansFactor)` | kcal, factor | kcal | Streefinname op een rustdag |
| `beoogdeInnameTrainingsdag(beoogdeInnameRustdag, ee)` | kcal, kcal | kcal | Streefinname op een trainingsdag |
| `eiwitGrammen(gewicht, factor=1.8)` | kg, g/kg | g | Dagelijkse eiwitbehoefte |
| `vetGrammen(ree, percentageVanREE=0.40)` | kcal, % | g | Dagelijkse vetbehoefte |
| `koolhydratenGrammen(beoogdeKcal, eiwitGrammen, vetGrammen)` | kcal, g, g | g | Resterende koolhydraten na eiwit/vet |
| `geschat1RM(gewicht, reps)` | kg, reps | kg | Epley-schatting van 1 rep max |
| `repTargetGewicht(rm, gewenstPercentage1RM)` | kg, % | kg | Werkgewicht bij een gewenst %1RM |
| `werkcapaciteit(oudeSet, nieuweSet)` | getal, getal | % | Procentuele progressie tussen twee metingen (bv. volume) |
| `frameSizeCheck(enkelomtrek)` | cm | `{enkelomtrek, afwijking, binnenNorm}` | Frame-size check (Karakas & Bozkir, 2007; norm 21.9 cm ±1.3 cm) |
| `verdeelMaaltijden(totalen, aantalMaaltijden)` | `{eiwit,vet,koolhydraten}`, 2–6 | array van maaltijden | Verdeelt macro's over maaltijden; eiwit dubbel na training |
| `palVoorActiviteitsniveau(activityLevel)` | string | getal | Standaard PAL-waarde per activiteitsniveau |
| `energiebalansFactorVoorDoel(doelCategorie)` | string | getal | Standaard energiebalans-factor per doel |
| `bepaalSplitsdagen(trainingsdagenPerWeek)` | dagen/week | `{naam, dagen}` | Voorgestelde trainingssplit |
| `detecteerBlessureConflicten(blessures)` | `{tekst, vermijdenOefeningen}` | array | Matcht gemelde blessures/vermijdlijst tegen standaardoefeningen |
| `genereerRodeVlaggen(intake, calculations)` | intake, calculations | array | Automatische coach-waarschuwingen |
| `berekenClient(intake, instellingen)` | intake, instellingen (optioneel) | volledig `calculations`-object | Orchestreert alle bovenstaande functies |

### Aannames / standaardwaarden

De opdracht gaf exacte formules maar niet elke constante. Deze defaults zijn
gekozen en overal in de UI aanpasbaar (stap 2, "Berekeningen controleren"):

- **PAL** (activiteitsfactor buiten training): sedentair `1.2`, licht actief
  `1.375`, actief `1.55`.
- **TEF** (voedsel-thermogenese): `1.1` (10%).
- **Energiebalans-factor** per doel: vetverlies `0.8`, onderhoud `1.0`,
  spieropbouw `1.1`, krachttoename `1.05`.
- **Eiwit**: `1.8` g/kg (instelbaar 1.6–1.8 g/kg, zoals gevraagd).
- **Vet**: `40%` van de REE.
- **Aantal maaltijden**: `4` (instelbaar 2–6).
- **Trainingsduur**: `60` minuten, **MET**: `5.7`.

## Gebruik

### Als cliënt (`index.html`)

1. Open de link die je van Arman hebt gekregen.
2. Vul het formulier in het Nederlands in — inclusief wat je motiveert en hoe
   je mentaal in elkaar zit, zodat hij je als persoon leert kennen, niet
   alleen als cijfers. Tussentijds opslaan gebeurt automatisch (lokaal,
   alleen op dit apparaat).
3. **Versturen** → je intake wordt automatisch naar Arman gemaild, én
   gedownload als `<naam>-intake.json` voor jezelf.
4. Het bedankt-scherm laat zien of het versturen gelukt is. Zo niet: stuur het
   gedownloade bestand alsnog even zelf door (WhatsApp, e-mail, AirDrop, ...).

### Als coach (`coach.html`)

1. Eerste keer: stel een pincode in voor het dashboard.
2. **Importeer JSON** → selecteer een bestand dat een cliënt heeft teruggestuurd.
   De cliënt verschijnt in de lijst.
3. Wil je zelf een intake invoeren (bv. tijdens een intakegesprek)? **+ Nieuwe
   cliënt** → vul het formulier zelf in.
3b. **Snelle rekentool** (knop naast "+ Nieuwe cliënt") → losse, directe
   berekeningen (voeding, frame size, 1RM &amp; rep target, werkcapaciteit)
   zonder dat er een cliëntprofiel wordt aangemaakt of iets wordt opgeslagen —
   handig tijdens een gesprek of ter controle. Gebruikt dezelfde functies uit
   `calculations.js` als de rest van de app. Alleen bereikbaar via
   `coach.html`; cliënten zien dit nergens.
4. Klik een cliënt aan → **Berekeningen controleren**: pas instellingen aan
   indien nodig (herrekent live) en check de tooltip-teksten onder elk
   kerncijfer.
5. **Naar overzicht** → het cliënt-dashboard: kerncijfers, voedingstabellen
   per maaltijd, trainingsadvies, blessure-aandachtspunten, rode vlaggen.
6. **Print / PDF** gebruikt de browser-printfunctie met een print-specifieke
   stylesheet (navigatie verborgen, licht thema voor papier).
7. **Export JSON** downloadt het volledige cliëntprofiel + berekeningen (bv.
   als back-up, of om over te zetten naar een ander apparaat).
8. **Vergrendel** (knop in de header) sluit het dashboard direct af zonder
   data te wissen — handig als je even wegloopt bij een gedeeld apparaat.

Alle cliënten staan in `localStorage` onder de sleutel `pt-intake:clients:v1`,
alléén in de browser waarin je `coach.html` gebruikt. Wissen van browserdata
verwijdert ze — exporteer dus regelmatig als back-up.

## Deployen naar GitHub Pages

1. Maak een nieuwe (of gebruik deze) GitHub-repository en push de bestanden:
   ```bash
   git init
   git add index.html client.js coach.html app.js coach-auth.js intake-form.js utils.js calculations.js styles.css README.md
   git commit -m "Initial commit: PT intake app"
   git branch -M main
   git remote add origin <jouw-repo-url>
   git push -u origin main
   ```
2. Ga naar **Settings → Pages** in de GitHub-repo.
3. Kies bij **Source**: branch `main`, map `/ (root)`.
4. Na een minuut is de app live:
   - Cliëntformulier: `https://<gebruikersnaam>.github.io/<repo-naam>/`
   - Coach-dashboard: `https://<gebruikersnaam>.github.io/<repo-naam>/coach.html`
     (bookmark deze zelf — deel hem niet met cliënten)

Voor lokaal testen: gebruik een lokale server (bv. `npx serve .` of
`python -m http.server`) in plaats van het bestand direct te openen — sommige
browsers blokkeren ES-module `import`/`export` op het `file://`-protocol.

### Cache-busting na een update

Elk lokaal bestand (`.js`, `.css`) wordt zowel in de `<script>`/`<link>`-tags
als in elke interne `import`-statement gevolgd door een versie-query,
bv. `client.js?v=2`. Zonder build-stap is dit de eenvoudigste manier om te
voorkomen dat een browser na een update stilletjes een oude, gecachete versie
van een bestand blijft gebruiken (dit gebeurde echt: een knop werkte niet meer
na een wijziging, puur omdat de browser nog de oude `client.js` in cache had).

**Verhoog dit versienummer overal tegelijk (alle `?v=N` in `index.html`,
`coach.html`, `client.js`, `app.js`, `intake-form.js`) telkens wanneer je een
van de `.js`- of `.css`-bestanden wijzigt en opnieuw deployt.** Vergeet je dit,
dan is het risico dat jij (niet je cliënten — zij laden alles voor het eerst)
een oude versie blijft zien totdat je handmatig een hard refresh doet
(Ctrl/Cmd+Shift+R) of de site-data van je browser wist.
