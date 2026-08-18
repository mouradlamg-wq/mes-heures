import { useState } from 'react'
import { validerHeureHorloge } from '../../engine'
import type { ModeSaisieHeure } from '../../db'

/**
 * Saisie d'une heure. **Deux modes, au choix de l'utilisateur** (réglage
 * « Comment tu tapes tes heures ») :
 *
 * - `clavier` — quatre chiffres au pavé numérique, les deux points s'écrivent
 *   seuls. Le plus rapide, et le seul qui tienne la cible des quinze secondes ;
 * - `selecteur` — le sélecteur natif du téléphone (`input type="time"`), avec
 *   son cadran ou ses molettes selon l'appareil.
 *
 * Les deux produisent **exactement la même chose** : une chaîne `HH:mm`. La
 * résolution en instant, la gestion du changement d'heure et les refus restent
 * donc au même endroit, quel que soit le mode.
 */
export function ChampHeure({
  valeur,
  label,
  onChange,
  refus,
  taille = 'grand',
  mode = 'clavier',
}: {
  readonly valeur: string | undefined
  readonly label: string
  readonly onChange: (heure: string | undefined) => void
  /** Phrase de refus venant du moteur (heure inexistante, par exemple). */
  readonly refus?: string
  readonly taille?: 'grand' | 'normal'
  readonly mode?: ModeSaisieHeure
}): React.JSX.Element {
  return mode === 'selecteur' ? (
    <SaisieSelecteur
      valeur={valeur}
      label={label}
      onChange={onChange}
      taille={taille}
      {...(refus === undefined ? {} : { refus })}
    />
  ) : (
    <SaisieClavier
      valeur={valeur}
      label={label}
      onChange={onChange}
      taille={taille}
      {...(refus === undefined ? {} : { refus })}
    />
  )
}

type ProprietesSaisie = {
  readonly valeur: string | undefined
  readonly label: string
  readonly onChange: (heure: string | undefined) => void
  readonly refus?: string
  readonly taille: 'grand' | 'normal'
}

/** Quatre chiffres au clavier numérique. Aucun défilement. */
function SaisieClavier({
  valeur,
  label,
  onChange,
  refus,
  taille,
}: ProprietesSaisie): React.JSX.Element {
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

/**
 * Sélecteur natif du téléphone. Il ne peut pas produire d'heure hors plage — le
 * navigateur s'en charge — mais il peut renvoyer une chaîne vide si
 * l'utilisateur efface, et il reste soumis aux mêmes refus métier (une heure qui
 * n'existe pas la nuit du changement d'heure).
 */
function SaisieSelecteur({
  valeur,
  label,
  onChange,
  refus,
  taille,
}: ProprietesSaisie): React.JSX.Element {
  return (
    <label className="bloc-horaire__champ">
      <span className="legende">{label}</span>
      <input
        className={[
          taille === 'grand' ? 'heure-saisie heure-saisie--selecteur' : 'input',
          refus !== undefined ? 'heure-saisie--invalide' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        type="time"
        aria-label={label}
        aria-invalid={refus !== undefined}
        value={valeur ?? ''}
        onChange={(evenement) => {
          const brut = evenement.target.value
          onChange(brut === '' ? undefined : brut)
        }}
      />
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
