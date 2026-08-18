import { useState } from 'react'
import { validerHeureHorloge } from '../../engine'

/**
 * Saisie d'une heure au clavier numérique du système. **Aucun sélecteur à faire
 * défiler** (DESIGN §8, §14) : on tape quatre chiffres, les deux points
 * s'écrivent tout seuls.
 *
 * Le composant ne connaît ni fuseau ni date : il produit une chaîne `HH:mm` et
 * laisse l'appelant la résoudre en instant. C'est ce qui garde la résolution DST
 * en un seul endroit.
 */
export function ChampHeure({
  valeur,
  label,
  onChange,
  refus,
  taille = 'grand',
}: {
  readonly valeur: string | undefined
  readonly label: string
  readonly onChange: (heure: string | undefined) => void
  /** Phrase de refus venant du moteur (heure inexistante, par exemple). */
  readonly refus?: string
  readonly taille?: 'grand' | 'normal'
}): React.JSX.Element {
  const [saisie, setSaisie] = useState(() => valeur ?? '')
  const [valeurPrecedente, setValeurPrecedente] = useState(valeur)

  // La valeur peut changer sous nos pieds — « Dupliquer hier », un modèle, ou le
  // choix fait dans le dialogue de changement d'heure. On resynchronise pendant
  // le rendu plutôt que dans un effet : c'est le motif recommandé par React
  // pour ajuster un état sur un changement de prop, et il évite un rendu en
  // cascade à chaque frappe.
  if (valeur !== valeurPrecedente) {
    setValeurPrecedente(valeur)
    setSaisie(valeur ?? '')
  }

  // La validation de forme appartient au moteur : le composant ne fait que
  // l'afficher (CLAUDE.md §4).
  const controle = saisie.length === 5 ? validerHeureHorloge(saisie) : { status: 'ok' as const }
  const invalide = controle.status === 'invalid'

  return (
    <label className="bloc-horaire__champ">
      <span className="legende">{label}</span>
      <input
        className={[
          taille === 'grand' ? 'heure-saisie' : 'input',
          invalide || refus !== undefined ? 'heure-saisie--invalide' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        placeholder="--:--"
        maxLength={5}
        aria-label={label}
        aria-invalid={invalide || refus !== undefined}
        value={saisie}
        onChange={(evenement) => {
          const formatee = formater(evenement.target.value)
          setSaisie(formatee)

          if (formatee === '') {
            onChange(undefined)
            return
          }
          if (formatee.length === 5 && validerHeureHorloge(formatee).status === 'ok') {
            onChange(formatee)
          }
        }}
      />
      {controle.status === 'invalid' ? (
        <span className="refus-saisie" role="alert">
          {controle.reason}
        </span>
      ) : null}
      {refus !== undefined ? (
        <span className="refus-saisie" role="alert">
          {refus}
        </span>
      ) : null}
    </label>
  )
}

/** `0540` → `05:40`. Les deux points ne se tapent pas. */
function formater(brut: string): string {
  const chiffres = brut.replace(/\D/g, '').slice(0, 4)
  if (chiffres.length <= 2) {
    return chiffres
  }
  return `${chiffres.slice(0, 2)}:${chiffres.slice(2)}`
}

