import * as calc from './calculations.js?v=8';
import { escapeHtml, fmt, num, downloadJson } from './utils.js?v=8';
import {
  maakLeegClient, initTagInputs, initFileInputs, vulIntakeFormIn, leesIntakeForm, maakKrachtRij,
  toggleePedsDisclaimer,
} from './intake-form.js?v=8';
import { initCoachGate, lockNow } from './coach-auth.js?v=8';
import { db, storage } from './firebase.js?v=8';
import {
  collection, doc, setDoc, getDoc, deleteDoc, query, orderBy, onSnapshot,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { ref, uploadBytes, getDownloadURL } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js';

const CLIENTS_COLLECTIE = 'clients';

// ---------- Storage (Firestore — shared with client.js's submissions) ----------

async function upsertClient(client) {
  await setDoc(doc(db, CLIENTS_COLLECTIE, client.id), client);
}

// Uploads to Storage under clients/{clientId}/... — same path the client-facing
// page uses, so files uploaded by the coach land in the same security-rule scope.
async function uploadNaarStorage(file, veldId) {
  const pad = ref(storage, `clients/${huidigeClient.id}/${veldId}-${Date.now()}-${file.name}`);
  await uploadBytes(pad, file);
  return getDownloadURL(pad);
}

async function verwijderClient(id) {
  await deleteDoc(doc(db, CLIENTS_COLLECTIE, id));
}

async function vindClient(id) {
  const snap = await getDoc(doc(db, CLIENTS_COLLECTIE, id));
  return snap.exists() ? snap.data() : null;
}

// ---------- App state ----------

let huidigeClient = null;
let huidigeLijst = [];
let opslaanTimer = null;

// ---------- Berekening view ----------

function vulInstellingenFormIn(client) {
  const intake = client.intake;
  const defaults = {
    energiebalansFactor: calc.energiebalansFactorVoorDoel(intake.doel.categorie),
    eiwitFactor: 1.8,
    percentageVetVanREE: 0.4,
    trainingsdagenPerWeek: intake.trainingsfrequentie.huidig ?? 3,
    trainingsduurMinuten: 60,
    MET: 5.7,
    pal: calc.palVoorActiviteitsniveau(intake.lifestyle.activityLevel),
    tef: calc.STANDAARD_TEF,
    aantalMaaltijden: 4,
    postTrainingBoost: calc.POST_TRAINING_BOOST_STANDAARD,
  };
  const overrides = Object.fromEntries(
    Object.entries(client.instellingen ?? {}).filter(([, v]) => v != null),
  );
  const s = { ...defaults, ...overrides };
  document.getElementById('i-energiebalans-factor').value = s.energiebalansFactor;
  document.getElementById('i-eiwit-factor').value = s.eiwitFactor;
  document.getElementById('i-vet-percentage').value = s.percentageVetVanREE;
  document.getElementById('i-trainingsdagen').value = s.trainingsdagenPerWeek;
  document.getElementById('i-trainingsduur').value = s.trainingsduurMinuten;
  document.getElementById('i-met').value = s.MET;
  document.getElementById('i-pal').value = s.pal;
  document.getElementById('i-tef').value = s.tef;
  document.getElementById('i-aantal-maaltijden').value = s.aantalMaaltijden;
  document.getElementById('i-post-training-boost').value = s.postTrainingBoost;
}

function leesInstellingenForm() {
  return {
    energiebalansFactor: num(document.getElementById('i-energiebalans-factor').value),
    eiwitFactor: num(document.getElementById('i-eiwit-factor').value),
    percentageVetVanREE: num(document.getElementById('i-vet-percentage').value),
    trainingsdagenPerWeek: num(document.getElementById('i-trainingsdagen').value),
    trainingsduurMinuten: num(document.getElementById('i-trainingsduur').value),
    MET: num(document.getElementById('i-met').value),
    pal: num(document.getElementById('i-pal').value),
    tef: num(document.getElementById('i-tef').value),
    aantalMaaltijden: num(document.getElementById('i-aantal-maaltijden').value),
    postTrainingBoost: num(document.getElementById('i-post-training-boost').value),
  };
}

function kerncijferHtml(label, waarde, eenheid, toelichting) {
  return `
    <div class="kerncijfer">
      <span class="kerncijfer__label">${escapeHtml(label)}</span>
      <span class="kerncijfer__waarde">${waarde}${eenheid ? ` ${eenheid}` : ''}</span>
      ${toelichting ? `<span class="kerncijfer__toelichting">${escapeHtml(toelichting)}</span>` : ''}
    </div>
  `;
}

function herberekenEnRender() {
  if (!huidigeClient) return;
  huidigeClient.instellingen = leesInstellingenForm();
  huidigeClient.calculations = calc.berekenClient(huidigeClient.intake, huidigeClient.instellingen);
  renderBerekeningResultaten(huidigeClient.calculations);

  // Recompute/render instantly (local, free); debounce the network write so
  // rapid slider/typing changes in the settings panel don't spam Firestore.
  clearTimeout(opslaanTimer);
  const teBewaren = huidigeClient;
  opslaanTimer = setTimeout(() => {
    upsertClient(teBewaren).catch((err) => console.error('Opslaan mislukt:', err));
  }, 500);
}

function renderBerekeningResultaten(c) {
  document.getElementById('berekening-kerncijfers').innerHTML = [
    kerncijferHtml('Vetvrije massa', fmt(c.vetvrijeMassa, 1), 'kg', 'gewicht × (1 − vetpercentage)'),
    kerncijferHtml('BMR (Katch-McArdle)', fmt(c.bmr), 'kcal', '370 + 21.6 × vetvrije massa'),
    kerncijferHtml('Energie training (EE)', fmt(c.ee), 'kcal', 'MET × 3.5 × gewicht / 200 × duur'),
    kerncijferHtml('Rustdag verbruik (REE)', fmt(c.ree), 'kcal', 'BMR × PAL × TEF'),
    kerncijferHtml('Totaal trainingsdag', fmt(c.totaalTrainingsdag), 'kcal', 'REE + (EE × TEF)'),
    kerncijferHtml('Onderhoud/dag', fmt(c.onderhoudPerDag), 'kcal', 'gewogen gemiddelde over de week'),
    kerncijferHtml('Beoogd — rustdag', fmt(c.beoogdeInnameRustdag), 'kcal',
      `richtbereik ${fmt(c.bereiken.beoogdeInname.min)}–${fmt(c.bereiken.beoogdeInname.max)} kcal — kies in overleg met cliënt`),
    kerncijferHtml('Beoogd — trainingsdag', fmt(c.beoogdeInnameTrainingsdag), 'kcal', 'beoogd rustdag + EE'),
  ].join('');

  document.getElementById('berekening-macros').innerHTML = [
    kerncijferHtml('Eiwit', fmt(c.macros.eiwit, 1), 'g/dag',
      `richtbereik ${fmt(c.bereiken.eiwit.min, 0)}–${fmt(c.bereiken.eiwit.maxSlank, 0)} g (1.6–2.4 g/kg, hoger bij veganisme/PEDs)`),
    kerncijferHtml('Vet', fmt(c.macros.vet, 1), 'g/dag',
      `richtbereik ${fmt(c.bereiken.vet.min, 0)}–${fmt(c.bereiken.vet.max, 0)} g (20–40% van REE)`),
    kerncijferHtml('Koolhydraten — rustdag', fmt(c.macros.koolhydratenRustdag, 1), 'g', 'restant van beoogde kcal'),
    kerncijferHtml('Koolhydraten — trainingsdag', fmt(c.macros.koolhydratenTrainingsdag, 1), 'g', 'restant van beoogde kcal'),
  ].join('');

  const frameLabel = c.frameSize.binnenNorm ? 'Binnen norm' : 'Buiten norm';
  let rmRows = c.rm.map((r) => `
    <tr><td>${escapeHtml(r.oefening)}</td><td>${r.kg} kg × ${r.herhalingen}</td><td>${fmt(r.geschat1RM, 1)} kg</td></tr>
  `).join('');
  if (!c.rm.length) rmRows = `<tr><td colspan="3" class="hint">Geen kracht-data ingevuld.</td></tr>`;

  document.getElementById('berekening-frame-rm').innerHTML = `
    <p>Enkelomtrek ${fmt(c.frameSize.enkelomtrek, 1)} cm — <strong>${frameLabel}</strong>
    (afwijking t.o.v. 21.9 cm-norm: ${c.frameSize.afwijking > 0 ? '+' : ''}${fmt(c.frameSize.afwijking, 1)} cm,
    Karakas &amp; Bozkir 2007, marge ±1.3 cm)</p>
    <table class="data-tabel">
      <thead><tr><th>Oefening</th><th>Huidig</th><th>Geschat 1RM (Epley)</th></tr></thead>
      <tbody>${rmRows}</tbody>
    </table>
  `;
}

// ---------- Overzicht view ----------

function renderMaaltijdTabel(elId, maaltijden) {
  const el = document.getElementById(elId);
  const rijen = maaltijden.map((m) => `
    <tr class="${m.postTraining ? 'post-training' : ''}">
      <td>Maaltijd ${m.maaltijd}${m.postTraining ? ' (na training)' : ''}</td>
      <td class="${m.postTraining ? 'post-training' : ''}">${fmt(m.eiwit, 1)} g</td>
      <td>${fmt(m.vet, 1)} g</td>
      <td>${fmt(m.koolhydraten, 1)} g</td>
      <td>${fmt(m.kcal)} kcal</td>
    </tr>
  `).join('');
  el.innerHTML = `
    <thead><tr><th>Maaltijd</th><th>Eiwit</th><th>Vet</th><th>Koolhydraten</th><th>Kcal</th></tr></thead>
    <tbody>${rijen}</tbody>
  `;
}

function renderOverzicht(client) {
  const { intake, calculations: c } = client;

  document.getElementById('ov-naam').textContent = intake.persoonsgegevens.naam || client.naam || 'Naamloos';
  const metaDelen = [
    `${intake.persoonsgegevens.leeftijd ?? '–'} jaar`,
    `${intake.persoonsgegevens.gewicht ?? '–'} kg`,
    `${intake.persoonsgegevens.vetpercentage ?? '–'}% vet`,
    `Doel: ${intake.doel.categorie}`,
  ];
  if (intake.persoonsgegevens.email) metaDelen.push(intake.persoonsgegevens.email);
  document.getElementById('ov-meta').textContent = metaDelen.join(' · ');

  const { motivatie, mentaleInstelling } = intake.motivatieMindset ?? {};
  document.getElementById('ov-motivatie').innerHTML = (motivatie || mentaleInstelling) ? `
    ${motivatie ? `<p><strong>Motivatie:</strong> ${escapeHtml(motivatie)}</p>` : ''}
    ${mentaleInstelling ? `<p><strong>Mentale instelling:</strong> ${escapeHtml(mentaleInstelling)}</p>` : ''}
  ` : '<p class="hint">Niets ingevuld.</p>';

  document.getElementById('ov-kerncijfers').innerHTML = [
    kerncijferHtml('BMR', fmt(c.bmr), 'kcal'),
    kerncijferHtml('Onderhoud/dag', fmt(c.onderhoudPerDag), 'kcal'),
    kerncijferHtml('Beoogd — rustdag', fmt(c.beoogdeInnameRustdag), 'kcal',
      `richtbereik ${fmt(c.bereiken.beoogdeInname.min)}–${fmt(c.bereiken.beoogdeInname.max)} kcal`),
    kerncijferHtml('Beoogd — trainingsdag', fmt(c.beoogdeInnameTrainingsdag), 'kcal'),
    kerncijferHtml('Eiwit', fmt(c.macros.eiwit, 1), 'g',
      `richtbereik ${fmt(c.bereiken.eiwit.min, 0)}–${fmt(c.bereiken.eiwit.maxSlank, 0)} g`),
    kerncijferHtml('Vet', fmt(c.macros.vet, 1), 'g',
      `richtbereik ${fmt(c.bereiken.vet.min, 0)}–${fmt(c.bereiken.vet.max, 0)} g`),
    kerncijferHtml('Koolhydraten rustdag', fmt(c.macros.koolhydratenRustdag, 1), 'g'),
    kerncijferHtml('Koolhydraten trainingsdag', fmt(c.macros.koolhydratenTrainingsdag, 1), 'g'),
  ].join('');

  const vlagSectie = document.getElementById('ov-rode-vlaggen-sectie');
  if (!c.rodeVlaggen.length) {
    document.getElementById('ov-rode-vlaggen').innerHTML = '<p class="geen-vlaggen">Geen bijzonderheden gedetecteerd.</p>';
  } else {
    document.getElementById('ov-rode-vlaggen').innerHTML = c.rodeVlaggen.map((v) => `
      <div class="vlag vlag--${v.niveau}">${escapeHtml(v.bericht)}</div>
    `).join('');
  }
  vlagSectie.hidden = false;

  document.getElementById('ov-trainingsadvies').innerHTML = `
    <p><strong>Aanbevolen splitsdagen (${c.instellingenGebruikt.trainingsdagenPerWeek}x/week):</strong> ${escapeHtml(c.advies.splitsdagen.naam)}</p>
    <p>${c.advies.splitsdagen.dagen.map(escapeHtml).join(' → ')}</p>
  `;

  renderRustintervalAdvies(intake);

  renderMaaltijdTabel('ov-voeding-rustdag', c.maaltijdVerdeling.rustdag);
  renderMaaltijdTabel('ov-voeding-trainingsdag', c.maaltijdVerdeling.trainingsdag);

  const blessureBlokken = [];
  if (intake.blessures.tekst) {
    blessureBlokken.push(`<div class="blessure-item"><strong>Gemeld:</strong> ${escapeHtml(intake.blessures.tekst)}</div>`);
  }
  for (const oefening of intake.blessures.vermijdenOefeningen) {
    blessureBlokken.push(`<div class="blessure-item"><strong>Vermijd:</strong> ${escapeHtml(oefening)}</div>`);
  }
  for (const conflict of c.advies.blessureConflicten) {
    blessureBlokken.push(`<div class="blessure-item"><strong>${escapeHtml(conflict.oefening)}:</strong> ${escapeHtml(conflict.reden)}</div>`);
  }
  document.getElementById('ov-blessures').innerHTML = blessureBlokken.join('') || '<p class="hint">Geen blessures gerapporteerd.</p>';

  const krachtRijen = c.rm.map((r) => `
    <tr><td>${escapeHtml(r.oefening)}</td><td>${r.kg} kg</td><td>${r.herhalingen}</td><td>${r.sets}</td><td>${fmt(r.geschat1RM, 1)} kg</td></tr>
  `).join('');
  document.getElementById('ov-kracht').innerHTML = `
    <thead><tr><th>Oefening</th><th>Kg</th><th>Reps</th><th>Sets</th><th>Geschat 1RM</th></tr></thead>
    <tbody>${krachtRijen || '<tr><td colspan="5" class="hint">Geen data</td></tr>'}</tbody>
  `;

  const bijlagen = [];
  if (intake.genen?.handFotoUrl) {
    bijlagen.push(`<p><a href="${escapeHtml(intake.genen.handFotoUrl)}" target="_blank" rel="noopener">📎 Handfoto — ${escapeHtml(intake.genen.handFotoBestandsnaam || 'bestand')}</a></p>`);
  }
  if (intake.huidigProgramma?.bestandUrl) {
    bijlagen.push(`<p><a href="${escapeHtml(intake.huidigProgramma.bestandUrl)}" target="_blank" rel="noopener">📎 Huidig programma — ${escapeHtml(intake.huidigProgramma.bestandNaam || 'bestand')}</a></p>`);
  }
  document.getElementById('ov-bijlagen').innerHTML = bijlagen.join('') || '<p class="hint">Geen bijlagen geüpload.</p>';
}

// ---------- Snelle rekentool (losse berekeningen, geen cliëntprofiel) ----------

function maaltijdNamenRekentool(n) {
  if (n === 3) return ['Ontbijt', 'Lunch', 'Avondeten'];
  if (n === 4) return ['Ontbijt', 'Lunch', 'Avondeten', 'Pre-bed'];
  if (n === 5) return ['Ontbijt', 'Lunch', 'Tussendoor', 'Avondeten', 'Pre-bed'];
  return Array.from({ length: n }, (_, i) => `Maaltijd ${i + 1}`);
}

function renderMaaltijdTabelRekentool(titel, maaltijden) {
  const namen = maaltijdNamenRekentool(maaltijden.length);
  const rijen = maaltijden.map((m, i) => `
    <tr class="${m.postTraining ? 'post-training' : ''}">
      <td>${escapeHtml(namen[i])}</td>
      <td class="${m.postTraining ? 'post-training' : ''}">${fmt(m.eiwit, 1)} g</td>
      <td>${fmt(m.vet, 1)} g</td>
      <td>${fmt(m.koolhydraten, 1)} g</td>
      <td>${fmt(m.kcal)} kcal</td>
    </tr>
  `).join('');
  return `
    <h4 style="margin-top: 1rem;">${escapeHtml(titel)}</h4>
    <table class="data-tabel">
      <thead><tr><th>Maaltijd</th><th>Eiwit</th><th>Vet</th><th>Koolhydraten</th><th>Kcal</th></tr></thead>
      <tbody>${rijen}</tbody>
    </table>
  `;
}

function berekenVoedingRekentool() {
  const naam = document.getElementById('r-naam').value.trim() || 'cliënt';
  const gewicht = num(document.getElementById('r-gewicht').value);
  const vetpct = num(document.getElementById('r-vetpct-lichaam').value);
  const pal = num(document.getElementById('r-pal').value);
  const tef = num(document.getElementById('r-tef').value);
  const duur = num(document.getElementById('r-duur').value);
  const dagen = num(document.getElementById('r-dagen').value);
  const ebf = num(document.getElementById('r-ebf').value);
  const eiwitFactor = num(document.getElementById('r-eiwitfactor').value);
  const vetPctRee = num(document.getElementById('r-vetpct-ree').value) / 100;
  const maaltijden = num(document.getElementById('r-maaltijden').value);

  const vvm = calc.vetvrijeMassa(gewicht, vetpct);
  const bmr = calc.katchMcArdleBMR(vvm);
  const ee = calc.energieverbruikTrainingsdag(gewicht, duur);
  const ree = calc.energieverbruikRustdag(bmr, pal, tef);
  const totaalTrainingsdag = calc.totaalEnergieTrainingsdag(ree, ee, tef);
  const onderhoudDag = calc.onderhoudsinnamePerDag(totaalTrainingsdag, ree, dagen);
  const beoogdRustdag = calc.beoogdeInnameRustdag(onderhoudDag, ebf);
  const beoogdTrainingsdag = calc.beoogdeInnameTrainingsdag(beoogdRustdag, ee);

  const eiwit = calc.eiwitGrammen(gewicht, eiwitFactor);
  const vet = calc.vetGrammen(ree, vetPctRee);
  const koolRust = calc.koolhydratenGrammen(beoogdRustdag, eiwit, vet);
  const koolTraining = calc.koolhydratenGrammen(beoogdTrainingsdag, eiwit, vet);

  // Fixed at 2x (not the app-wide default) to stay identical to the
  // original eigen-casus-calculator.html, which hardcodes doubling.
  const rustRijen = calc.verdeelMaaltijden({ eiwit, vet, koolhydraten: koolRust }, maaltijden, 2);
  const trainRijen = calc.verdeelMaaltijden({ eiwit, vet, koolhydraten: koolTraining }, maaltijden, 2);

  document.getElementById('rekentool-voeding-resultaat').innerHTML = `
    <div class="kerncijfers">
      ${kerncijferHtml('Naam', escapeHtml(naam))}
      ${kerncijferHtml('Vetvrije massa', fmt(vvm, 1), 'kg')}
      ${kerncijferHtml('BMR (Katch-McArdle)', fmt(bmr), 'kcal')}
      ${kerncijferHtml('EE (trainingsdag)', fmt(ee), 'kcal')}
      ${kerncijferHtml('REE (rustdag)', fmt(ree), 'kcal')}
      ${kerncijferHtml('Totaal trainingsdag', fmt(totaalTrainingsdag), 'kcal')}
      ${kerncijferHtml('Onderhoud/dag', fmt(onderhoudDag), 'kcal')}
      ${kerncijferHtml('Beoogd — rustdag', fmt(beoogdRustdag), 'kcal')}
      ${kerncijferHtml('Beoogd — trainingsdag', fmt(beoogdTrainingsdag), 'kcal')}
      ${kerncijferHtml('Eiwit', fmt(eiwit, 1), 'g')}
      ${kerncijferHtml('Vet', fmt(vet, 1), 'g')}
      ${kerncijferHtml('Koolhydraten rustdag', fmt(koolRust, 1), 'g')}
      ${kerncijferHtml('Koolhydraten trainingsdag', fmt(koolTraining, 1), 'g')}
    </div>
    ${renderMaaltijdTabelRekentool('Voeding rustdag', rustRijen)}
    ${renderMaaltijdTabelRekentool('Voeding trainingsdag', trainRijen)}
    <p class="hint" style="margin-top: 0.75rem;">Vergeet niet: vezelinname 25–38 g/dag, voedingskeuzes afstemmen op
      smaakvoorkeuren, en het kcal-tekort/surplus samen met de cliënt toetsen op haalbaarheid.</p>
  `;
}

function berekenFrameRekentool() {
  const enkel = num(document.getElementById('r-enkel').value);
  const pols = num(document.getElementById('r-pols').value);
  const { afwijking, binnenNorm } = calc.frameSizeCheck(enkel);

  document.getElementById('rekentool-frame-resultaat').innerHTML = `
    <div class="kerncijfers">
      ${kerncijferHtml('Enkelomtrek', fmt(enkel, 1), 'cm')}
      ${kerncijferHtml('Normwaarde', '21,9 ± 1,3', 'cm')}
      ${kerncijferHtml('Beoordeling', binnenNorm ? 'Binnen normaalwaarde' : 'Buiten normaalwaarde')}
      ${kerncijferHtml('Polsomtrek (informatief)', fmt(pols, 1), 'cm')}
    </div>
    <p class="hint">Afwijking t.o.v. norm: ${afwijking > 0 ? '+' : ''}${fmt(afwijking, 2)} cm</p>
  `;
}

// Shared renderer for the three 1RM subcalculators' loading tables.
// `kolomLabel`/`waardeFn` let each variant show its own second column
// (absolute weight for A, external weight needed for B/C).
function renderBelastingstabel(elId, epley1RM, tabel, kolomLabel, waardeFn) {
  const rijen = tabel.map((r) => `
    <tr><td>${fmt(r.percentage * 100, 0)}%</td><td>${fmt(waardeFn(r), 1)} kg</td></tr>
  `).join('');
  document.getElementById(elId).innerHTML = `
    <div class="kerncijfers">${kerncijferHtml('Geschatte 1RM', fmt(epley1RM, 1), 'kg')}</div>
    <table class="data-tabel">
      <thead><tr><th>% van 1RM</th><th>${escapeHtml(kolomLabel)}</th></tr></thead>
      <tbody>${rijen}</tbody>
    </table>
  `;
}

function berekenRmARekentool() {
  const gewicht = num(document.getElementById('r-rmA-gewicht').value);
  const reps = num(document.getElementById('r-rmA-reps').value);
  const { epley1RM, tabel } = calc.rm1VrijGewicht(gewicht, reps);
  renderBelastingstabel('rekentool-rmA-resultaat', epley1RM, tabel, 'Gewicht', (r) => r.gewicht);
}

function berekenRmBRekentool() {
  const lichaamsgewicht = num(document.getElementById('r-rmB-lichaamsgewicht').value);
  const extern = num(document.getElementById('r-rmB-extern').value);
  const reps = num(document.getElementById('r-rmB-reps').value);
  const { epley1RM, tabel } = calc.rm1Bodyweight(lichaamsgewicht, extern, reps);
  renderBelastingstabel('rekentool-rmB-resultaat', epley1RM, tabel, 'Benodigd extern gewicht', (r) => r.externGewicht);
}

function berekenRmCRekentool() {
  const lichaamsgewicht = num(document.getElementById('r-rmC-lichaamsgewicht').value);
  const extern = num(document.getElementById('r-rmC-extern').value);
  const reps = num(document.getElementById('r-rmC-reps').value);
  const { epley1RM, tabel } = calc.rm1PushUp(lichaamsgewicht, extern, reps);
  renderBelastingstabel('rekentool-rmC-resultaat', epley1RM, tabel, 'Benodigd extern gewicht', (r) => r.externGewicht);
}

function berekenVolumeRekentool() {
  const status = num(document.getElementById('r-vol-status').value);
  const vrouw = num(document.getElementById('r-vol-vrouw').value);
  const herstel = num(document.getElementById('r-vol-herstel').value);
  const ebf = num(document.getElementById('r-vol-ebf').value);
  const frequentie = num(document.getElementById('r-vol-frequentie').value);
  const volume = calc.trainingsvolumeAdvies(status, vrouw, herstel, ebf, frequentie);

  document.getElementById('rekentool-volume-resultaat').innerHTML = `
    <div class="kerncijfers">
      ${kerncijferHtml('Geschat optimaal trainingsvolume (sets/week/spiergroep)', fmt(volume, 1))}
    </div>
  `;
}

function berekenWerkcapaciteitRekentool() {
  const oud = num(document.getElementById('r-oud').value);
  const nieuw = num(document.getElementById('r-nieuw').value);
  const wc = calc.werkcapaciteit(oud, nieuw);

  document.getElementById('rekentool-wc-resultaat').innerHTML = `
    <div class="kerncijfers">
      ${kerncijferHtml('Werkcapaciteit', `${wc >= 0 ? '+' : ''}${fmt(wc, 1)}`, '%')}
      ${kerncijferHtml('Interpretatie', wc >= 0 ? 'Vooruitgang t.o.v. vorige sessie' : 'Terugval t.o.v. vorige sessie')}
    </div>
  `;
}

// ---------- Werkcapaciteit / rustinterval reference tool (Task 4) --------

let werkcapaciteitData = null; // { bron, definitie, voetnoten, data }
const werkcapaciteitFilter = { group: 'alle', oefening: '', rust: 'alle', sort: 'rest_min' };

async function laadWerkcapaciteitData() {
  try {
    const res = await fetch('data/werkcapaciteit-referentie.json');
    werkcapaciteitData = await res.json();
    renderWerkcapaciteitDefinitie();
    vulWerkcapaciteitRustFilter();
    renderWerkcapaciteitTabel();
  } catch (err) {
    console.error('Kon werkcapaciteit-referentiedata niet laden:', err);
  }
}

// Rustinterval-opties zijn niet vooraf bekend (afhankelijk van de data) —
// dus dynamisch opgebouwd uit de daadwerkelijk voorkomende rest_min-waarden.
function vulWerkcapaciteitRustFilter() {
  const uniek = new Map();
  for (const r of werkcapaciteitData.data) {
    if (r.rest_min != null) uniek.set(r.rest_min, r.rest_txt);
  }
  const opties = [...uniek.entries()].sort((a, b) => a[0] - b[0]);
  document.getElementById('wc-filter-rust').innerHTML = [
    '<option value="alle">Alle</option>',
    ...opties.map(([min, txt]) => `<option value="${min}">${escapeHtml(txt)}</option>`),
  ].join('');
}

function renderWerkcapaciteitDefinitie() {
  if (!werkcapaciteitData) return;
  document.getElementById('wc-definitie').textContent = werkcapaciteitData.definitie;
  const entries = Object.entries(werkcapaciteitData.voetnoten ?? {});
  document.getElementById('wc-voetnoten').innerHTML = entries.length
    ? `<ol>${entries.map(([nr, tekst]) => `<li><strong>${escapeHtml(nr)}.</strong> ${escapeHtml(tekst)}</li>`).join('')}</ol>`
    : '';
}

// Green (low performance loss) -> red (high) — a conditional-formatting-style
// color scale for fatigue_pct, same idea as a spreadsheet color scale.
function fatigueKleur(pct) {
  if (pct == null) return '';
  const clamped = Math.max(0, Math.min(100, pct));
  const hue = 140 - (clamped / 100) * 140; // 140=green, 0=red
  return `background: hsl(${hue}, 55%, 22%); color: #fff;`;
}

function renderWerkcapaciteitTabel() {
  if (!werkcapaciteitData) return;
  const { group, oefening, rust, sort } = werkcapaciteitFilter;
  let rijen = werkcapaciteitData.data.slice();

  if (group !== 'alle') rijen = rijen.filter((r) => r.group === group);
  if (oefening) {
    const q = oefening.toLowerCase();
    rijen = rijen.filter((r) => (r.exercise || '').toLowerCase().includes(q) || r.study.toLowerCase().includes(q));
  }
  if (rust !== 'alle') rijen = rijen.filter((r) => r.rest_min === Number(rust));
  rijen.sort((a, b) => (sort === 'fatigue_pct'
    ? (b.fatigue_pct ?? -1) - (a.fatigue_pct ?? -1)
    : (a.rest_min ?? 999) - (b.rest_min ?? 999)));

  const html = rijen.map((r) => `
    <tr>
      <td>${escapeHtml(r.group)}</td>
      <td>${escapeHtml(r.study)}</td>
      <td>${escapeHtml(r.population)}</td>
      <td>${r.sets}</td>
      <td>${escapeHtml(r.intensity)}</td>
      <td>${escapeHtml(r.rest_txt)}</td>
      <td>${escapeHtml(r.exercise || '—')}</td>
      <td style="${fatigueKleur(r.fatigue_pct)}">${r.fatigue_pct != null ? `${fmt(r.fatigue_pct, 1)}%` : '—'}</td>
      <td>${r.reps ?? '—'}</td>
      <td>${r.footnote ? escapeHtml(String(r.footnote)) : ''}</td>
    </tr>
  `).join('');

  document.getElementById('wc-tabel-body').innerHTML = html || '<tr><td colspan="10" class="hint">Geen resultaten.</td></tr>';
  document.getElementById('wc-resultaat-count').textContent = `${rijen.length} van ${werkcapaciteitData.data.length} datapunten`;
}

function wireWerkcapaciteitFilters() {
  document.getElementById('wc-filter-group').addEventListener('change', (e) => {
    werkcapaciteitFilter.group = e.target.value;
    renderWerkcapaciteitTabel();
  });
  document.getElementById('wc-filter-oefening').addEventListener('input', (e) => {
    werkcapaciteitFilter.oefening = e.target.value;
    renderWerkcapaciteitTabel();
  });
  document.getElementById('wc-filter-rust').addEventListener('change', (e) => {
    werkcapaciteitFilter.rust = e.target.value;
    renderWerkcapaciteitTabel();
  });
  document.getElementById('wc-filter-sort').addEventListener('change', (e) => {
    werkcapaciteitFilter.sort = e.target.value;
    renderWerkcapaciteitTabel();
  });
}

// Optional per-client rest-interval suggestion on the overzicht screen
// (Task 4, optional part) — dynamically averaged from the reference data,
// not hardcoded. Training status is inferred from trainingservaring: under
// 1 year counts as "Ongetraind", 1 year or more as "Getraind" — the
// reference dataset only distinguishes these two groups.
function renderRustintervalAdvies(intake) {
  const el = document.getElementById('ov-rustinterval-advies');
  if (!el) return;
  if (!werkcapaciteitData) { el.innerHTML = '<p class="hint">Referentiedata nog niet geladen.</p>'; return; }

  const groep = (intake.persoonsgegevens.trainingservaring ?? 0) >= 1 ? 'Getraind' : 'Ongetraind';
  const gemiddelde = calc.gemiddeldeVermoeidheidPerGroep(werkcapaciteitData.data, groep);
  if (!gemiddelde) { el.innerHTML = '<p class="hint">Onvoldoende referentiedata voor deze groep.</p>'; return; }

  el.innerHTML = `<p>Op basis van ${gemiddelde.n} datapunten voor <strong>${escapeHtml(groep.toLowerCase())}e</strong> lifters
    is het gemiddelde prestatieverlies over de onderzochte rustintervallen <strong>${fmt(gemiddelde.gemiddelde, 1)}%</strong>.
    Kies een rustinterval dat voldoende hersteltijd geeft tussen sets voor déze cliënt — zie het tabblad
    "Werkcapaciteit" (cliëntenlijst-scherm) voor de volledige referentietabel per studie.</p>`;
}

// ---------- Client list view (live — updates automatically as clients submit) ----------

function startLiveClientLijst() {
  const q = query(collection(db, CLIENTS_COLLECTIE), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snapshot) => {
    huidigeLijst = snapshot.docs.map((d) => d.data());
    renderClientLijstDom();
  }, (err) => {
    document.getElementById('client-lijst').innerHTML =
      `<div class="empty-state">Kon cliënten niet laden: ${escapeHtml(err.message)}</div>`;
  });
}

