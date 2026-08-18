import { describe, expect, it } from 'vitest'
import { bornesDe } from '../../src/ui/ecrans/bornes'
import { desSettings } from '../fixtures/builders'

/**
 * Les bornes de l'écran « Ma semaine / Ma période » viennent des **réglages**.
 * Sans réglage, l'écran refuse et renvoie au champ à remplir : il ne se rabat ni
 * sur le mois civil, ni sur le lundi (SPEC §7).
 */
describe('SEM — bornes de l’intervalle affiché', () => {
  it('SEM-12 — les bornes de période viennent des réglages, jamais d’un mois déduit', () => {
    const reglee = bornesDe('periode', '2027-03-16', desSettings({ payPeriodConfig: { jourDebut: 26 } }))

    expect(reglee.status).toBe('ok')
    if (reglee.status !== 'ok') return
    expect(reglee.debut).toBe('2027-02-26')
    expect(reglee.fin).toBe('2027-03-25')
    expect(reglee.libelle).toContain('→')
    // Surtout pas le mois civil.
    expect(reglee.debut).not.toBe('2027-03-01')
  })

  it('SEM-12 — sans réglage de période, l’écran refuse et nomme le champ', () => {
    const sansReglage = bornesDe('periode', '2027-03-16', desSettings())

    expect(sansReglage.status).toBe('inconnu')
    if (sansReglage.status !== 'inconnu') return
    expect(sansReglage.reglage).toBe('payPeriodConfig')
    expect(sansReglage.raison).toContain('du 26 au 25')
  })

  it('SEM-13 — les bornes de semaine suivent debutSemaine, pas le lundi', () => {
    // 2027-03-18 est un jeudi : avec une semaine ouverte le jeudi, elle commence
    // ce jour-là et non le lundi précédent.
    const auJeudi = bornesDe('semaine', '2027-03-18', desSettings({ debutSemaine: 4 }))
    expect(auJeudi.status).toBe('ok')
    if (auJeudi.status !== 'ok') return
    expect(auJeudi.debut).toBe('2027-03-18')
    expect(auJeudi.fin).toBe('2027-03-24')

    const auLundi = bornesDe('semaine', '2027-03-18', desSettings({ debutSemaine: 1 }))
    if (auLundi.status !== 'ok') return
    expect(auLundi.debut).toBe('2027-03-15')
    expect(auLundi.fin).toBe('2027-03-21')
  })

  it('SEM-13 — sans premier jour de semaine, l’écran refuse : le lundi n’est pas supposé', () => {
    const sansReglage = bornesDe('semaine', '2027-03-18', desSettings())

    expect(sansReglage.status).toBe('inconnu')
    if (sansReglage.status !== 'inconnu') return
    expect(sansReglage.reglage).toBe('debutSemaine')
    expect(sansReglage.raison).toContain('régime supplétif')
  })

  it('une semaine fait toujours sept jours, quel que soit son premier jour', () => {
    for (const premier of [1, 2, 3, 4, 5, 6, 7] as const) {
      const bornes = bornesDe('semaine', '2027-03-18', desSettings({ debutSemaine: premier }))
      expect(bornes.status).toBe('ok')
      if (bornes.status !== 'ok') continue
      const jours =
        (Date.parse(`${bornes.fin}T00:00:00Z`) - Date.parse(`${bornes.debut}T00:00:00Z`)) /
        86_400_000
      expect(jours, `debutSemaine ${String(premier)}`).toBe(6)
    }
  })
})
