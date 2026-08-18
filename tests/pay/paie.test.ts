import { beforeEach, describe, expect, it } from 'vitest'
import {
  cents,
  heuresSup,
  minutes,
  qualifierJournee,
  synthetiserPeriode,
  tempsRemunere,
  validerTranches,
  ventiler,
  type Absence,
  type JourneeQualifiee,
  type PayPeriod,
  type Settings,
  type TrancheHS,
  type WorkDay,
} from '../../src/engine'
import {
  aWorkDay,
  desSettings,
  PARIS,
  reinitialiserCompteur,
  type JourBrut,
} from '../fixtures/builders'

const LUNDI = '2027-03-15'

/** Tranches usuelles : 25 % jusqu'à 8 h, 50 % au-delà. Aucune n'est un défaut du moteur. */
const TRANCHES: readonly TrancheHS[] = [
  { deMinutes: minutes(0), aMinutes: minutes(480), majorationPct: 25 },
  { deMinutes: minutes(480), aMinutes: null, majorationPct: 50 },
]

function journeeDe(brut: JourBrut): JourneeQualifiee {
  return qualifierJournee(aWorkDay(brut), PARIS)
}

/** `jours` journées consécutives de `minutesParJour` de conduite, dès 06:00. */
function serie(date: string, jours: number, minutesParJour: number): JourneeQualifiee[] {
  const debutMinutes = 6 * 60
  const finMinutes = debutMinutes + minutesParJour
  const fin = `${String(Math.trunc(finMinutes / 60)).padStart(2, '0')}:${String(finMinutes % 60).padStart(2, '0')}`

  const construites: JourneeQualifiee[] = []
  for (let i = 0; i < jours; i += 1) {
    const [annee, mois, jour] = date.split('-').map(Number) as [number, number, number]
    const d = new Date(Date.UTC(annee, mois - 1, jour + i))
    const iso = `${String(d.getUTCFullYear())}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`
    construites.push(
      journeeDe({
        date: iso,
        prise: '06:00',
        fin,
        segments: [{ type: 'conduite', de: '06:00', a: fin }],
      }),
    )
  }
  return construites
}

const H = (heures: number): number => heures * 60

function periode(debut: string, fin: string, label = 'Période de test'): PayPeriod {
  return { id: `${debut}_${fin}`, label, debut, fin }
}

beforeEach(reinitialiserCompteur)

