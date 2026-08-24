import { downloadJson } from './utils.js?v=13';
import {
  maakLeegClient, initTagInputs, initFileInputs, vulIntakeFormIn, leesIntakeForm, maakKrachtRij, renderApparatuurChecklist,
  toggleePedsDisclaimer,
} from './intake-form.js?v=13';
import { TALEN, vertaal, apparatuurLabel } from './i18n.js?v=13';
import { db, storage } from './firebase.js?v=13';
import { doc, setDoc } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

// This page never talks to the coach dashboard: no client list, no
// calculations, no localStorage key shared with app.js. It only ever reads
// this one draft key, so nothing here can expose another client's data.
const DRAFT_KEY = 'pt-intake:client-draft:v1';
const TAAL_KEY = 'pt-intake:client-taal:v1';

// Public Web3Forms access key, tied to Arman's inbox — safe to expose in
// client-side code (Web3Forms rate-limits by key, no secret is involved).
const WEB3FORMS_ACCESS_KEY = '4e27ae27-18e9-4a54-bdc7-bd8c4e316a48';
const WEB3FORMS_ENDPOINT = 'https://api.web3forms.com/submit';

// Pocket Coach's real backend — dual-write target alongside this app's own
// Firestore project. Public, unauthenticated, rate-limited server-side
// (POST /api/intake in traininglog-backend-sync). Fire-and-forget, same as
// the Web3Forms email below: this app's own `clients` Firestore write
// (further down in verstuur()) stays the source of truth for THIS app's own
// coach.html dashboard and for the status shown to the client on this page.
//
// Deployed as a Firebase Cloud Function (Render was retired) — the base URL
// is https://us-central1-pocketcoach-280c4.cloudfunctions.net/api because
// the function itself is named "api"; server.js's own /api/intake route
// then appends on top of that, hence the doubled /api/api/intake below.
// That's correct, not a typo.
const POCKET_COACH_API = 'https://us-central1-pocketcoach-280c4.cloudfunctions.net/api/api/intake';

let huidigClient = null;
let huidigeTaal = 'nl';
let huidigeStatusSleutel = 'status.bezig';
let laatsteBestandsnaam = '';
let conceptTimer = null;

function toonView(naam) {
  document.querySelectorAll('.view').forEach((el) => el.classList.remove('active'));
  document.getElementById(`view-${naam}`).classList.add('active');
}

function bestandsnaamVoor(client) {
  const naam = (client.intake.persoonsgegevens.naam || 'intake').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return `${naam}-intake.json`;
}

// Uploads to Storage under clients/{clientId}/... — matches the security
// rule path (`match /clients/{clientId}/{fileName}`), which lets anyone
// write there but only a logged-in coach read it back.
async function uploadNaarStorage(file, veldId) {
  const pad = ref(storage, `clients/${huidigClient.id}/${veldId}-${Date.now()}-${file.name}`);
  await uploadBytes(pad, file);
  return getDownloadURL(pad);
}

function slaConceptOp() {
  try {
    huidigClient.intake = leesIntakeForm();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(huidigClient));
  } catch {
    // Form not in a readable state yet (e.g. mid-edit) — skip this autosave tick.
  }
}

// ---------- Taal (i18n) ----------

function bepaalStartTaal() {
  const opgeslagen = localStorage.getItem(TAAL_KEY);
  if (opgeslagen && TALEN.includes(opgeslagen)) return opgeslagen;
  const browserTaal = (navigator.language || 'nl').slice(0, 2).toLowerCase();
  return TALEN.includes(browserTaal) ? browserTaal : 'nl';
}

function herrenderApparatuur() {
  const geselecteerd = [...document.querySelectorAll('#apparatuur-checklist input:checked')].map((i) => i.value);
  renderApparatuurChecklist(geselecteerd, (key) => apparatuurLabel(huidigeTaal, key));
}

function pasVertalingToe(taal) {
  huidigeTaal = taal;
  document.documentElement.lang = taal;
  document.title = vertaal(taal, 'meta.title');

  document.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = vertaal(taal, el.dataset.i18n);
  });

  document.querySelectorAll('[data-i18n-placeholder]').forEach((el) => {
    const tekst = vertaal(taal, el.dataset.i18nPlaceholder);
    if (el.classList.contains('tag-input')) {
      el.dataset.placeholder = tekst;
      el.setTags?.(el.getTags?.() ?? []);
    } else {
      el.placeholder = tekst;
    }
  });

  herrenderApparatuur();

  // The generic loop above just reset the status line to its default
  // ("sending...") text — restore whatever it actually says right now.
  document.getElementById('verzend-status').textContent = vertaal(taal, huidigeStatusSleutel);

  document.getElementById('taal-keuze').value = taal;
  localStorage.setItem(TAAL_KEY, taal);
}