function renderClientLijstDom() {
  const container = document.getElementById('client-lijst');
  const tpl = document.getElementById('tpl-client-kaart');

  container.innerHTML = '';
  if (!huidigeLijst.length) {
    container.innerHTML = '<div class="empty-state">Nog geen cliënten. Klik op "+ Nieuwe cliënt", of wacht tot een cliënt de intake invult — die verschijnt hier vanzelf.</div>';
    return;
  }

  for (const client of huidigeLijst) {
    const node = tpl.content.cloneNode(true);
    const naam = client.intake.persoonsgegevens.naam || client.naam || 'Naamloos';
    node.querySelector('.client-kaart__naam').textContent = naam;
    node.querySelector('.client-kaart__meta').textContent =
      `Doel: ${client.intake.doel.categorie} · Aangemaakt: ${new Date(client.createdAt).toLocaleDateString('nl-NL')}`;
    node.querySelector('[data-action="open"]').addEventListener('click', () => openClient(client.id));
    node.querySelector('[data-action="export"]').addEventListener('click', (e) => {
      e.stopPropagation();
      exporteerClient(client);
    });
    node.querySelector('[data-action="verwijder"]').addEventListener('click', (e) => {
      e.stopPropagation();
      if (confirm(`"${naam}" verwijderen? Dit kan niet ongedaan gemaakt worden.`)) {
        verwijderClient(client.id).catch((err) => alert(`Verwijderen mislukt: ${err.message}`));
      }
    });
    container.appendChild(node);
  }
}