describe('PAI — temps rémunéré', () => {
  it('PAI-01 — journée de conduite pleine : conduite + autre travail', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '13:00' },
        { type: 'autre_travail', de: '13:00', a: '14:00' },
      ],
    })

    const r = tempsRemunere(journee, desSettings())

    expect(r.status).toBe('complete')
    expect(r.value).toBe(8 * 60)
    expect(r.steps.map((s) => s.label)).toEqual(['Conduite', 'Autre travail'])
  })

  it('PAI-02 — disponibilité à 50 % : la fraction et sa source apparaissent', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '12:00' },
        { type: 'disponibilite', de: '12:00', a: '14:00' },
      ],
    })

    const r = tempsRemunere(journee, desSettings({ fractionDisponibiliteRemuneree: 0.5 }))

    expect(r.value).toBe(7 * 60)
    expect(r.sources).toHaveLength(1)
    expect(r.steps.some((s) => s.label === 'Disponibilité retenue')).toBe(true)
  })

  it('PAI-03 — fraction absente avec de la disponibilité : unknown, ni 0 ni 100 %', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '12:00' },
        { type: 'disponibilite', de: '12:00', a: '14:00' },
      ],
    })

    const r = tempsRemunere(journee, desSettings())

    expect(r.status).toBe('unknown')
    expect(r.value).toBeUndefined()
    expect(r.warnings.at(-1)?.reglageManquant).toBe('fractionDisponibiliteRemuneree')
  })

  it('PAI-04 — fraction absente mais aucune disponibilité : complete', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [{ type: 'conduite', de: '06:00', a: '14:00' }],
    })

    const r = tempsRemunere(journee, desSettings())

    // Un réglage manquant ne pénalise que les journées qui en dépendent.
    expect(r.status).toBe('complete')
    expect(r.value).toBe(8 * 60)
  })

  it('PAI-05 — fraction saisie à 0 : un zéro choisi est une donnée', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '12:00' },
        { type: 'disponibilite', de: '12:00', a: '14:00' },
      ],
    })

    const r = tempsRemunere(journee, desSettings({ fractionDisponibiliteRemuneree: 0 }))

    expect(r.status).toBe('complete')
    expect(r.value).toBe(6 * 60)
  })

  it('PAI-06 — coupure : seule la part au-delà du seuil est rémunérée', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '15:30',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'coupure', de: '10:00', a: '11:30' },
        { type: 'conduite', de: '11:30', a: '15:30' },
      ],
    })

    const r = tempsRemunere(
      journee,
      desSettings({
        coupuresRemunerees: [{ auDelaDeMinutes: minutes(30), fraction: 0.5 }],
      }),
    )

    // 90 min de coupure, 60 au-delà du seuil, moitié rémunérée : 8 h + 30 min.
    expect(r.value).toBe(8 * 60 + 30)
  })

  it('PAI-07 — coupure exactement égale au seuil : rien au-delà', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '14:30',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'coupure', de: '10:00', a: '10:30' },
        { type: 'conduite', de: '10:30', a: '14:30' },
      ],
    })

    const r = tempsRemunere(
      journee,
      desSettings({ coupuresRemunerees: [{ auDelaDeMinutes: minutes(30), fraction: 0.5 }] }),
    )

    expect(r.status).toBe('complete')
    expect(r.value).toBe(8 * 60)
  })

  it('PAI-08 — plusieurs paliers de coupure, aucun double comptage', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '17:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'coupure', de: '10:00', a: '13:00' },
        { type: 'conduite', de: '13:00', a: '17:00' },
      ],
    })

    const r = tempsRemunere(
      journee,
      desSettings({
        coupuresRemunerees: [
          { auDelaDeMinutes: minutes(30), fraction: 0.5 },
          { auDelaDeMinutes: minutes(120), fraction: 1 },
        ],
      }),
    )

    // 180 min de coupure : 60 min au-delà de 120 à 100 %, puis 90 min
    // (de 30 à 120) à 50 % = 45. Total travail 8 h + 105 min.
    expect(r.value).toBe(8 * 60 + 105)
  })

  it('PAI-09 — coupure présente sans palier réglé : non comptée, mais signalée', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '15:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'coupure', de: '10:00', a: '11:00' },
        { type: 'conduite', de: '11:00', a: '15:00' },
      ],
    })

    const r = tempsRemunere(journee, desSettings())

    expect(r.value).toBe(8 * 60)
    const alerte = r.warnings.find((w) => w.reglageManquant === 'coupuresRemunerees')
    expect(alerte?.message).toContain("n'est pas comptée")
  })

  it('PAI-10 — zone non qualifiée : partial et range propagés jusqu’au temps rémunéré', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '18:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'conduite', de: '14:00', a: '18:00' },
      ],
    })

    const r = tempsRemunere(journee, desSettings())

    expect(r.status).toBe('partial')
    expect(r.range).toEqual({ min: 8 * 60, max: 12 * 60 })
  })

  it('PAI-11 — journée du recul des horloges : la 25e heure est comptée', () => {
    const journee = journeeDe({
      date: '2027-10-31',
      prise: '00:00',
      fin: '08:00',
      segments: [{ type: 'conduite', de: '00:00', a: '08:00' }],
    })

    expect(tempsRemunere(journee, desSettings()).value).toBe(9 * 60)
  })

  it('PAI-12 — le temps de conduite et l’amplitude ne portent aucune source', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [{ type: 'conduite', de: '06:00', a: '14:00' }],
    })

    expect(journee.amplitude.sources).toHaveLength(0)
    expect(journee.dureeParType.conduite.sources).toHaveLength(0)
    // Le temps rémunéré non plus, tant qu'aucun réglage n'est intervenu.
    expect(tempsRemunere(journee, desSettings()).sources).toHaveLength(0)
  })

  it('PAI-13 — dès qu’un réglage intervient, le temps rémunéré porte une source', () => {
    const journee = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '12:00' },
        { type: 'disponibilite', de: '12:00', a: '14:00' },
      ],
    })

    const r = tempsRemunere(journee, desSettings({ fractionDisponibiliteRemuneree: 0.5 }))

    expect(r.sources.length).toBeGreaterThan(0)
    expect(r.sources[0]?.kind).toBe('convention')
  })
})

