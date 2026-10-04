// Pure calculation functions for the PT client-intake app.
// No DOM access, no side effects — input in, output out.
// Reused as-is by app.js today; intended to be portable to a backend or the
// companion fitness app later without rewriting.

// Butters University (README, "Module: Energy balance") is the source for the
// energy constants below. PAL covers activity outside training only:
// resistance training is costed separately (energieverbruikTrainingsdag), so
// it is not counted twice. BU gives the sex-specific values as ranges
// (light 1.11–1.12, active 1.25–1.27, very active 1.45–1.48); the split per
// sex follows the IOM (2005) physical-activity coefficients those ranges
// come from. "anders" or an unknown sex uses the midpoint.
export const STANDAARD_PAL_PER_GESLACHT = {
  man: { sedentair: 1.0, 'licht actief': 1.11, actief: 1.25, 'erg actief': 1.48 },
  vrouw: { sedentair: 1.0, 'licht actief': 1.12, actief: 1.27, 'erg actief': 1.45 },
};

export const STANDAARD_PAL = {
  sedentair: 1.0,
  'licht actief': 1.115,
  actief: 1.26,
  'erg actief': 1.465,
};

export const STANDAARD_TEF = 1.1;

// Ranges from the course material (Modules 11/13) — these are deliberately
// wide, since the actual number within the range should follow from a
// conversation with the client (adherence history, preferences, how
// aggressive they want to be), not be picked automatically.
export const EIWIT_BEREIK_G_PER_KG = { min: 1.6, praktisch: 1.8, maxSlank: 2.4 };
export const VET_BEREIK_PERCENTAGE_REE = { min: 0.2, max: 0.4 };
// Fat default within 20–40% of REE (Butters University, "Module: Fats"):
// women at the high end (estrogen benefits, risks of low-fat diets for
// women). BU sets no point for men; the middle of the range is used.
export const VET_PERCENTAGE_REE_PER_GESLACHT = { man: 0.3, vrouw: 0.4, anders: 0.35 };

// BMR formula choice (Butters University, "Module: Energy balance"):
// Cunningham/Katch from fat-free mass for lean or trained clients, Tinsley
// (24.8 × BW + 10) for very lean, highly muscled clients. BU gives no
// cut-offs; "very lean" uses these body-fat levels and "highly muscled" means
// advanced training status (4+ years).
export const TINSLEY_MAX_VETPERCENTAGE = { man: 10, vrouw: 18, anders: 14 };
// BU: Cunningham is a poor default for untrained clients with higher body
// fat (it underestimated RMR by ~17% in a general clinic population). BU names
// no better formula, so these clients get a flag to correct the estimate
// against two or more weeks of weigh-ins. The body-fat levels are chosen so
// BU's example (untrained woman, 30% body fat) is flagged; men sit 8 points
// lower, the same offset as the deficit anchors.
export const CUNNINGHAM_ONBETROUWBAAR_VANAF_VETPERCENTAGE = { man: 22, vrouw: 30, anders: 26 };

// Sleep below this many hours raises a flag (BU, "Module: Ad libitum
// dieting": 4–7 h vs. 8 h of sleep raises appetite by 20–22%).
export const SLAAP_MINIMUM_UREN = 7;

// Surplus by training status (BU: beginners 5–15%, intermediate 2–7%,
// advanced 1–3%, the smallest surplus that keeps fat gain near zero). The
// default is the middle of each range. Training status comes from years of
// training experience (trainingsstatusUitErvaring).
export const SURPLUS_PER_TRAININGSSTATUS = {
  1: { min: 1.05, standaard: 1.10, max: 1.15 },
  2: { min: 1.02, standaard: 1.045, max: 1.07 },
  3: { min: 1.01, standaard: 1.02, max: 1.03 },
};
export const TRAININGSSTATUS_DREMPELS_JAREN = [1, 4]; // <1 jaar: 1, 1–4 jaar: 2, 4+ jaar: 3

