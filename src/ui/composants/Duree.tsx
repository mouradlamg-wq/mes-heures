import {
  afficherDuree,
  formatDuree,
  formatIntervalleDuree,
  type CalculationResult,
  type Minutes,
} from '../../engine'
import { TagStatut } from './Statut'

/**
 * Double affichage systématique (DESIGN §4) : la forme sexagésimale en gros, les
 * centièmes juste dessous, plus petits et en encre atténuée. **Jamais l'une sans
 * l'autre.**
 *
 * Aucun calcul ici : le composant reçoit des `Minutes` et appelle le formateur
 * du moteur (CLAUDE.md §4, §9).
 */
export function DureeDouble({
  duree,
  classe,
}: {
  readonly duree: Minutes
  readonly classe?: string
}): React.JSX.Element {
  const rendu = formatDuree(duree)
  return (
    <span className={`valeur-double ${classe ?? ''}`}>
      <span className="valeur">{rendu.sexagesimal}</span>
      <span className="valeur-double__centiemes">{rendu.centiemes}</span>
    </span>
  )
}

export function IntervalleDouble({
  min,
  max,
  classe,
}: {
  readonly min: Minutes
  readonly max: Minutes
  readonly classe?: string
}): React.JSX.Element {
  const rendu = formatIntervalleDuree(min, max)
  return (
    <span className={`valeur-double ${classe ?? ''}`}>
      <span className="valeur">{rendu.sexagesimal}</span>
      <span className="valeur-double__centiemes">{rendu.centiemes}</span>
    </span>
  )
}

/**
 * Rend un résultat du moteur avec son statut.
 *
 * `complete` → la valeur. `partial` → l'intervalle, **jamais une valeur seule**.
 * `unknown` → aucun chiffre : une phrase, sa cause, et un lien vers le réglage
 * à remplir. Ni `0`, ni `—`, ni valeur grisée (DESIGN §6).
 */
export function ResultatDuree({
  resultat,
  surReglageManquant,
  classe,
}: {
  readonly resultat: CalculationResult<Minutes>
  readonly surReglageManquant?: (reglage: string) => void
  readonly classe?: string
}): React.JSX.Element {
  const affichage = afficherDuree(resultat)

  if (affichage.statut === 'unknown') {
    return (
      <div className="incalculable">
        <TagStatut statut="unknown" />
        <p className="incalculable__phrase">{affichage.phrase}</p>
        {affichage.reglageManquant !== undefined && surReglageManquant !== undefined ? (
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              surReglageManquant(affichage.reglageManquant ?? '')
            }}
          >
            Renseigner ce réglage →
          </button>
        ) : null}
      </div>
    )
  }

  return (
    <span className={`valeur-double ${classe ?? ''}`}>
      <span className="valeur">{affichage.duree.sexagesimal}</span>
      <span className="valeur-double__centiemes">{affichage.duree.centiemes}</span>
    </span>
  )
}
