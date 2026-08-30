// Coach-only business tracker: acquisitiekosten, churn, CLV, doorverwijzingen.
// Deliberately kept local-only (localStorage, geen Firestore) — dit zijn
// Armans eigen bedrijfscijfers, niet cliëntdata die tussen apparaten hoeft te
// synchroniseren. Gated achter dezelfde Firebase-login als coach.html.

import { escapeHtml, num, downloadJson } from './utils.js?v=14';
import { initCoachGate, lockNow } from './coach-auth.js?v=14';

const STORAGE_KEY = 'ptBusinessTracker_v1';

// Zelfde drie namen als de prijzentabel op index.html (data-tier op de
// .tier-cta-knoppen) — moet letterlijk overeenkomen, anders matcht een lead
// niet meer met een tier hier.
const TIERS = ['Basis', 'Medium', 'Premium'];

// Aantal ad-hoc dieet-/programma-aanpassingen dat per kalendermaand is
// inbegrepen, per tier (zie de prijzentabel: Medium heeft er 2/maand
// inbegrepen, Premium onbeperkt, Basis geen). Dit telt alleen substantiële
// aanpassingsverzoeken (een programma of dieet herzien) — echte
// veiligheids-/welzijnsberichten worden bij elke tier altijd gehoord en
// vallen hier dus buiten.
const AANPASSING_CAPS = { Basis: 0, Medium: 2, Premium: Infinity };

// Aantal dagen na de startdatum waarna een cliënt zonder app-toegang en/of
// zonder ebook nog als "recent gestart, nog niet afgehandeld" telt in plaats
// van als iets dat écht is blijven liggen.
const ONBOARDING_WAARSCHUWING_DAGEN = 3;

// Vult per cliënt ontbrekende velden aan met hun default, zodat oudere
// back-ups (van vóór aanpassing-tracking / de onboarding-checklist) zonder
// fouten laden. Gedeeld door laadState() en de import-back-up-handler
// hieronder, zodat beide dezelfde defaults toepassen.
function normaliseerClienten(clients) {
  return (clients || []).map((c) => ({
    aanpassingen: [],
    appAccessGranted: false,
    ebookSent: false,
    ...c,
  }));
}

function laadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { clients: [], spend: [], leads: [], assumedRetentionMonths: 6 };
    const parsed = JSON.parse(raw);
    return {
      clients: normaliseerClienten(parsed.clients),
      spend: parsed.spend || [],
      leads: parsed.leads || [],
      assumedRetentionMonths: parsed.assumedRetentionMonths || 6,
    };
  } catch (e) {
    console.error('Kon business-tracker data niet laden:', e);
    return { clients: [], spend: [], leads: [], assumedRetentionMonths: 6 };
  }
}

let state = laadState();
function bewaarState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

// Onthoudt welke lead we aan het converteren zijn zodat het "Cliënt
// toevoegen"-formulier hem, na versturen, als geconverteerd kan markeren.
let inBehandelingLeadId = null;

// Welke cliënten hun aanpassing-geschiedenis uitgeklapt hebben staan. Puur
// UI-state (niet bewaard) — reset bij een herlaad van de pagina.
const uitgeklapteClienten = new Set();

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }
function maandSleutelVanDatum(dateStr) { return dateStr ? dateStr.slice(0, 7) : null; }
function eersteVanMaand(maandSleutel) {
  const [j, m] = maandSleutel.split('-').map(Number);
  return new Date(j, m - 1, 1);
}
function datumInMaand(dateStr, maandSleutel) {
  return dateStr ? maandSleutelVanDatum(dateStr) === maandSleutel : false;
}
function naarDatum(dateStr) { return new Date(dateStr + 'T00:00:00'); }
function maandenTussen(startStr, eindStr) {
  const start = naarDatum(startStr);
  const eind = naarDatum(eindStr);
  const maanden = (eind.getFullYear() - start.getFullYear()) * 12 + (eind.getMonth() - start.getMonth());
  return Math.max(maanden, 0.5);
}

// Telt alleen de aanpassingen van deze cliënt die in de huidige kalendermaand
// gelogd zijn — reset dus vanzelf elke maand, gebaseerd op de datum van de
// aanpassing zelf (geen handmatige reset-knop nodig).
function aanpassingenDezeMaand(client) {
  const mk = huidigeMaandSleutel();
  return (client.aanpassingen || []).filter((a) => datumInMaand(a.datum, mk)).length;
}