// Deficit by leanness (BU: 2.5–7.5% near contest leanness, up to 30–50% at
// higher body fat). BU gives the two ends; between them the deficit scales
// linearly with body fat. The body-fat anchors per sex are a judgement call,
// chosen so BU's worked example (untrained woman, 30% body fat) lands on its
// ~20% deficit. The default at high body fat is the low end of 30–50%.
export const TEKORT_VETPERCENTAGE_ANKERS = {
  man: { wedstrijd: 6, hoog: 32 },
  vrouw: { wedstrijd: 14, hoog: 40 },
  anders: { wedstrijd: 10, hoog: 36 },
};
export const TEKORT_BIJ_WEDSTRIJDVORM = { min: 0.025, standaard: 0.05, max: 0.075 };
export const TEKORT_BIJ_HOOG_VETPERCENTAGE = { min: 0.30, standaard: 0.30, max: 0.50 };

// Maintenance: BU gives no band; ±3% is a judgement call.
export const ONDERHOUD_BEREIK = { min: 0.97, standaard: 1.0, max: 1.03 };

export const POST_TRAINING_BOOST_STANDAARD = 1.5; // Module 11: "50% meer" normaal
export const POST_TRAINING_BOOST_ENKELE_MAALTIJD = 2.0; // Module 11: "100% meer" bij 1 maaltijd na training

const STANDAARD_OEFENINGEN_GEVOELIGHEID = {
  knie: ['squat', 'front squat', 'lunges', 'leg press', 'leg extension', 'bulgarian split squat'],
  'onderrug': ['deadlift', 'good morning', 'bent-over row', 'romanian deadlift'],
  rug: ['deadlift', 'good morning', 'bent-over row', 'romanian deadlift'],
  schouder: ['overhead press', 'bench press', 'upright row', 'lateral raise'],
  pols: ['bench press', 'overhead press', 'front squat'],
  elleboog: ['bicep curl', 'triceps extension', 'bench press', 'overhead press'],
  enkel: ['squat', 'lunges', 'calf raise'],
  heup: ['squat', 'deadlift', 'lunges'],
  nek: ['overhead press', 'shrug'],
};

function round(value, decimals = 1) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function vetvrijeMassa(gewicht, vetpct) {
  return gewicht * (1 - vetpct / 100);
}

export function katchMcArdleBMR(vvm) {
  return 370 + 21.6 * vvm;
}

export function tinsleyRMR(gewicht) {
  return 24.8 * gewicht + 10;
}

export function energieverbruikTrainingsdag(gewicht, duurMinuten, MET = 5.7) {
  return (MET * 3.5 * gewicht / 200) * duurMinuten;
}

export function energieverbruikRustdag(bmr, pal, tef) {
  return bmr * pal * tef;
}

export function totaalEnergieTrainingsdag(ree, ee, tef) {
  return ree + ee * tef;
}

export function onderhoudsinnamePerDag(totaalTrainingsdag, ree, trainingsdagenPerWeek) {
  return (totaalTrainingsdag * trainingsdagenPerWeek + ree * (7 - trainingsdagenPerWeek)) / 7;
}

export function beoogdeInnameRustdag(onderhoudPerDag, energiebalansFactor) {
  return onderhoudPerDag * energiebalansFactor;
}

export function beoogdeInnameTrainingsdag(beoogdeInnameRustdagKcal, ee) {
  return beoogdeInnameRustdagKcal + ee;
}

export function eiwitGrammen(gewicht, factor = 1.8) {
  return factor * gewicht;
}

export function vetGrammen(ree, percentageVanREE = 0.4) {
  return (percentageVanREE * ree) / 9;
}

export function koolhydratenGrammen(beoogdeKcal, eiwitGrammenWaarde, vetGrammenWaarde) {
  return (beoogdeKcal - eiwitGrammenWaarde * 4 - vetGrammenWaarde * 9) / 4;
}

export function geschat1RM(gewicht, reps) {
  return (reps / 30 + 1) * gewicht;
}

export function repTargetGewicht(rm, gewenstPercentage1RM) {
  return rm * gewenstPercentage1RM;
}

export function werkcapaciteit(oudeSet, nieuweSet) {
  return ((nieuweSet - oudeSet) / oudeSet) * 100;
}

