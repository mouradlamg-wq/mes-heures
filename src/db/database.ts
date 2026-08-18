import Dexie, { type EntityTable } from 'dexie'
import type {
  Absence,
  DayTemplate,
  PayCheck,
  QualificationManuelle,
  SaisieIndemnite,
  Settings,
  WorkDay,
} from '../engine'

/**
 * Dexie / IndexedDB, aucun backend, aucun compte (SPEC §12).
 *
 * **Aucun résultat de calcul n'est persisté.** On ne trouve ici que de la saisie
 * et des réglages : le temps rémunéré, les heures sup et les montants sont
 * recalculés à chaque affichage, et la complétude d'une journée est dérivée.
 * C'est ce qui garantit qu'une correction de règle corrige aussi le passé.
 */

/** Les réglages tiennent en une seule ligne, d'identifiant fixe. */
export const ID_SETTINGS = 'settings'

export type SettingsRow = Settings & { readonly id: typeof ID_SETTINGS }

/** Métadonnées locales : jamais exportées, jamais calculées. */
export type MetaRow = {
  readonly cle: string
  readonly valeur: string
}

export const CLES_META = {
  DERNIER_EXPORT: 'dernierExport',
  STOCKAGE_PERSISTANT: 'stockagePersistant',
  MODE_SAISIE_HEURE: 'modeSaisieHeure',
} as const

/**
 * Comment l'utilisateur préfère taper une heure.
 *
 * C'est une préférence **de cet appareil**, pas une règle métier : elle vit dans
 * `meta` et non dans `Settings`, donc elle ne part pas dans l'export. Le clavier
 * d'un téléphone n'est pas celui d'une tablette.
 */
export type ModeSaisieHeure = 'clavier' | 'selecteur'

export const MODE_SAISIE_PAR_DEFAUT: ModeSaisieHeure = 'clavier'

export class BaseMesHeures extends Dexie {
  declare settings: EntityTable<SettingsRow, 'id'>
  declare workDays: EntityTable<WorkDay, 'id'>
  declare absences: EntityTable<Absence, 'id'>
  declare templates: EntityTable<DayTemplate, 'id'>
  declare payChecks: EntityTable<PayCheck, 'id'>
  declare qualifications: EntityTable<QualificationManuelle, 'id'>
  declare saisiesIndemnites: EntityTable<SaisieIndemnite, 'id'>
  declare meta: EntityTable<MetaRow, 'cle'>

  constructor(nom = 'mes-heures') {
    super(nom)

    // Version 1 — schéma initial. Toute évolution ajoute une version, jamais ne
    // modifie celle-ci : c'est ce qui rend la migration testable.
    this.version(1).stores({
      settings: 'id',
      // `dateRattachement` est unique : une journée de service par jour.
      workDays: 'id, &dateRattachement',
      absences: 'id, debut, fin, type',
      templates: 'id',
      payChecks: 'id, payPeriodId',
      qualifications: 'id, dayId',
      saisiesIndemnites: 'id, dayId, code',
      meta: 'cle',
    })
  }
}

/** Version du schéma Dexie, à faire évoluer avec `this.version(n)`. */
export const VERSION_SCHEMA = 1

/**
 * Réglages d'une base neuve. **Seul `timeZoneReference` est renseigné**
 * (SPEC §9) : c'est le seul endroit de toute l'app où `'Europe/Paris'` a le
 * droit d'être écrit en dur (CLAUDE.md §6). Tout le reste est absent, donc
 * `unknown` à l'écran, avec la cause et le lien vers le réglage à remplir.
 */
export function settingsParDefaut(): Settings {
  return {
    timeZoneReference: 'Europe/Paris',
    indemnites: [],
  }
}
