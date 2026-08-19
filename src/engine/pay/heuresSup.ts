import {
  cents,
  minutes,
  ZERO_CENTS,
  ZERO_MINUTES,
  type Cents,
  type Minutes,
} from '../primitives/brands'
import {
  bornes,
  complete,
  partial,
  unknown,
  type CalculationResult,
  type CalculationStep,
  type CalculationWarning,
  type RuleSource,
} from '../primitives/calculationResult'
import { formatDuree } from '../primitives/format'
import { arrondirEnMinutes, valoriserMajore } from '../primitives/roundingPolicy'
import { assertNever } from '../primitives/assertNever'
import type {
  PayPeriod,
  RattachementSemaineChevauchante,
  Settings,
  TrancheHS,
} from '../domain'
import type { JourneeQualifiee } from '../qualify/types'
import type { ISODate } from '../time/types'
import { joursEntreDates } from '../time/instant'
import {
  blocsDeReference,
  chevaucheDeuxPeriodes,
  joursDansPeriode,
  semainesCouvrant,
  type Semaine,
} from './periodes'
import { CODES_PAIE, tempsRemunere } from './tempsRemunere'

/**
 * Heures supplémentaires (SPEC §7, §13 « Paie »).
 *
 * Trois modes de décompte, une durée de référence, des tranches de majoration —
 * **aucun n'a de valeur par défaut**. Un réglage manquant produit un `unknown`
 * nommant le réglage, jamais un 35 h en dur.
 */

export type HypotheseHS = {
  /** Phrase lisible : « si les semaines à cheval tombent sur la période de fin ». */
  readonly libelle: string
  readonly reglageSuppose: {
    readonly champ: 'rattachementSemaineChevauchante'
    readonly valeur: RattachementSemaineChevauchante
  }
  readonly duree: CalculationResult<Minutes>
  readonly valorisation: CalculationResult<Cents>
}

export type ResultatHeuresSup = {
  readonly duree: CalculationResult<Minutes>
  readonly valorisation: CalculationResult<Cents>
  /**
   * Renseigné **uniquement** quand une semaine est à cheval sur deux périodes et
   * que le réglage de rattachement n'est pas saisi. L'écran affiche les deux et
   * propose d'enregistrer le choix : c'est le seul cas où l'ignorance du moteur
   * devient une fonctionnalité, parce que le conducteur détient l'information.
   */
  readonly hypotheses?: readonly HypotheseHS[]
  readonly mention?: string
}

export const MENTION_HYPOTHESES = "selon la règle appliquée par ton employeur"

const SOURCE_HS: RuleSource = {
  kind: 'convention',
  libelle: 'Décompte des heures supplémentaires de ton entreprise',
  saisiPar: 'utilisateur',
}

export function heuresSup(
  journees: readonly JourneeQualifiee[],
  settings: Settings,
  periode: PayPeriod,
): ResultatHeuresSup {
  if (settings.estForfaitJours === true) {
    const raison: CalculationStep = {
      label: 'Forfait jours',
      detail: "Au forfait jours, le décompte ne se fait pas en heures : aucune heure supplémentaire n'est produite.",
      value: 0,
    }
    const duree = complete(ZERO_MINUTES, { steps: [raison], sources: [SOURCE_HS] })
    return { duree, valorisation: complete(ZERO_CENTS, { steps: [raison], sources: [SOURCE_HS] }) }
  }

  const mode = settings.modeDecompteHS
  if (mode === undefined) {
    return incalculable({
      code: CODES_PAIE.MODE_HS_ABSENT,
      message:
        "Le mode de décompte des heures supplémentaires n'est pas réglé : hebdomadaire, mensuel ou sur une période de référence ?",
      reglageManquant: 'modeDecompteHS',
    })
  }

  const reference = settings.dureeReferenceMinutes
  if (reference === undefined) {
    return incalculable({
      code: CODES_PAIE.DUREE_REFERENCE_ABSENTE,
      message:
        "La durée de référence n'est pas réglée. Sans elle, l'app ne peut pas dire à partir de quand tes heures deviennent supplémentaires.",
      reglageManquant: 'dureeReferenceMinutes',
    })
  }

  switch (mode) {
    case 'mensuel':
      return surLaPeriodeEntiere(journees, settings, periode, reference)
    case 'hebdomadaire':
      return surDesBlocs(journees, settings, periode, reference, 'hebdomadaire')
    case 'periode_reference':
      return surDesBlocs(journees, settings, periode, reference, 'periode_reference')
    default:
      return assertNever(mode, 'modeDecompteHS')
  }
}