// ---------- Training Volume Calculator (Menno Henselmans model) ----------
// trainingsstatus: 1 (beginner) - 3 (gevorderd/elite). vrouw: 0/1.
// herstelfactor: 0.5-1.2. energiebalansfactor: vermenigvuldiger (bv. lager
// tijdens een dieetfase). trainingsfrequentie: keer/week dat de spiergroep
// wordt getraind — boven de 3x/week telt effectief nog maar 2.5x mee.
export function trainingsvolumeAdvies(trainingsstatus, vrouw, herstelfactor, energiebalansfactor, trainingsfrequentie) {
  const statusGeklemd = Math.max(1, Math.min(3, trainingsstatus));
  const herstelGeklemd = Math.max(0.5, Math.min(1.2, herstelfactor));
  const effectieveFrequentie = trainingsfrequentie < 3 ? trainingsfrequentie : 2.5;
  const optimaalVolume = (effectieveFrequentie * 5) * herstelGeklemd * energiebalansfactor
    * Math.sqrt(statusGeklemd) + (vrouw ? 3 : 0);
  return round(optimaalVolume, 1);
}

// ---------- 1RM Calculator — three subcalculators (Menno Henselmans) ------
// Each returns { epley1RM, tabel } where tabel is the full loading table
// across the standard percentage set, not just the 1RM itself.
export const RM_BELASTING_PERCENTAGES = [0.90, 0.85, 0.80, 0.75, 0.70, 0.65, 0.60, 0.50, 0.30];

// A) Free weights & machine exercises.
export function rm1VrijGewicht(gewicht, herhalingen) {
  const epley1RM = gewicht * (1 + herhalingen / 30);
  const tabel = RM_BELASTING_PERCENTAGES.map((percentage) => ({
    percentage,
    gewicht: round(percentage * epley1RM, 1),
  }));
  return { epley1RM: round(epley1RM, 1), tabel };
}

// B) Bodyweight exercises (chin-up, dip, ...) — the source spreadsheet's
// assumption is that 93.48% of bodyweight loads the exercise.
const BODYWEIGHT_FACTOR = 0.9348;
export function rm1Bodyweight(lichaamsgewicht, externGewicht, herhalingen) {
  const totaalGewicht = BODYWEIGHT_FACTOR * lichaamsgewicht + externGewicht;
  const epley1RM = totaalGewicht * (1 + herhalingen / 30);
  const tabel = RM_BELASTING_PERCENTAGES.map((percentage) => ({
    percentage,
    externGewicht: round(percentage * epley1RM - BODYWEIGHT_FACTOR * lichaamsgewicht, 1),
  }));
  return { epley1RM: round(epley1RM, 1), tabel };
}

// C) Push-ups — same shape as B, but only 75% of bodyweight loads the
// exercise (the feet take the rest of the weight).
const PUSHUP_FACTOR = 0.75;
export function rm1PushUp(lichaamsgewicht, externGewicht, herhalingen) {
  const totaalGewicht = PUSHUP_FACTOR * lichaamsgewicht + externGewicht;
  const epley1RM = totaalGewicht * (1 + herhalingen / 30);
  const tabel = RM_BELASTING_PERCENTAGES.map((percentage) => ({
    percentage,
    externGewicht: round(percentage * epley1RM - PUSHUP_FACTOR * lichaamsgewicht, 1),
  }));
  return { epley1RM: round(epley1RM, 1), tabel };
}

// ---------- Werkcapaciteit / rustinterval reference data ------------------
// Pure aggregation over data/werkcapaciteit-referentie.json — used for the
// optional per-client rest-interval suggestion (Task 4).
export function gemiddeldeVermoeidheidPerGroep(data, group) {
  const relevant = (data ?? []).filter((r) => r.group === group && r.fatigue_pct != null);
  if (!relevant.length) return null;
  const gemiddelde = relevant.reduce((sum, r) => sum + r.fatigue_pct, 0) / relevant.length;
  return { gemiddelde: round(gemiddelde, 1), n: relevant.length };
}

export function frameSizeCheck(enkelomtrek) {
  const afwijking = enkelomtrek - 21.9;
  return {
    enkelomtrek,
    afwijking: round(afwijking, 2),
    binnenNorm: Math.abs(afwijking) <= 1.3,
  };
}