describe('PAI — heures supplémentaires', () => {
  const hebdo = (extras: Partial<Settings> = {}): Settings =>
    desSettings({
      modeDecompteHS: 'hebdomadaire',
      debutSemaine: 1,
      dureeReferenceMinutes: minutes(35 * 60),
      ...extras,
    })

  const SEMAINE = periode('2027-03-15', '2027-03-21', 'Semaine de test')

  it('PAI-20 — semaine à 39 h sur une référence de 35 h : 4 h supplémentaires', () => {
    const r = heuresSup(serie(LUNDI, 5, 468), hebdo(), SEMAINE)

    expect(r.duree.status).toBe('complete')
    expect(r.duree.value).toBe(4 * 60)
  })

  it('PAI-21 — semaine à 35 h pile : 0 h sup, complete', () => {
    const r = heuresSup(serie(LUNDI, 5, H(7)), hebdo(), SEMAINE)

    expect(r.duree.status).toBe('complete')
    expect(r.duree.value).toBe(0)
  })

  it('PAI-22 — semaine sous la référence : 0, jamais une valeur négative', () => {
    const r = heuresSup(serie(LUNDI, 4, H(7)), hebdo(), SEMAINE)

    expect(r.duree.value).toBe(0)
  })

  it('PAI-23 — mode mensuel : le seuil s’applique une fois sur la période', () => {
    const settings = desSettings({
      modeDecompteHS: 'mensuel',
      dureeReferenceMinutes: minutes(151 * 60 + 40),
    })
    // 20 journées de 8 h = 160 h.
    const journees = serie('2027-03-01', 20, H(8))

    const r = heuresSup(journees, settings, periode('2027-03-01', '2027-03-31'))

    expect(r.duree.value).toBe(160 * 60 - (151 * 60 + 40))
  })

  it('PAI-25 — les trois modes donnent trois résultats distincts sur le même jeu', () => {
    const journees = serie('2027-03-01', 14, H(8))
    // Période calée sur quatre semaines pleines : aucune semaine à cheval, donc
    // c'est bien le mode de décompte qu'on compare, et rien d'autre.
    const p = periode('2027-03-01', '2027-03-28')

    const parSemaine = heuresSup(
      journees,
      desSettings({
        modeDecompteHS: 'hebdomadaire',
        debutSemaine: 1,
        dureeReferenceMinutes: minutes(35 * 60),
      }),
      p,
    )
    const parMois = heuresSup(
      journees,
      desSettings({ modeDecompteHS: 'mensuel', dureeReferenceMinutes: minutes(35 * 60) }),
      p,
    )
    const parBloc = heuresSup(
      journees,
      desSettings({
        modeDecompteHS: 'periode_reference',
        dureeReferenceMinutes: minutes(35 * 60),
        periodeReferenceSemaines: 4,
        periodeReferenceDebut: '2027-03-01',
      }),
      p,
    )

    // 14 jours × 8 h = 112 h. Hebdo : deux semaines de 56 h → 2 × 21 h = 42 h.
    // Mensuel : 112 − 35 = 77 h. Bloc de 4 semaines : 112 − 35 = 77 h aussi,
    // mais sur un découpage différent — les trois seuils ne se déguisent pas
    // l'un en l'autre.
    expect(parSemaine.duree.value).toBe(42 * 60)
    expect(parMois.duree.value).toBe(77 * 60)
    expect(parBloc.duree.value).toBe(77 * 60)
    expect(parSemaine.duree.value).not.toBe(parMois.duree.value)
  })

  it('PAI-24 — periode_reference : le seuil porte sur le bloc, pas sur la période de paie', () => {
    const journees = serie('2027-03-01', 28, H(5))
    const settings = desSettings({
      modeDecompteHS: 'periode_reference',
      dureeReferenceMinutes: minutes(140 * 60),
      periodeReferenceSemaines: 4,
      periodeReferenceDebut: '2027-03-01',
    })

    const r = heuresSup(journees, settings, periode('2027-03-01', '2027-03-28'))

    // 28 jours × 5 h = 140 h, exactement la référence du bloc.
    expect(r.duree.value).toBe(0)
  })

  it('PAI-26 — durée de référence absente : unknown, aucun 35 h en dur', () => {
    const r = heuresSup(
      serie(LUNDI, 5, H(8)),
      desSettings({ modeDecompteHS: 'hebdomadaire', debutSemaine: 1 }),
      SEMAINE,
    )

    expect(r.duree.status).toBe('unknown')
    expect(r.duree.warnings.at(-1)?.reglageManquant).toBe('dureeReferenceMinutes')
  })

  it('PAI-27 — mode de décompte absent : unknown', () => {
    const r = heuresSup(
      serie(LUNDI, 5, H(8)),
      desSettings({ dureeReferenceMinutes: minutes(2100) }),
      SEMAINE,
    )

    expect(r.duree.status).toBe('unknown')
    expect(r.duree.warnings.at(-1)?.reglageManquant).toBe('modeDecompteHS')
  })

  it('PAI-28 — forfait jours : aucune heure supplémentaire, et on dit pourquoi', () => {
    const r = heuresSup(serie(LUNDI, 5, H(10)), hebdo({ estForfaitJours: true }), SEMAINE)

    expect(r.duree.status).toBe('complete')
    expect(r.duree.value).toBe(0)
    expect(r.duree.steps[0]?.detail).toContain('forfait jours')
  })

  it('PAI-29 — 6 h sup avec tranches 25 / 50 : tout à 25 %', () => {
    const parts = ventiler(minutes(6 * 60), TRANCHES)

    expect(parts).toEqual([{ duree: 360, majorationPct: 25 }])
  })

  it('PAI-30 — 12 h sup : 8 h à 25 % puis 4 h à 50 %, les deux lignes visibles', () => {
    const parts = ventiler(minutes(12 * 60), TRANCHES)

    expect(parts).toEqual([
      { duree: 480, majorationPct: 25 },
      { duree: 240, majorationPct: 50 },
    ])
  })

  it('PAI-31 — 8 h sup exactement : la borne haute d’une tranche est exclusive', () => {
    const parts = ventiler(minutes(8 * 60), TRANCHES)

    expect(parts).toEqual([{ duree: 480, majorationPct: 25 }])
  })

  it('PAI-32 — tranches absentes : la durée reste complete, le montant devient unknown', () => {
    const r = heuresSup(
      serie(LUNDI, 5, H(8)),
      hebdo({ tauxHoraireBaseCents: cents(1300) }),
      SEMAINE,
    )

    expect(r.duree.status).toBe('complete')
    expect(r.duree.value).toBe(5 * 60)
    expect(r.valorisation.status).toBe('unknown')
    expect(r.valorisation.warnings.at(-1)?.reglageManquant).toBe('tranchesHS')
  })

  it('PAI-33 — taux horaire absent : la durée reste complete, le montant unknown', () => {
    const r = heuresSup(serie(LUNDI, 5, H(8)), hebdo({ tranchesHS: TRANCHES }), SEMAINE)

    expect(r.duree.status).toBe('complete')
    expect(r.valorisation.status).toBe('unknown')
    expect(r.valorisation.warnings.at(-1)?.reglageManquant).toBe('tauxHoraireBaseCents')
  })

  it('PAI-34 — tranches incohérentes : refus explicite, pas de calcul silencieux', () => {
    const trou = validerTranches([
      { deMinutes: minutes(0), aMinutes: minutes(480), majorationPct: 25 },
      { deMinutes: minutes(600), aMinutes: null, majorationPct: 50 },
    ])
    expect(trou.ok).toBe(false)

    const chevauchement = validerTranches([
      { deMinutes: minutes(0), aMinutes: minutes(480), majorationPct: 25 },
      { deMinutes: minutes(300), aMinutes: null, majorationPct: 50 },
    ])
    expect(chevauchement.ok).toBe(false)

    const nonOuverte = validerTranches([
      { deMinutes: minutes(0), aMinutes: minutes(480), majorationPct: 25 },
    ])
    expect(nonOuverte.ok).toBe(false)

    expect(validerTranches(TRANCHES).ok).toBe(true)
  })

  it('PAI-35 — semaine partielle : heures sup partial avec range, jamais une valeur unique', () => {
    const incomplete = journeeDe({
      date: LUNDI,
      prise: '06:00',
      fin: '20:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '10:00' },
        { type: 'conduite', de: '14:00', a: '20:00' },
      ],
    })
    const journees = [incomplete, ...serie('2027-03-16', 4, H(8))]

    const r = heuresSup(journees, hebdo(), SEMAINE)

    expect(r.duree.status).toBe('partial')
    // 10 h certaines + 32 h = 42 h → 7 h sup ; jusqu'à 14 h + 32 = 46 h → 11 h.
    expect(r.duree.range).toEqual({ min: 7 * 60, max: 11 * 60 })
  })

  it('PAI-36 — semaine à cheval sans réglage : deux hypothèses, aucune choisie', () => {
    // Période du 26 février au 25 mars ; la semaine du lundi 22 mars déborde.
    const p = periode('2027-02-26', '2027-03-25', 'Mars 2027')
    const journees = serie('2027-03-22', 5, H(8))

    const r = heuresSup(journees, hebdo(), p)

    expect(r.duree.status).toBe('unknown')
    expect(r.hypotheses).toHaveLength(2)
    expect(r.mention).toBe('selon la règle appliquée par ton employeur')
    expect(r.hypotheses?.map((h) => h.reglageSuppose.valeur)).toEqual([
      'periode_de_fin',
      'periode_de_debut',
    ])
    // La semaine finit le 28 mars, hors période : rattachée à sa fin, elle ne
    // compte pas ici ; rattachée à son début, elle compte entièrement.
    expect(r.hypotheses?.[0]?.duree.value).toBe(0)
    expect(r.hypotheses?.[1]?.duree.value).toBe(5 * 60)
  })

  it('PER-15 — réglage de rattachement absent : deux hypothèses, aucune choisie', () => {
    const p = periode('2027-02-26', '2027-03-25', 'Mars 2027')
    const r = heuresSup(serie('2027-03-22', 5, H(8)), hebdo(), p)

    // Le moteur ne tranche pas : il n'y a ni valeur, ni range, mais deux
    // hypothèses nommées. C'est le seul endroit où son ignorance est une
    // fonctionnalité — le conducteur, lui, a sa fiche sous les yeux.
    expect(r.duree.status).toBe('unknown')
    expect(r.duree.value).toBeUndefined()
    expect(r.duree.range).toBeUndefined()
    expect(r.hypotheses).toHaveLength(2)
    expect(r.duree.warnings.at(-1)?.reglageManquant).toBe('rattachementSemaineChevauchante')
  })

  it('PER-16 — chaque hypothèse est nommée et porte le réglage qu’elle suppose', () => {
    const p = periode('2027-02-26', '2027-03-25', 'Mars 2027')
    const r = heuresSup(serie('2027-03-22', 5, H(8)), hebdo(), p)

    for (const hypothese of r.hypotheses ?? []) {
      expect(hypothese.libelle.startsWith('Si ')).toBe(true)
      expect(hypothese.reglageSuppose.champ).toBe('rattachementSemaineChevauchante')
      expect(hypothese.duree.status).toBe('complete')
    }
    expect(r.hypotheses?.map((h) => h.libelle)).toEqual([
      'Si les semaines à cheval tombent sur la période où elles se terminent',
      'Si les semaines à cheval tombent sur la période où elles commencent',
    ])
  })

  it('PER-12 — rattachement à la période de fin', () => {
    const p = periode('2027-02-26', '2027-03-25', 'Mars 2027')
    const r = heuresSup(
      serie('2027-03-22', 5, H(8)),
      hebdo({ rattachementSemaineChevauchante: 'periode_de_fin' }),
      p,
    )

    expect(r.duree.status).toBe('complete')
    expect(r.duree.value).toBe(0)
    expect(r.hypotheses).toBeUndefined()
  })

  it('PER-13 — rattachement à la période de début', () => {
    const p = periode('2027-02-26', '2027-03-25', 'Mars 2027')
    const r = heuresSup(
      serie('2027-03-22', 5, H(8)),
      hebdo({ rattachementSemaineChevauchante: 'periode_de_debut' }),
      p,
    )

    expect(r.duree.value).toBe(5 * 60)
  })

  it('PER-14 — prorata : les deux parts somment exactement au total', () => {
    const journees = serie('2027-03-22', 5, H(8))
    const settings = hebdo({ rattachementSemaineChevauchante: 'prorata' })

    // La semaine du 22 au 28 mars : 4 jours dans la période de mars (22→25),
    // 3 jours dans celle d'avril.
    const mars = heuresSup(journees, settings, periode('2027-02-26', '2027-03-25'))
    const avril = heuresSup(journees, settings, periode('2027-03-26', '2027-04-25'))

    const total = (mars.duree.value ?? 0) + (avril.duree.value ?? 0)
    expect(total).toBe(5 * 60)
    expect(mars.duree.value).toBe(171)
    expect(avril.duree.value).toBe(129)
  })

  it('PAI-37 — 4 h sup à 13,00 €/h majorées de 25 % : 65,00 €', () => {
    const r = heuresSup(
      serie(LUNDI, 5, 468),
      hebdo({ tauxHoraireBaseCents: cents(1300), tranchesHS: TRANCHES }),
      SEMAINE,
    )

    expect(r.duree.value).toBe(4 * 60)
    expect(r.valorisation.status).toBe('complete')
    expect(r.valorisation.value).toBe(6500)
  })

  it('PRV-06 — tout résultat financier porte au moins une source', () => {
    const r = heuresSup(
      serie(LUNDI, 5, 468),
      hebdo({ tauxHoraireBaseCents: cents(1300), tranchesHS: TRANCHES }),
      SEMAINE,
    )

    expect(r.valorisation.sources.length).toBeGreaterThan(0)
  })

  it('PRV-07 — un unknown dû à un réglage nomme le réglage manquant', () => {
    const r = heuresSup(serie(LUNDI, 5, H(8)), hebdo({ tranchesHS: TRANCHES }), SEMAINE)

    expect(r.valorisation.status).toBe('unknown')
    expect(r.valorisation.warnings.at(-1)?.reglageManquant).toBeDefined()
  })
})