function incalculable(raison: CalculationWarning): ResultatHeuresSup {
  return {
    duree: unknown<Minutes>(raison),
    valorisation: unknown<Cents>(raison),
  }
}

// ————————————————————————————————————————————————————————————————
// Mode mensuel : un seuil, appliqué une fois sur la période
// ————————————————————————————————————————————————————————————————

function surLaPeriodeEntiere(
  journees: readonly JourneeQualifiee[],
  settings: Settings,
  periode: PayPeriod,
  reference: Minutes,
): ResultatHeuresSup {
  const dansLaPeriode = journees.filter((j) => estDans(j.dateRattachement, periode))
  const total = totalTempsRemunere(dansLaPeriode, settings)
  const duree = excedent(total, reference, `Période ${periode.label}`)
  return { duree, valorisation: valoriser(duree, settings) }
}

// ————————————————————————————————————————————————————————————————
// Modes par blocs : semaine, ou période de référence
// ————————————————————————————————————————————————————————————————

function surDesBlocs(
  journees: readonly JourneeQualifiee[],
  settings: Settings,
  periode: PayPeriod,
  reference: Minutes,
  mode: 'hebdomadaire' | 'periode_reference',
): ResultatHeuresSup {
  let blocs: readonly Semaine[]

  if (mode === 'hebdomadaire') {
    const debutSemaine = settings.debutSemaine
    if (debutSemaine === undefined) {
      return incalculable({
        code: CODES_PAIE.DEBUT_SEMAINE_ABSENT,
        message:
          "Le premier jour de la semaine n'est pas réglé. Le lundi est le régime supplétif, mais un accord peut en décider autrement : l'app ne le suppose pas.",
        reglageManquant: 'debutSemaine',
      })
    }
    blocs = semainesCouvrant(periode, debutSemaine)
  } else {
    const nombreSemaines = settings.periodeReferenceSemaines
    if (nombreSemaines === undefined) {
      return incalculable({
        code: CODES_PAIE.SEMAINES_REFERENCE_ABSENTES,
        message: "Le nombre de semaines de la période de référence n'est pas réglé.",
        reglageManquant: 'periodeReferenceSemaines',
      })
    }
    const ancrage = settings.periodeReferenceDebut
    if (ancrage === undefined) {
      return incalculable({
        code: CODES_PAIE.ANCRAGE_ABSENT,
        message:
          "La date de début de la période de référence n'est pas réglée. Sans point d'ancrage, « " +
          String(nombreSemaines) +
          " semaines » ne désigne aucune période précise.",
        reglageManquant: 'periodeReferenceDebut',
      })
    }
    blocs = blocsDeReference(periode, ancrage, nombreSemaines)
  }

  const aCheval = blocs.some((bloc) => chevaucheDeuxPeriodes(bloc, periode))
  const rattachement = settings.rattachementSemaineChevauchante

  if (aCheval && rattachement === undefined) {
    // Le moteur ne tranche pas : il produit les deux hypothèses et laisse le
    // conducteur reconnaître la sienne sur sa fiche (SPEC §7).
    const hypotheses = (['periode_de_fin', 'periode_de_debut'] as const).map((valeur) => {
      const duree = cumulerBlocs(blocs, journees, settings, periode, reference, valeur)
      return {
        libelle: libelleHypothese(valeur),
        reglageSuppose: { champ: 'rattachementSemaineChevauchante' as const, valeur },
        duree,
        valorisation: valoriser(duree, settings),
      }
    })

    return {
      duree: unknown<Minutes>({
        code: 'rattachement_semaine_chevauchante_absent',
        message: `Une période de décompte est à cheval sur deux périodes de paie, et la règle de rattachement n'est pas réglée. Deux hypothèses sont proposées, ${MENTION_HYPOTHESES}.`,
        reglageManquant: 'rattachementSemaineChevauchante',
      }),
      valorisation: unknown<Cents>({
        code: 'rattachement_semaine_chevauchante_absent',
        message: `Deux hypothèses sont proposées, ${MENTION_HYPOTHESES}.`,
        reglageManquant: 'rattachementSemaineChevauchante',
      }),
      hypotheses,
      mention: MENTION_HYPOTHESES,
    }
  }

  // À ce point : soit le réglage est saisi, soit aucun bloc n'est à cheval — et
  // dans ce second cas la règle de rattachement n'a strictement aucun effet.
  const politique: RattachementSemaineChevauchante =
    rattachement === undefined ? 'periode_de_fin' : rattachement

  const duree = cumulerBlocs(blocs, journees, settings, periode, reference, politique)
  return { duree, valorisation: valoriser(duree, settings) }
}