// Splits macro totals over `aantalMaaltijden` meals. Meals in the second
// half of the day (post-training) get `postTrainingMultiplier`× the protein
// weight of meals in the first half. Module 11 gives 1.5x ("50% meer") as
// the normal case, and 2.0x ("100% meer") specifically when there's only
// one meal between training and bed — this is a coach choice, not fixed.
// Fat and carbs are spread evenly across all meals either way.
export function verdeelMaaltijden(totalen, aantalMaaltijden, postTrainingMultiplier = POST_TRAINING_BOOST_STANDAARD) {
  const n = Math.max(2, Math.min(6, aantalMaaltijden));
  const preCount = Math.floor(n / 2);
  const postCount = n - preCount;
  const gewichten = [...Array(preCount).fill(1), ...Array(postCount).fill(postTrainingMultiplier)];
  const totaalGewicht = gewichten.reduce((a, b) => a + b, 0);

  return gewichten.map((gewicht, i) => {
    const eiwit = (totalen.eiwit * gewicht) / totaalGewicht;
    const vet = totalen.vet / n;
    const koolhydraten = totalen.koolhydraten / n;
    const kcal = eiwit * 4 + vet * 9 + koolhydraten * 4;
    return {
      maaltijd: i + 1,
      postTraining: gewicht > 1,
      eiwit: round(eiwit),
      vet: round(vet),
      koolhydraten: round(koolhydraten),
      kcal: round(kcal, 0),
    };
  });
}

// Personalized protein range (grams) for this client's bodyweight — for
// display alongside the coach's chosen point value, not as an enforced limit.
export function eiwitBereik(gewicht) {
  return {
    min: round(EIWIT_BEREIK_G_PER_KG.min * gewicht),
    praktisch: round(EIWIT_BEREIK_G_PER_KG.praktisch * gewicht),
    maxSlank: round(EIWIT_BEREIK_G_PER_KG.maxSlank * gewicht),
  };
}

// Personalized fat range (grams) for this client's REE.
export function vetBereik(ree) {
  return {
    min: round((VET_BEREIK_PERCENTAGE_REE.min * ree) / 9),
    max: round((VET_BEREIK_PERCENTAGE_REE.max * ree) / 9),
  };
}

export function trainingsstatusUitErvaring(jaren) {
  const j = Number(jaren);
  if (jaren == null || jaren === '' || !Number.isFinite(j)) return 2;
  const i = TRAININGSSTATUS_DREMPELS_JAREN.findIndex((d) => j < d);
  return i === -1 ? 3 : i + 1;
}

function geslachtSleutel(geslacht) {
  return geslacht === 'man' || geslacht === 'vrouw' ? geslacht : 'anders';
}

// Deficit (fraction of maintenance) for this body fat and sex: { min, standaard, max }.
export function tekortBereik(vetpercentage, geslacht) {
  const { wedstrijd, hoog } = TEKORT_VETPERCENTAGE_ANKERS[geslachtSleutel(geslacht)];
  const t = Math.max(0, Math.min(1, (Number(vetpercentage) - wedstrijd) / (hoog - wedstrijd)));
  const tussen = (k) => round(TEKORT_BIJ_WEDSTRIJDVORM[k] + t * (TEKORT_BIJ_HOOG_VETPERCENTAGE[k] - TEKORT_BIJ_WEDSTRIJDVORM[k]), 3);
  return { min: tussen('min'), standaard: tussen('standaard'), max: tussen('max') };
}

// Energy-balance factor range for a goal and client: { min, standaard, max }
// as factors of maintenance. `persoon` = intake.persoonsgegevens
// ({ vetpercentage, geslacht, trainingservaring }).
export function energiebalansBereik(doelCategorie, persoon = {}) {
  if (doelCategorie === 'vetverlies') {
    const t = tekortBereik(persoon.vetpercentage, persoon.geslacht);
    return { min: round(1 - t.max, 3), standaard: round(1 - t.standaard, 3), max: round(1 - t.min, 3) };
  }
  if (doelCategorie === 'spieropbouw' || doelCategorie === 'krachttoename') {
    return { ...SURPLUS_PER_TRAININGSSTATUS[trainingsstatusUitErvaring(persoon.trainingservaring)] };
  }
  return { ...ONDERHOUD_BEREIK };
}

