# PT Intake & Overzicht

Web-app (vanilla HTML/CSS/JS, geen build-stap) voor personal trainers: zet een
cliënt-intake automatisch om in een trainings- en voedingsoverzicht. De
gehoste bestanden zijn nog steeds pure statische HTML/CSS/JS (bv. via GitHub
Pages), maar de data zelf leeft in **Firebase** (Firestore + Authentication)
in plaats van alleen in de browser van elke gebruiker — zo verschijnt een
cliënt-intake automatisch in het coach-dashboard, zonder handmatige stap.

## Vier losstaande pagina's — cliënt ziet nooit het coach-dashboard

Dit project bestaat uit **vier losstaande HTML-pagina's**. De twee
cliëntgerichte pagina's en de twee coach-pagina's delen dezelfde
Firestore-database (voor cliëntdata), maar verder niets:

- **`index.html` (root) — de publieke homepage.** Dit is de link die je
  overal deelt (social media, bio-link, etc.) — een korte marketingpagina
  ("evidence-based fysiek coaching") die uitlegt wat de coaching inhoudt,
  toont een **prijzentabel met drie tiers** (Basis/Medium/Premium), en eindigt
  in een duidelijke **"Start intake"**-call-to-action. Bevat geen enkel
  formulierveld en praat met geen enkele database — behalve één ding: een
  klik op een prijs-tier schrijft een "lead" naar dezelfde `localStorage`-
  sleutel die `business.html` uitleest (zie "Prijzen & leads" hieronder).
- **`intake.html` — het cliëntformulier zelf.** Waar de homepage's
  "Start intake"-knoppen naartoe linken. Bevat alléén de intake: geen
  cliëntenlijst, geen berekeningen, geen overzicht, geen data van andere
  cliënten. Het formulier spreekt de cliënt aan als **Arman Bahali persoonlijk**
  (ik-vorm), niet als een team of bedrijf. Na het versturen wordt de intake
  automatisch naar Firestore geschreven (zie hieronder) én gedownload als
  `.json`-bestand voor de cliënt zelf. Dit is dezelfde pagina die vroeger op
  `index.html` stond — enkel hernoemd toen de marketinghomepage ervoor kwam.
- **`coach.html` — jouw dashboard.** Log in met je coach-account (e-mail +
  wachtwoord) en de cliëntenlijst laadt live uit Firestore — een nieuwe
  intake verschijnt vanzelf, ook terwijl je ernaar kijkt. Bookmark deze URL
  voor jezelf; deel hem niet met cliënten.
- **`business.html` — business tracker (coach-only).** Los van cliëntintakes:
  bijhouden van acquisitiekosten, churn, CLV, doorverwijzingen, en de
  prijs-tier-funnel (leads binnen via de homepage → geconverteerd naar
  cliënt). Achter dezelfde Firebase-login als `coach.html` (bereikbaar via de
  "Business tracker"-knop daar), maar bewaart zijn data alleen lokaal in de
  browser (`localStorage`, geen Firestore) — zie de sectie hieronder.

Cliënten kunnen `coach.html` of `business.html` in theorie gewoon openen (het
zijn publieke URL's, net als elke pagina op een statische site), maar zonder
in te loggen zien ze niets — geen enkele cliëntgegeven wordt getoond of zelfs
maar opgehaald voordat Firebase bevestigt dat er een geldige sessie is. Dat is
*echte* toegangscontrole (afgedwongen door Firestore's security rules op de
server, niet alleen verborgen in de UI), in tegenstelling tot de oude lokale
pincode-gate uit een eerdere versie van dit project.

### Handoff-workflow: automatisch, via Firestore

1. Coach deelt de link naar `index.html` (de homepage) — bv. in een bio-link
   of social post. Wil je meteen naar het formulier linken zonder de
   marketingpagina ertussen, deel dan rechtstreeks `intake.html`.
2. Cliënt klikt door naar **"Start intake"** en vult het formulier in op
   zijn/haar eigen apparaat. Tussentijds wordt een concept lokaal in die
   browser bewaard (`pt-intake:client-draft:v1`), zodat een per ongeluk
   gesloten tabblad niets kost.
3. Cliënt klikt **Versturen**. Er gebeuren dan drie dingen tegelijk:
   - `client.js` schrijft het cliëntprofiel rechtstreeks naar de
     `clients`-collectie in Firestore — dit is de **primaire, gezaghebbende**
     route. Firestore's security rules staan dit toe zonder in te loggen, mits
     de cliënt de verplichte toestemmingscheckbox (gezondheidsgegevens, AVG
     art. 9) heeft aangevinkt (zie `firestore.rules`).
   - De browser **downloadt** ook `<naam>-intake.json` als eigen back-up voor
     de cliënt.
   - Er gaat een **heads-up e-mail** naar Arman via Web3Forms (fire-and-forget,
     blokkeert niks) — alleen naam, e-mail en "nieuwe intake binnen". De
     intake zelf (gezondheidsgegevens) gaat bewust niet via een externe
     mailrelay; die staat in het dashboard.
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
- **Security rules:** staan in `firestore.rules` (deployen met
  `firebase deploy --only firestore:rules`, of plakken in Firebase Console →
  Firestore Database → Rules). Vervang eerst `REPLACE_WITH_COACH_UID` door de
  uid van je coach-account (Console → Authentication → Users).
  Vertaling: **iedereen** (ook een niet-ingelogde cliënt) mag een nieuw
  cliëntprofiel aanmaken, maar alleen met precies het schema hierboven en met
  `consents.healthData == true` (de verplichte toestemmingscheckbox);
  **alleen het coach-account** mag iets lezen, bewerken of verwijderen. De
  oude regel (`request.auth != null`) liet élke ingelogde gebruiker alles
  lezen — en met e-mail/wachtwoord-registratie aan kan iedereen met de
  publieke `apiKey` een account aanmaken. Een schrijfactie naar een bestaand
  document-ID is een `update`, dus een cliënt kan nooit andermans record
  overschrijven.
- **Live updates:** `coach.html` gebruikt Firestore's `onSnapshot` (geen
  eenmalige `getDocs`) voor de cliëntenlijst — een nieuwe intake verschijnt
  dus zonder de pagina te hoeven verversen.