// Plain-text summary for the email body, so Arman can read the intake
// straight in his inbox. Kept in Dutch regardless of the client's chosen
// UI language, since Arman is the only reader.
function bouwSamenvatting(client) {
  const i = client.intake;
  const regels = [];
  const sectie = (titel) => regels.push(`\n== ${titel} ==`);
  const veld = (label, waarde) => regels.push(`${label}: ${waarde === '' || waarde == null ? '-' : waarde}`);

  sectie('Persoonsgegevens');
  veld('Naam', i.persoonsgegevens.naam);
  veld('E-mail', i.persoonsgegevens.email);
  veld('Leeftijd', i.persoonsgegevens.leeftijd);
  veld('Lengte (cm)', i.persoonsgegevens.lengte);
  veld('Gewicht (kg)', i.persoonsgegevens.gewicht);
  veld('Vetpercentage (%)', i.persoonsgegevens.vetpercentage);
  veld('Geslacht', i.persoonsgegevens.geslacht);
  veld('Trainingservaring (jaar)', i.persoonsgegevens.trainingservaring);

  sectie('Doel');
  veld('Categorie', i.doel.categorie);
  veld('Toelichting', i.doel.tekst);

  sectie('Motivatie & mindset');
  veld('Motivatie', i.motivatieMindset.motivatie);
  veld('Mentale instelling', i.motivatieMindset.mentaleInstelling);

  sectie('Huidige kracht');
  if (i.huidigeKracht.length) {
    for (const r of i.huidigeKracht) regels.push(`- ${r.oefening}: ${r.kg}kg x ${r.herhalingen} (${r.sets} sets)`);
  } else {
    regels.push('- Geen data');
  }

  sectie('Trainingsfrequentie & baan');
  veld('Frequentie (dagen/week)', i.trainingsfrequentie.huidig);
  veld('Trainingsmomenten', i.trainingsfrequentie.trainingsmomenten.join(', '));
  veld('Baan type', i.trainingsfrequentie.baan.type);
  veld('Uren zittend / staand', `${i.trainingsfrequentie.baan.urenZittend ?? '-'} / ${i.trainingsfrequentie.baan.urenStaand ?? '-'}`);

  sectie('Blessures');
  veld('Toelichting', i.blessures.tekst);
  veld('Te vermijden oefeningen', i.blessures.vermijdenOefeningen.join(', '));

  sectie('Dieet');
  veld('Huidig', i.dieet.huidig);
  veld('Voorkeuren', i.dieet.voorkeuren.join(', '));
  veld('Afkeuren', i.dieet.afkeuren.join(', '));

  sectie('PEDs');
  veld('Gebruikt', i.peds.gebruikt ? 'Ja' : 'Nee');
  veld('Toelichting', i.peds.toelichting);

  sectie('Lifestyle');
  veld('Activiteitsniveau', i.lifestyle.activityLevel);
  veld('Stressniveau', i.lifestyle.stressLevel);
  veld('Slaap', `${i.lifestyle.slaap.uren ?? '-'} uur, kwaliteit: ${i.lifestyle.slaap.kwaliteit}`);
  veld('Cafeïne (mg/dag)', i.lifestyle.cafeine);

  sectie('Meetmethode vetpercentage');
  veld('Huidplooimeter gebruikt', i.vetpercentageMeting.huidplooimeter ? 'Ja' : 'Nee');

  sectie('Materiaal & toegang');
  veld('Laagste plaat (kg)', i.materiaal.laagstePlaat);
  veld('Dumbbell-stapgrootte (kg)', i.materiaal.dumbbellStapgrootte);
  veld('Apparatuur', i.materiaal.apparatuur.join(', '));

  sectie('Supplementen');
  veld('Vrije tekst', i.supplementen);

  sectie('Genen');
  veld('Polsomtrek (cm)', i.genen.polsomtrek);
  veld('Enkelomtrek (cm)', i.genen.enkelomtrek);
  veld('Gewicht voorheen', i.genen.gewichtVoorheen);
  veld('Zware baby', i.genen.zwareBaby ? 'Ja' : 'Nee');

  return regels.join('\n');
}

async function verstuurNaarArman(client) {
  const naam = client.naam || 'Naamloos';
  const email = client.intake.persoonsgegevens.email;

  const formData = new FormData();
  formData.append('access_key', WEB3FORMS_ACCESS_KEY);
  formData.append('subject', `Nieuwe trainingsintake — ${naam}`);
  formData.append('from_name', naam);
  if (email) {
    formData.append('email', email);
    formData.append('replyto', email);
  }
  // Note: Web3Forms rejects the whole submission on the free tier if a file
  // is attached ("Pro feature required"), so the JSON travels only via the
  // local download below — the email carries the readable summary only.
  formData.append('message', bouwSamenvatting(client));

  const response = await fetch(WEB3FORMS_ENDPOINT, { method: 'POST', body: formData });
  const result = await response.json().catch(() => ({ success: false }));
  return result.success === true;
}