function libelleHypothese(valeur: RattachementSemaineChevauchante): string {
  switch (valeur) {
    case 'periode_de_fin':
      return 'Si les semaines à cheval tombent sur la période où elles se terminent'
    case 'periode_de_debut':
      return 'Si les semaines à cheval tombent sur la période où elles commencent'
    case 'prorata':
      return 'Si les semaines à cheval sont réparties au prorata des jours'
    default:
      return assertNever(valeur, 'rattachementSemaineChevauchante')
  }
}

function cumulerBlocs(
  blocs: readonly Semaine[],
  journees: readonly JourneeQualifiee[],
  settings: Settings,
  periode: PayPeriod,
  reference: Minutes,
  rattachement: RattachementSemaineChevauchante,
): CalculationResult<Minutes> {
  const parts: CalculationResult<Minutes>[] = []

  for (const bloc of blocs) {
    const duJour = journees.filter(
      (j) => j.dateRattachement >= bloc.debut && j.dateRattachement <= bloc.fin,
    )
    const total = totalTempsRemunere(duJour, settings)
    const brut = excedent(total, reference, `${bloc.debut} → ${bloc.fin}`)

    parts.push(attribuer(brut, bloc, periode, rattachement))
  }

  return sommerParts(parts)
}

/**
 * Part d'un bloc revenant à la période. Le prorata est calculé **toujours depuis
 * le début** : la part de la période de début est arrondie, celle de la période
 * de fin est le complément. Les deux parts somment donc exactement au total,
 * quelle que soit la coupure (`PER-14`).
 */
function attribuer(
  brut: CalculationResult<Minutes>,
  bloc: Semaine,
  periode: PayPeriod,
  rattachement: RattachementSemaineChevauchante,
): CalculationResult<Minutes> {
  if (!chevaucheDeuxPeriodes(bloc, periode)) {
    return brut
  }

  const blocCommenceDansLaPeriode = bloc.debut >= periode.debut && bloc.debut <= periode.fin
  const blocFinitDansLaPeriode = bloc.fin >= periode.debut && bloc.fin <= periode.fin

  switch (rattachement) {
    case 'periode_de_fin':
      return blocFinitDansLaPeriode ? brut : zeroAvecTrace(brut, bloc, 'se termine ailleurs')
    case 'periode_de_debut':
      return blocCommenceDansLaPeriode ? brut : zeroAvecTrace(brut, bloc, 'commence ailleurs')
    case 'prorata': {
      const joursIci = joursDansPeriode(bloc, periode)
      const joursDuBloc = nombreDeJours(bloc)
      return prorater(brut, joursIci, joursDuBloc, blocCommenceDansLaPeriode, bloc)
    }
    default:
      return assertNever(rattachement, 'rattachementSemaineChevauchante')
  }
}

function nombreDeJours(bloc: Semaine): number {
  return joursEntreDates(bloc.debut, bloc.fin) + 1
}

function zeroAvecTrace(
  brut: CalculationResult<Minutes>,
  bloc: Semaine,
  raison: string,
): CalculationResult<Minutes> {
  return complete(ZERO_MINUTES, {
    steps: [
      {
        label: `Semaine du ${bloc.debut}`,
        detail: `Rattachée à une autre période de paie : elle ${raison}.`,
        value: 0,
      },
    ],
    warnings: brut.warnings,
  })
}

function prorater(
  brut: CalculationResult<Minutes>,
  joursIci: number,
  joursDuBloc: number,
  estLaPeriodeDeDebut: boolean,
  bloc: Semaine,
): CalculationResult<Minutes> {
  const b = bornes(brut)
  if (b === undefined) {
    return brut
  }

  const part = (valeur: number): number => {
    const joursDeDebut = estLaPeriodeDeDebut ? joursIci : joursDuBloc - joursIci
    const partDebut = arrondirEnMinutes((valeur * joursDeDebut) / joursDuBloc)
    return estLaPeriodeDeDebut ? partDebut : valeur - partDebut
  }

  const steps: CalculationStep[] = [
    {
      label: `Semaine du ${bloc.debut}, au prorata`,
      detail: `${String(joursIci)} jour(s) sur ${String(joursDuBloc)} dans cette période`,
      value: part(b.max),
    },
  ]

  if (brut.status === 'complete') {
    return complete(minutes(part(brut.value)), { steps, warnings: brut.warnings })
  }
  return partial<Minutes>(
    { min: minutes(part(b.min)), max: minutes(part(b.max)) },
    { steps, warnings: brut.warnings },
  )
}

