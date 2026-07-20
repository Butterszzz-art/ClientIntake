import { downloadJson } from './utils.js';
import { maakLeegClient, initTagInputs, vulIntakeFormIn, leesIntakeForm, maakKrachtRij } from './intake-form.js';

// This page never talks to the coach dashboard: no client list, no
// calculations, no localStorage key shared with app.js. It only ever reads
// this one draft key, so nothing here can expose another client's data.
const DRAFT_KEY = 'pt-intake:client-draft:v1';

let huidigClient = null;
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

function slaConceptOp() {
  try {
    huidigClient.intake = leesIntakeForm();
    localStorage.setItem(DRAFT_KEY, JSON.stringify(huidigClient));
  } catch {
    // Form not in a readable state yet (e.g. mid-edit) — skip this autosave tick.
  }
}

function verstuur() {
  huidigClient.intake = leesIntakeForm();
  huidigClient.naam = huidigClient.intake.persoonsgegevens.naam;
  laatsteBestandsnaam = bestandsnaamVoor(huidigClient);
  downloadJson(laatsteBestandsnaam, { client: huidigClient });
  document.getElementById('bedankt-naam').textContent = huidigClient.naam || 'daar';
  document.getElementById('bedankt-bestandsnaam').textContent = laatsteBestandsnaam;
  toonView('bedankt');
}

document.addEventListener('DOMContentLoaded', () => {
  initTagInputs();

  const opgeslagenConcept = localStorage.getItem(DRAFT_KEY);
  if (opgeslagenConcept) {
    try {
      const concept = JSON.parse(opgeslagenConcept);
      if (concept?.intake && confirm('We vonden een eerder gestart formulier op dit apparaat. Wil je daarmee verdergaan?\n\nAnnuleren = opnieuw beginnen.')) {
        huidigClient = concept;
      }
    } catch {
      // Corrupt draft — ignore and start fresh below.
    }
  }
  if (!huidigClient) huidigClient = maakLeegClient();
  vulIntakeFormIn(huidigClient);

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
    vulIntakeFormIn(huidigClient);
    toonView('form');
  });
});
