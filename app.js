import * as calc from './calculations.js';

const STORAGE_KEY = 'pt-intake:clients:v1';

const APPARATUUR_OPTIES = [
  'Squat rek', 'Hyperextension bench', 'Chin-up belt (assist)', 'Leg curl machine',
  'Leg extension machine', 'TRX', 'Powerlifting bands', 'Powerlifting chains',
  'Verstelbare bank', 'Kabel machine', 'Smith machine', 'Dumbbells tot 50kg+',
];

const STANDAARD_KRACHT_RIJEN = ['Bench press', 'Squat', 'Chin-up', 'Overhead press'];

// ---------- Utilities ----------

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function fmt(n, decimals = 0) {
  if (n == null || Number.isNaN(n)) return '–';
  return Number(n).toLocaleString('nl-NL', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function num(value, fallback = null) {
  if (value === '' || value == null) return fallback;
  const n = Number(value);
  return Number.isNaN(n) ? fallback : n;
}

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

// ---------- Schema factory ----------

function maakLeegClient() {
  return {
    id: crypto.randomUUID(),
    naam: '',
    createdAt: new Date().toISOString(),
    intake: {
      persoonsgegevens: {
        naam: '', leeftijd: null, lengte: null, gewicht: null, vetpercentage: null,
        geslacht: 'man', trainingservaring: null,
      },
      huidigeKracht: STANDAARD_KRACHT_RIJEN.map((oefening) => ({ oefening, kg: 0, herhalingen: 0, sets: 0 })),
      doel: { tekst: '', categorie: 'onderhoud' },
      trainingsfrequentie: { huidig: 3, trainingsmomenten: [], baan: { type: '', urenZittend: null, urenStaand: null } },
      blessures: { tekst: '', vermijdenOefeningen: [] },
      dieet: { huidig: '', voorkeuren: [], afkeuren: [] },
      peds: { gebruikt: false, toelichting: '' },
      lifestyle: { activityLevel: 'sedentair', stressLevel: 'gemiddeld', slaap: { uren: null, kwaliteit: 'matig' }, cafeine: null },
      vetpercentageMeting: { huidplooimeter: false },
      materiaal: { laagstePlaat: null, dumbbellStapgrootte: null, apparatuur: [] },
      supplementen: '',
      genen: { polsomtrek: null, enkelomtrek: null, gewichtVoorheen: '', zwareBaby: false },
    },
    instellingen: {},
    calculations: null,
  };
}

// ---------- App state ----------

let huidigeClient = null;

// ---------- Tag input component ----------

function initTagInput(container) {
  container.tags = [];

  function render() {
    container.innerHTML = '';
    for (const tag of container.tags) {
      const el = document.createElement('span');
      el.className = 'tag';
      el.innerHTML = `${escapeHtml(tag)} <button type="button" aria-label="Verwijder">&times;</button>`;
      el.querySelector('button').addEventListener('click', () => {
        container.tags = container.tags.filter((t) => t !== tag);
        render();
      });
      container.appendChild(el);
    }
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = container.dataset.placeholder || '';
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const waarde = input.value.trim().replace(/,$/, '');
        if (waarde && !container.tags.includes(waarde)) {
          container.tags.push(waarde);
          render();
        }
      } else if (e.key === 'Backspace' && !input.value && container.tags.length) {
        container.tags.pop();
        render();
      }
    });
    container.appendChild(input);
  }

  container.setTags = (tags) => { container.tags = [...(tags ?? [])]; render(); };
  container.getTags = () => [...container.tags];
  render();
  return container;
}

// ---------- Kracht tabel ----------

function renderKrachtTabel(rijen) {
  const tbody = document.getElementById('kracht-tbody');
  tbody.innerHTML = '';
  for (const rij of rijen) tbody.appendChild(maakKrachtRij(rij));
}