// Personalized calorie-target range for the given goal and client.
export function beoogdeInnameBereik(onderhoudPerDag, doelCategorie, persoon = {}) {
  const b = energiebalansBereik(doelCategorie, persoon);
  return { min: round(onderhoudPerDag * b.min, 0), max: round(onderhoudPerDag * b.max, 0) };
}

// 'tinsley' for very lean, advanced clients; otherwise 'katchMcArdle'.
export function bmrMethodeVoorClient(persoon = {}) {
  const g = geslachtSleutel(persoon.geslacht);
  const zeerSlank = Number(persoon.vetpercentage) <= TINSLEY_MAX_VETPERCENTAGE[g];
  return zeerSlank && trainingsstatusUitErvaring(persoon.trainingservaring) === 3 ? 'tinsley' : 'katchMcArdle';
}

export function cunninghamOnbetrouwbaar(persoon = {}) {
  const g = geslachtSleutel(persoon.geslacht);
  return trainingsstatusUitErvaring(persoon.trainingservaring) === 1
    && Number(persoon.vetpercentage) >= CUNNINGHAM_ONBETROUWBAAR_VANAF_VETPERCENTAGE[g];
}

export function vetPercentageVoorClient(persoon = {}) {
  return VET_PERCENTAGE_REE_PER_GESLACHT[geslachtSleutel(persoon.geslacht)];
}

export function palVoorActiviteitsniveau(activityLevel, geslacht) {
  const tabel = STANDAARD_PAL_PER_GESLACHT[geslacht] ?? STANDAARD_PAL;
  return tabel[activityLevel] ?? tabel.sedentair;
}

export function energiebalansFactorVoorDoel(doelCategorie, persoon = {}) {
  return energiebalansBereik(doelCategorie, persoon).standaard;
}

// Suggests a training split based on weekly training frequency.
export function bepaalSplitsdagen(trainingsdagenPerWeek) {
  const n = Math.max(1, Math.min(6, Math.round(trainingsdagenPerWeek)));
  const schemas = {
    1: { naam: 'Full Body', dagen: ['Full Body'] },
    2: { naam: 'Full Body (2x)', dagen: ['Full Body A', 'Full Body B'] },
    3: { naam: 'Full Body (3x)', dagen: ['Full Body A', 'Full Body B', 'Full Body C'] },
    4: { naam: 'Upper / Lower', dagen: ['Upper A', 'Lower A', 'Upper B', 'Lower B'] },
    5: { naam: 'Push / Pull / Legs / Upper / Lower', dagen: ['Push', 'Pull', 'Legs', 'Upper', 'Lower'] },
    6: { naam: 'Push / Pull / Legs (2x)', dagen: ['Push A', 'Pull A', 'Legs A', 'Push B', 'Pull B', 'Legs B'] },
  };
  return schemas[n];
}

// Flags standard exercises that conflict with reported injuries/avoid-list.
export function detecteerBlessureConflicten(blessures) {
  const conflicten = [];
  const vermijden = new Set((blessures?.vermijdenOefeningen ?? []).map((o) => o.toLowerCase().trim()));
  const tekst = (blessures?.tekst ?? '').toLowerCase();

  for (const oefening of vermijden) {
    if (oefening) conflicten.push({ oefening, reden: 'Staat op de expliciete vermijdenlijst van de cliënt' });
  }

  for (const [klacht, oefeningen] of Object.entries(STANDAARD_OEFENINGEN_GEVOELIGHEID)) {
    if (tekst.includes(klacht)) {
      for (const oefening of oefeningen) {
        if (!conflicten.some((c) => c.oefening === oefening)) {
          conflicten.push({ oefening, reden: `Mogelijk risicovol bij gemelde klacht: "${klacht}"` });
        }
      }
    }
  }

  return conflicten;
}

