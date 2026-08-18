import { minutes, type Minutes } from '../primitives/brands'
import {
  complete,
  partial,
  unknown,
  type CalculationInput,
  type CalculationResult,
  type CalculationStep,
  type CalculationWarning,
  type RuleSource,
} from '../primitives/calculationResult'
import { formatDuree } from '../primitives/format'
import { arrondirEnMinutes } from '../primitives/roundingPolicy'
import type { Settings } from '../domain'
import type { JourneeQualifiee } from '../qualify/types'
import { CODES as CODES_QUALIFICATION } from '../qualify/types'

/**
 * Étage « Temps rémunéré » (SPEC §3). **Seule notion qui alimente la paie en
 * v1** : `tempsConduite` et `amplitude` restent des informations brutes.
 *
 * Composition :
 * - conduite et autre travail comptent en entier ;
 * - la disponibilité compte pour la fraction réglée — **absente, elle rend le
 *   résultat `unknown`**, jamais 0 ni 100 % ;
 * - la coupure ne compte que si des paliers sont réglés.
 */

export const CODES_PAIE = {
  DISPONIBILITE_NON_REGLEE: 'fraction_disponibilite_absente',
  COUPURE_NON_REGLEE: 'coupures_non_reglees',
  ZONE_NON_QUALIFIEE: CODES_QUALIFICATION.ZONE_NON_QUALIFIEE,
  JOURNEE_INCALCULABLE: 'journee_incalculable',
  MODE_HS_ABSENT: 'mode_decompte_hs_absent',
  DUREE_REFERENCE_ABSENTE: 'duree_reference_absente',
  DEBUT_SEMAINE_ABSENT: 'debut_semaine_absent',
  ANCRAGE_ABSENT: 'periode_reference_debut_absent',
  SEMAINES_REFERENCE_ABSENTES: 'periode_reference_semaines_absent',
  TRANCHES_ABSENTES: 'tranches_hs_absentes',
  TRANCHES_INCOHERENTES: 'tranches_hs_incoherentes',
  TAUX_ABSENT: 'taux_horaire_absent',
  PERIODE_NON_REGLEE: 'pay_period_config_absent',
  FORFAIT_JOURS: 'forfait_jours',
  ABSENCE_NON_VALORISEE: 'absence_non_valorisee',
} as const

function sourceReglage(libelle: string): RuleSource {
  // Le réglage vient de la convention ou de la fiche de paie, saisi par
  // l'utilisateur : la source dit d'où sort le chiffre, sans prétendre à un
  // texte légal que l'app n'a pas lu.
  return { kind: 'convention', libelle, saisiPar: 'utilisateur' }
}

