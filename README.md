# PT Intake & Overzicht

Web-app (vanilla HTML/CSS/JS, geen build-stap) voor personal trainers: zet een
cliënt-intake automatisch om in een trainings- en voedingsoverzicht. De
gehoste bestanden zijn nog steeds pure statische HTML/CSS/JS (bv. via GitHub
Pages), maar de data zelf leeft in **Firebase** (Firestore + Authentication)
in plaats van alleen in de browser van elke gebruiker — zo verschijnt een
cliënt-intake automatisch in het coach-dashboard, zonder handmatige stap.

## Twee aparte pagina's — cliënt ziet nooit het coach-dashboard

Dit project bestaat uit **twee losstaande HTML-pagina's** die dezelfde
Firestore-database delen, maar verder niets:

- **`index.html` (root) — het cliëntformulier.** Dit is de link die je naar
  cliënten stuurt. Hij bevat alléén de intake: geen cliëntenlijst, geen
  berekeningen, geen overzicht, geen data van andere cliënten. Het formulier
  spreekt de cliënt aan als **Arman Bahali persoonlijk** (ik-vorm), niet als
  een team of bedrijf. Na het versturen wordt de intake automatisch naar
  Firestore geschreven (zie hieronder) én gedownload als `.json`-bestand voor
  de cliënt zelf.
- **`coach.html` — jouw dashboard.** Log in met je coach-account (e-mail +
  wachtwoord) en de cliëntenlijst laadt live uit Firestore — een nieuwe
  intake verschijnt vanzelf, ook terwijl je ernaar kijkt. Bookmark deze URL
  voor jezelf; deel hem niet met cliënten.

Cliënten kunnen `coach.html` in theorie gewoon openen (het is een publieke
URL, net als elke pagina op een statische site), maar zonder in te loggen
zien ze niets — geen enkele cliëntgegeven wordt getoond of zelfs maar
opgehaald voordat Firebase bevestigt dat er een geldige sessie is. Dat is
*echte* toegangscontrole (afgedwongen door Firestore's security rules op de
server, niet alleen verborgen in de UI), in tegenstelling tot de oude lokale
pincode-gate uit een eerdere versie van dit project.

### Handoff-workflow: automatisch, via Firestore

1. Coach deelt de link naar `index.html` met een (nieuwe) cliënt.
2. Cliënt vult het formulier in op zijn/haar eigen apparaat. Tussentijds wordt
   een concept lokaal in die browser bewaard (`pt-intake:client-draft:v1`),
   zodat een per ongeluk gesloten tabblad niets kost.
3. Cliënt klikt **Versturen**. Er gebeuren dan drie dingen tegelijk:
   - `client.js` schrijft het cliëntprofiel rechtstreeks naar de
     `clients`-collectie in Firestore — dit is de **primaire, gezaghebbende**
     route. Firestore's security rules staan dit toe voor iedereen
     (`allow create: if true`), zonder dat de cliënt hoeft in te loggen.
   - De browser **downloadt** ook `<naam>-intake.json` als eigen back-up voor
     de cliënt.
   - Er gaat een **heads-up e-mail** naar Arman via Web3Forms (fire-and-forget,
     blokkeert niks) — een leesbare samenvatting, handig om snel te scannen,
     maar niet meer de manier waarop data in het dashboard terechtkomt.
   - Het bedankt-scherm toont of de Firestore-schrijfactie gelukt is. Lukt dat
     niet (geen internet, Firestore plat), dan staat er expliciet dat de
     cliënt het gedownloade bestand naar Arman moet mailen via de altijd
     zichtbare **"Mail dit bestand naar Arman"**-knop (`mailto:`, volledig
     onafhankelijk van zowel Firestore als Web3Forms).
