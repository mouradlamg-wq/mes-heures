import { DateTime } from 'luxon'
import {
  complete,
  unknown,
  type CalculationResult,
} from '../primitives/calculationResult'
import type { JourSemaine, PayPeriod, Settings } from '../domain'
import { decalerDate, jourDeSemaine, joursEntreDates } from '../time/instant'
import { composerDate } from '../time/zone'
import type { ISODate } from '../time/types'
import { CODES_PAIE } from './tempsRemunere'

/**
 * Périodes de décompte (SPEC §7) — « le piège principal ».
 *
 * Le mois civil n'est pas la période de paie. Les périodes sont **générées
 * depuis les réglages**, jamais déduites d'un `YYYY-MM`, et tout calcul de paie
 * prend une `PayPeriod` en entrée.
 */

const MOIS = [
  'janvier',
  'février',
  'mars',
  'avril',
  'mai',
  'juin',
  'juillet',
  'août',
  'septembre',
  'octobre',
  'novembre',
  'décembre',
] as const

function joursDansLeMois(annee: number, mois: number): number {
  const jours = DateTime.fromObject({ year: annee, month: mois, day: 1 }, { zone: 'utc' })
    .daysInMonth
  if (jours === undefined) {
    // Un mois valide a toujours un nombre de jours : arriver ici est un bug,
    // et retourner 0 fabriquerait une période vide en silence.
    throw new RangeError(`Mois invalide : ${String(annee)}-${String(mois)}`)
  }
  return jours
}

/**
 * Premier jour de la période contenant `date`.
 *
 * `jourDebut = 31` sur un mois de 30 jours démarre au dernier jour existant :
 * jamais un débordement silencieux sur le mois suivant, qui décalerait toute la
 * série (SPEC §13, `PER-03`).
 */
function debutDePeriode(annee: number, mois: number, jourDebut: number): ISODate {
  return composerDate(annee, mois, Math.min(jourDebut, joursDansLeMois(annee, mois)))
}

/** Période de paie contenant la date donnée. */
export function periodePour(
  date: ISODate,
  settings: Settings,
): CalculationResult<PayPeriod> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    // Une période ne se déduit **jamais** d'un `YYYY-MM` (SPEC §7) : refuser la
    // forme abrégée à l'entrée est ce qui empêche le mois civil de rentrer par
    // la fenêtre.
    return unknown({
      code: 'date_invalide',
      message: `« ${date} » n'est pas une date. Une période de paie se calcule à partir d'un jour précis, jamais d'un mois.`,
    })
  }

  const config = settings.payPeriodConfig
  if (config === undefined) {
    return unknown({
      code: CODES_PAIE.PERIODE_NON_REGLEE,
      message:
        "La période de paie n'est pas réglée. Beaucoup d'entreprises décomptent du 26 au 25 : regarde ta fiche de paie et renseigne le jour de début.",
      reglageManquant: 'payPeriodConfig',
    })
  }

  const [annee, mois] = date.split('-').map(Number) as [number, number, number]
  const debutDuMois = debutDePeriode(annee, mois, config.jourDebut)

  // Si la date précède le début de période de son propre mois, elle appartient à
  // la période ouverte le mois d'avant.
  const { anneeDebut, moisDebut } =
    date >= debutDuMois
      ? { anneeDebut: annee, moisDebut: mois }
      : mois === 1
        ? { anneeDebut: annee - 1, moisDebut: 12 }
        : { anneeDebut: annee, moisDebut: mois - 1 }

  return complete(construire(anneeDebut, moisDebut, config.jourDebut), {
    inputs: [
      {
        label: 'Jour de début de la période de paie',
        value: config.jourDebut,
        origin: 'reglage',
      },
    ],
    sources: [
      { kind: 'convention', libelle: 'Période de paie de ton entreprise', saisiPar: 'utilisateur' },
    ],
  })
}

function construire(annee: number, mois: number, jourDebut: number): PayPeriod {
  const debut = debutDePeriode(annee, mois, jourDebut)
  const anneeSuivante = mois === 12 ? annee + 1 : annee
  const moisSuivant = mois === 12 ? 1 : mois + 1
  const debutSuivant = debutDePeriode(anneeSuivante, moisSuivant, jourDebut)
  const fin = decalerDate(debutSuivant, -1)

  // Le libellé porte le mois de **fin** : une période du 26 décembre au
  // 25 janvier est la paie de janvier.
  const [anneeFin, moisFin] = fin.split('-').map(Number) as [number, number, number]

  return {
    id: `${debut}_${fin}`,
    label: `${capitaliser(MOIS[moisFin - 1] ?? '')} ${String(anneeFin)}`,
    debut,
    fin,
  }
}

