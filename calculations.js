// Pure calculation functions for the PT client-intake app.
// No DOM access, no side effects — input in, output out.
// Reused as-is by app.js today; intended to be portable to a backend or the
// companion fitness app later without rewriting.

export const STANDAARD_PAL = {
  sedentair: 1.2,
  'licht actief': 1.375,
  actief: 1.55,
};

export const STANDAARD_TEF = 1.1;

export const STANDAARD_ENERGIEBALANS_FACTOR = {
  vetverlies: 0.8,
  onderhoud: 1.0,
  spieropbouw: 1.1,
  krachttoename: 1.05,
};

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

export function frameSizeCheck(enkelomtrek) {
  const afwijking = enkelomtrek - 21.9;
  return {
    enkelomtrek,
    afwijking: round(afwijking, 2),
    binnenNorm: Math.abs(afwijking) <= 1.3,
  };
}

// Splits macro totals over `aantalMaaltijden` meals. Meals in the second
// half of the day (post-training) get double the protein weight of meals
// in the first half — e.g. at 4 meals: 1-1-2-2. Fat and carbs are spread
// evenly across all meals.
export function verdeelMaaltijden(totalen, aantalMaaltijden) {
  const n = Math.max(2, Math.min(6, aantalMaaltijden));
  const preCount = Math.floor(n / 2);
  const postCount = n - preCount;
  const gewichten = [...Array(preCount).fill(1), ...Array(postCount).fill(2)];
  const totaalGewicht = gewichten.reduce((a, b) => a + b, 0);

  return gewichten.map((gewicht, i) => {
    const eiwit = (totalen.eiwit * gewicht) / totaalGewicht;
    const vet = totalen.vet / n;
    const koolhydraten = totalen.koolhydraten / n;
    const kcal = eiwit * 4 + vet * 9 + koolhydraten * 4;
    return {
      maaltijd: i + 1,
      postTraining: gewicht === 2,
      eiwit: round(eiwit),
      vet: round(vet),
      koolhydraten: round(koolhydraten),
      kcal: round(kcal, 0),
    };
  });
}

export function palVoorActiviteitsniveau(activityLevel) {
  return STANDAARD_PAL[activityLevel] ?? STANDAARD_PAL.sedentair;
}

export function energiebalansFactorVoorDoel(doelCategorie) {
  return STANDAARD_ENERGIEBALANS_FACTOR[doelCategorie] ?? 1.0;
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

  if (calculations.beoogdeInnameRustdag < calculations.onderhoudPerDag * 0.75) {
    vlaggen.push({
      niveau: 'rood',
      bericht: 'Beoogde inname op rustdagen ligt meer dan 25% onder onderhoud — mogelijk te agressief tekort.',
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

  if (intake.lifestyle?.slaap?.uren != null && intake.lifestyle.slaap.uren < 6) {
    vlaggen.push({
      niveau: 'oranje',
      bericht: 'Minder dan 6 uur slaap gerapporteerd — kan herstel en trainingsvoortgang limiteren.',
    });
  }

  if (intake.lifestyle?.stressLevel === 'hoog') {
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
  const pal = instellingen.pal ?? palVoorActiviteitsniveau(intake.lifestyle?.activityLevel);
  const tef = instellingen.tef ?? STANDAARD_TEF;
  const energiebalansFactor = instellingen.energiebalansFactor ?? energiebalansFactorVoorDoel(intake.doel?.categorie);
  const eiwitFactor = instellingen.eiwitFactor ?? 1.8;
  const percentageVetVanREE = instellingen.percentageVetVanREE ?? 0.4;
  const aantalMaaltijden = instellingen.aantalMaaltijden ?? 4;

  const vvm = vetvrijeMassa(gewicht, vetpercentage);
  const bmr = katchMcArdleBMR(vvm);
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
    rustdag: verdeelMaaltijden({ eiwit, vet, koolhydraten: koolhydratenRustdag }, aantalMaaltijden),
    trainingsdag: verdeelMaaltijden({ eiwit, vet, koolhydraten: koolhydratenTrainingsdag }, aantalMaaltijden),
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
    ee: round(ee, 0),
    ree: round(ree, 0),
    totaalTrainingsdag: round(totaalTrainingsdag, 0),
    onderhoudPerDag: round(onderhoudPerDag, 0),
    beoogdeInnameRustdag: round(beoogdeRustdag, 0),
    beoogdeInnameTrainingsdag: round(beoogdeTrainingsdag, 0),
    macros,
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
      aantalMaaltijden,
    },
  };

  const splitsdagen = bepaalSplitsdagen(trainingsdagenPerWeek);
  const blessureConflicten = detecteerBlessureConflicten(intake.blessures);
  calculations.advies = { splitsdagen, blessureConflicten };
  calculations.rodeVlaggen = genereerRodeVlaggen(intake, calculations);

  return calculations;
}