// ————————————————————————————————————————————————————————————————
// Briques communes
// ————————————————————————————————————————————————————————————————

function estDans(date: ISODate, periode: PayPeriod): boolean {
  return date >= periode.debut && date <= periode.fin
}

export function totalTempsRemunere(
  journees: readonly JourneeQualifiee[],
  settings: Settings,
): CalculationResult<Minutes> {
  return sommerParts(journees.map((j) => tempsRemunere(j, settings)))
}

function sommerParts(parts: readonly CalculationResult<Minutes>[]): CalculationResult<Minutes> {
  const inconnu = parts.find((p) => p.status === 'unknown')
  if (inconnu !== undefined) {
    return inconnu
  }
  let min = 0
  let max = 0
  for (const part of parts) {
    const b = bornes(part)
    /* c8 ignore next 3 */
    if (b === undefined) {
      continue
    }
    min += b.min
    max += b.max
  }
  return partial<Minutes>(
    { min: minutes(min), max: minutes(max) },
    {
      inputs: parts.flatMap((p) => p.inputs),
      steps: parts.flatMap((p) => p.steps),
      warnings: parts.flatMap((p) => p.warnings),
      sources: parts.flatMap((p) => p.sources),
    },
  )
}

/** Ce qui dépasse la durée de référence. Jamais négatif. */
function excedent(
  total: CalculationResult<Minutes>,
  reference: Minutes,
  libelleBloc: string,
): CalculationResult<Minutes> {
  const b = bornes(total)
  if (b === undefined) {
    return total
  }

  const auDela = (valeur: number): number => Math.max(0, valeur - reference)
  const steps: CalculationStep[] = [
    {
      label: libelleBloc,
      detail: `${formatDuree(minutes(b.max)).sexagesimal} travaillées, référence ${formatDuree(reference).sexagesimal}`,
      value: auDela(b.max),
    },
  ]

  const preuves = {
    inputs: [
      ...total.inputs,
      { label: 'Durée de référence', value: reference, origin: 'reglage' as const },
    ],
    steps: [...total.steps, ...steps],
    warnings: total.warnings,
    sources: [...total.sources, SOURCE_HS],
  }

  if (total.status === 'complete') {
    return complete(minutes(auDela(total.value)), preuves)
  }
  return partial<Minutes>({ min: minutes(auDela(b.min)), max: minutes(auDela(b.max)) }, preuves)
}

// ————————————————————————————————————————————————————————————————
// Valorisation
// ————————————————————————————————————————————————————————————————

type TranchesValides = { readonly ok: true; readonly tranches: readonly TrancheHS[] }
type TranchesInvalides = { readonly ok: false; readonly raison: CalculationWarning }

export function validerTranches(
  tranches: readonly TrancheHS[] | undefined,
): TranchesValides | TranchesInvalides {
  if (tranches === undefined || tranches.length === 0) {
    return {
      ok: false,
      raison: {
        code: CODES_PAIE.TRANCHES_ABSENTES,
        message:
          "Les tranches de majoration ne sont pas réglées : la durée des heures supplémentaires est connue, mais pas ce qu'elles valent.",
        reglageManquant: 'tranchesHS',
      },
    }
  }

  const triees = [...tranches].sort((a, b) => a.deMinutes - b.deMinutes)
  let attendu = 0
  for (const [index, tranche] of triees.entries()) {
    const derniere = index === triees.length - 1
    if (tranche.deMinutes !== attendu) {
      return { ok: false, raison: incoherence('les tranches ne se suivent pas sans trou') }
    }
    if (tranche.aMinutes === null) {
      if (!derniere) {
        return { ok: false, raison: incoherence('une tranche ouverte doit être la dernière') }
      }
      continue
    }
    if (tranche.aMinutes <= tranche.deMinutes) {
      return { ok: false, raison: incoherence('une tranche se termine avant de commencer') }
    }
    attendu = tranche.aMinutes
    if (derniere) {
      return { ok: false, raison: incoherence('la dernière tranche doit rester ouverte') }
    }
  }

  return { ok: true, tranches: triees }
}