async function openClient(id) {
  const client = await vindClient(id);
  if (!client) return;
  huidigeClient = client;
  client.calculations = calc.berekenClient(client.intake, client.instellingen);
  await upsertClient(client);
  vulIntakeFormIn(client);
  vulInstellingenFormIn(client);
  renderBerekeningResultaten(client.calculations);
  renderOverzicht(client);
  toonView('overzicht');
}

// ---------- Export / import ----------

function exporteerClient(client) {
  const naam = (client.intake.persoonsgegevens.naam || client.naam || 'client').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  downloadJson(`${naam}-intake.json`, { client });
}

function importeerJsonBestand(file) {
  const reader = new FileReader();
  reader.onload = async () => {
    try {
      const data = JSON.parse(reader.result);
      const client = data.client ?? data;
      if (!client.intake) throw new Error('Geen geldig cliëntprofiel gevonden in dit bestand.');
      client.id = client.id || crypto.randomUUID();
      client.instellingen = client.instellingen || {};
      await upsertClient(client);
    } catch (err) {
      alert(`Import mislukt: ${err.message}`);
    }
  };
  reader.readAsText(file);
}

// ---------- Navigation ----------

function toonView(naam) {
  for (const el of document.querySelectorAll('.view')) el.classList.remove('active');
  document.getElementById(`view-${naam}`).classList.add('active');

  const headerInfo = document.getElementById('header-client-info');
  if (naam === 'lijst' || naam === 'rekentool' || naam === 'werkcapaciteit') {
    headerInfo.hidden = true;
  } else if (huidigeClient) {
    headerInfo.hidden = false;
    document.getElementById('header-client-naam').textContent =
      huidigeClient.intake.persoonsgegevens.naam || huidigeClient.naam || 'Naamloos';
  }
}

