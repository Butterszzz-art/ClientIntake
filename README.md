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
  berekeningen, geen overzicht, geen data van andere cliënten. Na het
  versturen downloadt de cliënt een `.json`-bestand en stuurt dat zelf naar
  jou (WhatsApp, e-mail, AirDrop, ...).
- **`coach.html` — jouw dashboard.** Cliëntenlijst, "Importeer JSON" (voor de
  bestanden die cliënten terugsturen), de berekeningen-stap en het overzicht.
  Bookmark deze URL voor jezelf; deel hem niet met cliënten.

Omdat dit een statische site zonder server/login is, is er geen "echte"
toegangscontrole mogelijk — zie de sectie **Pincode-gate** hieronder voor wat
dat in de praktijk betekent en waarom dat voor dit gebruik voldoende is.

### Handoff-workflow (geen backend nodig)

1. Coach deelt de link naar `index.html` met een (nieuwe) cliënt.
2. Cliënt vult het formulier in op zijn/haar eigen apparaat. Tussentijds wordt
   een concept lokaal in de browser van de cliënt bewaard (`pt-intake:client-draft:v1`),
   zodat een per ongeluk gesloten tabblad niets kost.
3. Cliënt klikt **Versturen** → browser downloadt `<naam>-intake.json` → cliënt
   stuurt dat bestand naar de coach.
4. Coach opent `coach.html`, klikt **Importeer JSON**, selecteert het bestand.
   De cliënt verschijnt in de lijst; berekeningen worden bij het openen
   automatisch gegenereerd.

Er wordt nergens automatisch iets verstuurd of naar een server geüpload — het
bestand gaat letterlijk alleen via het kanaal dat de cliënt zelf kiest.

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

## Bestandsstructuur

| Bestand | Rol |
|---|---|
| `index.html` | Cliëntformulier — het enige wat cliënten te zien krijgen |
| `client.js` | Logica voor `index.html`: concept-autosave, versturen (JSON-download), bedankt-scherm |
| `coach.html` | Coach-dashboard — cliëntenlijst, intake (handmatige invoer), berekeningen, overzicht |
| `app.js` | Logica voor `coach.html`: rendering, `localStorage`, export/import, pincode-gate |
| `coach-auth.js` | Lokale pincode-gate voor `coach.html` (zie hierboven) |
| `intake-form.js` | Gedeeld tussen `client.js` en `app.js`: schema-factory, formulier lezen/invullen, tag-input/kracht-tabel/apparatuur-widgets |
| `utils.js` | Kleine gedeelde helpers: `escapeHtml`, `fmt`, `num`, `downloadJson` |
| `calculations.js` | Pure rekenfuncties (geen DOM, geen side-effects) — het herbruikbare contract, alleen gebruikt door `app.js` |
| `styles.css` | Donker/industrieel thema, responsive, print-stylesheet |
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
        "naam": "string", "leeftijd": 0, "lengte": 0, "gewicht": 0,
        "vetpercentage": 0, "geslacht": "man|vrouw|anders", "trainingservaring": 0
      },
      "huidigeKracht": [
        { "oefening": "string", "kg": 0, "herhalingen": 0, "sets": 0 }
      ],
      "doel": {
        "tekst": "string",
        "categorie": "vetverlies|spieropbouw|onderhoud|krachttoename"
      },
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
      "materiaal": { "laagstePlaat": 0, "dumbbellStapgrootte": 0, "apparatuur": ["string"] },
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

1. Open de link die je van je coach hebt gekregen.
2. Vul het formulier in het Nederlands in. Tussentijds opslaan gebeurt
   automatisch (lokaal, alleen op dit apparaat).
3. **Versturen** → er downloadt een `<naam>-intake.json` bestand.
4. Stuur dat bestand naar je coach (WhatsApp, e-mail, AirDrop, ...). Klaar.

### Als coach (`coach.html`)

1. Eerste keer: stel een pincode in voor het dashboard.
2. **Importeer JSON** → selecteer een bestand dat een cliënt heeft teruggestuurd.
   De cliënt verschijnt in de lijst.
3. Wil je zelf een intake invoeren (bv. tijdens een intakegesprek)? **+ Nieuwe
   cliënt** → vul het formulier zelf in.
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