function incoherence(detail: string): CalculationWarning {
  return {
    code: CODES_PAIE.TRANCHES_INCOHERENTES,
    message: `Les tranches de majoration sont incohérentes : ${detail}. L'app préfère ne rien calculer plutôt que de deviner.`,
    reglageManquant: 'tranchesHS',
  }
}

function valoriser(
  duree: CalculationResult<Minutes>,
  settings: Settings,
): CalculationResult<Cents> {
  if (duree.status === 'unknown') {
    return unknown<Cents>(
      duree.warnings.at(-1) ?? {
        code: CODES_PAIE.MODE_HS_ABSENT,
        message: "Les heures supplémentaires ne sont pas calculables.",
      },
      { warnings: duree.warnings },
    )
  }

  const taux = settings.tauxHoraireBaseCents
  if (taux === undefined) {
    return unknown<Cents>(
      {
        code: CODES_PAIE.TAUX_ABSENT,
        message:
          "Le taux horaire de base n'est pas renseigné : sans lui, le montant des heures supplémentaires reste incalculable.",
        reglageManquant: 'tauxHoraireBaseCents',
      },
      { warnings: duree.warnings },
    )
  }

  const validation = validerTranches(settings.tranchesHS)
  if (!validation.ok) {
    return unknown<Cents>(validation.raison, { warnings: duree.warnings })
  }

  // Une tranche dont la majoration n'est pas renseignée ne vaut pas « 0 % » :
  // elle ne vaut rien de connu. Tant qu'elle est atteinte, le montant reste
  // incalculable — la durée, elle, est déjà acquise.
  const sansTaux = ventiler(bornes(duree)?.max ?? ZERO_MINUTES, validation.tranches).find(
    (part) => part.majorationPct === undefined,
  )
  if (sansTaux !== undefined) {
    return unknown<Cents>(
      {
        code: CODES_PAIE.TRANCHES_ABSENTES,
        message:
          "Une tranche de majoration atteinte n'a pas de taux renseigné : la durée de tes heures supplémentaires est connue, mais pas ce qu'elles valent.",
        reglageManquant: 'tranchesHS',
      },
      { warnings: duree.warnings },
    )
  }

  const steps: CalculationStep[] = []

  // Une tranche = une ligne de fiche de paie, donc un arrondi par tranche : ce
  // n'est pas un arrondi en cascade, c'est la granularité réelle du bulletin.
  const montant = (total: Minutes, tracer: boolean): number =>
    ventiler(total, validation.tranches).reduce<number>((somme, part) => {
      /* c8 ignore next 3 — les tranches sans taux ont été écartées au-dessus. */
      if (part.majorationPct === undefined) {
        return somme
      }
      const ligne = valoriserMajore(part.duree, taux, part.majorationPct)
      if (tracer) {
        steps.push({
          label: `Heures supplémentaires majorées de ${String(part.majorationPct)} %`,
          detail: formatDuree(part.duree).sexagesimal,
          value: ligne,
        })
      }
      return somme + ligne
    }, 0)

  const preuves = {
    inputs: [
      ...duree.inputs,
      { label: 'Taux horaire de base', value: taux, origin: 'reglage' as const },
    ],
    steps,
    warnings: duree.warnings,
    sources: [...duree.sources, SOURCE_HS],
  }

  if (duree.status === 'complete') {
    return complete(cents(montant(duree.value, true)), preuves)
  }
  const max = cents(montant(duree.range.max, true))
  return partial<Cents>({ min: cents(montant(duree.range.min, false)), max }, preuves)
}

/** Répartit une durée d'heures sup dans les tranches. Borne haute **exclusive**. */
export function ventiler(
  total: Minutes,
  tranches: readonly TrancheHS[],
): readonly { duree: Minutes; majorationPct: number | undefined }[] {
  const parts: { duree: Minutes; majorationPct: number | undefined }[] = []
  for (const tranche of tranches) {
    const haut = tranche.aMinutes === null ? total : Math.min(total, tranche.aMinutes)
    const duree = haut - tranche.deMinutes
    if (duree > 0) {
      parts.push({ duree: minutes(duree), majorationPct: tranche.majorationPct })
    }
  }
  return parts
}