// True zodra de cliënt een paar dagen "oud" is maar app-toegang en/of ebook
// nog niet zijn afgevinkt — een zachte prikkel zodat dit niet blijft liggen
// zodra het cliëntenaantal groeit.
function onboardingWaarschuwing(client) {
  if (client.appAccessGranted && client.ebookSent) return false;
  if (!client.start) return false;
  const dagenSindsStart = (Date.now() - naarDatum(client.start).getTime()) / 86400000;
  return dagenSindsStart > ONBOARDING_WAARSCHUWING_DAGEN;
}

function actiefBijStartVanMaand(maandSleutel) {
  const start = eersteVanMaand(maandSleutel);
  return state.clients.filter((c) => {
    const clientStart = naarDatum(c.start);
    if (clientStart >= start) return false;
    if (!c.churnDatum) return true;
    return naarDatum(c.churnDatum) >= start;
  }).length;
}
function nieuweClientenInMaand(maandSleutel) {
  return state.clients.filter((c) => datumInMaand(c.start, maandSleutel)).length;
}
function gestoptInMaand(maandSleutel) {
  return state.clients.filter((c) => c.churnDatum && datumInMaand(c.churnDatum, maandSleutel)).length;
}
function uitgaveInMaand(maandSleutel) {
  return state.spend.filter((s) => s.maand === maandSleutel).reduce((som, s) => som + Number(s.bedrag || 0), 0);
}
function acquisitiekostenVoorMaand(maandSleutel) {
  const uitgave = uitgaveInMaand(maandSleutel);
  const nieuw = nieuweClientenInMaand(maandSleutel);
  return nieuw === 0 ? null : uitgave / nieuw;
}
function churnPercentageVoorMaand(maandSleutel) {
  const actiefStart = actiefBijStartVanMaand(maandSleutel);
  return actiefStart === 0 ? null : gestoptInMaand(maandSleutel) / actiefStart;
}
function actieveClienten() { return state.clients.filter((c) => !c.churnDatum); }
function mrr() { return actieveClienten().reduce((s, c) => s + Number(c.waarde || 0), 0); }
function geschatteCLV() {
  const gestopt = state.clients.filter((c) => c.churnDatum);
  if (gestopt.length === 0) {
    const gemWaarde = state.clients.length
      ? state.clients.reduce((s, c) => s + Number(c.waarde || 0), 0) / state.clients.length
      : 0;
    return { waarde: gemWaarde * state.assumedRetentionMonths, basis: 'aangenomen' };
  }
  const gemDuur = gestopt.reduce((s, c) => s + maandenTussen(c.start, c.churnDatum), 0) / gestopt.length;
  const gemWaarde = gestopt.reduce((s, c) => s + Number(c.waarde || 0), 0) / gestopt.length;
  return { waarde: gemWaarde * gemDuur, basis: 'echt' };
}
function doorverwijsRanglijst() {
  const tellingen = {};
  state.clients.forEach((c) => { if (c.doorverwezenDoor) tellingen[c.doorverwezenDoor] = (tellingen[c.doorverwezenDoor] || 0) + 1; });
  return Object.entries(tellingen).sort((a, b) => b[1] - a[1]);
}

function tierTagClass(tier) {
  return `tag--tier-${(tier || 'basis').toLowerCase()}`;
}

function facturatieLabel(billing) {
  return billing === 'kwartaal' ? 'Per 3 maanden' : 'Maandelijks';
}

function funnelPerTier() {
  return TIERS.map((tier) => {
    const leads = state.leads.filter((l) => l.tier === tier);
    const geconverteerd = leads.filter((l) => l.status === 'geconverteerd');
    const tierClienten = actieveClienten().filter((c) => c.tier === tier);
    const tierMrr = tierClienten.reduce((s, c) => s + Number(c.waarde || 0), 0);
    return {
      tier,
      aantalLeads: leads.length,
      aantalGeconverteerd: geconverteerd.length,
      conversieRatio: leads.length ? geconverteerd.length / leads.length : null,
      aantalActief: tierClienten.length,
      mrr: tierMrr,
    };
  });
}

function fmtEuro(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return '€' + Number(n).toLocaleString('nl-NL', { maximumFractionDigits: 0 });
}
function fmtPct(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  return (n * 100).toFixed(1) + '%';
}

// ---------- Rendering ----------

const monthSelect = document.getElementById('monthSelect');
function huidigeMaandSleutel() {
  const nu = new Date();
  return nu.getFullYear() + '-' + String(nu.getMonth() + 1).padStart(2, '0');
}

