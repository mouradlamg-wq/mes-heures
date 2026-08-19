import { beforeEach, describe, expect, it } from 'vitest'
import {
  cents,
  comparerAvecFiche,
  detaillerIntervalle,
  minutes,
  qualifierJournee,
  synthetiserPeriode,
  type Comparaison,
  type IndemniteConfig,
  type JourneeQualifiee,
  type PayCheck,
  type PayPeriod,
  type RuleSource,
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

const PERIODE: PayPeriod = {
  id: '2027-03-01_2027-03-31',
  label: 'Mars 2027',
  debut: '2027-03-01',
  fin: '2027-03-31',
}

const SOURCE: RuleSource = {
  kind: 'convention',
  libelle: 'Convention collective',
  saisiPar: 'utilisateur',
}

const TRANCHES: readonly TrancheHS[] = [
  { deMinutes: minutes(0), aMinutes: minutes(480), majorationPct: 25 },
  { deMinutes: minutes(480), aMinutes: null, majorationPct: 50 },
]

const REPAS: IndemniteConfig = {
  id: 'i-repas',
  code: 'REPAS',
  libelle: 'Indemnités de repas',
  declencheur: 'plage_horaire',
  plageDebut: '11:30',
  plageFin: '14:30',
  montantCents: cents(1500),
  source: SOURCE,
}

function paire(brut: JourBrut): { jour: WorkDay; journee: JourneeQualifiee } {
  const jour = aWorkDay(brut)
  return { jour, journee: qualifierJournee(jour, PARIS) }
}

/** Journée de 8 h, avec une coupure de midi qui déclenche le repas. */
function journeeAvecRepas(date: string) {
  return paire({
    date,
    prise: '06:00',
    fin: '18:00',
    segments: [
      { type: 'conduite', de: '06:00', a: '11:00' },
      { type: 'coupure', de: '11:00', a: '15:00' },
      { type: 'conduite', de: '15:00', a: '18:00' },
    ],
  })
}

function journeeAvecTrou(date: string) {
  return paire({
    date,
    prise: '06:00',
    fin: '18:00',
    segments: [
      { type: 'conduite', de: '06:00', a: '10:00' },
      { type: 'conduite', de: '14:00', a: '18:00' },
    ],
  })
}

/**
 * Réglages complets. `sauf` retire un champ **sans le mettre à `undefined`** :
 * `exactOptionalPropertyTypes` distingue les deux, et c'est le point — un
 * réglage absent n'est pas un réglage à `undefined`.
 */
const REGLAGES_COMPLETS = (sauf: readonly (keyof Settings)[] = []): Settings => {
  const complets: Settings = desSettings({
    payPeriodConfig: { jourDebut: 1 },
    modeDecompteHS: 'mensuel',
    dureeReferenceMinutes: minutes(20 * 60),
    tauxHoraireBaseCents: cents(1300),
    tranchesHS: TRANCHES,
    indemnites: [REPAS],
  })
  const copie = { ...complets }
  for (const champ of sauf) {
    delete copie[champ]
  }
  return copie
}

function comparer(
  jours: readonly { jour: WorkDay; journee: JourneeQualifiee }[],
  fiche: PayCheck | undefined,
  settings: Settings = REGLAGES_COMPLETS(),
): Comparaison {
  const synthese = synthetiserPeriode(PERIODE, jours, settings)
  const detail = detaillerIntervalle(PERIODE.debut, PERIODE.fin, jours, settings)
  return comparerAvecFiche(PERIODE, synthese, detail, fiche)
}

function ligne(comparaison: Comparaison, code: string) {
  return comparaison.lignes.find((l) => l.code === code)
}

const fiche = (partiels: Partial<PayCheck>): PayCheck => ({
  id: 'f1',
  payPeriodId: PERIODE.id,
  ...partiels,
})

beforeEach(reinitialiserCompteur)

describe('ECA — comparaison avec la fiche de paie', () => {
  const troisJours = ['2027-03-01', '2027-03-02', '2027-03-03'].map(journeeAvecRepas)

  it('ECA-01 — écart signé, positif quand l’app compte plus que la fiche', () => {
    // 3 journées de 8 h = 24 h, référence 20 h → 4 h supplémentaires.
    const c = comparer(troisJours, fiche({ heuresSupPayees: 3 }))

    expect(ligne(c, 'HEURES_SUP')?.calcule.value).toBe(4 * 60)
    expect(ligne(c, 'HEURES_SUP')?.ecart?.valeur).toBe(60)
    expect(ligne(c, 'HEURES_SUP')?.ecart?.dansIncertitude).toBe(false)
  })

  it('ECA-01 — écart négatif quand la fiche compte plus que l’app', () => {
    const c = comparer(troisJours, fiche({ heuresSupPayees: 5 }))

    expect(ligne(c, 'HEURES_SUP')?.ecart?.valeur).toBe(-60)
  })

  it('ECA-02 — une ligne non comparée n’est pas un écart de zéro', () => {
    const c = comparer(troisJours, fiche({}))

    const hs = ligne(c, 'HEURES_SUP')
    expect(hs?.calcule.value).toBe(4 * 60)
    expect(hs?.ecart).toBeUndefined()
    expect(hs?.fiche).toBeUndefined()
  })

  it('ECA-03 — une ligne incalculable ne produit aucun écart, mais reste visible', () => {
    // Sans durée de référence, les heures sup sont incalculables.
    const c = comparer(
      troisJours,
      fiche({ heuresSupPayees: 3 }),
      REGLAGES_COMPLETS(['dureeReferenceMinutes']),
    )

    const hs = ligne(c, 'HEURES_SUP')
    expect(hs).toBeDefined()
    expect(hs?.calcule.status).toBe('unknown')
    expect(hs?.ecart).toBeUndefined()
    expect(hs?.calcule.warnings.at(-1)?.reglageManquant).toBe('dureeReferenceMinutes')
  })

  it('ECA-04 — une fiche dans l’intervalle n’est pas un écart avéré', () => {
    // La journée à trou rend le temps rémunéré partiel : entre 8 h et 12 h.
    const c = comparer([journeeAvecTrou('2027-03-01')], fiche({ heuresPayeesCentiemes: 10 }))

    const temps = ligne(c, 'TEMPS_REMUNERE')
    expect(temps?.calcule.status).toBe('partial')
    expect(temps?.ecart?.valeur).toBe(0)
    expect(temps?.ecart?.dansIncertitude).toBe(true)
  })

  it('ECA-05 — hors de l’intervalle, l’écart part de la borne la plus proche', () => {
    // 14 h sur la fiche, alors que l'app borne à 12 h au maximum.
    const c = comparer([journeeAvecTrou('2027-03-01')], fiche({ heuresPayeesCentiemes: 14 }))

    const temps = ligne(c, 'TEMPS_REMUNERE')
    expect(temps?.calcule.range).toEqual({ min: 8 * 60, max: 12 * 60 })
    expect(temps?.ecart?.valeur).toBe(-2 * 60)
    expect(temps?.ecart?.dansIncertitude).toBe(false)

    // Et de l'autre côté de l'intervalle.
    const dessous = comparer([journeeAvecTrou('2027-03-01')], fiche({ heuresPayeesCentiemes: 6 }))
    expect(ligne(dessous, 'TEMPS_REMUNERE')?.ecart?.valeur).toBe(2 * 60)
  })

  it('ECA-06 — les heures de la fiche se lisent en centièmes', () => {
    // 17,00 sur la fiche vaut 17 h 00, pas 17 minutes.
    const c = comparer(troisJours, fiche({ heuresSupPayees: 17 }))

    expect(ligne(c, 'HEURES_SUP')?.fiche).toBe(17 * 60)

    // Et 17,25 vaut 17 h 15.
    const quart = comparer(troisJours, fiche({ heuresSupPayees: 17.25 }))
    expect(ligne(quart, 'HEURES_SUP')?.fiche).toBe(17 * 60 + 15)
  })

  it('ECA-07 — le compteur ne mélange jamais heures et euros', () => {
    const c = comparer(
      troisJours,
      fiche({
        heuresSupPayees: 3,
        indemnitesPayees: [{ code: 'REPAS', montantCents: cents(3000) }],
      }),
    )

    // Deux grandeurs, deux valeurs. Aucune addition entre elles.
    expect(c.ecartHeuresSup?.valeur).toBe(60)
    expect(c.ecartIndemnites?.valeur).toBe(1500)
    expect(c.ecartHeuresSup?.valeur).not.toBe(c.ecartIndemnites?.valeur)
  })

  it('ECA-08 — le cumul des indemnités ignore le brut et le temps rémunéré', () => {
    const c = comparer(
      troisJours,
      fiche({
        indemnitesPayees: [{ code: 'REPAS', montantCents: cents(3000) }],
        brutCents: cents(100),
        heuresPayeesCentiemes: 1,
      }),
    )

    // 3 repas à 15,00 € = 45,00 € contre 30,00 € relevés : +15,00 €.
    expect(c.ecartIndemnites?.valeur).toBe(1500)
    // Le brut et le temps rémunéré ont chacun un écart énorme, qui n'entre pas
    // dans ce cumul.
    expect(ligne(c, 'BRUT')?.ecart?.valeur).not.toBe(0)
    expect(c.ecartIndemnites?.valeur).toBe(1500)
  })

  it('ECA-09 — une indemnité relevée en quantité se compare en quantité', () => {
    const c = comparer(troisJours, fiche({ indemnitesPayees: [{ code: 'REPAS', quantite: 2 }] }))

    const repas = ligne(c, 'REPAS')
    expect(repas?.unite).toBe('quantite')
    expect(repas?.calcule.value).toBe(3)
    expect(repas?.fiche).toBe(2)
    expect(repas?.ecart?.valeur).toBe(1)
  })

  it('ECA-10 — une indemnité relevée en montant se compare en montant', () => {
    const c = comparer(
      troisJours,
      fiche({ indemnitesPayees: [{ code: 'REPAS', quantite: 3, montantCents: cents(4000) }] }),
    )

    const repas = ligne(c, 'REPAS')
    expect(repas?.unite).toBe('montant')
    expect(repas?.calcule.value).toBe(4500)
    expect(repas?.ecart?.valeur).toBe(500)
  })

  it('ECA-11 — sans fiche, tout est visible et rien n’est comparé', () => {
    const c = comparer(troisJours, undefined)

    expect(c.lignes.length).toBeGreaterThanOrEqual(3)
    expect(c.lignes.every((l) => l.ecart === undefined)).toBe(true)
    expect(c.lignesComparees).toBe(0)
    expect(c.ecartHeuresSup).toBeUndefined()
    expect(c.ecartIndemnites).toBeUndefined()
  })

  it('ECA-12 — les décomptes suivent le contenu', () => {
    const c = comparer(
      troisJours,
      fiche({ heuresSupPayees: 3 }),
      REGLAGES_COMPLETS(['tauxHoraireBaseCents']),
    )

    expect(c.lignesComparees).toBe(1)
    expect(c.lignesIncalculables).toBe(
      c.lignes.filter((l) => l.calcule.status === 'unknown').length,
    )
  })

  it('ECA-13 — le statut d’ensemble suit la ligne la moins sûre', () => {
    const toutCertain = comparer(troisJours, fiche({ heuresSupPayees: 4 }))
    expect(toutCertain.statut).toBe('complete')

    const avecPartiel = comparer([...troisJours, journeeAvecTrou('2027-03-04')], fiche({}))
    expect(avecPartiel.statut).toBe('partial')
  })

  it('ECA-14 — le brut n’apparaît que s’il a été relevé', () => {
    expect(ligne(comparer(troisJours, fiche({})), 'BRUT')).toBeUndefined()
    expect(ligne(comparer(troisJours, fiche({ brutCents: cents(210000) })), 'BRUT')).toBeDefined()
  })

  it('ECA-15 — chaque ligne permet de remonter aux journées', () => {
    const c = comparer(troisJours, fiche({ heuresSupPayees: 3 }))

    for (const l of c.lignes) {
      expect(l.dayIds).toHaveLength(3)
      expect(l.dayIds).toEqual(troisJours.map((j) => j.jour.id))
    }
  })

  it('PAI-40 — chaque ligne est dépliable sur ses étapes', () => {
    const c = comparer(troisJours, fiche({ heuresSupPayees: 3 }))

    const hs = ligne(c, 'HEURES_SUP')
    expect(hs?.calcule.steps.length).toBeGreaterThan(0)
    expect(hs?.calcule.sources.length).toBeGreaterThan(0)
  })

  it('PAI-41 — un écart nul est affiché quand même : c’est une information', () => {
    const c = comparer(troisJours, fiche({ heuresSupPayees: 4 }))

    const hs = ligne(c, 'HEURES_SUP')
    expect(hs?.ecart).toBeDefined()
    expect(hs?.ecart?.valeur).toBe(0)
    expect(hs?.ecart?.dansIncertitude).toBe(false)
  })

  it('PAI-42 — un écart contenu dans l’incertitude est signalé comme tel', () => {
    const c = comparer([journeeAvecTrou('2027-03-01')], fiche({ heuresPayeesCentiemes: 9 }))

    const temps = ligne(c, 'TEMPS_REMUNERE')
    expect(temps?.ecart?.dansIncertitude).toBe(true)
    // Compatible avec l'incertitude : ce n'est pas un écart avéré.
    expect(temps?.ecart?.valeur).toBe(0)
  })
})