function maakKrachtRij(rij) {
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td><input type="text" class="k-oefening" value="${escapeHtml(rij.oefening)}"></td>
    <td><input type="number" step="0.5" class="k-kg" value="${rij.kg ?? 0}"></td>
    <td><input type="number" class="k-reps" value="${rij.herhalingen ?? 0}"></td>
    <td><input type="number" class="k-sets" value="${rij.sets ?? 0}"></td>
    <td><button type="button" class="btn btn--danger btn--small" data-remove-rij>&times;</button></td>
  `;
  tr.querySelector('[data-remove-rij]').addEventListener('click', () => tr.remove());
  return tr;
}

function leesKrachtTabel() {
  return [...document.getElementById('kracht-tbody').querySelectorAll('tr')].map((tr) => ({
    oefening: tr.querySelector('.k-oefening').value.trim(),
    kg: num(tr.querySelector('.k-kg').value, 0),
    herhalingen: num(tr.querySelector('.k-reps').value, 0),
    sets: num(tr.querySelector('.k-sets').value, 0),
  })).filter((r) => r.oefening);
}

// ---------- Apparatuur checklist ----------

function renderApparatuurChecklist(geselecteerd) {
  const el = document.getElementById('apparatuur-checklist');
  el.innerHTML = APPARATUUR_OPTIES.map((optie) => `
    <label>
      <input type="checkbox" value="${escapeHtml(optie)}" ${geselecteerd.includes(optie) ? 'checked' : ''}>
      ${escapeHtml(optie)}
    </label>
  `).join('');
}

function leesApparatuurChecklist() {
  return [...document.querySelectorAll('#apparatuur-checklist input:checked')].map((i) => i.value);
}

// ---------- Intake form <-> data ----------

function vulIntakeFormIn(client) {
  const i = client.intake;
  document.getElementById('f-naam').value = i.persoonsgegevens.naam;
  document.getElementById('f-leeftijd').value = i.persoonsgegevens.leeftijd ?? '';
  document.getElementById('f-lengte').value = i.persoonsgegevens.lengte ?? '';
  document.getElementById('f-gewicht').value = i.persoonsgegevens.gewicht ?? '';
  document.getElementById('f-vetpercentage').value = i.persoonsgegevens.vetpercentage ?? '';
  document.getElementById('f-geslacht').value = i.persoonsgegevens.geslacht;
  document.getElementById('f-trainingservaring').value = i.persoonsgegevens.trainingservaring ?? '';
  document.getElementById('f-huidplooimeter').checked = !!i.vetpercentageMeting.huidplooimeter;

  renderKrachtTabel(i.huidigeKracht);

  document.getElementById('f-doel-categorie').value = i.doel.categorie;
  document.getElementById('f-doel-tekst').value = i.doel.tekst;

  document.getElementById('f-trainingsfrequentie').value = i.trainingsfrequentie.huidig ?? 3;
  document.getElementById('f-baan-type').value = i.trainingsfrequentie.baan.type;
  document.getElementById('f-baan-uren-zittend').value = i.trainingsfrequentie.baan.urenZittend ?? '';
  document.getElementById('f-baan-uren-staand').value = i.trainingsfrequentie.baan.urenStaand ?? '';
  document.getElementById('tags-trainingsmomenten').setTags(i.trainingsfrequentie.trainingsmomenten);

  document.getElementById('f-blessures-tekst').value = i.blessures.tekst;
  document.getElementById('tags-vermijden-oefeningen').setTags(i.blessures.vermijdenOefeningen);

  document.getElementById('f-dieet-huidig').value = i.dieet.huidig;
  document.getElementById('tags-voorkeuren').setTags(i.dieet.voorkeuren);
  document.getElementById('tags-afkeuren').setTags(i.dieet.afkeuren);

  document.getElementById('f-peds-gebruikt').checked = !!i.peds.gebruikt;
  document.getElementById('f-peds-toelichting').value = i.peds.toelichting;

  document.getElementById('f-activity-level').value = i.lifestyle.activityLevel;
  document.getElementById('f-stress-level').value = i.lifestyle.stressLevel;
  document.getElementById('f-slaap-uren').value = i.lifestyle.slaap.uren ?? '';
  document.getElementById('f-slaap-kwaliteit').value = i.lifestyle.slaap.kwaliteit;
  document.getElementById('f-cafeine').value = i.lifestyle.cafeine ?? '';

  document.getElementById('f-laagste-plaat').value = i.materiaal.laagstePlaat ?? '';
  document.getElementById('f-dumbbell-stap').value = i.materiaal.dumbbellStapgrootte ?? '';
  renderApparatuurChecklist(i.materiaal.apparatuur);

  document.getElementById('f-supplementen').value = i.supplementen;

  document.getElementById('f-polsomtrek').value = i.genen.polsomtrek ?? '';
  document.getElementById('f-enkelomtrek').value = i.genen.enkelomtrek ?? '';
  document.getElementById('f-gewicht-voorheen').value = i.genen.gewichtVoorheen;
  document.getElementById('f-zware-baby').checked = !!i.genen.zwareBaby;
}

function leesIntakeForm() {
  return {
    persoonsgegevens: {
      naam: document.getElementById('f-naam').value.trim(),
      leeftijd: num(document.getElementById('f-leeftijd').value),
      lengte: num(document.getElementById('f-lengte').value),
      gewicht: num(document.getElementById('f-gewicht').value),
      vetpercentage: num(document.getElementById('f-vetpercentage').value),
      geslacht: document.getElementById('f-geslacht').value,
      trainingservaring: num(document.getElementById('f-trainingservaring').value),
    },
    huidigeKracht: leesKrachtTabel(),
    doel: {
      tekst: document.getElementById('f-doel-tekst').value.trim(),
      categorie: document.getElementById('f-doel-categorie').value,
    },
    trainingsfrequentie: {
      huidig: num(document.getElementById('f-trainingsfrequentie').value, 3),
      trainingsmomenten: document.getElementById('tags-trainingsmomenten').getTags(),
      baan: {
        type: document.getElementById('f-baan-type').value.trim(),
        urenZittend: num(document.getElementById('f-baan-uren-zittend').value),
        urenStaand: num(document.getElementById('f-baan-uren-staand').value),
      },
    },
    blessures: {
      tekst: document.getElementById('f-blessures-tekst').value.trim(),
      vermijdenOefeningen: document.getElementById('tags-vermijden-oefeningen').getTags(),
    },
    dieet: {
      huidig: document.getElementById('f-dieet-huidig').value.trim(),
      voorkeuren: document.getElementById('tags-voorkeuren').getTags(),
      afkeuren: document.getElementById('tags-afkeuren').getTags(),
    },
    peds: {
      gebruikt: document.getElementById('f-peds-gebruikt').checked,
      toelichting: document.getElementById('f-peds-toelichting').value.trim(),
    },
    lifestyle: {
      activityLevel: document.getElementById('f-activity-level').value,
      stressLevel: document.getElementById('f-stress-level').value,
      slaap: {
        uren: num(document.getElementById('f-slaap-uren').value),
        kwaliteit: document.getElementById('f-slaap-kwaliteit').value,
      },
      cafeine: num(document.getElementById('f-cafeine').value),
    },
    vetpercentageMeting: { huidplooimeter: document.getElementById('f-huidplooimeter').checked },
    materiaal: {
      laagstePlaat: num(document.getElementById('f-laagste-plaat').value),
      dumbbellStapgrootte: num(document.getElementById('f-dumbbell-stap').value),
      apparatuur: leesApparatuurChecklist(),
    },
    supplementen: document.getElementById('f-supplementen').value.trim(),
    genen: {
      polsomtrek: num(document.getElementById('f-polsomtrek').value),
      enkelomtrek: num(document.getElementById('f-enkelomtrek').value),
      gewichtVoorheen: document.getElementById('f-gewicht-voorheen').value.trim(),
      zwareBaby: document.getElementById('f-zware-baby').checked,
    },
  };
}

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
  document.getElementById('ov-meta').textContent =
    `${intake.persoonsgegevens.leeftijd ?? '–'} jaar · ${intake.persoonsgegevens.gewicht ?? '–'} kg · ${intake.persoonsgegevens.vetpercentage ?? '–'}% vet · Doel: ${intake.doel.categorie}`;

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

// ---------- Client list view ----------

function renderClientLijst() {
  const container = document.getElementById('client-lijst');
  const tpl = document.getElementById('tpl-client-kaart');
  const clients = laadClients().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  container.innerHTML = '';
  if (!clients.length) {
    container.innerHTML = '<div class="empty-state">Nog geen cliënten. Klik op "+ Nieuwe cliënt" om te starten.</div>';
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

function downloadJson(bestandsnaam, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = bestandsnaam;
  a.click();
  URL.revokeObjectURL(url);
}

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
  if (naam === 'lijst') {
    headerInfo.hidden = true;
  } else if (huidigeClient) {
    headerInfo.hidden = false;
    document.getElementById('header-client-naam').textContent =
      huidigeClient.intake.persoonsgegevens.naam || huidigeClient.naam || 'Naamloos';
  }
}

// ---------- Event wiring ----------

function initTagInputs() {
  for (const el of document.querySelectorAll('.tag-input')) initTagInput(el);
}

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

document.addEventListener('DOMContentLoaded', () => {
  initTagInputs();
  wireEvents();
  renderClientLijst();
  toonView('lijst');
});
