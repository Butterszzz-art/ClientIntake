// Shared intake-form logic: schema factory, form <-> data binding, and the
// small UI widgets (tag input, kracht table, apparatuur checklist, file
// upload) used by both the client-facing intake page and the coach
// dashboard. Both pages render the same fieldset markup (same element IDs)
// and import this module so the reading/writing logic exists exactly once.

import { escapeHtml, num } from './utils.js?v=9';

// Stable canonical keys (not translated) — these are the values actually
// stored in intake.materiaal.apparatuur, so the schema stays consistent no
// matter which language a client filled the form in. Display labels are
// looked up via `labelFn`, which defaults to Dutch (used by coach.html).
export const APPARATUUR_OPTIES = [
  'squat_rack', 'hyperextension_bench', 'reverse_hyper', 'glute_ham_raise',
  'standing_calf_raise_machine', 'seated_calf_raise', 'chinup_belt',
  'leg_curl_machine', 'leg_extension_machine', 'knee_wraps', 'gymnastic_rings',
  'trx', 'resistance_bands', 'powerlifting_bands', 'powerlifting_chains',
  'adjustable_bench', 'cable_machine', 'smith_machine', 'dumbbells_50kg',
];

const STANDAARD_APPARATUUR_LABELS = {
  squat_rack: 'Squat rack/cage',
  hyperextension_bench: '45° hyperextension bank',
  reverse_hyper: 'Reverse hyper',
  glute_ham_raise: 'Glute-ham raise (GHR)',
  standing_calf_raise_machine: 'Staande calf raise machine',
  seated_calf_raise: 'Seated calf raise',
  chinup_belt: 'Dip/chin-up belt (assist)',
  leg_curl_machine: 'Leg curl machine (zittend/liggend/staand)',
  leg_extension_machine: 'Leg extension machine',
  knee_wraps: 'Knee wraps',
  gymnastic_rings: 'Gymnastiekringen',
  trx: 'TRX / suspensietrainer',
  resistance_bands: 'Weerstandsbanden',
  powerlifting_bands: 'Powerlifting bands (accommodating resistance)',
  powerlifting_chains: 'Kettingen',
  adjustable_bench: 'Verstelbare bank',
  cable_machine: 'Kabelstation (verstelbaar)',
  smith_machine: 'Smith machine',
  dumbbells_50kg: 'Dumbbells tot 50kg+',
};

export const STANDAARD_KRACHT_RIJEN = ['Bench press', 'Squat', 'Chin-up', 'Overhead press'];

const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // matches the Storage security rule's 15MB cap

// ---------- Schema factory ----------

export function maakLeegClient() {
  return {
    id: crypto.randomUUID(),
    naam: '',
    createdAt: new Date().toISOString(),
    intake: {
      persoonsgegevens: {
        naam: '', email: '', adres: '', postcode: '', stad: '', land: '',
        leeftijd: null, lengte: null, gewicht: null, vetpercentage: null,
        geslacht: 'man', trainingservaring: null,
      },
      huidigeKracht: STANDAARD_KRACHT_RIJEN.map((oefening) => ({ oefening, kg: 0, herhalingen: 0, sets: 0 })),
      doel: {
        tekst: '', categorie: 'onderhoud',
        spiergroepenNietGroter: '', andereSporten: '', gewenstFrequentieTekst: '',
      },
      motivatieMindset: { motivatie: '', mentaleInstelling: '' },
      trainingsfrequentie: {
        huidig: 3, trainingsmomenten: [], nietBeschikbaarTekst: '',
        baan: { type: '', urenZittend: null, urenStaand: null },
      },
      blessures: { tekst: '', vermijdenOefeningen: [] },
      dieet: { huidig: '', specifiekDieet: '', voorkeuren: [], afkeuren: [] },
      peds: { gebruikt: false, toelichting: '', disclaimerGeaccepteerd: false },
      lifestyle: {
        activityLevel: 'sedentair', stressLevel: 'gemiddeld',
        slaap: { uren: null, kwaliteit: 'matig', ritmeToelichting: '' },
        cafeine: null, cafeineToelichting: '',
      },
      vetpercentageMeting: { huidplooimeter: false, methode: '' },
      materiaal: { laagstePlaat: null, dumbbellStapgrootte: null, apparatuur: [], overig: '' },
      supplementen: '',
      genen: {
        polsomtrek: null, enkelomtrek: null, gewichtVoorheen: '', lengteVoorheen: '', zwareBaby: false,
        handFotoUrl: null, handFotoBestandsnaam: '',
      },
      huidigProgramma: { tekst: '', bestandUrl: null, bestandNaam: '' },
    },
    instellingen: {},
    calculations: null,
  };
}

// ---------- Tag input component ----------