### Firebase Storage

Twee upload-velden in de intake (handfoto voor vingerlengteverhouding, bijlage
huidig trainingsprogramma) gaan naar **Firebase Storage**, niet naar Firestore
— een los bestand als base64 in een Firestore-document proppen loopt al snel
tegen Firestore's limiet van 1 MB per document aan. `client.js` en `app.js`
uploaden allebei via dezelfde `uploadNaarStorage()`-achtige functie naar het
pad `clients/{clientId}/{veldId}-{tijdstempel}-{bestandsnaam}`; het
`intake`-document bewaart alleen de resulterende `downloadUrl` en
bestandsnaam (`genen.handFotoUrl`, `huidigProgramma.bestandUrl`).

- **Security rules:** staan in `storage.rules` (deployen met
  `firebase deploy --only storage`). Zelfde `REPLACE_WITH_COACH_UID` als
  hierboven. **Iedereen** mag een nieuw bestand uploaden (afbeelding of PDF,
  tot 15 MB, zie `MAX_UPLOAD_BYTES` in `intake-form.js`); **alleen het
  coach-account** mag het terug downloaden/bekijken.
- Geüploade bestanden verschijnen als klikbare links onder **"Bijlagen"**
  onderaan het overzichtsscherm in `coach.html`.

### Firebase Authentication

`coach.html` logt in met **e-mail + wachtwoord** via Firebase Auth
(`signInWithEmailAndPassword` in `coach-auth.js`). Er is precies één account
(dat van Arman) — er is bewust geen publieke registratieflow gebouwd. Een
"Wachtwoord vergeten?"-link stuurt een reset-mail via Firebase's ingebouwde
`sendPasswordResetEmail`. Een sessie blijft actief tot je op **Vergrendel**
klikt (roept `signOut` aan) of het wachtwoord ergens anders wijzigt — Firebase
regelt de sessie-persistentie zelf, dus dit werkt ook na een volledige
herstart van de browser.

`intake.html` bevat bewust geen link naar `coach.html` (verwijderd — Arman
gebruikt daarvoor zijn eigen bookmark). Firebase's sessie-opslag is sowieso
gedeeld tussen alle pagina's op hetzelfde origin: ben je al ingelogd, dan zie
je meteen het dashboard bij het openen van `coach.html`; zo niet, dan toont
die pagina zijn eigen inlogscherm. `business.html` gebruikt exact dezelfde
`initCoachGate()` uit `coach-auth.js` — een sessie die je op `coach.html`
opent werkt dus automatisch ook daar, en andersom.

### Configuratie

`firebase.js` bevat het Firebase-configuratieobject (`apiKey`, `authDomain`,
`projectId`, ...). Dit is **geen geheime sleutel** — Firebase's `apiKey`
identificeert alleen het project; de daadwerkelijke beveiliging zit in de
security rules hierboven plus de login-eis. Het is dus geen probleem dat dit
object zichtbaar is in client-side code (het staat letterlijk in elke
Firebase-tutorial zo gedocumenteerd).

## Taal — nl / en / es / pt (alleen op het cliëntformulier)

`intake.html` heeft een taalkeuze rechtsboven (Nederlands/English/Español/Português).
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

`coach.html` en `business.html` zijn en blijven volledig Nederlandstalig — het
zijn Armans eigen tools, geen cliëntgerichte pagina's.