function kerncijferHtml(label, waarde, toelichting, accent) {
  return `
    <div class="kerncijfer">
      <span class="kerncijfer__label">${escapeHtml(label)}</span>
      <span class="kerncijfer__waarde"${accent ? ' style="color:var(--accent)"' : ''}>${waarde}</span>
      ${toelichting ? `<span class="kerncijfer__toelichting">${escapeHtml(toelichting)}</span>` : ''}
    </div>
  `;
}

function renderMetrics() {
  const mk = monthSelect.value || huidigeMaandSleutel();
  const acqKosten = acquisitiekostenVoorMaand(mk);
  const churn = churnPercentageVoorMaand(mk);
  const clv = geschatteCLV();
  document.getElementById('metrics-grid').innerHTML = [
    kerncijferHtml('Actieve cliënten', actieveClienten().length),
    kerncijferHtml('MRR', fmtEuro(mrr()), null, true),
    kerncijferHtml(`Acquisitiekosten (${mk})`, acqKosten === null ? '—' : fmtEuro(acqKosten),
      `${nieuweClientenInMaand(mk)} nieuwe cliënt(en) deze maand`),
    kerncijferHtml(`Churn-percentage (${mk})`, fmtPct(churn),
      `${gestoptInMaand(mk)} verloren / ${actiefBijStartVanMaand(mk)} actief bij start maand`),
    kerncijferHtml('Geschatte CLV', fmtEuro(clv.waarde),
      clv.basis === 'echt' ? 'gebaseerd op echte gestopte-cliëntdata' : 'gebaseerd op aangenomen retentie — nog geen churn-data', true),
  ].join('');
}

// Aantal kolommen in de cliënt-tabel (zie de <thead> in business.html) —
// gebruikt als colspan voor de uitklapbare aanpassing-geschiedenis-rij.
const CLIENT_TABEL_KOLOMMEN = 11;

function aanpassingCelHtml(c) {
  const cap = AANPASSING_CAPS[c.tier];
  const gebruikt = aanpassingenDezeMaand(c);
  const heeftCap = cap !== undefined && cap !== Infinity;
  const bovenCap = heeftCap && gebruikt >= cap;
  const label = cap === Infinity ? `${gebruikt} (geen limiet)` : `${gebruikt} / ${cap ?? 0}`;
  const uitgeklapt = uitgeklapteClienten.has(c.id);
  return `
    <div class="rij-acties">
      <span class="tag ${bovenCap ? 'tag--boven-limiet' : ''}">${label}</span>
      <button class="btn btn--ghost btn--small" data-actie="toggle-aanpassingen" data-id="${c.id}">${uitgeklapt ? 'Verberg' : 'Geschiedenis'}</button>
      <button class="btn btn--ghost btn--small" data-actie="log-aanpassing" data-id="${c.id}">Log aanpassing</button>
    </div>
  `;
}

function onboardingCelHtml(c) {
  const waarschuwing = onboardingWaarschuwing(c);
  return `
    <div class="onboarding-cel ${waarschuwing ? 'onboarding-cel--waarschuwing' : ''}">
      <label class="checkbox-label" title="App-toegang verleend"><input type="checkbox" data-actie="toggle-app-toegang" data-id="${c.id}" ${c.appAccessGranted ? 'checked' : ''}> App</label>
      <label class="checkbox-label" title="Ebook verstuurd"><input type="checkbox" data-actie="toggle-ebook" data-id="${c.id}" ${c.ebookSent ? 'checked' : ''}> Ebook</label>
    </div>
  `;
}

function aanpassingGeschiedenisRijHtml(c) {
  const aanpassingen = (c.aanpassingen || []).slice().sort((a, b) => new Date(b.datum) - new Date(a.datum));
  const inhoud = aanpassingen.length === 0
    ? '<span class="hint">Nog geen aanpassingen gelogd.</span>'
    : `<ul class="aanpassing-lijst">${aanpassingen.map((a) => `<li>${a.datum}${a.notitie ? ' — ' + escapeHtml(a.notitie) : ''}</li>`).join('')}</ul>`;
  return `<tr class="aanpassing-geschiedenis-rij"><td colspan="${CLIENT_TABEL_KOLOMMEN}">${inhoud}</td></tr>`;
}