4. Coach opent `coach.html` (al ingelogd, of logt in) en ziet de cliënt meteen
   in de lijst staan — geen import nodig. **Importeer JSON** blijft bestaan
   als handmatige fallback (bv. voor een bestand dat via de mailto-knop is
   binnengekomen); het schrijft het geïmporteerde profiel alsnog naar
   Firestore, zodat het net zo in de live lijst verschijnt.

**Over de Web3Forms-koppeling:** deze bestaat nog steeds als secundaire
notificatie (zie `verstuurNaarArman()` in `client.js`), met dezelfde
public access key en dezelfde beperkingen als eerder gedocumenteerd (geen
bijlage-ondersteuning op het gratis plan, en een bekend geval waarin Web3Forms
`success: true` teruggaf terwijl de mail nooit aankwam). Dat is nu minder
kritiek, omdat de Firestore-schrijfactie de échte bron van waarheid is voor
het dashboard — de e-mail is puur een bonus-notificatie.

## Firebase-architectuur

### Waarom dit nodig was

Zonder een gedeelde backend leven cliëntformulier en coach-dashboard in twee
volledig gescheiden browsers op twee verschillende apparaten. Er is dan
principieel geen manier waarop data van de één naar de ander kan "oversteken"
zonder een tussenstation dat beide kanten kunnen bereiken. Web3Forms (e-mail)
was zo'n tussenstation, maar levert alleen een leesbare samenvatting af in een
inbox — niet een structured record dat automatisch in een cliëntenlijst
verschijnt. Firestore lost dat op: beide pagina's lezen/schrijven naar
dezelfde database.

### Firestore

- **Collectie:** `clients`. Elk document = één cliënt-object, exact het
  schema hieronder (`id`, `naam`, `createdAt`, `intake`, `instellingen`,
  `calculations`), met het document-ID gelijk aan `client.id`.
- **Security rules** (ingesteld via de Firebase Console → Firestore Database
  → Rules):
  ```
  rules_version = '2';
  service cloud.firestore {
    match /databases/{database}/documents {
      match /clients/{clientId} {
        allow create: if true;
        allow read, update, delete: if request.auth != null;
      }
    }
  }
  ```
  Vertaling: **iedereen** (ook een niet-ingelogde cliënt) mag een nieuw
  cliëntprofiel aanmaken; **alleen een ingelogde gebruiker** mag iets lezen,
  bewerken of verwijderen. Firestore behandelt een schrijfactie naar een
  bestaand document-ID automatisch als `update` (niet `create`), dus een
  cliënt kan sowieso nooit andermans bestaande record overschrijven, zelfs
  niet als die het toevallige UUID zou raden.
- **Live updates:** `coach.html` gebruikt Firestore's `onSnapshot` (geen
  eenmalige `getDocs`) voor de cliëntenlijst — een nieuwe intake verschijnt
  dus zonder de pagina te hoeven verversen.

### Firebase Authentication

`coach.html` logt in met **e-mail + wachtwoord** via Firebase Auth
(`signInWithEmailAndPassword` in `coach-auth.js`). Er is precies één account
(dat van Arman) — er is bewust geen publieke registratieflow gebouwd. Een
"Wachtwoord vergeten?"-link stuurt een reset-mail via Firebase's ingebouwde
`sendPasswordResetEmail`. Een sessie blijft actief tot je op **Vergrendel**
klikt (roept `signOut` aan) of het wachtwoord ergens anders wijzigt — Firebase
regelt de sessie-persistentie zelf, dus dit werkt ook na een volledige
herstart van de browser.

Omdat Firebase's sessie-opslag gedeeld is tussen alle pagina's op hetzelfde
origin, hoeft `index.html`'s kleine **"Coach"**-linkje (onderaan, bewust
onopvallend gestyled) niets zelf te verifiëren — het is een simpele link naar
`coach.html`. Ben je daar al ingelogd, dan zie je meteen het dashboard; zo
niet, dan toont `coach.html` zijn eigen inlogscherm.

### Configuratie

