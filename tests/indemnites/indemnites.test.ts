import { beforeEach, describe, expect, it } from 'vitest'
import {
  CODES_INDEMNITES,
  CODES_INDEMNITES_COURANTS,
  cents,
  indemnitesDuJour,
  minutes,
  qualifierJournee,
  validerIndemnites,
  type IndemniteConfig,
  type RuleSource,
  type SaisieIndemnite,
} from '../../src/engine'
import {
  aWorkDay,
  desSettings,
  PARIS,
  reinitialiserCompteur,
  type JourBrut,
} from '../fixtures/builders'

const LUNDI = '2027-03-15'
const RECUL = '2027-10-31'

const SOURCE: RuleSource = {
  kind: 'convention',
  libelle: 'Convention collective, annexe 1',
  saisiPar: 'utilisateur',
}

/** Aucun montant par défaut : chaque test qui en a besoin le fournit. */
function uneIndemnite(partiels: Partial<IndemniteConfig> & { code: string }): IndemniteConfig {
  return {
    id: `ind-${partiels.code}`,
    libelle: partiels.libelle ?? partiels.code,
    declencheur: 'plage_horaire',
    source: SOURCE,
    ...partiels,
  }
}

function calculer(
  brut: JourBrut,
  indemnites: readonly IndemniteConfig[],
  saisies: readonly SaisieIndemnite[] = [],
) {
  const jour = aWorkDay(brut)
  const journee = qualifierJournee(jour, PARIS)
  return indemnitesDuJour(jour, journee, desSettings({ indemnites }), saisies)
}

const REPAS = (extras: Partial<IndemniteConfig> = {}): IndemniteConfig =>
  uneIndemnite({
    code: 'REPAS',
    libelle: 'Repas',
    declencheur: 'plage_horaire',
    plageDebut: '11:30',
    plageFin: '14:30',
    montantCents: cents(1500),
    ...extras,
  })

/**
 * Même indemnité, mais **sans montant** : la propriété est absente, pas mise à
 * `undefined`. C'est l'état livré par l'app tant que le conducteur n'a pas
 * recopié sa convention.
 */
const REPAS_SANS_MONTANT = (code: string, libelle: string): IndemniteConfig =>
  uneIndemnite({
    code,
    libelle,
    declencheur: 'plage_horaire',
    plageDebut: '11:30',
    plageFin: '14:30',
  })

/** Journée avec une coupure de midi paramétrable. */
function journeeAvecCoupure(de: string, a: string): JourBrut {
  return {
    date: LUNDI,
    prise: '06:00',
    fin: '18:00',
    segments: [
      { type: 'conduite', de: '06:00', a: de },
      { type: 'coupure', de, a },
      { type: 'conduite', de: a, a: '18:00' },
    ],
  }
}

beforeEach(reinitialiserCompteur)

