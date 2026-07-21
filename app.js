import * as calc from './calculations.js?v=2';
import { escapeHtml, fmt, num, downloadJson } from './utils.js?v=2';
import {
  maakLeegClient, initTagInputs, vulIntakeFormIn, leesIntakeForm, maakKrachtRij,
} from './intake-form.js?v=2';
import { initCoachGate, lockNow } from './coach-auth.js?v=2';

const STORAGE_KEY = 'pt-intake:clients:v1';

// ---------- Storage ----------

function laadClients() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function opslaanClients(clients) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(clients));
}

function upsertClient(client) {
  const clients = laadClients();
  const i = clients.findIndex((c) => c.id === client.id);
  if (i >= 0) clients[i] = client; else clients.push(client);
  opslaanClients(clients);
}

function verwijderClientUitStorage(id) {
  opslaanClients(laadClients().filter((c) => c.id !== id));
}

function vindClient(id) {
  return laadClients().find((c) => c.id === id) ?? null;
}

// ---------- App state ----------

let huidigeClient = null;

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
  upsertClient(huidigeClient);
  renderBerekeningResultaten(huidigeClient.calculations);
}

function renderBerekeningResultaten(c) {
  document.getElementById('berekening-kerncijfers').innerHTML = [
    kerncijferHtml('Vetvrije massa', fmt(c.vetvrijeMassa, 1), 'kg', 'gewicht × (1 − vetpercentage)'),
    kerncijferHtml('BMR (Katch-McArdle)', fmt(c.bmr), 'kcal', '370 + 21.6 × vetvrije massa'),
    kerncijferHtml('Energie training (EE)', fmt(c.ee), 'kcal', 'MET × 3.5 × gewicht / 200 × duur'),
    kerncijferHtml('Rustdag verbruik (REE)', fmt(c.ree), 'kcal', 'BMR × PAL × TEF'),
    kerncijferHtml('Totaal trainingsdag', fmt(c.totaalTrainingsdag), 'kcal', 'REE + (EE × TEF)'),
    kerncijferHtml('Onderhoud/dag', fmt(c.onderhoudPerDag), 'kcal', 'gewogen gemiddelde over de week'),
    kerncijferHtml('Beoogd — rustdag', fmt(c.beoogdeInnameRustdag), 'kcal', 'onderhoud × energiebalans-factor'),
    kerncijferHtml('Beoogd — trainingsdag', fmt(c.beoogdeInnameTrainingsdag), 'kcal', 'beoogd rustdag + EE'),
  ].join('');

  document.getElementById('berekening-macros').innerHTML = [
    kerncijferHtml('Eiwit', fmt(c.macros.eiwit, 1), 'g/dag', 'factor × lichaamsgewicht'),
    kerncijferHtml('Vet', fmt(c.macros.vet, 1), 'g/dag', '% van REE / 9'),
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
    kerncijferHtml('Beoogd — rustdag', fmt(c.beoogdeInnameRustdag), 'kcal'),
    kerncijferHtml('Beoogd — trainingsdag', fmt(c.beoogdeInnameTrainingsdag), 'kcal'),
    kerncijferHtml('Eiwit', fmt(c.macros.eiwit, 1), 'g'),
    kerncijferHtml('Vet', fmt(c.macros.vet, 1), 'g'),
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

  const rustRijen = calc.verdeelMaaltijden({ eiwit, vet, koolhydraten: koolRust }, maaltijden);
  const trainRijen = calc.verdeelMaaltijden({ eiwit, vet, koolhydraten: koolTraining }, maaltijden);

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

function berekenRmRekentool() {
  const gewicht = num(document.getElementById('r-rm-gewicht').value);
  const reps = num(document.getElementById('r-rm-reps').value);
  const pct = num(document.getElementById('r-rm-pct').value) / 100;
  const rm = calc.geschat1RM(gewicht, reps);
  const target = calc.repTargetGewicht(rm, pct);

  document.getElementById('rekentool-rm-resultaat').innerHTML = `
    <div class="kerncijfers">
      ${kerncijferHtml('Geschatte 1RM', fmt(rm, 1), 'kg')}
      ${kerncijferHtml(`Rep target (${fmt(pct * 100, 0)}% 1RM)`, fmt(target, 1), 'kg')}
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

// ---------- Client list view ----------

function renderClientLijst() {
  const container = document.getElementById('client-lijst');
  const tpl = document.getElementById('tpl-client-kaart');
  const clients = laadClients().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  container.innerHTML = '';
  if (!clients.length) {
    container.innerHTML = '<div class="empty-state">Nog geen cliënten. Klik op "+ Nieuwe cliënt" of importeer een ingevulde intake.</div>';
    return;
  }

  for (const client of clients) {
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
        verwijderClientUitStorage(client.id);
        renderClientLijst();
      }
    });
    container.appendChild(node);
  }
}

function openClient(id) {
  const client = vindClient(id);
  if (!client) return;
  huidigeClient = client;
  client.calculations = calc.berekenClient(client.intake, client.instellingen);
  upsertClient(client);
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
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      const client = data.client ?? data;
      if (!client.intake) throw new Error('Geen geldig cliëntprofiel gevonden in dit bestand.');
      client.id = client.id || crypto.randomUUID();
      client.instellingen = client.instellingen || {};
      upsertClient(client);
      renderClientLijst();
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
  if (naam === 'lijst' || naam === 'rekentool') {
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
      if (target === 'lijst') { renderClientLijst(); toonView('lijst'); }
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
  document.getElementById('btn-bereken-rm').addEventListener('click', berekenRmRekentool);
  document.getElementById('btn-bereken-werkcapaciteit').addEventListener('click', berekenWerkcapaciteitRekentool);

  document.getElementById('intake-form').addEventListener('submit', (e) => {
    e.preventDefault();
    if (!huidigeClient) huidigeClient = maakLeegClient();
    huidigeClient.intake = leesIntakeForm();
    huidigeClient.naam = huidigeClient.intake.persoonsgegevens.naam;
    upsertClient(huidigeClient);
    vulInstellingenFormIn(huidigeClient);
    herberekenEnRender();
    toonView('berekening');
  });

  document.querySelectorAll('#view-berekening input').forEach((input) => {
    input.addEventListener('input', herberekenEnRender);
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
    wireEvents();
    renderClientLijst();
    toonView('lijst');
  });
});