export function tempsRemunere(
  journee: JourneeQualifiee,
  settings: Settings,
): CalculationResult<Minutes> {
  const inputs: CalculationInput[] = []
  const steps: CalculationStep[] = []
  const warnings: CalculationWarning[] = []
  const sources: RuleSource[] = []

  const conduite = valeurCertaine(journee, 'conduite')
  const autreTravail = valeurCertaine(journee, 'autre_travail')
  const disponibilite = valeurCertaine(journee, 'disponibilite')
  const coupure = valeurCertaine(journee, 'coupure')

  // Les quatre types sont inconnus ensemble ou connus ensemble : une journée
  // vide n'a rien à borner. Les tester tous d'un coup évite d'écrire `?? 0`,
  // qui transformerait une ignorance en zéro (CLAUDE.md §6).
  if (
    conduite === undefined ||
    autreTravail === undefined ||
    disponibilite === undefined ||
    coupure === undefined
  ) {
    return unknown(
      {
        code: CODES_PAIE.JOURNEE_INCALCULABLE,
        message:
          journee.warnings.at(0)?.message ??
          "Cette journée ne contient pas assez d'informations pour calculer un temps rémunéré.",
        dayId: journee.dayId,
      },
      { warnings: journee.warnings },
    )
  }

  let certain = conduite + autreTravail
  steps.push({
    label: 'Conduite',
    detail: formatDuree(minutes(conduite)).sexagesimal,
    value: conduite,
  })
  if (autreTravail > 0) {
    steps.push({
      label: 'Autre travail',
      detail: formatDuree(minutes(autreTravail)).sexagesimal,
      value: autreTravail,
    })
  }
  inputs.push({
    label: 'Temps de conduite',
    value: conduite,
    origin: 'derive',
    dayId: journee.dayId,
  })

  // ————— Disponibilité —————
  const fraction = settings.fractionDisponibiliteRemuneree
  if (disponibilite > 0) {
    if (fraction === undefined) {
      return unknown(
        {
          code: CODES_PAIE.DISPONIBILITE_NON_REGLEE,
          message:
            "Cette journée contient de la disponibilité, et la part rémunérée de la disponibilité n'est pas renseignée. Sans elle, le temps rémunéré ne peut pas être calculé.",
          dayId: journee.dayId,
          reglageManquant: 'fractionDisponibiliteRemuneree',
        },
        { inputs, steps, warnings: journee.warnings },
      )
    }
    const retenu = arrondirEnMinutes(disponibilite * fraction)
    certain += retenu
    steps.push({
      label: 'Disponibilité retenue',
      detail: `${formatDuree(minutes(disponibilite)).sexagesimal} × ${String(fraction)}`,
      value: retenu,
    })
    inputs.push({
      label: 'Part rémunérée de la disponibilité',
      value: fraction,
      origin: 'reglage',
      dayId: journee.dayId,
    })
    sources.push(sourceReglage('Part rémunérée de la disponibilité'))
  }

  // ————— Coupures —————
  const paliers = settings.coupuresRemunerees
  if (coupure > 0) {
    if (paliers === undefined || paliers.length === 0) {
      // La coupure n'est pas rémunérée par défaut, mais on le dit : le réglage
      // vide est nommé, il ne disparaît pas dans un total silencieux.
      warnings.push({
        code: CODES_PAIE.COUPURE_NON_REGLEE,
        message: `Cette journée contient ${formatDuree(minutes(coupure)).sexagesimal} de coupure, et aucun palier de rémunération des coupures n'est réglé : elle n'est pas comptée.`,
        dayId: journee.dayId,
        reglageManquant: 'coupuresRemunerees',
      })
    } else {
      const retenu = coupureRemuneree(minutes(coupure), paliers, steps)
      certain += retenu
      inputs.push({
        label: 'Paliers de coupure rémunérée',
        value: paliers.length,
        origin: 'reglage',
        dayId: journee.dayId,
      })
      sources.push(sourceReglage('Paliers de rémunération des coupures'))
    }
  }

  const preuves = { inputs, steps, warnings: [...journee.warnings, ...warnings], sources }

  if (journee.tempsIndetermine === 0) {
    return complete(minutes(certain), preuves)
  }

  // Une zone non qualifiée peut être du travail comme une coupure non
  // rémunérée : les bornes sont « elle ne compte pas » et « elle compte en
  // entier ». Aucun milieu (SPEC §6).
  return partial<Minutes>(
    { min: minutes(certain), max: minutes(certain + journee.tempsIndetermine) },
    preuves,
  )
}

function valeurCertaine(
  journee: JourneeQualifiee,
  type: 'conduite' | 'autre_travail' | 'disponibilite' | 'coupure',
): number | undefined {
  const resultat = journee.dureeParType[type]
  if (resultat.status === 'unknown') {
    return undefined
  }
  // La borne basse d'un `partial` est le temps **certain** de ce type ; ce qui
  // reste est porté par `tempsIndetermine`.
  return resultat.status === 'complete' ? resultat.value : resultat.range.min
}

/**
 * Paliers cumulatifs : chaque palier rémunère la part de coupure au-delà de son
 * seuil, à la fraction indiquée. Les paliers sont appliqués du plus haut seuil
 * au plus bas pour qu'une minute ne soit comptée qu'une fois.
 */
function coupureRemuneree(
  dureeCoupure: Minutes,
  paliers: readonly { auDelaDeMinutes: Minutes; fraction: number }[],
  steps: CalculationStep[],
): number {
  const tries = [...paliers].sort((a, b) => b.auDelaDeMinutes - a.auDelaDeMinutes)
  let restant: number = dureeCoupure
  let total = 0

  for (const palier of tries) {
    if (restant <= palier.auDelaDeMinutes) {
      continue
    }
    const tranche = restant - palier.auDelaDeMinutes
    const retenu = arrondirEnMinutes(tranche * palier.fraction)
    total += retenu
    steps.push({
      label: `Coupure au-delà de ${formatDuree(palier.auDelaDeMinutes).sexagesimal}`,
      detail: `${formatDuree(minutes(tranche)).sexagesimal} × ${String(palier.fraction)}`,
      value: retenu,
    })
    restant = palier.auDelaDeMinutes
  }

  return total
}
