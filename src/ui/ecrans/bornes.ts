import {
  debutDeSemaine,
  decalerDate,
  periodePour,
  type ISODate,
  type JourSemaine,
  type Settings,
} from '../../engine'
import { libellePeriode } from '../libelles'

/**
 * Bornes de l'intervalle affiché par « Ma semaine / Ma période ».
 *
 * Isolé du composant pour être testable sans écran, et parce que c'est ici que
 * se joue la règle du SPEC §7 : **les bornes viennent des réglages**. Sans
 * réglage, l'écran refuse et renvoie au champ à remplir — il ne se rabat ni sur
 * le mois civil, ni sur le lundi.
 */
export type Portee = 'semaine' | 'periode'

export type Bornes =
  | {
      readonly status: 'ok'
      readonly debut: ISODate
      readonly fin: ISODate
      readonly libelle: string
    }
  | { readonly status: 'inconnu'; readonly raison: string; readonly reglage: string }

export function bornesDe(portee: Portee, ancre: ISODate, settings: Settings): Bornes {
  if (portee === 'semaine') {
    const premier: JourSemaine | undefined = settings.debutSemaine
    if (premier === undefined) {
      return {
        status: 'inconnu',
        raison:
          "Le premier jour de la semaine n'est pas réglé. Le lundi est le régime supplétif, mais un accord peut en décider autrement : l'app ne le suppose pas.",
        reglage: 'debutSemaine',
      }
    }
    const debut = debutDeSemaine(ancre, premier)
    const fin = decalerDate(debut, 6)
    return { status: 'ok', debut, fin, libelle: libellePeriode(debut, fin) }
  }

  const periode = periodePour(ancre, settings)
  if (periode.status !== 'complete') {
    return {
      status: 'inconnu',
      raison: periode.warnings.at(-1)?.message ?? "La période de paie n'est pas réglée.",
      reglage: 'payPeriodConfig',
    }
  }
  return {
    status: 'ok',
    debut: periode.value.debut,
    fin: periode.value.fin,
    libelle: libellePeriode(periode.value.debut, periode.value.fin),
  }
}