// Generates coach-facing warnings from intake + computed values.
export function genereerRodeVlaggen(intake, calculations) {
  const vlaggen = [];

  const p = intake.persoonsgegevens ?? {};
  const maxTekort = tekortBereik(p.vetpercentage, p.geslacht).max;
  const tekort = 1 - calculations.beoogdeInnameRustdag / calculations.onderhoudPerDag;
  if (tekort > maxTekort) {
    vlaggen.push({
      niveau: 'rood',
      bericht: `Tekort van ${Math.round(tekort * 100)}% is groter dan het maximum van ${Math.round(maxTekort * 100)}% bij dit vetpercentage — mogelijk te agressief.`,
    });
  }

  if (calculations.beoogdeInnameRustdag < calculations.bmr) {
    vlaggen.push({
      niveau: 'rood',
      bericht: 'Beoogde inname ligt onder het BMR — risico op metabole vertraging en verlies van spiermassa.',
    });
  }

  const conflicten = detecteerBlessureConflicten(intake.blessures);
  for (const c of conflicten) {
    vlaggen.push({ niveau: 'oranje', bericht: `Let op bij "${c.oefening}": ${c.reden}.` });
  }

  if (intake.lifestyle?.slaap?.uren != null && intake.lifestyle.slaap.uren < SLAAP_MINIMUM_UREN) {
    vlaggen.push({
      niveau: 'oranje',
      bericht: `Minder dan ${SLAAP_MINIMUM_UREN} uur slaap gerapporteerd — kan eetlust, herstel en trainingsvoortgang beïnvloeden.`,
    });
  }

  if (calculations.bmrMethode === 'katchMcArdle' && cunninghamOnbetrouwbaar(p)) {
    vlaggen.push({
      niveau: 'oranje',
      bericht: 'BMR via Katch-McArdle is onbetrouwbaar bij een ongetrainde cliënt met een hoger vetpercentage (vaak ~15% te laag) — corrigeer de calorieën na 2+ weken weegdata.',
    });
  }

  // 'hoog' is the pre-Task-1 value (kept so older stored intakes still flag
  // correctly); 'veel_stress' is the current 4-level scale's top option.
  if (intake.lifestyle?.stressLevel === 'hoog' || intake.lifestyle?.stressLevel === 'veel_stress') {
    vlaggen.push({
      niveau: 'oranje',
      bericht: 'Hoog stressniveau gerapporteerd — houd rekening met verminderd herstelvermogen.',
    });
  }

  if (intake.peds?.gebruikt) {
    vlaggen.push({
      niveau: 'info',
      bericht: 'Cliënt geeft PED-gebruik aan — houd hier rekening mee bij inschatting van herstel en trainingsvolume.',
    });
  }

  if (intake.persoonsgegevens?.vetpercentage != null && !intake.vetpercentageMeting?.huidplooimeter) {
    vlaggen.push({
      niveau: 'info',
      bericht: 'Vetpercentage is niet met een huidplooimeter gemeten — beschouw als schatting bij het volgen van voortgang.',
    });
  }

  return vlaggen;
}