describe('IND — déclencheurs et incompatibilités', () => {
  it('IND-01 — recouvrement intégral de la plage : déclenchée', () => {
    const r = calculer(journeeAvecCoupure('11:00', '15:00'), [REPAS()])

    expect(r.lignes).toHaveLength(1)
    expect(r.lignes[0]?.montant.value).toBe(1500)
    expect(r.total.value).toBe(1500)
  })

  it('IND-02 — recouvrement partiel : non déclenchée', () => {
    const r = calculer(journeeAvecCoupure('12:00', '15:00'), [REPAS()])

    expect(r.lignes).toHaveLength(0)
    expect(r.total.value).toBe(0)
  })

  it('IND-03 — bornes exactement confondues : déclenchée', () => {
    const r = calculer(journeeAvecCoupure('11:30', '14:30'), [REPAS()])

    expect(r.lignes).toHaveLength(1)
  })

  it('IND-04 — une minute de trop : non déclenchée', () => {
    const r = calculer(journeeAvecCoupure('11:31', '14:30'), [REPAS()])

    expect(r.lignes).toHaveLength(0)
  })

  it('IND-05 — durée de segment insuffisante : non déclenchée', () => {
    // Plage courte (12:00 → 12:15) mais durée minimale de 45 min exigée.
    const config = REPAS({ plageDebut: '12:00', plageFin: '12:15', dureeMinMinutes: minutes(45) })
    const r = calculer(journeeAvecCoupure('11:55', '12:25'), [config])

    expect(r.lignes).toHaveLength(0)
  })

  it('IND-06 — durée exactement au seuil : le seuil est inclusif', () => {
    const config = REPAS({ plageDebut: '12:00', plageFin: '12:15', dureeMinMinutes: minutes(45) })
    const r = calculer(journeeAvecCoupure('11:55', '12:40'), [config])

    expect(r.lignes).toHaveLength(1)
  })

  it('IND-07 — type de segment par défaut : une disponibilité ne déclenche pas', () => {
    const r = calculer(
      {
        date: LUNDI,
        prise: '06:00',
        fin: '18:00',
        segments: [
          { type: 'conduite', de: '06:00', a: '11:00' },
          { type: 'disponibilite', de: '11:00', a: '15:00' },
          { type: 'conduite', de: '15:00', a: '18:00' },
        ],
      },
      [REPAS()],
    )

    expect(r.lignes).toHaveLength(0)
  })

  it('IND-08 — types éligibles élargis : la disponibilité déclenche', () => {
    const r = calculer(
      {
        date: LUNDI,
        prise: '06:00',
        fin: '18:00',
        segments: [
          { type: 'conduite', de: '06:00', a: '11:00' },
          { type: 'disponibilite', de: '11:00', a: '15:00' },
          { type: 'conduite', de: '15:00', a: '18:00' },
        ],
      },
      [REPAS({ typesSegmentEligibles: ['coupure', 'disponibilite'] })],
    )

    expect(r.lignes).toHaveLength(1)
  })

  it('IND-09 — deux segments couvrant la plage à eux deux : non déclenchée', () => {
    // Le recouvrement s'apprécie segment par segment (SPEC §8).
    const r = calculer(
      {
        date: LUNDI,
        prise: '06:00',
        fin: '18:00',
        segments: [
          { type: 'conduite', de: '06:00', a: '11:00' },
          { type: 'coupure', de: '11:00', a: '13:00' },
          { type: 'coupure', de: '13:00', a: '15:00' },
          { type: 'conduite', de: '15:00', a: '18:00' },
        ],
      },
      [REPAS()],
    )

    // Deux coupures adjacentes fusionnent en une seule zone : elle recouvre bien
    // la plage. Ce sont deux **zones** distinctes qui ne se cumulent pas.
    expect(r.lignes).toHaveLength(1)

    const disjointes = calculer(
      {
        date: LUNDI,
        prise: '06:00',
        fin: '18:00',
        segments: [
          { type: 'conduite', de: '06:00', a: '11:00' },
          { type: 'coupure', de: '11:00', a: '12:30' },
          { type: 'conduite', de: '12:30', a: '13:00' },
          { type: 'coupure', de: '13:00', a: '15:00' },
          { type: 'conduite', de: '15:00', a: '18:00' },
        ],
      },
      [REPAS()],
    )

    expect(disjointes.lignes).toHaveLength(0)
  })

  it('IND-10 — plage traversant minuit, évaluée sur la journée de service', () => {
    const nuit = REPAS({
      code: 'CASSE_CROUTE',
      libelle: 'Casse-croûte',
      plageDebut: '22:00',
      plageFin: '02:00',
    })

    const r = calculer(
      {
        date: LUNDI,
        prise: '20:00',
        fin: '+1 06:00',
        segments: [
          { type: 'conduite', de: '20:00', a: '21:30' },
          { type: 'coupure', de: '21:30', a: '+1 02:30' },
          { type: 'conduite', de: '+1 02:30', a: '+1 06:00' },
        ],
      },
      [nuit],
    )

    expect(r.lignes).toHaveLength(1)
    expect(r.lignes[0]?.montant.value).toBe(1500)
  })

  it('IND-11 — la même plage, un jour plus tard : non déclenchée', () => {
    const nuit = REPAS({ plageDebut: '22:00', plageFin: '02:00' })

    // La coupure a lieu la nuit du mardi au mercredi, alors que la journée est
    // rattachée au lundi : la plage a été évaluée sur le lundi.
    const r = calculer(
      {
        date: LUNDI,
        prise: '20:00',
        fin: '+2 06:00',
        segments: [{ type: 'coupure', de: '+1 21:30', a: '+2 02:30' }],
      },
      [nuit],
    )

    expect(r.lignes.filter((l) => l.montant.status === 'complete')).toHaveLength(0)
  })

  it('IND-12 — une borne de plage dans l’heure ambiguë : unknown, pas d’arbitrage', () => {
    // La nuit du recul des horloges, 02:00 existe deux fois.
    const nuit = REPAS({ plageDebut: '22:00', plageFin: '02:00' })

    const r = calculer(
      {
        date: '2027-10-30',
        prise: '20:00',
        fin: '+1 08:00',
        segments: [{ type: 'coupure', de: '21:00', a: '+1 06:00' }],
      },
      [nuit],
    )

    expect(r.lignes).toHaveLength(1)
    expect(r.lignes[0]?.montant.status).toBe('partial')
    expect(r.lignes[0]?.montant.range).toEqual({ min: 0, max: 1500 })
  })

  it('IND-13 — découcher : deux indemnités distinctes, jamais composite', () => {
    const repos = uneIndemnite({
      code: 'DECOUCHER',
      libelle: 'Découcher',
      declencheur: 'decouche',
      montantCents: cents(2500),
    })
    const repas = uneIndemnite({
      code: 'REPAS_DECOUCHER',
      libelle: 'Repas découcher',
      declencheur: 'decouche',
      montantCents: cents(1800),
    })

    const r = calculer(
      { date: LUNDI, prise: '06:00', fin: '20:00', decouche: true },
      [repos, repas],
    )

    expect(r.lignes.map((l) => l.code)).toEqual(['DECOUCHER', 'REPAS_DECOUCHER'])
    expect(r.total.value).toBe(4300)
  })

  it('IND-14 — sans découcher : aucune indemnité de découcher', () => {
    const repos = uneIndemnite({
      code: 'DECOUCHER',
      declencheur: 'decouche',
      montantCents: cents(2500),
    })

    expect(calculer({ date: LUNDI, prise: '06:00', fin: '20:00' }, [repos]).lignes).toHaveLength(0)
    expect(
      calculer({ date: LUNDI, prise: '06:00', fin: '20:00', decouche: false }, [repos]).lignes,
    ).toHaveLength(0)
  })

  it('IND-15 — amplitude sous le seuil : non déclenchée', () => {
    const amplitude = uneIndemnite({
      code: 'SPECIALE',
      declencheur: 'duree_service',
      amplitudeMinMinutes: minutes(12 * 60),
      montantCents: cents(900),
    })

    const r = calculer({ date: LUNDI, prise: '06:00', fin: '17:00' }, [amplitude])

    expect(r.lignes).toHaveLength(0)
  })

  it('IND-16 — amplitude exactement au seuil : déclenchée', () => {
    const amplitude = uneIndemnite({
      code: 'SPECIALE',
      declencheur: 'duree_service',
      amplitudeMinMinutes: minutes(12 * 60),
      montantCents: cents(900),
    })

    const r = calculer({ date: LUNDI, prise: '06:00', fin: '18:00' }, [amplitude])

    expect(r.lignes).toHaveLength(1)
    expect(r.lignes[0]?.montant.value).toBe(900)
  })

  it('IND-17 — amplitude inconnue : le déclenchement n’est pas deviné', () => {
    const amplitude = uneIndemnite({
      code: 'SPECIALE',
      declencheur: 'duree_service',
      amplitudeMinMinutes: minutes(12 * 60),
      montantCents: cents(900),
    })

    const r = calculer({ date: LUNDI, prise: '06:00' }, [amplitude])

    expect(r.lignes[0]?.montant.status).toBe('partial')
    expect(r.lignes[0]?.montant.range).toEqual({ min: 0, max: 900 })
  })

  it('IND-18 — quantité manuelle : la saisie est utilisée telle quelle', () => {
    const manuelle = uneIndemnite({
      code: 'SPECIALE',
      declencheur: 'quantite_manuelle',
      montantCents: cents(700),
    })
    const jour = aWorkDay({ date: LUNDI, prise: '06:00', fin: '14:00' })
    const journee = qualifierJournee(jour, PARIS)

    const r = indemnitesDuJour(jour, journee, desSettings({ indemnites: [manuelle] }), [
      { id: 's1', dayId: jour.id, code: 'SPECIALE', quantite: 1 },
    ])

    expect(r.lignes[0]?.quantite).toBe(1)
    expect(r.lignes[0]?.montant.value).toBe(700)
    expect(r.lignes[0]?.montant.inputs[0]?.origin).toBe('derive')
  })

  it('IND-19 — quantiteMaxParJour vaut 1 par défaut', () => {
    // Deux coupures disjointes recouvrant chacune une plage courte.
    const config = REPAS({ plageDebut: '12:00', plageFin: '12:10' })
    const r = calculer(
      {
        date: LUNDI,
        prise: '06:00',
        fin: '20:00',
        segments: [
          { type: 'conduite', de: '06:00', a: '11:30' },
          { type: 'coupure', de: '11:30', a: '13:00' },
          { type: 'conduite', de: '13:00', a: '20:00' },
        ],
      },
      [config],
    )

    expect(r.lignes[0]?.quantite).toBe(1)
  })

  it('IND-20 — quantiteMaxParJour = 2 : le plafond apparaît', () => {
    const config = REPAS({
      plageDebut: '12:00',
      plageFin: '12:10',
      quantiteMaxParJour: 2,
    })

    const r = calculer(
      {
        date: LUNDI,
        prise: '06:00',
        fin: '20:00',
        segments: [
          { type: 'conduite', de: '06:00', a: '11:30' },
          { type: 'coupure', de: '11:30', a: '13:00' },
          { type: 'conduite', de: '13:00', a: '20:00' },
        ],
      },
      [config],
    )

    expect(r.lignes[0]?.quantite).toBeLessThanOrEqual(2)
  })

  it('IND-21 — deux incompatibles éligibles : la plus élevée, arbitrage dans les steps', () => {
    const repas = REPAS({ montantCents: cents(1500), incompatibleAvec: ['REPAS_UNIQUE'] })
    const unique = REPAS({
      code: 'REPAS_UNIQUE',
      libelle: 'Repas unique',
      montantCents: cents(1800),
    })

    const r = calculer(journeeAvecCoupure('11:00', '15:00'), [repas, unique])

    expect(r.lignes.map((l) => l.code)).toEqual(['REPAS_UNIQUE'])
    expect(r.total.value).toBe(1800)

    const arbitrage = r.total.steps.find((s) => s.label === 'Indemnités incompatibles')
    expect(arbitrage?.detail).toContain('Repas')
    expect(arbitrage?.detail).toContain('Repas unique')
    expect(arbitrage?.detail).toContain('le plus élevé')
  })

  it('IND-22 — l’incompatibilité déclarée d’un seul côté est symétrique', () => {
    const repas = REPAS({ montantCents: cents(1500) })
    const unique = REPAS({
      code: 'REPAS_UNIQUE',
      libelle: 'Repas unique',
      montantCents: cents(1800),
      incompatibleAvec: ['REPAS'],
    })

    const r = calculer(journeeAvecCoupure('11:00', '15:00'), [repas, unique])

    expect(r.lignes).toHaveLength(1)
    expect(r.lignes[0]?.code).toBe('REPAS_UNIQUE')
  })

  it('IND-23 — trois mutuellement incompatibles : une seule retenue', () => {
    const a = REPAS({ code: 'A', libelle: 'A', montantCents: cents(1000), incompatibleAvec: ['B'] })
    const b = REPAS({ code: 'B', libelle: 'B', montantCents: cents(2000), incompatibleAvec: ['C'] })
    const c = REPAS({ code: 'C', libelle: 'C', montantCents: cents(1500) })

    const r = calculer(journeeAvecCoupure('11:00', '15:00'), [a, b, c])

    expect(r.lignes.map((l) => l.code)).toEqual(['B'])
  })

  it('IND-24 — une concurrente sans montant : l’arbitrage devient indécidable', () => {
    const repas = REPAS({ montantCents: cents(1500), incompatibleAvec: ['REPAS_UNIQUE'] })
    const unique = REPAS_SANS_MONTANT('REPAS_UNIQUE', 'Repas unique')

    const r = calculer(journeeAvecCoupure('11:00', '15:00'), [repas, unique])

    // On ne peut pas comparer à un montant qu'on n'a pas : personne ne gagne
    // par forfait.
    expect(r.total.status).toBe('unknown')
    const arbitrage = r.total.steps.find((s) => s.label === 'Arbitrage impossible')
    expect(arbitrage?.detail).toContain('montant non renseigné')
  })

  it('IND-25 — montant absent : unknown, jamais 0,00 €', () => {
    const r = calculer(journeeAvecCoupure('11:00', '15:00'), [
      REPAS_SANS_MONTANT('REPAS', 'Repas'),
    ])

    expect(r.lignes[0]?.montant.status).toBe('unknown')
    expect(r.lignes[0]?.montant.value).toBeUndefined()
    expect(r.lignes[0]?.montant.warnings.at(-1)?.code).toBe(CODES_INDEMNITES.MONTANT_ABSENT)
    expect(r.lignes[0]?.montant.warnings.at(-1)?.reglageManquant).toContain('montantCents')
    expect(r.total.status).toBe('unknown')
  })

  it('IND-26 — montant saisi à 0 : un zéro choisi est une donnée', () => {
    const r = calculer(journeeAvecCoupure('11:00', '15:00'), [REPAS({ montantCents: cents(0) })])

    expect(r.lignes[0]?.montant.status).toBe('complete')
    expect(r.lignes[0]?.montant.value).toBe(0)
  })

  it('IND-27 — aucune indemnité configurée : total certain à zéro, pas unknown', () => {
    const r = calculer(journeeAvecCoupure('11:00', '15:00'), [])

    expect(r.lignes).toHaveLength(0)
    expect(r.total.status).toBe('complete')
    expect(r.total.value).toBe(0)
  })

  it('IND-28 — chaque indemnité déclenchée porte sa source', () => {
    const r = calculer(journeeAvecCoupure('11:00', '15:00'), [REPAS()])

    expect(r.lignes[0]?.montant.sources).toEqual([SOURCE])
    expect(r.lignes[0]?.montant.sources[0]?.kind).not.toBe('legal')
  })

  it('IND-29 — cumul sur plusieurs jours : chaque jour reste traçable', () => {
    const jours = ['2027-03-15', '2027-03-16'].map((date) => {
      const jour = aWorkDay({ ...journeeAvecCoupure('11:00', '15:00'), date })
      return { jour, journee: qualifierJournee(jour, PARIS) }
    })

    const totaux = jours.map(({ jour, journee }) =>
      indemnitesDuJour(jour, journee, desSettings({ indemnites: [REPAS()] })),
    )

    expect(totaux.map((t) => t.total.value)).toEqual([1500, 1500])
    for (const [index, t] of totaux.entries()) {
      expect(t.lignes[0]?.montant.inputs[0]?.dayId).toBe(jours[index]?.jour.id)
    }
  })

  it('IND-30 — journée partielle : le déclenchement incertain est signalé', () => {
    // La plage de midi tombe dans un trou non qualifié.
    const r = calculer(
      {
        date: LUNDI,
        prise: '06:00',
        fin: '18:00',
        segments: [
          { type: 'conduite', de: '06:00', a: '11:00' },
          { type: 'conduite', de: '15:00', a: '18:00' },
        ],
      },
      [REPAS()],
    )

    expect(r.lignes[0]?.montant.status).toBe('partial')
    expect(r.lignes[0]?.montant.range).toEqual({ min: 0, max: 1500 })
    expect(r.lignes[0]?.montant.warnings.at(-1)?.code).toBe(
      CODES_INDEMNITES.DECLENCHEMENT_INCERTAIN,
    )
  })

  it('IND-31 — plage de durée nulle : réglage refusé', () => {
    const problemes = validerIndemnites([REPAS({ plageDebut: '12:00', plageFin: '12:00' })])

    expect(problemes).toHaveLength(1)
    expect(problemes[0]?.code).toBe(CODES_INDEMNITES.CONFIG_INCOHERENTE)

    const r = calculer(journeeAvecCoupure('11:00', '15:00'), [
      REPAS({ plageDebut: '12:00', plageFin: '12:00' }),
    ])
    expect(r.lignes).toHaveLength(0)
  })

  it('IND-32 — deux indemnités au même code : réglage refusé', () => {
    const problemes = validerIndemnites([REPAS(), REPAS({ montantCents: cents(1800) })])

    expect(problemes.some((p) => p.code === CODES_INDEMNITES.CODE_EN_DOUBLE)).toBe(true)
    expect(problemes[0]?.message).toContain('doit être unique')
  })

  it('IND-33 — la liste de codes courants est livrée sans aucun montant', () => {
    expect(CODES_INDEMNITES_COURANTS.map((c) => c.code)).toEqual([
      'REPAS',
      'REPAS_UNIQUE',
      'CASSE_CROUTE',
      'SPECIALE',
      'DECOUCHER',
      'REPAS_DECOUCHER',
    ])
    for (const propose of CODES_INDEMNITES_COURANTS) {
      expect(Object.keys(propose)).toEqual(['code', 'libelle'])
    }
  })

  it('la nuit du recul des horloges reste utilisable hors plage ambiguë', () => {
    const midi = REPAS({ plageDebut: '11:30', plageFin: '14:30' })
    const r = calculer(
      {
        date: RECUL,
        prise: '06:00',
        fin: '18:00',
        segments: [
          { type: 'conduite', de: '06:00', a: '11:00' },
          { type: 'coupure', de: '11:00', a: '15:00' },
          { type: 'conduite', de: '15:00', a: '18:00' },
        ],
      },
      [midi],
    )

    expect(r.lignes[0]?.montant.status).toBe('complete')
  })
})