De marketinghomepage (`index.html`) heeft zijn **eigen, losse taalwissel**
rechtsboven in de nav — zelfde vier taalcodes (nl/en/es/pt) als hierboven,
maar **Engels is hier de standaardtaal** (niet Nederlands), en de keuze wordt
apart onthouden (`pt-intake:homepage-taal:v1` in `localStorage`, los van
`intake.html`'s eigen `pt-intake:client-taal:v1`). Dit is bewust een eigen,
zelfstandig vertaalwoordenboek binnen `index.html`'s eigen `<script>` — geen
koppeling met `i18n.js`, want die pagina wordt alleen door `client.js`
gebruikt en `index.html` blijft verder net zo zelfstandig als voorheen (geen
losse module, alles in één bestand). Zodra een cliënt doorklikt naar
`intake.html` kan die daar onafhankelijk zelf nog een taal kiezen.

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
| `index.html` | Publieke marketinghomepage (root) — statisch, geen database-koppeling, eindigt in een "Start intake"-link naar `intake.html` |
| `intake.html` | Cliëntformulier — het enige wat cliënten *daadwerkelijk invullen* |
| `client.js` | Logica voor `intake.html`: concept-autosave, versturen (Firestore-write + Web3Forms-mail + JSON-download), bedankt-scherm, betaalinstructies-e-mail naar de cliënt via EmailJS (zie "Betaalinstructies e-mail" hierboven) |
| `coach.html` | Coach-dashboard — cliëntenlijst (live uit Firestore), intake (handmatige invoer), berekeningen, overzicht |
| `app.js` | Logica voor `coach.html`: rendering, Firestore CRUD + live `onSnapshot`-lijst, export/import |
| `business.html` | Business tracker (coach-only) — acquisitiekosten, churn, CLV, doorverwijs-ranglijst, prijs-tier-funnel & leads |
| `business.js` | Logica voor `business.html`: alleen `localStorage` (geen Firestore), gated via dezelfde `initCoachGate()` |
| `coach-auth.js` | Echte login voor `coach.html` én `business.html` via Firebase Auth (e-mail + wachtwoord), zie hierboven |
| `firebase.js` | Firebase-initialisatie (config + `db`/`auth`/`storage`-instanties), gedeeld door `client.js` en `app.js` |
| `intake-form.js` | Gedeeld tussen `client.js` en `app.js`: schema-factory, formulier lezen/invullen, tag-input/kracht-tabel/apparatuur-widgets |
| `i18n.js` | Vertaalwoordenboek (nl/en/es/pt) en helpers, alleen gebruikt door `client.js` — `coach.html`/`business.html` blijven Nederlandstalig |
| `utils.js` | Kleine gedeelde helpers: `escapeHtml`, `fmt`, `num`, `downloadJson` |
| `calculations.js` | Pure rekenfuncties (geen DOM, geen side-effects) — het herbruikbare contract, alleen gebruikt door `app.js` |
| `styles.css` | Donker thema (zwart/donkergroen/lichtgroen), responsive, print-stylesheet — inclusief de marketinghomepage- en business-tracker-secties |
| `data/werkcapaciteit-referentie.json` | Referentiedata voor het Werkcapaciteit-tabblad (Task 4) — zie "Werkcapaciteit-referentiedata" hierboven |
| `README.md` | Dit bestand |

`intake.html` en `coach.html` renderen dezelfde `<form id="intake-form">`
fieldsets (zelfde element-`id`'s), zodat `intake-form.js` één keer geschreven
kan worden en door beide pagina's hergebruikt wordt. Dat is bewust HTML-duplicatie
in ruil voor JS-hergebruik — een normale afweging bij een statische multi-page
site zonder build-stap/templating.

### Prijzen & leads: hoe de homepage en de business tracker praten

`index.html` toont drie prijs-tiers (**Basis** €150, **Medium** €260,
**Premium** €385 per maand — pas aan naar je eigen markt) met een
**facturatie-toggle** erboven: **Maandelijks** of **Per 3 maanden**
(vooruitbetaald, met korting — `data-price-monthly`/`data-price-quarter` op
elke kaart, standaard zo'n 10% korting). De toggle herschrijft live het
bedrag, de periode-tekst, en een sub-regel per kaart (bij maandelijks: "bespaar
X% per 3 maanden"; bij per-3-maanden: "≈ €X/maand · in één keer voldaan").
Een klik op een tier-knop doet twee dingen: hij schrijft een lead
(`{ id, tier, billing, datum, status: 'in_behandeling' }`, met
`billing: 'maandelijks' | 'kwartaal'` naar wat de toggle op dat moment
stond) naar de `localStorage`-sleutel `ptBusinessTracker_v1`, en gaat daarna
gewoon door naar `intake.html` zoals elke andere link — er wordt niets
tegengehouden of afgevangen.

`business.html` leest diezelfde sleutel en toont die leads (incl. facturatie)
onder **"Binnenkomende leads"**, met per lead **Converteer naar cliënt** (zet
de tier én facturatie vast in het "Cliënt toevoegen"-formulier en scrollt
daarheen; de lead wordt pas `geconverteerd` zodra je het formulier
daadwerkelijk verstuurt) of **Afwijzen**. **"Funnel per tier"** telt per tier
leads, conversies, conversieratio, actieve cliënten en MRR bij elkaar op.

Bij **"Cliënt toevoegen"** kies je ook zelf een facturatie
(Maandelijks/Per 3 maanden) — bij "per 3 maanden" vraagt het formulier om
het **totaal vooruitbetaalde bedrag**, en rekent dat zelf om naar een
maand-equivalent (`waarde = totaal / 3`) zodat MRR/CLV/funnel-cijfers overal
vergelijkbaar blijven tussen tiers en facturatiewijzes. Het rauwe totaalbedrag
blijft zichtbaar als toelichting in de cliëntentabel.

Een paar dingen om te weten:
- Dit werkt alleen als `index.html` en `business.html` **vanaf dezelfde
  origin** bediend worden (bv. dezelfde GitHub Pages-site) — `localStorage`
  is per-origin. Lokaal elk bestand los openen via `file://` deelt geen
  storage.
- De tier-namen (`Basis`/`Medium`/`Premium`) staan letterlijk zowel in
  `index.html` (als `data-tier` op elke prijs-knop) als in `business.js`
  (de `TIERS`-constante) — wijzig je de namen of voeg je een tier toe, doe
  dat op beide plekken. Hetzelfde geldt voor de facturatiewaarden
  (`maandelijks`/`kwartaal`).
- Dit is bewust **niet** gekoppeld aan de Firestore-cliëntdata: een lead is
  puur interesse-signaal, geen cliëntprofiel. Pas als je een lead conveert
  vul je zelf de rest van het cliëntprofiel in (net als bij een cliënt die
  je handmatig toevoegt).
- **Geen juridisch advies:** de prijzentekst herinnert je eraan om je
  herroepingsrecht-verplichtingen te checken voordat je een 3-maands
  vooruitbetaling live zet (in Nederland/EU geldt normaal een
  bedenktermijn bij diensten op afstand) — controleer dit zelf of met een
  jurist voordat je dit gebruikt.

### Gratis gesprek aanvragen (twijfelaars)

Tussen de prijzen en de sluit-CTA staat op `index.html` een sectie
**"Twijfel je nog? / Not sure yet?"** (`#gesprek`, ook bereikbaar via de
nav-link "Gratis gesprek" en een link onder de sluit-CTA). Bezoekers die nog
niet klaar zijn voor de intake kunnen daar direct een moment prikken via
Calendly (knop "Kies een moment in mijn agenda", opent
`https://calendly.com/armanbahali/im-interested` in een nieuw tabblad — pas
de link aan in de `.call-book-btn` in `index.html`). Past geen enkel moment,
dan laten ze via het formulier ernaast naam, e-mail, optioneel
telefoon/WhatsApp, een voorkeursmoment (ochtend/middag/avond) en hun twijfel
achter. Dit gaat via **Web3Forms** (zelfde public key als de intake-mail) als
e-mail naar Arman, altijd in het Nederlands — met `replyto` op het adres van de
bezoeker, zodat je direct kunt antwoorden om een moment te prikken. Er wordt
niets naar Firestore of de business tracker geschreven. Lukt het versturen
niet, dan toont de pagina het contactadres als alternatief.

### Betaalinstructies e-mail (EmailJS)

Een klik op een prijs-tier hangt ook `?tier=...&billing=...&amount=...` aan
de link naar `intake.html` (naast het loggen van de lead hierboven — zie de
`.tier-cta`-click-handler in `index.html`). `intake.html` leest die
parameters (`leesGekozenPakket()` in `client.js`) en toont daar een banner
boven het formulier ("Je koos het pakket ..."). Rondt de bezoeker het
formulier af, dan gebeurt er automatisch twee dingen extra, bovenop de
gewone intake-afhandeling:

1. Het bedankt-scherm toont meteen een **"Rond je inschrijving af"**-blok met
   het gekozen pakket, het bedrag, je bankgegevens (`BANKGEGEVENS` in
   `client.js`) en een betaalomschrijving (`<naam> — <tier>`) — zodat de
   cliënt dit altijd ziet, ongeacht of de e-mail hieronder aankomt.
2. Er gaat een **e-mail naar de cliënt** (niet naar jou — dat is nog steeds
   Web3Forms, zie hierboven) met diezelfde gegevens plus een bevestiging dat
   de aanmelding ontvangen is, via [EmailJS](https://www.emailjs.com/).
   Web3Forms' gratis plan kan alleen náár jouw eigen inbox mailen, niet náár
   een cliënt vanuit jouw adres — vandaar een tweede dienst specifiek hiervoor.

**Eenmalige setup (moet je zelf doen — Claude Code kan geen account voor je
aanmaken):**

1. Maak een gratis account op [emailjs.com](https://www.emailjs.com/) en
   koppel je zakelijke e-mailadres als **Email Service** (Gmail/Outlook/eigen
   domein/...). Onthoud de **Service ID**.
2. Maak een **Email Template** aan met (in elk geval) deze variabelen erin —
   exact deze namen, want dat is wat `verstuurBetaalinstructies()` in
   `client.js` meestuurt: `{{to_name}}`, `{{tier_naam}}`, `{{facturatie}}`,
   `{{bedrag}}`, `{{referentie}}`, `{{rekeninghouder}}`, `{{iban}}`,
   `{{bic}}`. Zet het template-"To"-veld op `{{to_email}}`. Onthoud de
   **Template ID**.
3. Kopieer je **Public Key** (Account → General).
4. Vul deze drie waarden in bovenaan `client.js`
   (`EMAILJS_PUBLIC_KEY`/`EMAILJS_SERVICE_ID`/`EMAILJS_TEMPLATE_ID`), en vul
   je echte bankgegevens in bij `BANKGEGEVENS` (`rekeninghouder`, `iban`,
   `bic`) in datzelfde bestand.
5. Verhoog het versienummer van `client.js` (zie "Cache-busting" onderaan)
   en deploy opnieuw.

Zolang `EMAILJS_SERVICE_ID` nog op de placeholder-waarde staat, slaat
`verstuurBetaalinstructies()` de verzending stilzwijgend over — het
bedankt-scherm blijft de betaalgegevens gewoon tonen, dus de app blijft
bruikbaar zonder EmailJS-setup, alleen zonder de e-mail-kant ervan.

**Let op — dit is geen betaalgateway:** dit stuurt alleen instructies; er
wordt geen betaling automatisch geverifieerd of geïnd. Jij controleert zelf
je bankrekening en markeert de cliënt pas als actief (bv. in
`business.html` bij "Cliënt toevoegen") zodra de overschrijving binnen is.
Je eigen IBAN/BIC delen met iemand die jou moet betalen is normale,
publieke informatie (net als op een factuur) — geen geheime sleutel.

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
        "naam": "string", "email": "string", "adres": "string", "postcode": "string",
        "stad": "string", "land": "string", "leeftijd": 0, "lengte": 0, "gewicht": 0,
        "vetpercentage": 0, "geslacht": "man|vrouw|anders", "trainingservaring": 0
      },
      "huidigeKracht": [
        { "oefening": "string", "kg": 0, "herhalingen": 0, "sets": 0 }
      ],
      "doel": {
        "tekst": "string",
        "categorie": "vetverlies|spieropbouw|onderhoud|krachttoename",
        "spiergroepenNietGroter": "string", "andereSporten": "string", "gewenstFrequentieTekst": "string"
      },
      "motivatieMindset": { "motivatie": "string", "mentaleInstelling": "string" },
      "trainingsfrequentie": {
        "huidig": 0,
        "trainingsmomenten": ["string"],
        "nietBeschikbaarTekst": "string",
        "baan": { "type": "string", "urenZittend": 0, "urenStaand": 0 }
      },
      "blessures": { "tekst": "string", "vermijdenOefeningen": ["string"] },
      "dieet": { "huidig": "string", "specifiekDieet": "string", "voorkeuren": ["string"], "afkeuren": ["string"] },
      "peds": { "gebruikt": false, "toelichting": "string", "disclaimerGeaccepteerd": false },
      "lifestyle": {
        "activityLevel": "sedentair|licht actief|actief|erg actief",
        "stressLevel": "stressvrij|sporadisch_mild|gemiddeld|veel_stress",
        "slaap": { "uren": 0, "kwaliteit": "slecht|matig|goed", "ritmeToelichting": "string" },
        "cafeine": 0, "cafeineToelichting": "string"
      },
      "vetpercentageMeting": { "huidplooimeter": false, "methode": "string" },
      "materiaal": { "laagstePlaat": 0, "dumbbellStapgrootte": 0, "apparatuur": ["squat_rack", "..."], "overig": "string" },
      "supplementen": "string",
      "genen": {
        "polsomtrek": 0, "enkelomtrek": 0, "gewichtVoorheen": "string", "lengteVoorheen": "string",
        "zwareBaby": false, "handFotoUrl": "https://firebasestorage.../...|null", "handFotoBestandsnaam": "string"
      },
      "huidigProgramma": { "tekst": "string", "bestandUrl": "https://firebasestorage.../...|null", "bestandNaam": "string" }
    },
    "instellingen": {
      "energiebalansFactor": 1.0, "eiwitFactor": 1.8, "percentageVetVanREE": 0.4,
      "trainingsdagenPerWeek": 3, "trainingsduurMinuten": 60, "MET": 5.7,
      "pal": 1.0, "tef": 1.1, "aantalMaaltijden": 4
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

**Schema-uitbreiding (nieuwe velden):** alle bovenstaande `intake`-velden die
in eerdere versies nog niet bestonden (adres/postcode/stad/land, de
uitgebreide `doel`-, `dieet`- en `lifestyle`-velden, `huidigProgramma`, de
foto-upload-velden, ...) zijn puur *additief* — een ouder opgeslagen
cliëntbestand zonder deze velden blijft gewoon inladen; `vulIntakeFormIn`
valt terug op `''`/`null`/`false` voor alles wat ontbreekt. Twee waarde-sets
zijn wél gewijzigd, met behoud van achterwaartse compatibiliteit:
- `lifestyle.activityLevel` kreeg een 4e optie (`erg actief`) naast de
  bestaande drie — puur additief, geen breuk.
- `lifestyle.stressLevel` ging van drie waarden (`laag`/`gemiddeld`/`hoog`)
  naar vier (`stressvrij`/`sporadisch_mild`/`gemiddeld`/`veel_stress`), omdat
  het cursusmateriaal expliciet vier niveaus onderscheidt. Een ouder record
  met `"hoog"` toont geen aangevinkte optie meer in de `<select>` (geen van
  de nieuwe opties matcht die waarde), maar `genereerRodeVlaggen()` in
  `calculations.js` controleert nog steeds op zowel `'hoog'` als
  `'veel_stress'`, dus de rode-vlag-detectie blijft voor oudere data werken.

**Task 2/3/4 zijn bewust géén nieuwe `calculations`-velden:** de opdracht
plaatst de Training Volume Calculator en de drie 1RM-subcalculators expliciet
"in de calculator-UI" — dat is de bestaande **Snelle rekentool** (los van een
cliëntprofiel, niets wordt opgeslagen, zie hieronder). Ze horen dus niet thuis
in het per-cliënt schema. De optionele rustinterval-suggestie (Task 4) is wél
per cliënt, maar wordt *live herberekend* bij het openen van het
overzichtsscherm (`renderRustintervalAdvies()` in `app.js`) op basis van
`data/werkcapaciteit-referentie.json` — net als de maaltijdtabellen elders in
hetzelfde scherm — in plaats van als vast `calculations.rustintervalAdvies`-veld
te worden weggeschreven.

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
| `verdeelMaaltijden(totalen, aantalMaaltijden, postTrainingMultiplier=1.5)` | `{eiwit,vet,koolhydraten}`, 2–6, factor | array van maaltijden | Verdeelt macro's over maaltijden; eiwit ×multiplier na training (1.5 standaard, 2 als er maar 1 maaltijd na training zit) |
| `eiwitBereik(gewicht)` | kg | `{min, praktisch, maxSlank}` (g) | Persoonlijk eiwit-richtbereik: 1.6–1.8–2.4 g/kg |
| `vetBereik(ree)` | kcal | `{min, max}` (g) | Persoonlijk vet-richtbereik: 20–40% van REE |
| `beoogdeInnameBereik(onderhoudPerDag, doelCategorie, persoonsgegevens)` | kcal, string, object | `{min, max}` (kcal) | Richtbereik voor de streefinname, per doel (zie hieronder) |
| `palVoorActiviteitsniveau(activityLevel, geslacht)` | string, `man`/`vrouw`/... | getal | Standaard PAL-waarde per activiteitsniveau en geslacht (zonder krachttraining) |
| `energiebalansFactorVoorDoel(doelCategorie, persoonsgegevens)` | string, `{vetpercentage, geslacht, trainingservaring}` | getal | Standaard energiebalans-factor: tekort naar vetpercentage, surplus naar trainingsstatus |
| `energiebalansBereik(doelCategorie, persoonsgegevens)` | idem | `{min, standaard, max}` | Bereik van de energiebalans-factor |
| `tekortBereik(vetpercentage, geslacht)` | %, string | `{min, standaard, max}` | Tekort (fractie van onderhoud) bij dit vetpercentage |
| `trainingsstatusUitErvaring(jaren)` | jaren | 1-3 | <1 jaar: 1, 1–4 jaar: 2, 4+ jaar: 3 (onbekend: 2) |
| `bepaalSplitsdagen(trainingsdagenPerWeek)` | dagen/week | `{naam, dagen}` | Voorgestelde trainingssplit |
| `detecteerBlessureConflicten(blessures)` | `{tekst, vermijdenOefeningen}` | array | Matcht gemelde blessures/vermijdlijst tegen standaardoefeningen |
| `genereerRodeVlaggen(intake, calculations)` | intake, calculations | array | Automatische coach-waarschuwingen |
| `berekenClient(intake, instellingen)` | intake, instellingen (optioneel) | volledig `calculations`-object | Orchestreert alle bovenstaande functies |
| `trainingsvolumeAdvies(trainingsstatus, vrouw, herstelfactor, energiebalansfactor, trainingsfrequentie)` | 1-3, 0/1, 0.5-1.2, factor, keer/week | getal (sets/week/spiergroep) | Menno Henselmans-model voor optimaal trainingsvolume (Task 2) — clamt status en herstelfactor binnen hun toegestane bereik |
| `rm1VrijGewicht(gewicht, herhalingen)` | kg, reps | `{epley1RM, tabel}` | 1RM-subcalculator A: vrije gewichten & machine-oefeningen — `tabel` is de volledige belastingstabel (90-30% van 1RM) |
| `rm1Bodyweight(lichaamsgewicht, externGewicht, herhalingen)` | kg, kg, reps | `{epley1RM, tabel}` | 1RM-subcalculator B: bodyweight-oefeningen (chin-up, dip, ...) — 93.48% van het lichaamsgewicht wordt belast; `tabel` geeft het benodigde extern gewicht per percentage |
| `rm1PushUp(lichaamsgewicht, externGewicht, herhalingen)` | kg, kg, reps | `{epley1RM, tabel}` | 1RM-subcalculator C: push-ups — zelfde opzet als B maar met 75% (voeten geven steun) |
| `gemiddeldeVermoeidheidPerGroep(data, group)` | werkcapaciteit-data-array, `"Ongetraind"\|"Getraind"` | `{gemiddelde, n}` of `null` | Gemiddeld `fatigue_pct` voor een groep uit `data/werkcapaciteit-referentie.json` (Task 4, optionele rustinterval-suggestie) |

### Aannames / standaardwaarden

De opdracht gaf exacte formules maar niet elke constante. Deze defaults zijn
gekozen en overal in de UI aanpasbaar (stap 2, "Berekeningen controleren"):

- **PAL** (activiteitsfactor buiten training, **zonder** krachttraining — die
  telt apart via EE): man sedentair `1.00`, licht actief `1.11`, actief
  `1.25`, erg actief `1.48`; vrouw `1.00` / `1.12` / `1.27` / `1.45`;
  "anders" het midden daarvan. Bron: Butters University, module Energy
  balance (de verdeling per geslacht volgt de IOM-coëfficiënten waar die
  ranges vandaan komen).
- **TEF** (voedsel-thermogenese): `1.1` (10%).
- **Energiebalans-factor** per doel (Butters University):
  - vetverlies: tekort naar vetpercentage, lineair van 2.5–7.5% (standaard
    5%) bij wedstrijdvorm tot 30–50% (standaard 30%) bij een hoog
    vetpercentage. Ankers: man 6% → 32%, vrouw 14% → 40%, anders 10% → 36%
    vetpercentage. BU geeft alleen de twee uitersten; de ankers zijn zo
    gekozen dat BU's voorbeeld (ongetrainde vrouw, 30% vet) op ~20% tekort
    uitkomt.
  - spieropbouw en krachttoename: surplus naar trainingsstatus — beginner
    (<1 jaar) 5–15% (standaard 10%), gemiddeld (1–4 jaar) 2–7% (4.5%),
    gevorderd (4+ jaar) 1–3% (2%).
  - onderhoud: `1.0` (±3%, eigen inschatting).
- **Eiwit**: `1.8` g/kg (instelbaar 1.6–3.7 g/kg).
- **Vet**: `40%` van de REE (instelbaar 20–40%+).
- **Aantal maaltijden**: `4` (instelbaar 2–6).
- **Post-training eiwitboost**: `1.5×` (instelbaar naar `2×`).

### Richtbereiken in plaats van één vast getal

De kerncijfers en macro's tonen naast het huidige gekozen getal ook een
**persoonlijk richtbereik** (bv. "Eiwit: 153 g — richtbereik 112–168 g").
Reden: de brontabellen (Menno PT Course, modules 11/13/14) geven zelf al
ranges, geen vaste getallen — en de juiste plek binnen die range hangt af van
een gesprek met de cliënt (adherentie, voorkeuren, hoe agressief ze willen
zijn), niet van een formule alleen. De instellingen blijven daarom altijd
gewoon aanpasbaar; het bereik is context, geen harde grens.

Herkomst van elk bereik:
- **Eiwit** (`eiwitBereik`): 1.6 g/kg (RCT-afkappunt) tot 1.8 g/kg (praktisch
  optimum) tot 2.2–2.4 g/kg (slanke lifters, hoog volume) — Module 11. Nog
  hoger bij veganisme (≥2.3 g/kg) of PED-gebruik (2.1–3.7 g/kg); dat wordt
  niet automatisch toegepast, maar als hint getoond zodat je het bewust kunt
  overschrijven.
- **Vet** (`vetBereik`): 20% (absoluut minimum, hormonale gezondheid) tot 40%
  (optimum voor anabole hormonen) van de REE — Module 13. Let op: Module 13's
  geschreven tekst framet dit percentage als aandeel van de *totale
  energie-inname*, terwijl de rekenformule (en de originele
  `eigen-casus-calculator.html`) het als aandeel van de REE berekent. Dat is
  een spanning die al in het brondocument zelf zit — de app volgt hier
  bewust de rekentool, niet de tekst, voor consistentie met je eigen
  cursusmateriaal.
- **Beoogde inname** (`beoogdeInnameBereik`): onderhoud × het bereik van
  `energiebalansBereik` (tekort naar vetpercentage, surplus naar
  trainingsstatus; zie hierboven). De rode vlag "te agressief tekort" gaat
  af boven het maximale tekort voor dat vetpercentage (`tekortBereik().max`),
  niet meer bij een vaste 25%.
- **Post-training eiwitboost**: Module 11 noemt "50% meer eiwit" als de
  normale regel voor maaltijden na training, en "100% meer" specifiek als er
  maar één maaltijd tussen training en bedtijd zit. De app paste voorheen
  altijd de 100%-regel (dubbele portie) toe op élke maaltijd na training —
  dat is nu een expliciete keuze in de instellingen (1.5× standaard, 2× voor
  de één-maaltijd-situatie) in plaats van een vaste aanname.
- **Trainingsduur**: `60` minuten, **MET**: `5.7`.

### Training Volume Calculator & 1RM-subcalculators (Task 2/3)

De formules voor deze twee rekentool-blokken kwamen exact gespecificeerd uit
de opdracht (`Training_volume_calculator_MennoHenselmans.xlsx` en
`1RM_Calculator_MennoHenselmans_.xlsx`) — geen aannames of standaardwaarden
nodig, dus geen extra instelbare defaults zoals bij de voedingsberekeningen
hierboven. Beide zijn uitsluitend beschikbaar in de **Snelle rekentool**
(coach.html), los van een cliëntprofiel — zie "Task 2/3/4 zijn bewust géén
nieuwe `calculations`-velden" hierboven voor waarom.

### Werkcapaciteit-referentiedata (Task 4)

`data/werkcapaciteit-referentie.json` bevat 189 datapunten uit 27 studies
(bron: `Work_capacity_reference_data_PTC.docx`, Menno Henselmans
PTC-cursusmateriaal) over prestatieverlies bij verschillende rustintervallen
tussen sets. Structuur:

```json
{
  "bron": "string",
  "definitie": "string — uitleg van de vermoeidheidsindex",
  "voetnoten": { "1": "string", "2": "string", "...": "..." },
  "data": [
    {
      "group": "Ongetraind|Getraind", "study": "string", "population": "string",
      "n": 0, "sets": 0, "intensity": "string", "rest_txt": "string",
      "rest_min": 0, "footnote": null, "exercise": "string",
      "fatigue_pct": 0, "reps": null
    }
  ]
}
```

`fatigue_pct` en `reps` zijn wederzijds exclusief (1-set-protocollen
rapporteren `reps` in plaats van een vermoeidheidsindex); een lege `exercise`
betekent dat het protocol maar 1 oefening had. Het **Werkcapaciteit**-tabblad
(knop naast "Snelle rekentool" in de cliëntenlijst) laadt dit bestand via
`fetch()`, en biedt filteren op groep/oefening-of-studie/rustinterval
(dropdown dynamisch gevuld met de daadwerkelijk voorkomende waarden), sorteren
op rustinterval of vermoeidheidsindex, en een groen→rood kleurschaal op
`fatigue_pct` (conditional-formatting-stijl). De optionele
rustinterval-suggestie op het cliënt-overzichtsscherm gebruikt
`gemiddeldeVermoeidheidPerGroep()` om live het gemiddelde te berekenen voor de
groep die bij de cliënt past — zie de schema-notitie hierboven voor waarom
dat niet als vast veld wordt opgeslagen.

## Gebruik

### Als bezoeker (`index.html`)

1. Open de homepage-link (bv. vanuit een bio-link of social post) — een korte
   uitleg van de coaching-aanpak, wat je krijgt, en hoe het traject start.
2. **Prijzen**: drie tiers (Basis/Medium/Premium) met wat elk niveau inhoudt,
   en een toggle bovenaan om te wisselen tussen maandelijks en per-3-maanden
   (met korting) — de bedragen op de kaarten passen zich live aan. Een klik
   op een tier-knop logt die keuze (incl. gekozen facturatie) als lead voor
   de business tracker (zie "Prijzen & leads" hierboven) en gaat daarna
   gewoon door naar de intake.
3. Klik op **"Start intake"** (in de nav, de hero, een tier-knop, of de
   sluit-CTA onderaan) → je komt op `intake.html` terecht, het daadwerkelijke
   formulier.

### Als cliënt (`intake.html`)

1. Open de link die je van Arman hebt gekregen (rechtstreeks, of via de
   homepage's "Start intake"-knop).
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
   berekeningen (voeding, frame size, 1RM-belastingstabellen voor drie
   oefeningtypes A/B/C, werkcapaciteit tussen sessies, Training Volume
   Calculator) zonder dat er een cliëntprofiel wordt aangemaakt of iets wordt
   opgeslagen — handig tijdens een gesprek of ter controle. Gebruikt dezelfde
   functies uit `calculations.js` als de rest van de app. Alleen bereikbaar
   via `coach.html`; cliënten zien dit nergens.
3c. **Werkcapaciteit** (knop naast "Snelle rekentool") → doorzoekbare
   referentietabel van 189 datapunten over prestatieverlies per rustinterval
   (zie "Werkcapaciteit-referentiedata" hierboven).
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

### Als coach — business tracker (`business.html`)

1. Vanuit `coach.html`: klik **"Business tracker"** (naast "Werkcapaciteit").
   Zelfde login als het dashboard — eenmaal ingelogd hoef je niet opnieuw in
   te loggen.
2. **Binnenkomende leads**: klikken op een prijs-tier op de homepage
   verschijnt hier automatisch, inclusief welke facturatie (maandelijks/per 3
   maanden) de bezoeker had aanstaan. **Converteer naar cliënt** zet de tier
   én facturatie alvast klaar in het "Cliënt toevoegen"-formulier hieronder;
   **Afwijzen** sluit een lead af zonder cliënt te worden. **Funnel per tier**
   telt leads, conversies en MRR per tier bij elkaar op.
3. **Cliënt toevoegen**: naam, tier (Basis/Medium/Premium), facturatie
   (maandelijks, of per 3 maanden vooruitbetaald — bij dat laatste vraagt het
   formulier om het totaalbedrag en rekent zelf om naar een maand-equivalent),
   bron (doorverwijzing/social/website/...), waarde, startdatum, en optioneel
   wie de cliënt heeft doorverwezen. Verschijnt meteen in de tabel en telt mee
   in de kerncijfers.
4. Kerncijfers bovenaan: actieve cliënten, MRR, acquisitiekosten voor de
   gekozen rapportagemaand (uitgaven ÷ nieuwe cliënten die maand),
   churn-percentage, en een geschatte CLV (customer lifetime value) — gebruikt
   je echte gemiddelde retentie zodra er minstens één gestopte cliënt is,
   anders de aangenomen retentie uit **Instellingen**.
5. **Marketing / acquisitiekosten**: log per maand wat je aan marketing
   uitgeeft — nodig voor de acquisitiekosten-kerncijfer hierboven.
6. **Doorverwijs-ranglijst**: automatisch opgebouwd uit het "doorverwezen
   door"-veld op cliënten — geen aparte invoer nodig.
7. **Export/importeer back-up**: dezelfde soort `.json`-back-up als bij
   cliëntprofielen, maar dan óók de leads en de funnel-data.

Let op: deze data staat **alleen lokaal** in de browser (`localStorage`,
sleutel `ptBusinessTracker_v1`) — niet in Firestore, dus niet gesynchroniseerd
tussen apparaten. Dat is bewust: dit zijn Armans eigen bedrijfscijfers, geen
cliëntdata die tussen meerdere gebruikers hoeft te synchroniseren. Gebruik
**Exporteer back-up** als je van apparaat wisselt of een reservekopie wilt.

## Deployen naar GitHub Pages

1. Zorg dat het Firestore-project + security rules + coach-account staan zoals
   beschreven onder **Firebase-architectuur** hierboven (eenmalig, in de
   Firebase Console — niet iets wat via deze repo gebeurt).
2. Maak een nieuwe (of gebruik deze) GitHub-repository en push de bestanden:
   ```bash
   git init
   git add index.html intake.html client.js coach.html app.js business.html business.js coach-auth.js firebase.js intake-form.js utils.js calculations.js i18n.js styles.css data/werkcapaciteit-referentie.json README.md
   git commit -m "Initial commit: PT intake app"
   git branch -M main
   git remote add origin <jouw-repo-url>
   git push -u origin main
   ```
3. Ga naar **Settings → Pages** in de GitHub-repo.
4. Kies bij **Source**: branch `main`, map `/ (root)`.
5. Na een minuut is de app live:
   - Homepage (deel deze): `https://<gebruikersnaam>.github.io/<repo-naam>/`
   - Cliëntformulier (rechtstreekse link, indien gewenst):
     `https://<gebruikersnaam>.github.io/<repo-naam>/intake.html`
   - Coach-dashboard: `https://<gebruikersnaam>.github.io/<repo-naam>/coach.html`
     (bookmark deze zelf — deel hem niet met cliënten)
   - Business tracker: `https://<gebruikersnaam>.github.io/<repo-naam>/business.html`
     (ook alleen voor jezelf — bereikbaar via de knop in `coach.html`)

Voor lokaal testen: gebruik een lokale server (bv. `npx serve .` of
`python -m http.server`) in plaats van het bestand direct te openen — sommige
browsers blokkeren ES-module `import`/`export` op het `file://`-protocol.

### Cache-busting na een update

Elk lokaal bestand (`.js`, `.css`) wordt zowel in de `<script>`/`<link>`-tags
als in elke interne `import`-statement gevolgd door een versie-query,
bv. `client.js?v=3`. Zonder build-stap is dit de eenvoudigste manier om te
voorkomen dat een browser na een update stilletjes een oude, gecachete versie
van een bestand blijft gebruiken (dit gebeurde echt: een knop werkte niet meer
na een wijziging, puur omdat de browser nog de oude `client.js` in cache had).

**Verhoog dit versienummer overal tegelijk (alle `?v=N` in `index.html`,
`intake.html`, `coach.html`, `business.html`, `client.js`, `app.js`,
`business.js`, `coach-auth.js`, `intake-form.js`, `firebase.js`) telkens
wanneer je een van de `.js`- of `.css`-bestanden wijzigt en opnieuw
deployt.** Vergeet je dit,
dan is het risico dat jij (niet je cliënten — zij laden alles voor het eerst)
een oude versie blijft zien totdat je handmatig een hard refresh doet
(Ctrl/Cmd+Shift+R) of de site-data van je browser wist.
