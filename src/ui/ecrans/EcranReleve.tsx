import { useLiveQuery } from 'dexie-react-hooks'
import { DateTime } from 'luxon'
import {
  comparerAvecFiche,
  detaillerIntervalle,
  periodePour,
  qualifierJournee,
  type ISODate,
} from '../../engine'
import { synthetiserPeriode } from '../../engine'
import { useDonnees } from '../../app/contexteDonnees'
import { Releve } from '../../pdf/Releve'

/**
 * Prépare la sortie moteur et la confie au relevé.
 *
 * Toute la lecture de données est ici ; le relevé, lui, ne connaît que des
 * résultats déjà calculés. C'est ce qui permet de le tester et de l'imprimer
 * sans jamais risquer un second calcul divergent (SPEC §2).
 */
export function EcranReleve({
  ancre,
  onFermer,
}: {
  readonly ancre: ISODate
  readonly onFermer: () => void
}): React.JSX.Element {
  const { repo, settings, zone, maintenantMillis } = useDonnees()

  const periode = periodePour(ancre, settings)
  const bornes = periode.status === 'complete' ? periode.value : undefined

  const donnees = useLiveQuery(
    async () => {
      if (bornes === undefined) {
        return undefined
      }
      const jours = await repo.lireJourneesEntre(bornes.debut, bornes.fin)
      const qualifications = await repo.lireQualifications(jours.map((j) => j.id))
      const absences = await repo.lireAbsencesEntre(bornes.debut, bornes.fin)
      const saisies = await repo.lireSaisiesIndemnites(jours.map((j) => j.id))
      const fiche = await repo.lirePayCheck(bornes.id)
      return { jours, qualifications, absences, saisies, fiche }
    },
    [bornes?.id],
    undefined,
  )

  const actions = (
    <div className="releve-actions">
      <button type="button" className="btn btn-secondary" onClick={onFermer}>
        ← Fermer
      </button>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() => {
          // « Enregistrer en PDF » du système : aucune dépendance, hors ligne.
          globalThis.print()
        }}
      >
        Imprimer ou enregistrer en PDF
      </button>
    </div>
  )

  if (bornes === undefined || donnees === undefined) {
    return (
      <>
        {actions}
        <div className="gouttiere">
          <p className="mention">
            {bornes === undefined
              ? (periode.warnings.at(-1)?.message ?? "La période de paie n'est pas réglée.")
              : 'Préparation du relevé…'}
          </p>
        </div>
      </>
    )
  }

  const paires = donnees.jours.map((jour) => ({
    jour,
    journee: qualifierJournee(jour, zone, donnees.qualifications),
  }))
  const synthese = synthetiserPeriode(bornes, paires, settings, donnees.absences, donnees.saisies)
  const detail = detaillerIntervalle(bornes.debut, bornes.fin, paires, settings, donnees.absences)
  const comparaison = comparerAvecFiche(bornes, synthese, detail, donnees.fiche)

  return (
    <>
      {actions}
      <Releve
        detail={detail}
        synthese={synthese}
        comparaison={comparaison}
        entreprise={settings.entreprise}
        imprimeLe={DateTime.fromMillis(maintenantMillis, { zone })
          .setLocale('fr')
          .toFormat('d LLLL yyyy')}
      />
    </>
  )
}