// Best-effort dual-write to Pocket Coach's backend. Silently swallows any
// failure (network error, 503 if INTAKE_COACH_USERNAME isn't configured
// server-side, rate limit, ...) — this app's own Firestore write is still
// what determines the status shown to the client, exactly like verstuurNaarArman.
async function verstuurNaarPocketCoach(client) {
  await fetch(POCKET_COACH_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ intake: client.intake, instellingen: client.instellingen || {} }),
  });
}

// Independent of Web3Forms entirely — a real client submission once showed
// "sent successfully" here but never arrived by email, so this always-visible
// mailto link gives a second channel that doesn't depend on that service at all.
function mailtoLink(client, bestandsnaam) {
  const onderwerp = `${vertaal(huidigeTaal, 'header.brand')} — ${client.naam || 'Naamloos'}`;
  const body = vertaal(huidigeTaal, 'mailto.body')
    .replace('{bestand}', bestandsnaam)
    .replace('{naam}', client.naam || '');
  return `mailto:armanbahali@pocketcoachcoms.org?subject=${encodeURIComponent(onderwerp)}&body=${encodeURIComponent(body)}`;
}

function zetVerzendStatus(sleutel, variant) {
  huidigeStatusSleutel = sleutel;
  const el = document.getElementById('verzend-status');
  el.textContent = vertaal(huidigeTaal, sleutel);
  el.className = `verzend-status verzend-status--${variant}`;
}

async function verstuur() {
  huidigClient.intake = leesIntakeForm();
  huidigClient.naam = huidigClient.intake.persoonsgegevens.naam;
  laatsteBestandsnaam = bestandsnaamVoor(huidigClient);

  downloadJson(laatsteBestandsnaam, { client: huidigClient });
  localStorage.removeItem(DRAFT_KEY);

  document.getElementById('bedankt-naam').textContent = huidigClient.naam || 'daar';
  document.getElementById('bedankt-bestandsnaam').textContent = laatsteBestandsnaam;
  document.getElementById('btn-mail-backup').href = mailtoLink(huidigClient, laatsteBestandsnaam);
  zetVerzendStatus('status.bezig', 'bezig');
  toonView('bedankt');

  // Fire-and-forget heads-up email — independent of the Firestore write
  // below, which is the actual source of truth for the coach dashboard.
  verstuurNaarArman(huidigClient).catch(() => {});

  // Fire-and-forget dual-write to Pocket Coach's own backend (see
  // POCKET_COACH_API above) — likewise independent of this app's own
  // Firestore write below.
  verstuurNaarPocketCoach(huidigClient).catch(() => {});

  try {
    await setDoc(doc(db, 'clients', huidigClient.id), huidigClient);
    zetVerzendStatus('status.ok', 'ok');
  } catch {
    zetVerzendStatus('status.fout', 'fout');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  pasVertalingToe(bepaalStartTaal());
  initTagInputs();
  initFileInputs(uploadNaarStorage);

  const opgeslagenConcept = localStorage.getItem(DRAFT_KEY);
  if (opgeslagenConcept) {
    try {
      const concept = JSON.parse(opgeslagenConcept);
      if (concept?.intake && confirm(vertaal(huidigeTaal, 'confirm.eerderFormulier'))) {
        huidigClient = concept;
      }
    } catch {
      // Corrupt draft — ignore and start fresh below.
    }
  }
  if (!huidigClient) huidigClient = maakLeegClient();
  vulIntakeFormIn(huidigClient, (key) => apparatuurLabel(huidigeTaal, key));

  document.getElementById('taal-keuze').addEventListener('change', (e) => {
    pasVertalingToe(e.target.value);
  });

  document.getElementById('f-peds-gebruikt').addEventListener('change', toggleePedsDisclaimer);

  document.getElementById('intake-form').addEventListener('submit', (e) => {
    e.preventDefault();
    verstuur();
  });

  document.getElementById('intake-form').addEventListener('input', () => {
    clearTimeout(conceptTimer);
    conceptTimer = setTimeout(slaConceptOp, 500);
  });

  document.getElementById('btn-kracht-rij-toevoegen').addEventListener('click', () => {
    document.getElementById('kracht-tbody').appendChild(maakKrachtRij({ oefening: '', kg: 0, herhalingen: 0, sets: 0 }));
  });

  document.getElementById('btn-opnieuw-downloaden').addEventListener('click', () => {
    downloadJson(laatsteBestandsnaam, { client: huidigClient });
  });

  document.getElementById('btn-nieuw-formulier').addEventListener('click', () => {
    localStorage.removeItem(DRAFT_KEY);
    huidigClient = maakLeegClient();
    vulIntakeFormIn(huidigClient, (key) => apparatuurLabel(huidigeTaal, key));
    toonView('form');
  });
});
