import { libelleStatut, type Statut } from '../../engine'

/**
 * Le mot est obligatoire, l'icône n'est qu'un renfort (DESIGN §6, §14).
 * Un statut ne se lit jamais à la seule couleur.
 */
export function TagStatut({ statut }: { readonly statut: Statut }): React.JSX.Element {
  const classe =
    statut === 'complete' ? 'tag-accent' : statut === 'partial' ? 'tag-outline' : 'tag-neutre'

  return (
    <span className={`tag ${classe}`} data-statut={statut}>
      {libelleStatut(statut)}
    </span>
  )
}