`firebase.js` bevat het Firebase-configuratieobject (`apiKey`, `authDomain`,
`projectId`, ...). Dit is **geen geheime sleutel** — Firebase's `apiKey`
identificeert alleen het project; de daadwerkelijke beveiliging zit in de
security rules hierboven plus de login-eis. Het is dus geen probleem dat dit
object zichtbaar is in client-side code (het staat letterlijk in elke
Firebase-tutorial zo gedocumenteerd).

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
| `client.js` | Logica voor `index.html`: concept-autosave, versturen (Firestore-write + Web3Forms-mail + JSON-download), bedankt-scherm |
| `coach.html` | Coach-dashboard — cliëntenlijst (live uit Firestore), intake (handmatige invoer), berekeningen, overzicht |
| `app.js` | Logica voor `coach.html`: rendering, Firestore CRUD + live `onSnapshot`-lijst, export/import |
| `coach-auth.js` | Echte login voor `coach.html` via Firebase Auth (e-mail + wachtwoord), zie hierboven |
| `firebase.js` | Firebase-initialisatie (config + `db`/`auth`-instanties), gedeeld door `client.js` en `app.js` |
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

Elke cliënt is één object met deze vorm (zo opgeslagen als document in de
Firestore-collectie `clients`, en als `{ "client": {...} }` bij export):

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
3. **Versturen** → je intake wordt automatisch naar Firestore geschreven (zo
   verschijnt hij vanzelf in Armans dashboard), er gaat een heads-up e-mail
   naar Arman, én je krijgt zelf `<naam>-intake.json` als download.
4. Het bedankt-scherm laat zien of het opslaan gelukt is. Zo niet: klik dan
   de knop **"Mail dit bestand naar Arman"** om het gedownloade bestand
   alsnog rechtstreeks naar hem te sturen.

### Als coach (`coach.html`)

1. Log in met je coach-e-mailadres en wachtwoord (zie **Firebase Authentication**
   hierboven voor hoe dat account is aangemaakt).
2. Cliënten die de intake invullen verschijnen **automatisch** in de lijst —
   geen actie nodig. **Importeer JSON** blijft beschikbaar als handmatige
   fallback (bv. voor een bestand dat via de mailto-knop is binnengekomen).
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
8. **Vergrendel** (knop in de header) logt je uit (`signOut`) zonder data te
   wissen — handig als je even wegloopt bij een gedeeld apparaat.

Alle cliënten staan in de `clients`-collectie in Firestore — niet meer lokaal
in de browser. Exporteer regelmatig via **Export JSON** als portable back-up
per cliënt als je dat wilt.

## Deployen naar GitHub Pages

1. Zorg dat het Firestore-project + security rules + coach-account staan zoals
   beschreven onder **Firebase-architectuur** hierboven (eenmalig, in de
   Firebase Console — niet iets wat via deze repo gebeurt).
2. Maak een nieuwe (of gebruik deze) GitHub-repository en push de bestanden:
   ```bash
   git init
   git add index.html client.js coach.html app.js coach-auth.js firebase.js intake-form.js utils.js calculations.js i18n.js styles.css README.md
   git commit -m "Initial commit: PT intake app"
   git branch -M main
   git remote add origin <jouw-repo-url>
   git push -u origin main
   ```
3. Ga naar **Settings → Pages** in de GitHub-repo.
4. Kies bij **Source**: branch `main`, map `/ (root)`.
5. Na een minuut is de app live:
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
`coach.html`, `client.js`, `app.js`, `coach-auth.js`, `intake-form.js`,
`firebase.js`) telkens wanneer je een van de `.js`- of `.css`-bestanden
wijzigt en opnieuw deployt.** Vergeet je dit,
dan is het risico dat jij (niet je cliënten — zij laden alles voor het eerst)
een oude versie blijft zien totdat je handmatig een hard refresh doet
(Ctrl/Cmd+Shift+R) of de site-data van je browser wist.