function renderClients() {
  const tbody = document.getElementById('client-tabel-body');
  const leeg = document.getElementById('client-leeg');
  tbody.innerHTML = '';
  if (state.clients.length === 0) { leeg.hidden = false; return; }
  leeg.hidden = true;
  state.clients
    .slice()
    .sort((a, b) => new Date(b.start) - new Date(a.start))
    .forEach((c) => {
      const tr = document.createElement('tr');
      if (c.churnDatum) tr.classList.add('rij-gestopt');
      const facturatieCel = c.billing === 'kwartaal' && c.totaalBetaald
        ? `${facturatieLabel(c.billing)} <span class="hint">(${fmtEuro(c.totaalBetaald)} totaal)</span>`
        : facturatieLabel(c.billing);
      tr.innerHTML = `
        <td>${escapeHtml(c.naam)}</td>
        <td><span class="tag ${tierTagClass(c.tier)}">${escapeHtml(c.tier || 'Basis')}</span></td>
        <td>${facturatieCel}</td>
        <td>${escapeHtml(c.bron)}</td>
        <td>${fmtEuro(c.waarde)}</td>
        <td>${c.start}</td>
        <td>${c.churnDatum ? `<span class="tag tag--gestopt">Gestopt ${c.churnDatum}</span>` : '<span class="tag tag--actief">Actief</span>'}</td>
        <td>${c.doorverwezenDoor ? escapeHtml(c.doorverwezenDoor) : '—'}</td>
        <td>${aanpassingCelHtml(c)}</td>
        <td>${onboardingCelHtml(c)}</td>
        <td class="rij-acties">
          ${c.churnDatum
            ? `<button class="btn btn--ghost btn--small" data-actie="heractiveer" data-id="${c.id}">Heractiveer</button>`
            : `<button class="btn btn--ghost btn--small" data-actie="stop" data-id="${c.id}">Markeer gestopt</button>`}
          <button class="btn btn--danger btn--small" data-actie="verwijder" data-id="${c.id}">Verwijder</button>
        </td>
      `;
      tbody.appendChild(tr);
      if (uitgeklapteClienten.has(c.id)) {
        tbody.insertAdjacentHTML('beforeend', aanpassingGeschiedenisRijHtml(c));
      }
    });
}

