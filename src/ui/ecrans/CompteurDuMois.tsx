import { useLiveQuery } from 'dexie-react-hooks'
import {
  formatDuree,
  formatMontant,
  periodePour,
  qualifierJournee,
  synthetiserPeriode,
  type ISODate,
} from '../../engine'
import { useDonnees } from '../../app/contexteDonnees'
import { TagStatut } from '../composants/Statut'

/**
 * Compteur — **c'est ce qu'on voit en ouvrant l'app** (DESIGN §8) : les heures
 * supplémentaires cumulées de la période en cours, en 76 px, avec une rangée de
 * tags dessous.
 *
 * Un seul compteur par écran, en haut. Aucun calcul ici : `synthetiserPeriode`
 * fait tout, le composant met en forme.
 */
export function CompteurDuMois({
  date,
  onOuvrirReglages,
}: {
  readonly date: ISODate
  readonly onOuvrirReglages: (reglage?: string) => void
}): React.JSX.Element {
  const { repo, settings, zone } = useDonnees()

  const periode = periodePour(date, settings)
  const bornes = periode.status === 'complete' ? periode.value : undefined

  const donneesPeriode = useLiveQuery(
    async () => {
      if (bornes === undefined) {
        return undefined
      }
      const jours = await repo.lireJourneesEntre(bornes.debut, bornes.fin)
      const qualifications = await repo.lireQualifications(jours.map((j) => j.id))
      const absences = await repo.lireAbsencesEntre(bornes.debut, bornes.fin)
      const saisies = await repo.lireSaisiesIndemnites(jours.map((j) => j.id))
      return { jours, qualifications, absences, saisies }
    },
    [bornes?.debut, bornes?.fin],
    undefined,
  )

  // Réglage de période absent : on le dit, on ne se rabat pas sur le mois civil.
  if (bornes === undefined) {
    return (
      <section className="compteur gouttiere">
        <p className="kicker">Période de paie</p>
        <div className="incalculable">
          <TagStatut statut="unknown" />
          <p className="incalculable__phrase">
            {periode.warnings.at(-1)?.message ?? "La période de paie n'est pas réglée."}
          </p>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              onOuvrirReglages('payPeriodConfig')
            }}
          >
            Renseigner la période de paie →
          </button>
        </div>
      </section>
    )
  }

  if (donneesPeriode === undefined) {
    return (
      <section className="compteur gouttiere">
        <p className="kicker">{bornes.label} — heures sup cumulées</p>
        <p className="mention">Calcul en cours…</p>
      </section>
    )
  }

  const paires = donneesPeriode.jours.map((jour) => ({
    jour,
    journee: qualifierJournee(jour, zone, donneesPeriode.qualifications),
  }))

  const synthese = synthetiserPeriode(
    bornes,
    paires,
    settings,
    donneesPeriode.absences,
    donneesPeriode.saisies,
  )

  const heuresSup = synthese.heuresSup.duree

  return (
    <section className="compteur gouttiere">
      <p className="kicker">{bornes.label} — heures sup cumulées</p>

      {heuresSup.status === 'unknown' ? (
        <div className="incalculable">
          <TagStatut statut="unknown" />
          <p className="incalculable__phrase">
            {heuresSup.warnings.at(-1)?.message ??
              'Les heures supplémentaires ne sont pas calculables.'}
          </p>
          {heuresSup.warnings.at(-1)?.reglageManquant === undefined ? null : (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                onOuvrirReglages(heuresSup.warnings.at(-1)?.reglageManquant)
              }}
            >
              Renseigner ce réglage →
            </button>
          )}
        </div>
      ) : (
        <>
          <p className="compteur__valeur">
            <ValeurCompteur
              texte={
                heuresSup.status === 'complete'
                  ? formatDuree(heuresSup.value).sexagesimal
                  : `${formatDuree(heuresSup.range.min).sexagesimal} – ${formatDuree(heuresSup.range.max).sexagesimal}`
              }
            />
          </p>
          <div className="compteur__tags">
            <TagStatut statut={heuresSup.status} />
            <span className="tag tag-neutre tag-valeur">
              {heuresSup.status === 'complete'
                ? formatDuree(heuresSup.value).centiemes
                : formatDuree(heuresSup.range.max).centiemes}
            </span>
            <span className="tag tag-neutre tag-valeur">
              {synthese.totalIndemnites.status === 'complete'
                ? formatMontant(synthese.totalIndemnites.value)
                : 'indemnités à régler'}
            </span>
          </div>
        </>
      )}
    </section>
  )
}

/**
 * Le `h` d'une durée passe à 34 px au milieu d'un chiffre de 76 px (DESIGN §4).
 * On découpe la chaîne déjà formatée par le moteur : on ne la reformate pas.
 */
function ValeurCompteur({ texte }: { readonly texte: string }): React.JSX.Element {
  const morceaux = texte.split('h')
  if (morceaux.length !== 2) {
    return <>{texte}</>
  }
  return (
    <>
      {morceaux[0]}
      <span className="compteur__unite">h</span>
      {morceaux[1]}
    </>
  )
}