export function initTagInput(container) {
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

export function initTagInputs() {
  for (const el of document.querySelectorAll('.tag-input')) initTagInput(el);
}

// ---------- Kracht tabel ----------

export function renderKrachtTabel(rijen) {
  const tbody = document.getElementById('kracht-tbody');
  tbody.innerHTML = '';
  for (const rij of rijen) tbody.appendChild(maakKrachtRij(rij));
}

export function maakKrachtRij(rij) {
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

export function leesKrachtTabel() {
  return [...document.getElementById('kracht-tbody').querySelectorAll('tr')].map((tr) => ({
    oefening: tr.querySelector('.k-oefening').value.trim(),
    kg: num(tr.querySelector('.k-kg').value, 0),
    herhalingen: num(tr.querySelector('.k-reps').value, 0),
    sets: num(tr.querySelector('.k-sets').value, 0),
  })).filter((r) => r.oefening);
}

// ---------- Apparatuur checklist ----------

export function renderApparatuurChecklist(geselecteerd, labelFn = (key) => STANDAARD_APPARATUUR_LABELS[key] ?? key) {
  const el = document.getElementById('apparatuur-checklist');
  el.innerHTML = APPARATUUR_OPTIES.map((key) => `
    <label>
      <input type="checkbox" value="${escapeHtml(key)}" ${geselecteerd.includes(key) ? 'checked' : ''}>
      ${escapeHtml(labelFn(key))}
    </label>
  `).join('');
}

export function leesApparatuurChecklist() {
  return [...document.querySelectorAll('#apparatuur-checklist input:checked')].map((i) => i.value);
}

// ---------- File upload (hand photo, program attachment) ----------
// Files go to Firebase Storage, not into the Firestore document — Firestore
// hard-caps a document at 1MB, so embedding a photo as a base64 data: URL
// would silently fail to save the moment someone uploads a real photo
// instead of a tiny test file. The document only ever stores the resulting
// download URL (a short string) plus the original filename.
//
// `uploadFn(file, veldId) => Promise<url>` is injected by the caller
// (client.js / app.js), which both already own the Firebase Storage
// reference — keeps this module free of a hard Firebase dependency, same as
// the rest of it.

// Wires every <input type="file" data-upload-status="..."> on the page: on
// selection, uploads the file and stashes the resulting URL as a property on
// the input element itself (browsers won't let script set `.files`, so this
// is the only way to both show the existing value on reload and carry a
// freshly-picked file through to leesIntakeForm()).
export function initFileInputs(uploadFn) {
  for (const el of document.querySelectorAll('input[type="file"][data-upload-status]')) {
    el.addEventListener('change', async () => {
      const statusEl = document.getElementById(el.dataset.uploadStatus);
      const file = el.files?.[0];
      if (!file) return;
      if (file.size > MAX_UPLOAD_BYTES) {
        el.value = '';
        alert('Bestand is groter dan 15MB — kies een kleiner bestand.');
        return;
      }
      if (statusEl) statusEl.textContent = 'Uploaden...';
      try {
        el.downloadUrl = await uploadFn(file, el.id);
        el.bestandNaam = file.name;
        if (statusEl) statusEl.textContent = `${file.name} ✓`;
      } catch (err) {
        el.value = '';
        el.downloadUrl = null;
        el.bestandNaam = '';
        if (statusEl) statusEl.textContent = '';
        alert(`Uploaden mislukt: ${err.message}`);
      }
    });
  }
}

function zetBestandVeld(inputId, statusId, downloadUrl, bestandNaam) {
  const input = document.getElementById(inputId);
  input.downloadUrl = downloadUrl ?? null;
  input.bestandNaam = bestandNaam ?? '';
  const statusEl = document.getElementById(statusId);
  if (statusEl) statusEl.textContent = bestandNaam ? `${bestandNaam} ✓` : '';
}

function leesBestandVeld(inputId) {
  const input = document.getElementById(inputId);
  return { downloadUrl: input.downloadUrl ?? null, bestandNaam: input.bestandNaam ?? '' };
}

// ---------- Intake form <-> data ----------

export function vulIntakeFormIn(client, apparatuurLabelFn) {
  const i = client.intake;
  document.getElementById('f-naam').value = i.persoonsgegevens.naam;
  document.getElementById('f-email').value = i.persoonsgegevens.email ?? '';
  document.getElementById('f-adres').value = i.persoonsgegevens.adres ?? '';
  document.getElementById('f-postcode').value = i.persoonsgegevens.postcode ?? '';
  document.getElementById('f-stad').value = i.persoonsgegevens.stad ?? '';
  document.getElementById('f-land').value = i.persoonsgegevens.land ?? '';
  document.getElementById('f-leeftijd').value = i.persoonsgegevens.leeftijd ?? '';
  document.getElementById('f-lengte').value = i.persoonsgegevens.lengte ?? '';
  document.getElementById('f-gewicht').value = i.persoonsgegevens.gewicht ?? '';
  document.getElementById('f-vetpercentage').value = i.persoonsgegevens.vetpercentage ?? '';
  document.getElementById('f-geslacht').value = i.persoonsgegevens.geslacht;
  document.getElementById('f-trainingservaring').value = i.persoonsgegevens.trainingservaring ?? '';
  document.getElementById('f-huidplooimeter').checked = !!i.vetpercentageMeting.huidplooimeter;
  document.getElementById('f-huidplooimeter-methode').value = i.vetpercentageMeting.methode ?? '';

  renderKrachtTabel(i.huidigeKracht);

  document.getElementById('f-doel-categorie').value = i.doel.categorie;
  document.getElementById('f-doel-tekst').value = i.doel.tekst;
  document.getElementById('f-doel-spiergroepen-niet-groter').value = i.doel.spiergroepenNietGroter ?? '';
  document.getElementById('f-doel-andere-sporten').value = i.doel.andereSporten ?? '';
  document.getElementById('f-doel-gewenste-frequentie').value = i.doel.gewenstFrequentieTekst ?? '';

  document.getElementById('f-motivatie').value = i.motivatieMindset?.motivatie ?? '';
  document.getElementById('f-mentale-instelling').value = i.motivatieMindset?.mentaleInstelling ?? '';

  document.getElementById('f-trainingsfrequentie').value = i.trainingsfrequentie.huidig ?? 3;
  document.getElementById('f-niet-beschikbaar').value = i.trainingsfrequentie.nietBeschikbaarTekst ?? '';
  document.getElementById('f-baan-type').value = i.trainingsfrequentie.baan.type;
  document.getElementById('f-baan-uren-zittend').value = i.trainingsfrequentie.baan.urenZittend ?? '';
  document.getElementById('f-baan-uren-staand').value = i.trainingsfrequentie.baan.urenStaand ?? '';
  document.getElementById('tags-trainingsmomenten').setTags(i.trainingsfrequentie.trainingsmomenten);

  document.getElementById('f-blessures-tekst').value = i.blessures.tekst;
  document.getElementById('tags-vermijden-oefeningen').setTags(i.blessures.vermijdenOefeningen);

  document.getElementById('f-dieet-huidig').value = i.dieet.huidig;
  document.getElementById('f-dieet-specifiek').value = i.dieet.specifiekDieet ?? '';
  document.getElementById('tags-voorkeuren').setTags(i.dieet.voorkeuren);
  document.getElementById('tags-afkeuren').setTags(i.dieet.afkeuren);

  document.getElementById('f-peds-gebruikt').checked = !!i.peds.gebruikt;
  document.getElementById('f-peds-toelichting').value = i.peds.toelichting;
  document.getElementById('f-peds-disclaimer').checked = !!i.peds.disclaimerGeaccepteerd;
  toggleePedsDisclaimer();

  document.getElementById('f-activity-level').value = i.lifestyle.activityLevel;
  document.getElementById('f-stress-level').value = i.lifestyle.stressLevel;
  document.getElementById('f-slaap-uren').value = i.lifestyle.slaap.uren ?? '';
  document.getElementById('f-slaap-kwaliteit').value = i.lifestyle.slaap.kwaliteit;
  document.getElementById('f-slaap-ritme').value = i.lifestyle.slaap.ritmeToelichting ?? '';
  document.getElementById('f-cafeine').value = i.lifestyle.cafeine ?? '';
  document.getElementById('f-cafeine-toelichting').value = i.lifestyle.cafeineToelichting ?? '';

  document.getElementById('f-laagste-plaat').value = i.materiaal.laagstePlaat ?? '';
  document.getElementById('f-dumbbell-stap').value = i.materiaal.dumbbellStapgrootte ?? '';
  document.getElementById('f-materiaal-overig').value = i.materiaal.overig ?? '';
  renderApparatuurChecklist(i.materiaal.apparatuur, apparatuurLabelFn);

  document.getElementById('f-supplementen').value = i.supplementen;

  document.getElementById('f-polsomtrek').value = i.genen.polsomtrek ?? '';
  document.getElementById('f-enkelomtrek').value = i.genen.enkelomtrek ?? '';
  document.getElementById('f-gewicht-voorheen').value = i.genen.gewichtVoorheen;
  document.getElementById('f-lengte-voorheen').value = i.genen.lengteVoorheen ?? '';
  document.getElementById('f-zware-baby').checked = !!i.genen.zwareBaby;
  zetBestandVeld('f-hand-foto', 'f-hand-foto-status', i.genen.handFotoUrl, i.genen.handFotoBestandsnaam);

  document.getElementById('f-huidig-programma-tekst').value = i.huidigProgramma?.tekst ?? '';
  zetBestandVeld('f-huidig-programma-bestand', 'f-huidig-programma-bestand-status', i.huidigProgramma?.bestandUrl, i.huidigProgramma?.bestandNaam);
}

// Shows/hides the PED liability disclaimer depending on whether "gebruikt"
// is checked — the disclaimer only makes sense once PED use is disclosed.
export function toggleePedsDisclaimer() {
  const gebruikt = document.getElementById('f-peds-gebruikt').checked;
  const wrap = document.getElementById('peds-disclaimer-wrap');
  if (wrap) wrap.hidden = !gebruikt;
  if (!gebruikt) document.getElementById('f-peds-disclaimer').checked = false;
}

export function leesIntakeForm() {
  const handFoto = leesBestandVeld('f-hand-foto');
  const programmaBestand = leesBestandVeld('f-huidig-programma-bestand');

  return {
    persoonsgegevens: {
      naam: document.getElementById('f-naam').value.trim(),
      email: document.getElementById('f-email').value.trim(),
      adres: document.getElementById('f-adres').value.trim(),
      postcode: document.getElementById('f-postcode').value.trim(),
      stad: document.getElementById('f-stad').value.trim(),
      land: document.getElementById('f-land').value.trim(),
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
      spiergroepenNietGroter: document.getElementById('f-doel-spiergroepen-niet-groter').value.trim(),
      andereSporten: document.getElementById('f-doel-andere-sporten').value.trim(),
      gewenstFrequentieTekst: document.getElementById('f-doel-gewenste-frequentie').value.trim(),
    },
    motivatieMindset: {
      motivatie: document.getElementById('f-motivatie').value.trim(),
      mentaleInstelling: document.getElementById('f-mentale-instelling').value.trim(),
    },
    trainingsfrequentie: {
      huidig: num(document.getElementById('f-trainingsfrequentie').value, 3),
      trainingsmomenten: document.getElementById('tags-trainingsmomenten').getTags(),
      nietBeschikbaarTekst: document.getElementById('f-niet-beschikbaar').value.trim(),
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
      specifiekDieet: document.getElementById('f-dieet-specifiek').value.trim(),
      voorkeuren: document.getElementById('tags-voorkeuren').getTags(),
      afkeuren: document.getElementById('tags-afkeuren').getTags(),
    },
    peds: {
      gebruikt: document.getElementById('f-peds-gebruikt').checked,
      toelichting: document.getElementById('f-peds-toelichting').value.trim(),
      disclaimerGeaccepteerd: document.getElementById('f-peds-disclaimer').checked,
    },
    lifestyle: {
      activityLevel: document.getElementById('f-activity-level').value,
      stressLevel: document.getElementById('f-stress-level').value,
      slaap: {
        uren: num(document.getElementById('f-slaap-uren').value),
        kwaliteit: document.getElementById('f-slaap-kwaliteit').value,
        ritmeToelichting: document.getElementById('f-slaap-ritme').value.trim(),
      },
      cafeine: num(document.getElementById('f-cafeine').value),
      cafeineToelichting: document.getElementById('f-cafeine-toelichting').value.trim(),
    },
    vetpercentageMeting: {
      huidplooimeter: document.getElementById('f-huidplooimeter').checked,
      methode: document.getElementById('f-huidplooimeter-methode').value.trim(),
    },
    materiaal: {
      laagstePlaat: num(document.getElementById('f-laagste-plaat').value),
      dumbbellStapgrootte: num(document.getElementById('f-dumbbell-stap').value),
      apparatuur: leesApparatuurChecklist(),
      overig: document.getElementById('f-materiaal-overig').value.trim(),
    },
    supplementen: document.getElementById('f-supplementen').value.trim(),
    genen: {
      polsomtrek: num(document.getElementById('f-polsomtrek').value),
      enkelomtrek: num(document.getElementById('f-enkelomtrek').value),
      gewichtVoorheen: document.getElementById('f-gewicht-voorheen').value.trim(),
      lengteVoorheen: document.getElementById('f-lengte-voorheen').value.trim(),
      zwareBaby: document.getElementById('f-zware-baby').checked,
      handFotoUrl: handFoto.downloadUrl,
      handFotoBestandsnaam: handFoto.bestandNaam,
    },
    huidigProgramma: {
      tekst: document.getElementById('f-huidig-programma-tekst').value.trim(),
      bestandUrl: programmaBestand.downloadUrl,
      bestandNaam: programmaBestand.bestandNaam,
    },
  };
}