describe('PAI — synthèse de période', () => {
  function paire(brut: JourBrut): { jour: WorkDay; journee: JourneeQualifiee } {
    const jour = aWorkDay(brut)
    return { jour, journee: qualifierJournee(jour, PARIS) }
  }

  const settingsComplets = desSettings({
    payPeriodConfig: { jourDebut: 1 },
    modeDecompteHS: 'mensuel',
    dureeReferenceMinutes: minutes(20 * 60),
    tauxHoraireBaseCents: cents(1300),
    tranchesHS: TRANCHES,
  })

  const troisJours = ['2027-03-01', '2027-03-02', '2027-03-03'].map((date) =>
    paire({
      date,
      prise: '06:00',
      fin: '14:00',
      segments: [{ type: 'conduite', de: '06:00', a: '14:00' }],
    }),
  )

  it('PAI-39 — mois sans absence, tous réglages présents : brut complete', () => {
    const s = synthetiserPeriode(
      periode('2027-03-01', '2027-03-31', 'Mars 2027'),
      troisJours,
      settingsComplets,
    )

    expect(s.tempsRemunere.value).toBe(24 * 60)
    expect(s.heuresSup.duree.value).toBe(4 * 60)
    expect(s.brut.status).toBe('complete')
  })

  it('PAI-38 — mois avec absence : brut unknown, heures sup et indemnités complete', () => {
    const absence: Absence = {
      id: 'abs-1',
      type: 'MALADIE',
      debut: '2027-03-10',
      fin: '2027-03-12',
    }

    const s = synthetiserPeriode(
      periode('2027-03-01', '2027-03-31', 'Mars 2027'),
      troisJours,
      settingsComplets,
      [absence],
    )

    expect(s.brut.status).toBe('unknown')
    expect(s.brut.warnings.at(-1)?.message).toContain('ne les valorise pas')
    // Ce sont ces deux-là qui portent la valeur pour le conducteur.
    expect(s.heuresSup.duree.status).toBe('complete')
    expect(s.totalIndemnites.status).toBe('complete')
    // On compte les jours par type, rien de plus (SPEC §1).
    expect(s.joursAbsence['MALADIE']).toBe(3)
  })

  it('PRV-22 — l’absence rend le brut incalculable, pas le reste', () => {
    const s = synthetiserPeriode(
      periode('2027-03-01', '2027-03-31', 'Mars 2027'),
      troisJours,
      settingsComplets,
      [{ id: 'a', type: 'CP', debut: '2027-03-05', fin: '2027-03-05', demiJournee: 'matin' }],
    )

    expect(s.brut.status).toBe('unknown')
    expect(s.heuresSup.valorisation.status).toBe('complete')
    expect(s.joursAbsence['CP']).toBe(0.5)
  })
})