function capitaliser(mot: string): string {
  return mot.charAt(0).toUpperCase() + mot.slice(1)
}

/** Suite de périodes couvrant l'intervalle, dans l'ordre. */
export function periodesEntre(
  debut: ISODate,
  fin: ISODate,
  settings: Settings,
): CalculationResult<readonly PayPeriod[]> {
  const premiere = periodePour(debut, settings)
  if (premiere.status !== 'complete') {
    return unknown(
      premiere.warnings.at(-1) ?? {
        code: CODES_PAIE.PERIODE_NON_REGLEE,
        message: "La période de paie n'est pas réglée.",
      },
    )
  }

  const periodes: PayPeriod[] = [premiere.value]
  let courante = premiere.value
  while (courante.fin < fin) {
    const suivante = periodePour(decalerDate(courante.fin, 1), settings)
    /* c8 ignore next 3 — la config est présente puisque la première a réussi. */
    if (suivante.status !== 'complete') {
      break
    }
    periodes.push(suivante.value)
    courante = suivante.value
  }

  return complete(periodes, { inputs: premiere.inputs, sources: premiere.sources })
}

// ————————————————————————————————————————————————————————————————
// Semaines
// ————————————————————————————————————————————————————————————————

export type Semaine = {
  readonly debut: ISODate
  /** Inclusive. */
  readonly fin: ISODate
}

/**
 * Le lundi est le **régime supplétif**, pas une constante : un accord peut
 * définir une autre période de sept jours consécutifs. Le moteur ne le suppose
 * jamais — sans réglage, il refuse de découper.
 */
export function debutDeSemaine(date: ISODate, debutSemaine: JourSemaine): ISODate {
  const jour = jourDeSemaine(date)
  const recul = (jour - debutSemaine + 7) % 7
  return decalerDate(date, -recul)
}

/**
 * Semaines couvrant la période, bornes incluses. Une semaine qui déborde de la
 * période est renvoyée **entière** : c'est le rattachement (§7) qui décidera
 * ensuite de la période sur laquelle ses heures sup tombent.
 */
export function semainesCouvrant(
  periode: PayPeriod,
  debutSemaine: JourSemaine,
): readonly Semaine[] {
  const semaines: Semaine[] = []
  let debut = debutDeSemaine(periode.debut, debutSemaine)
  while (debut <= periode.fin) {
    semaines.push({ debut, fin: decalerDate(debut, 6) })
    debut = decalerDate(debut, 7)
  }
  return semaines
}

/**
 * Blocs de `nombreSemaines` semaines ancrés sur `ancrage`, y compris en
 * remontant avant l'ancrage : sans point d'ancrage, « 4 semaines » ne veut rien
 * dire (SPEC §7).
 */
export function blocsDeReference(
  periode: PayPeriod,
  ancrage: ISODate,
  nombreSemaines: number,
): readonly Semaine[] {
  const joursParBloc = nombreSemaines * 7
  const decalage = joursEntreDates(ancrage, periode.debut)
  const indexPremierBloc = Math.floor(decalage / joursParBloc)

  const blocs: Semaine[] = []
  let debut = decalerDate(ancrage, indexPremierBloc * joursParBloc)
  while (debut <= periode.fin) {
    blocs.push({ debut, fin: decalerDate(debut, joursParBloc - 1) })
    debut = decalerDate(debut, joursParBloc)
  }
  return blocs
}

export function chevaucheDeuxPeriodes(semaine: Semaine, periode: PayPeriod): boolean {
  return semaine.debut < periode.debut || semaine.fin > periode.fin
}

/** Nombre de jours de la semaine tombant dans la période. Sert au prorata. */
export function joursDansPeriode(semaine: Semaine, periode: PayPeriod): number {
  const debut = semaine.debut > periode.debut ? semaine.debut : periode.debut
  const fin = semaine.fin < periode.fin ? semaine.fin : periode.fin
  if (fin < debut) {
    return 0
  }
  return joursEntreDates(debut, fin) + 1
}