function renderSpend() {
  const tbody = document.getElementById('spend-tabel-body');
  const leeg = document.getElementById('spend-leeg');
  tbody.innerHTML = '';
  if (state.spend.length === 0) { leeg.hidden = false; return; }
  leeg.hidden = true;
  state.spend
    .slice()
    .sort((a, b) => b.maand.localeCompare(a.maand))
    .forEach((s) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td>${s.maand}</td>
        <td>${fmtEuro(s.bedrag)}</td>
        <td><button class="btn btn--danger btn--small" data-actie="verwijder-uitgave" data-id="${s.id}">Verwijder</button></td>
      `;
      tbody.appendChild(tr);
    });
}

function renderRanglijst() {
  const ranglijst = doorverwijsRanglijst();
  const container = document.getElementById('ranglijst');
  const leeg = document.getElementById('ranglijst-leeg');
  container.innerHTML = '';
  if (ranglijst.length === 0) { leeg.hidden = false; return; }
  leeg.hidden = true;
  ranglijst.forEach(([naam, aantal]) => {
    const div = document.createElement('div');
    div.className = 'ranglijst-item';
    div.innerHTML = `<span>${escapeHtml(naam)}</span><span>${aantal} doorverwijzing${aantal > 1 ? 'en' : ''}</span>`;
    container.appendChild(div);
  });
}

function renderFunnel() {
  const tbody = document.getElementById('funnel-tabel-body');
  tbody.innerHTML = funnelPerTier().map((r) => `
    <tr>
      <td><span class="tag ${tierTagClass(r.tier)}">${r.tier}</span></td>
      <td>${r.aantalLeads}</td>
      <td>${r.aantalGeconverteerd}</td>
      <td>${r.conversieRatio === null ? '—' : fmtPct(r.conversieRatio)}</td>
      <td>${r.aantalActief}</td>
      <td>${fmtEuro(r.mrr)}</td>
    </tr>
  `).join('');
}

function renderLeads() {
  const tbody = document.getElementById('leads-tabel-body');
  const leeg = document.getElementById('leads-leeg');
  tbody.innerHTML = '';
  if (state.leads.length === 0) { leeg.hidden = false; return; }
  leeg.hidden = true;
  state.leads
    .slice()
    .sort((a, b) => new Date(b.datum) - new Date(a.datum))
    .forEach((lead) => {
      const tr = document.createElement('tr');
      const statusTag = lead.status === 'geconverteerd'
        ? '<span class="tag tag--lead-geconverteerd">Geconverteerd</span>'
        : lead.status === 'afgewezen'
          ? '<span class="tag tag--lead-afgewezen">Afgewezen</span>'
          : '<span class="tag tag--lead-in-behandeling">In behandeling</span>';
      tr.innerHTML = `
        <td><span class="tag ${tierTagClass(lead.tier)}">${escapeHtml(lead.tier)}</span></td>
        <td>${facturatieLabel(lead.billing)}</td>
        <td>${lead.datum}</td>
        <td>${statusTag}</td>
        <td class="rij-acties">
          ${lead.status === 'in_behandeling'
            ? `<button class="btn btn--ghost btn--small" data-actie="converteer-lead" data-id="${lead.id}">Converteer naar cliënt</button>
               <button class="btn btn--danger btn--small" data-actie="wijs-lead-af" data-id="${lead.id}">Afwijzen</button>`
            : ''}
        </td>
      `;
      tbody.appendChild(tr);
    });
}

function renderAlles() {
  renderMetrics();
  renderFunnel();
  renderLeads();
  renderClients();
  renderSpend();
  renderRanglijst();
  document.getElementById('i-retentie').value = state.assumedRetentionMonths;
}

// ---------- Event wiring ----------

// Bij "per 3 maanden" vult de coach het totaal vooruitbetaalde bedrag in
// (bv. €700), maar MRR/CLV/funnel-cijfers verwachten overal een
// maand-equivalent — dat wordt hier omgerekend en apart bewaard als
// `totaalBetaald` zodat de rauwe factuur nog zichtbaar blijft in de tabel.
function updateWaardeVeldVoorFacturatie() {
  const facturatie = document.getElementById('c-facturatie').value;
  const label = document.getElementById('c-waarde-label');
  const hint = document.getElementById('c-waarde-hint');
  if (facturatie === 'kwartaal') {
    label.textContent = 'Totaal betaald voor 3 maanden (€)';
    hint.textContent = 'Wordt intern als maand-equivalent bewaard, zodat MRR/CLV vergelijkbaar blijven tussen tiers.';
  } else {
    label.textContent = 'Waarde per maand (€)';
    hint.textContent = '';
  }
}

function wireEvents() {
  monthSelect.value = huidigeMaandSleutel();

  document.getElementById('c-facturatie').addEventListener('change', updateWaardeVeldVoorFacturatie);
  updateWaardeVeldVoorFacturatie();

  document.getElementById('client-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const facturatie = document.getElementById('c-facturatie').value;
    const ruweWaarde = num(document.getElementById('c-waarde').value, 0);
    const maandEquivalent = facturatie === 'kwartaal' ? ruweWaarde / 3 : ruweWaarde;
    state.clients.push({
      id: uid(),
      naam: document.getElementById('c-naam').value.trim(),
      tier: document.getElementById('c-tier').value,
      billing: facturatie,
      totaalBetaald: facturatie === 'kwartaal' ? ruweWaarde : null,
      bron: document.getElementById('c-bron').value,
      waarde: maandEquivalent,
      start: document.getElementById('c-start').value,
      churnDatum: null,
      doorverwezenDoor: document.getElementById('c-doorverwezen').value.trim() || null,
      aanpassingen: [],
      appAccessGranted: false,
      ebookSent: false,
    });
    if (inBehandelingLeadId) {
      const lead = state.leads.find((l) => l.id === inBehandelingLeadId);
      if (lead) lead.status = 'geconverteerd';
      inBehandelingLeadId = null;
    }
    bewaarState();
    e.target.reset();
    updateWaardeVeldVoorFacturatie();
    renderAlles();
  });

  document.getElementById('spend-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.spend.push({
      id: uid(),
      maand: document.getElementById('s-maand').value,
      bedrag: num(document.getElementById('s-bedrag').value, 0),
    });
    bewaarState();
    e.target.reset();
    renderAlles();
  });

  document.getElementById('instellingen-form').addEventListener('submit', (e) => {
    e.preventDefault();
    state.assumedRetentionMonths = num(document.getElementById('i-retentie').value, 6);
    bewaarState();
    renderAlles();
  });

  document.getElementById('client-tabel-body').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const actie = btn.dataset.actie;
    if (actie === 'stop') {
      const churnDatum = prompt('Stopdatum (JJJJ-MM-DD)?', new Date().toISOString().slice(0, 10));
      if (churnDatum) {
        const c = state.clients.find((c) => c.id === id);
        if (c) { c.churnDatum = churnDatum; bewaarState(); renderAlles(); }
      }
    } else if (actie === 'heractiveer') {
      const c = state.clients.find((c) => c.id === id);
      if (c) { c.churnDatum = null; bewaarState(); renderAlles(); }
    } else if (actie === 'verwijder') {
      if (confirm('Deze cliënt permanent verwijderen?')) {
        state.clients = state.clients.filter((c) => c.id !== id);
        bewaarState(); renderAlles();
      }
    } else if (actie === 'log-aanpassing') {
      const c = state.clients.find((c) => c.id === id);
      if (!c) return;
      // Optionele notitie via prompt() — zelfde patroon als de stopdatum
      // hierboven bij "Markeer gestopt", geen apart modal-systeem nodig.
      const notitie = prompt('Notitie voor deze aanpassing (optioneel)?', '');
      if (notitie === null) return; // geannuleerd
      if (!c.aanpassingen) c.aanpassingen = [];
      c.aanpassingen.push({ id: uid(), datum: new Date().toISOString().slice(0, 10), notitie: notitie.trim() || null });
      bewaarState();
      renderAlles();
    } else if (actie === 'toggle-aanpassingen') {
      if (uitgeklapteClienten.has(id)) uitgeklapteClienten.delete(id); else uitgeklapteClienten.add(id);
      renderClients();
    }
  });

  document.getElementById('client-tabel-body').addEventListener('change', (e) => {
    const input = e.target.closest('input[type="checkbox"][data-actie]');
    if (!input) return;
    const c = state.clients.find((c) => c.id === input.dataset.id);
    if (!c) return;
    if (input.dataset.actie === 'toggle-app-toegang') c.appAccessGranted = input.checked;
    else if (input.dataset.actie === 'toggle-ebook') c.ebookSent = input.checked;
    else return;
    bewaarState();
    renderAlles();
  });

  document.getElementById('spend-tabel-body').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.dataset.actie === 'verwijder-uitgave') {
      state.spend = state.spend.filter((s) => s.id !== btn.dataset.id);
      bewaarState(); renderAlles();
    }
  });

  document.getElementById('leads-tabel-body').addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    const id = btn.dataset.id;
    const actie = btn.dataset.actie;
    if (actie === 'converteer-lead') {
      const lead = state.leads.find((l) => l.id === id);
      if (!lead) return;
      // Zet het "Cliënt toevoegen"-formulier klaar met de juiste tier alvast
      // ingevuld; de lead wordt pas als "geconverteerd" gemarkeerd zodra de
      // coach het formulier daadwerkelijk verstuurt (zie client-form hierboven).
      inBehandelingLeadId = id;
      document.getElementById('c-tier').value = lead.tier;
      document.getElementById('c-facturatie').value = lead.billing === 'kwartaal' ? 'kwartaal' : 'maandelijks';
      updateWaardeVeldVoorFacturatie();
      document.getElementById('c-naam').focus();
      document.getElementById('client-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (actie === 'wijs-lead-af') {
      const lead = state.leads.find((l) => l.id === id);
      if (lead) { lead.status = 'afgewezen'; bewaarState(); renderAlles(); }
    }
  });

  monthSelect.addEventListener('change', renderMetrics);

  document.getElementById('btn-export').addEventListener('click', () => {
    downloadJson(`business-tracker-backup-${huidigeMaandSleutel()}.json`, state);
  });

  document.getElementById('import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const geimporteerd = JSON.parse(reader.result);
        if (confirm('Dit vervangt alle huidige data met de geïmporteerde back-up. Doorgaan?')) {
          state = {
            clients: normaliseerClienten(geimporteerd.clients),
            spend: geimporteerd.spend || [],
            leads: geimporteerd.leads || [],
            assumedRetentionMonths: geimporteerd.assumedRetentionMonths || 6,
          };
          bewaarState();
          renderAlles();
        }
      } catch {
        alert('Kon dit bestand niet lezen — controleer of het een back-up is die uit deze tool geëxporteerd is.');
      }
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  document.getElementById('btn-vergrendel').addEventListener('click', lockNow);
}

document.addEventListener('DOMContentLoaded', () => {
  initCoachGate(() => {
    wireEvents();
    renderAlles();
  });
});
