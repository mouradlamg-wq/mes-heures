import type {
  Absence,
  DayTemplate,
  ISODate,
  PayCheck,
  QualificationManuelle,
  SaisieIndemnite,
  Settings,
  WorkDay,
} from '../engine'
import { BaseMesHeures, CLES_META, ID_SETTINGS, type SettingsRow } from './database'

/**
 * Accès aux données. La couche au-dessus (UI) ne parle jamais à Dexie
 * directement : c'est ici qu'on garantit qu'une journée supprimée emporte ses
 * qualifications, et qu'aucun résultat calculé n'est écrit.
 */
export class Repository {
  constructor(private readonly base: BaseMesHeures) {}

  // ————— Réglages —————

  async lireSettings(): Promise<Settings | undefined> {
    const ligne = await this.base.settings.get(ID_SETTINGS)
    if (ligne === undefined) {
      return undefined
    }
    const { id: _id, ...settings } = ligne
    return settings
  }

  async ecrireSettings(settings: Settings): Promise<void> {
    await this.base.settings.put({ ...settings, id: ID_SETTINGS } satisfies SettingsRow)
  }

  // ————— Journées —————

  async lireJournee(id: string): Promise<WorkDay | undefined> {
    return this.base.workDays.get(id)
  }

  async lireJourneeDuJour(date: ISODate): Promise<WorkDay | undefined> {
    return this.base.workDays.where('dateRattachement').equals(date).first()
  }

  async lireJourneesEntre(debut: ISODate, fin: ISODate): Promise<WorkDay[]> {
    return this.base.workDays
      .where('dateRattachement')
      .between(debut, fin, true, true)
      .sortBy('dateRattachement')
  }

  async enregistrerJournee(jour: WorkDay): Promise<void> {
    await this.base.workDays.put(jour)
  }

  /** Supprime la journée **et** ce qui s'y rattache : aucun orphelin. */
  async supprimerJournee(id: string): Promise<void> {
    await this.base.transaction(
      'rw',
      this.base.workDays,
      this.base.qualifications,
      this.base.saisiesIndemnites,
      async () => {
        await this.base.workDays.delete(id)
        await this.base.qualifications.where('dayId').equals(id).delete()
        await this.base.saisiesIndemnites.where('dayId').equals(id).delete()
      },
    )
  }

  // ————— Absences —————

  async lireAbsencesEntre(debut: ISODate, fin: ISODate): Promise<Absence[]> {
    // Une absence chevauchant la fenêtre compte, même si elle commence avant.
    const toutes = await this.base.absences.toArray()
    return toutes.filter((a) => a.fin >= debut && a.debut <= fin)
  }

  async enregistrerAbsence(absence: Absence): Promise<void> {
    await this.base.absences.put(absence)
  }

  async supprimerAbsence(id: string): Promise<void> {
    await this.base.absences.delete(id)
  }

  // ————— Qualifications et saisies —————

  async lireQualifications(dayIds: readonly string[]): Promise<QualificationManuelle[]> {
    return this.base.qualifications.where('dayId').anyOf([...dayIds]).toArray()
  }

  async enregistrerQualification(qualification: QualificationManuelle): Promise<void> {
    await this.base.qualifications.put(qualification)
  }

  async lireSaisiesIndemnites(dayIds: readonly string[]): Promise<SaisieIndemnite[]> {
    return this.base.saisiesIndemnites.where('dayId').anyOf([...dayIds]).toArray()
  }

  async enregistrerSaisieIndemnite(saisie: SaisieIndemnite): Promise<void> {
    await this.base.saisiesIndemnites.put(saisie)
  }

  // ————— Modèles et fiches de paie —————

  async lireTemplates(): Promise<DayTemplate[]> {
    return this.base.templates.toArray()
  }

  async enregistrerTemplate(template: DayTemplate): Promise<void> {
    await this.base.templates.put(template)
  }

  async lirePayCheck(payPeriodId: string): Promise<PayCheck | undefined> {
    return this.base.payChecks.where('payPeriodId').equals(payPeriodId).first()
  }

  async enregistrerPayCheck(payCheck: PayCheck): Promise<void> {
    await this.base.payChecks.put(payCheck)
  }

  // ————— Sauvegarde —————

  async dernierExport(): Promise<string | undefined> {
    return (await this.base.meta.get(CLES_META.DERNIER_EXPORT))?.valeur
  }

  async noterExport(instant: string): Promise<void> {
    await this.base.meta.put({ cle: CLES_META.DERNIER_EXPORT, valeur: instant })
  }

  async noterStockagePersistant(accorde: boolean): Promise<void> {
    await this.base.meta.put({
      cle: CLES_META.STOCKAGE_PERSISTANT,
      valeur: accorde ? 'accorde' : 'refuse',
    })
  }

  async stockagePersistant(): Promise<'accorde' | 'refuse' | undefined> {
    const ligne = await this.base.meta.get(CLES_META.STOCKAGE_PERSISTANT)
    if (ligne?.valeur === 'accorde') {
      return 'accorde'
    }
    return ligne?.valeur === 'refuse' ? 'refuse' : undefined
  }
}