// ---------- Event wiring ----------

function wireEvents() {
  document.querySelectorAll('[data-nav]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.nav;
      if (target === 'lijst') toonView('lijst');
      else if (target === 'intake-terug') toonView('intake');
      else if (target === 'berekening-terug') toonView('berekening');
    });
  });

  document.getElementById('btn-nieuwe-client').addEventListener('click', () => {
    huidigeClient = maakLeegClient();
    vulIntakeFormIn(huidigeClient);
    toonView('intake');
  });

  document.getElementById('btn-snelle-rekentool').addEventListener('click', () => toonView('rekentool'));
  document.getElementById('btn-bereken-voeding').addEventListener('click', berekenVoedingRekentool);
  document.getElementById('btn-bereken-frame').addEventListener('click', berekenFrameRekentool);
  document.getElementById('btn-bereken-rmA').addEventListener('click', berekenRmARekentool);
  document.getElementById('btn-bereken-rmB').addEventListener('click', berekenRmBRekentool);
  document.getElementById('btn-bereken-rmC').addEventListener('click', berekenRmCRekentool);
  document.getElementById('btn-bereken-werkcapaciteit').addEventListener('click', berekenWerkcapaciteitRekentool);
  document.getElementById('btn-bereken-volume').addEventListener('click', berekenVolumeRekentool);

  document.getElementById('btn-werkcapaciteit-tool').addEventListener('click', () => toonView('werkcapaciteit'));
  wireWerkcapaciteitFilters();

  document.getElementById('f-peds-gebruikt').addEventListener('change', toggleePedsDisclaimer);

  document.getElementById('intake-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!huidigeClient) huidigeClient = maakLeegClient();
    huidigeClient.intake = leesIntakeForm();
    huidigeClient.naam = huidigeClient.intake.persoonsgegevens.naam;
    try {
      await upsertClient(huidigeClient);
    } catch (err) {
      alert(`Opslaan mislukt: ${err.message}`);
      return;
    }
    vulInstellingenFormIn(huidigeClient);
    herberekenEnRender();
    toonView('berekening');
  });

  document.querySelectorAll('#view-berekening input, #view-berekening select').forEach((veld) => {
    veld.addEventListener('input', herberekenEnRender);
  });

  document.getElementById('btn-naar-overzicht').addEventListener('click', () => {
    renderOverzicht(huidigeClient);
    toonView('overzicht');
  });

  document.getElementById('btn-export-json').addEventListener('click', () => exporteerClient(huidigeClient));
  document.getElementById('btn-print').addEventListener('click', () => window.print());

  document.getElementById('btn-kracht-rij-toevoegen').addEventListener('click', () => {
    document.getElementById('kracht-tbody').appendChild(maakKrachtRij({ oefening: '', kg: 0, herhalingen: 0, sets: 0 }));
  });

  document.getElementById('import-json-input').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) importeerJsonBestand(file);
    e.target.value = '';
  });
}

// ---------- Init ----------

document.getElementById('btn-vergrendel').addEventListener('click', lockNow);

document.addEventListener('DOMContentLoaded', () => {
  initCoachGate(() => {
    initTagInputs();
    initFileInputs(uploadNaarStorage);
    wireEvents();
    startLiveClientLijst();
    laadWerkcapaciteitData();
    toonView('lijst');
  });
});
