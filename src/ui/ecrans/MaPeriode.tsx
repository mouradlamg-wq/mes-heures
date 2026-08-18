import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  decalerDate,
  detaillerIntervalle,
  formatDuree,
  formatIntervalleDuree,
  MENTIONS,
  qualifierJournee,
  statutDeLecture,
  type CalculationResult,
  type DetailIntervalle,
  type ISODate,
  type LigneJournaliere,
  type Minutes,
} from '../../engine'
import { useDonnees } from '../../app/contexteDonnees'
import { libelleAbsence, libelleJourCourt } from '../libelles'
import { bornesDe, type Portee } from './bornes'
import { TagStatut } from '../composants/Statut'

/**
 * Écran « Ma semaine / Ma période » (DESIGN §9).
 *
 * Durées brutes par jour, **aucune qualification de conformité** : ni feu
 * tricolore, ni badge de dépassement. La v1 ne vérifie rien du règlement
 * européen, et la mention le dit sous le tableau.
 *
 * Aucun calcul ici : `detaillerIntervalle` produit les lignes et le total, le
 * composant met en forme.
 */
export function MaPeriode({
  onOuvrirJournee,
  onOuvrirReglages,
  onVerifierPaie,
}: {
  readonly onOuvrirJournee: (date: ISODate) => void
  readonly onOuvrirReglages: (reglage?: string) => void
  readonly onVerifierPaie: () => void
}): React.JSX.Element {
  const { repo, settings, zone, aujourdhui } = useDonnees()
  const [portee, setPortee] = useState<Portee>('periode')
  const [ancre, setAncre] = useState<ISODate>(aujourdhui)

  const intervalle = bornesDe(portee, ancre, settings)

  const donnees = useLiveQuery(
    async () => {
      if (intervalle.status !== 'ok') {
        return undefined
      }
      const jours = await repo.lireJourneesEntre(intervalle.debut, intervalle.fin)
      const qualifications = await repo.lireQualifications(jours.map((j) => j.id))
      const absences = await repo.lireAbsencesEntre(intervalle.debut, intervalle.fin)
      return { jours, qualifications, absences }
    },
    [intervalle.status === 'ok' ? intervalle.debut : '', intervalle.status === 'ok' ? intervalle.fin : ''],
    undefined,
  )

  return (
    <>
      <div className="gouttiere periode-entete">
        <h1 className="periode-entete__titre">
          {intervalle.status === 'ok' ? intervalle.libelle : 'Ma période'}
        </h1>
        {/* Aplat rouge du segmenté : c'est le seul de l'écran (DESIGN §3). */}
        <div className="seg seg--accent">
          {(['semaine', 'periode'] as const).map((valeur) => (
            <button
              key={valeur}
              type="button"
              aria-pressed={portee === valeur}
              onClick={() => {
                setPortee(valeur)
              }}
            >
              {valeur === 'semaine' ? 'Semaine' : 'Période'}
            </button>
          ))}
        </div>
      </div>

      {intervalle.status !== 'ok' ? (
        <div className="gouttiere">
          <div className="incalculable">
            <TagStatut statut="unknown" />
            <p className="incalculable__phrase">{intervalle.raison}</p>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                onOuvrirReglages(intervalle.reglage)
              }}
            >
              Renseigner ce réglage →
            </button>
          </div>
        </div>
      ) : donnees === undefined ? (
        <div className="gouttiere">
          <p className="mention">Calcul en cours…</p>
        </div>
      ) : (
        <Contenu
          detail={detaillerIntervalle(
            intervalle.debut,
            intervalle.fin,
            donnees.jours.map((jour) => ({
              jour,
              journee: qualifierJournee(jour, zone, donnees.qualifications),
            })),
            settings,
            donnees.absences,
          )}
          onOuvrirJournee={onOuvrirJournee}
          onReculer={() => {
            setAncre(decalerDate(intervalle.debut, -1))
          }}
          onAvancer={() => {
            setAncre(decalerDate(intervalle.fin, 1))
          }}
          portee={portee}
          onVerifierPaie={onVerifierPaie}
        />
      )}
    </>
  )
}