// Orchestrator: composes every calculation above into the `calculations`
// object described in README.md. `instellingen` overrides all defaults.
export function berekenClient(intake, instellingen = {}) {
  const { gewicht, vetpercentage } = intake.persoonsgegevens;

  const trainingsdagenPerWeek = instellingen.trainingsdagenPerWeek ?? intake.trainingsfrequentie?.huidig ?? 3;
  const trainingsduurMinuten = instellingen.trainingsduurMinuten ?? 60;
  const MET = instellingen.MET ?? 5.7;
  const pal = instellingen.pal ?? palVoorActiviteitsniveau(intake.lifestyle?.activityLevel, intake.persoonsgegevens.geslacht);
  const tef = instellingen.tef ?? STANDAARD_TEF;
  const energiebalansFactor = instellingen.energiebalansFactor ?? energiebalansFactorVoorDoel(intake.doel?.categorie, intake.persoonsgegevens);
  const eiwitFactor = instellingen.eiwitFactor ?? 1.8;
  const percentageVetVanREE = instellingen.percentageVetVanREE ?? vetPercentageVoorClient(intake.persoonsgegevens);
  const bmrMethode = instellingen.bmrMethode ?? bmrMethodeVoorClient(intake.persoonsgegevens);
  const aantalMaaltijden = instellingen.aantalMaaltijden ?? 4;
  const postTrainingBoost = instellingen.postTrainingBoost ?? POST_TRAINING_BOOST_STANDAARD;

  const vvm = vetvrijeMassa(gewicht, vetpercentage);
  const bmr = bmrMethode === 'tinsley' ? tinsleyRMR(gewicht) : katchMcArdleBMR(vvm);
  const ee = energieverbruikTrainingsdag(gewicht, trainingsduurMinuten, MET);
  const ree = energieverbruikRustdag(bmr, pal, tef);
  const totaalTrainingsdag = totaalEnergieTrainingsdag(ree, ee, tef);
  const onderhoudPerDag = onderhoudsinnamePerDag(totaalTrainingsdag, ree, trainingsdagenPerWeek);
  const beoogdeRustdag = beoogdeInnameRustdag(onderhoudPerDag, energiebalansFactor);
  const beoogdeTrainingsdag = beoogdeInnameTrainingsdag(beoogdeRustdag, ee);

  const eiwit = eiwitGrammen(gewicht, eiwitFactor);
  const vet = vetGrammen(ree, percentageVetVanREE);
  const koolhydratenRustdag = koolhydratenGrammen(beoogdeRustdag, eiwit, vet);
  const koolhydratenTrainingsdag = koolhydratenGrammen(beoogdeTrainingsdag, eiwit, vet);

  const macros = {
    eiwit: round(eiwit),
    vet: round(vet),
    koolhydratenRustdag: round(koolhydratenRustdag),
    koolhydratenTrainingsdag: round(koolhydratenTrainingsdag),
  };

  const maaltijdVerdeling = {
    rustdag: verdeelMaaltijden({ eiwit, vet, koolhydraten: koolhydratenRustdag }, aantalMaaltijden, postTrainingBoost),
    trainingsdag: verdeelMaaltijden({ eiwit, vet, koolhydraten: koolhydratenTrainingsdag }, aantalMaaltijden, postTrainingBoost),
  };

  const rm = (intake.huidigeKracht ?? [])
    .filter((r) => r.oefening && r.kg > 0 && r.herhalingen > 0)
    .map((r) => ({
      oefening: r.oefening,
      kg: r.kg,
      herhalingen: r.herhalingen,
      sets: r.sets,
      geschat1RM: round(geschat1RM(r.kg, r.herhalingen)),
    }));

  const frameSize = frameSizeCheck(intake.genen?.enkelomtrek ?? 0);

  const calculations = {
    vetvrijeMassa: round(vvm),
    bmr: round(bmr, 0),
    bmrMethode,
    ee: round(ee, 0),
    ree: round(ree, 0),
    totaalTrainingsdag: round(totaalTrainingsdag, 0),
    onderhoudPerDag: round(onderhoudPerDag, 0),
    beoogdeInnameRustdag: round(beoogdeRustdag, 0),
    beoogdeInnameTrainingsdag: round(beoogdeTrainingsdag, 0),
    macros,
    bereiken: {
      eiwit: eiwitBereik(gewicht),
      vet: vetBereik(ree),
      beoogdeInname: beoogdeInnameBereik(onderhoudPerDag, intake.doel?.categorie, intake.persoonsgegevens),
      energiebalansFactor: energiebalansBereik(intake.doel?.categorie, intake.persoonsgegevens),
    },
    maaltijdVerdeling,
    frameSize,
    rm,
    instellingenGebruikt: {
      trainingsdagenPerWeek,
      trainingsduurMinuten,
      MET,
      pal,
      tef,
      energiebalansFactor,
      eiwitFactor,
      percentageVetVanREE,
      bmrMethode,
      aantalMaaltijden,
      postTrainingBoost,
    },
  };

  const splitsdagen = bepaalSplitsdagen(trainingsdagenPerWeek);
  const blessureConflicten = detecteerBlessureConflicten(intake.blessures);
  calculations.advies = { splitsdagen, blessureConflicten };
  calculations.rodeVlaggen = genereerRodeVlaggen(intake, calculations);

  return calculations;
}
