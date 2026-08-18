import { describe, expect, it } from 'vitest'
import {
  annoter,
  bornes,
  cents,
  complete,
  contient,
  formatSource,
  minutes,
  partial,
  personnaliser,
  sommer,
  transformer,
  unknown,
  type CalculationResult,
  type Cents,
  type Minutes,
  type RuleSource,
} from '../../src/engine'

const sourceConvention: RuleSource = {
  kind: 'convention',
  libelle: 'Accord d’entreprise, article 4',
  saisiPar: 'utilisateur',
}

const sourceLegale: RuleSource = {
  kind: 'legal',
  texte: 'Code du travail',
  article: 'L3121-28',
}

describe('PRV — CalculationResult, steps, sources', () => {
  it('PRV-01 — complete porte une valeur et aucun range', () => {
    const r = complete(minutes(480))
    expect(r.status).toBe('complete')
    expect(r.value).toBe(480)
    expect(r.range).toBeUndefined()
  })

  it('PRV-02 — partial porte un range et aucune valeur', () => {
    const r = partial({ min: minutes(360), max: minutes(600) })
    expect(r.status).toBe('partial')
    expect(r.range).toEqual({ min: 360, max: 600 })
    expect(r.value).toBeUndefined()
  })

  it('PRV-03 — unknown ne porte ni valeur ni range, et dit pourquoi en français', () => {
    const r = unknown<Minutes>({
      code: 'taux_absent',
      message: "Le taux horaire n'est pas renseigné.",
      reglageManquant: 'tauxHoraireBaseCents',
    })
    expect(r.status).toBe('unknown')
    expect(r.value).toBeUndefined()
    expect(r.range).toBeUndefined()
    expect(r.warnings.at(-1)?.message).toBe("Le taux horaire n'est pas renseigné.")
    expect(r.warnings.at(-1)?.reglageManquant).toBe('tauxHoraireBaseCents')
  })

  it('PRV-04 — un intervalle inversé est un bug, pas un cas métier', () => {
    expect(() => partial({ min: minutes(600), max: minutes(360) })).toThrow(RangeError)
  })

  it('PRV-05 — un intervalle de largeur nulle est normalisé en complete', () => {
    const r = partial({ min: minutes(480), max: minutes(480) })
    expect(r.status).toBe('complete')
    expect(r.value).toBe(480)
  })

  it('PRV-08 — une amplitude brute ne porte aucune source', () => {
    // fin − début : pas de règle derrière, donc pas de RuleSource inventée.
    const amplitude = complete(minutes(480), {
      inputs: [
        { label: 'Prise de service', value: '06:00', origin: 'saisie_utilisateur' },
        { label: 'Fin de service', value: '14:00', origin: 'saisie_utilisateur' },
      ],
    })
    expect(amplitude.sources).toHaveLength(0)
  })

  it('PRV-10 — une valeur modifiée par l’utilisateur devient personnalise', () => {
    const source = personnaliser(sourceLegale)
    expect(source.kind).toBe('personnalise')
    expect(source).toEqual({ kind: 'personnalise', base: sourceLegale })
  })

  it('PRV-11 — une source personnalise n’est jamais présentée comme légale', () => {
    const rendu = formatSource(personnaliser(sourceLegale))
    expect(rendu).toContain('personnalisé')
    expect(formatSource(sourceLegale)).toBe('Code du travail, L3121-28')
    expect(formatSource(sourceConvention)).toContain('saisi par toi')
  })

  it('PRV-12 — les steps sont ordonnés et stables', () => {
    const construire = (): CalculationResult<Minutes> =>
      complete(minutes(60), {
        steps: [
          { label: 'Conduite', detail: '06:00 → 07:00', value: 60 },
          { label: 'Coupure', detail: '07:00 → 07:30', value: 0 },
        ],
      })
    expect(construire().steps.map((s) => s.label)).toEqual(['Conduite', 'Coupure'])
    expect(construire().steps).toEqual(construire().steps)
  })

  it('PRV-13 — les inputs d’un total permettent de remonter aux dayId', () => {
    const jour1 = complete(minutes(480), {
      inputs: [{ label: 'Temps rémunéré', value: 480, origin: 'derive', dayId: 'j1' }],
    })
    const jour2 = complete(minutes(420), {
      inputs: [{ label: 'Temps rémunéré', value: 420, origin: 'derive', dayId: 'j2' }],
    })

    const total = sommer([jour1, jour2], (v) => minutes(v))
    expect(total.value).toBe(900)
    expect(total.inputs.map((i) => i.dayId)).toEqual(['j1', 'j2'])
  })

  it('PRV-14 — l’origine d’un input distingue saisie, réglage et dérivé', () => {
    const r = complete(minutes(60), {
      inputs: [
        { label: 'Prise de service', value: '06:00', origin: 'saisie_utilisateur' },
        { label: 'Fraction de disponibilité rémunérée', value: 0.5, origin: 'reglage' },
        { label: 'Amplitude', value: 480, origin: 'derive' },
      ],
    })
    const saisie = r.inputs.find((i) => i.label === 'Prise de service')
    expect(saisie?.origin).toBe('saisie_utilisateur')
    expect(saisie?.origin).not.toBe('reglage')
  })

  it('PRV-15 — un partial se propage à travers une transformation', () => {
    const duree = partial<Minutes>({ min: minutes(360), max: minutes(600) })
    const montant = transformer<Minutes, Cents>(duree, (m) => cents(m * 10))
    expect(montant.status).toBe('partial')
    expect(montant.range).toEqual({ min: 3600, max: 6000 })
  })

  it('PRV-16 — un unknown se propage, et sa cause reste lisible en fin de chaîne', () => {
    const duree = unknown<Minutes>({
      code: 'disponibilite_non_reglee',
      message: 'La part rémunérée de la disponibilité n’est pas renseignée.',
    })
    const montant = transformer<Minutes, Cents>(duree, (m) => cents(m * 10))
    expect(montant.status).toBe('unknown')
    expect(montant.warnings.at(-1)?.message).toContain('disponibilité')
  })

  it('PRV-17 — complete + complete = complete, preuves fusionnées sans doublon', () => {
    const a = complete(minutes(300), { sources: [sourceConvention] })
    const b = complete(minutes(180), { sources: [sourceConvention, sourceLegale] })
    const total = sommer([a, b], (v) => minutes(v))

    expect(total.status).toBe('complete')
    expect(total.value).toBe(480)
    expect(total.sources).toHaveLength(2)
  })

  it('PRV-18 — complete + partial = partial, bornes additionnées', () => {
    const a = complete(minutes(300))
    const b = partial<Minutes>({ min: minutes(0), max: minutes(240) })
    const total = sommer([a, b], (v) => minutes(v))

    expect(total.status).toBe('partial')
    expect(total.range).toEqual({ min: 300, max: 540 })
  })

  it('PRV-19 — partial + unknown = unknown : on ne borne pas ce qu’on ignore', () => {
    const a = partial<Minutes>({ min: minutes(300), max: minutes(400) })
    const b = unknown<Minutes>({ code: 'reglage_absent', message: 'Réglage absent.' })
    const total = sommer([a, b], (v) => minutes(v))

    expect(total.status).toBe('unknown')
    expect(total.range).toBeUndefined()
  })

  it('PRV-20 — un cas non calculable retourne unknown, il ne lève pas', () => {
    expect(() =>
      unknown<Minutes>({ code: 'x', message: 'Réglage absent.' }),
    ).not.toThrow()
  })

  it('PRV-21 — les libellés de steps sont lisibles par un non-technicien', () => {
    const r = complete(minutes(60), {
      steps: [{ label: 'Temps de conduite', detail: '06:00 → 07:00', value: 60 }],
    })
    for (const step of r.steps) {
      expect(step.label).not.toMatch(/^[a-z]+[A-Z]/) // pas de camelCase nu
      expect(step.label).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/) // pas d'UUID
    }
  })

  it('bornes et contient — un écart peut tomber dans la zone d’incertitude', () => {
    const r = partial<Minutes>({ min: minutes(360), max: minutes(600) })
    expect(bornes(r)).toEqual({ min: 360, max: 600 })
    expect(contient(r, minutes(500))).toBe(true)
    expect(contient(r, minutes(700))).toBe(false)

    const inconnu = unknown<Minutes>({ code: 'x', message: 'Réglage absent.' })
    expect(bornes(inconnu)).toBeUndefined()
    expect(contient(inconnu, minutes(500))).toBe(false)
  })

  it('annoter — ajoute des preuves sans toucher à la valeur ni au statut', () => {
    const r = complete(minutes(480), { steps: [{ label: 'Base', detail: '', value: 480 }] })
    const annote = annoter(r, { sources: [sourceConvention] })

    expect(annote.status).toBe('complete')
    expect(annote.value).toBe(480)
    expect(annote.steps).toHaveLength(1)
    expect(annote.sources).toEqual([sourceConvention])
  })

  it('sommer sur une liste vide vaut zéro, pas unknown', () => {
    const total = sommer<Minutes>([], (v) => minutes(v))
    expect(total.status).toBe('complete')
    expect(total.value).toBe(0)
  })
})