function Contenu({
  detail,
  portee,
  onOuvrirJournee,
  onReculer,
  onAvancer,
  onVerifierPaie,
}: {
  readonly detail: DetailIntervalle
  readonly portee: Portee
  readonly onOuvrirJournee: (date: ISODate) => void
  readonly onReculer: () => void
  readonly onAvancer: () => void
  readonly onVerifierPaie: () => void
}): React.JSX.Element {
  const statut = statutDeLecture(detail)

  return (
    <>
      <hr className="hr-section" />

      <section className="compteur gouttiere">
        <p className="kicker">Temps rémunéré — {portee === 'semaine' ? 'semaine' : 'période'}</p>
        <TotalPeriode detail={detail} />
        <div className="compteur__tags">
          <TagStatut statut={statut} />
          {detail.joursCertains > 0 ? (
            <span className="tag tag-neutre tag-valeur">
              {detail.joursCertains} {detail.joursCertains > 1 ? 'jours certains' : 'jour certain'}
            </span>
          ) : null}
          {detail.joursPartiels > 0 ? (
            <span className="tag tag-neutre tag-valeur">
              {detail.joursPartiels} à qualifier
            </span>
          ) : null}
          {detail.joursIncalculables > 0 ? (
            <span className="tag tag-neutre tag-valeur">
              {detail.joursIncalculables} incalculable
              {detail.joursIncalculables > 1 ? 's' : ''}
            </span>
          ) : null}
        </div>
      </section>

      <hr className="hr-section" />

      <div className="gouttiere raccourcis">
        <button type="button" className="btn btn-secondary" onClick={onReculer}>
          ← Précédent
        </button>
        <button type="button" className="btn btn-secondary" onClick={onAvancer}>
          Suivant →
        </button>
      </div>

      <div className="gouttiere">
        <table className="table table-jours">
          <thead>
            <tr>
              <th scope="col">Jour</th>
              <th scope="col" className="nombre">
                Amplitude
              </th>
              <th scope="col" className="nombre">
                Conduite
              </th>
              <th scope="col" className="nombre">
                Temps rémunéré
              </th>
            </tr>
          </thead>
          <tbody>
            {detail.lignes.map((ligne) => (
              <LigneDuJour key={ligne.date} ligne={ligne} onOuvrir={onOuvrirJournee} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="pied">
        <hr className="hr-section" />
        <div className="gouttiere pied__mention">
          <p className="mention">{MENTIONS.durees}</p>
        </div>
        <div className="gouttiere pied__action">
          <button type="button" className="btn btn-secondary btn-pleine" onClick={onVerifierPaie}>
            Voir l’écart avec ma fiche →
          </button>
        </div>
      </div>
    </>
  )
}

/** Le total, en double affichage. Jamais l'une des deux notations sans l'autre. */
function TotalPeriode({ detail }: { readonly detail: DetailIntervalle }): React.JSX.Element {
  const total = detail.total

  if (total.status === 'unknown') {
    return (
      <div className="incalculable">
        <p className="incalculable__phrase">
          {total.warnings.at(-1)?.message ?? "Rien à totaliser sur cette période."}
        </p>
      </div>
    )
  }

  const rendu =
    total.status === 'complete'
      ? formatDuree(total.value)
      : formatIntervalleDuree(total.range.min, total.range.max)

  return (
    <>
      <p className="compteur__valeur compteur__valeur--total">{rendu.sexagesimal}</p>
      <p className="compteur__centiemes">{rendu.centiemes}</p>
    </>
  )
}

function LigneDuJour({
  ligne,
  onOuvrir,
}: {
  readonly ligne: LigneJournaliere
  readonly onOuvrir: (date: ISODate) => void
}): React.JSX.Element {
  if (ligne.sorte === 'repos') {
    return (
      <tr className="ligne-jour ligne-jour--vide">
        <th scope="row">{libelleJourCourt(ligne.date)}</th>
        <td colSpan={3} className="ligne-jour__mot">
          Repos
        </td>
      </tr>
    )
  }

  if (ligne.sorte === 'absence') {
    return (
      <tr className="ligne-jour ligne-jour--vide">
        <th scope="row">{libelleJourCourt(ligne.date)}</th>
        <td colSpan={3} className="ligne-jour__mot">
          {libelleAbsence(ligne.type)} — non valorisé
        </td>
      </tr>
    )
  }

  const temps = ligne.tempsRemunere
  const incertain = temps.status === 'partial'

  return (
    <tr
      className={`ligne-jour ligne-jour--travail ${incertain ? 'ligne-jour--partielle hachure' : ''}`}
      onClick={() => {
        onOuvrir(ligne.date)
      }}
    >
      <th scope="row">{libelleJourCourt(ligne.date)}</th>
      <td className="nombre">{brut(ligne.amplitude)}</td>
      <td className="nombre">{brut(ligne.conduite)}</td>
      <td className="nombre">
        {temps.status === 'unknown' ? (
          <span className="ligne-jour__cause">
            <TagStatut statut="unknown" />
            <span className="ligne-jour__phrase">{temps.warnings.at(-1)?.message}</span>
          </span>
        ) : temps.status === 'partial' ? (
          <span className="ligne-jour__cause">
            <span>{formatIntervalleDuree(temps.range.min, temps.range.max).sexagesimal}</span>
            <TagStatut statut="partial" />
          </span>
        ) : (
          formatDuree(temps.value).sexagesimal
        )}
      </td>
    </tr>
  )
}

/**
 * Une durée brute dans le tableau.
 *
 * Quand elle est inconnue, la cellule reste **vide** : ni `0`, ni tiret
 * (DESIGN §14). Le statut et sa cause sont portés une seule fois par ligne,
 * dans la colonne « temps rémunéré » — les répéter dans chaque cellule
 * transformerait un tableau de lecture en mur d'avertissements.
 */
function brut(resultat: CalculationResult<Minutes>): string {
  switch (resultat.status) {
    case 'complete':
      return formatDuree(resultat.value).sexagesimal
    case 'partial':
      return formatIntervalleDuree(resultat.range.min, resultat.range.max).sexagesimal
    case 'unknown':
      return ''
  }
}
