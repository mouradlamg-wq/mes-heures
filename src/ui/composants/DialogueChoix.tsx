import { useEffect, useRef } from 'react'

export type Choix = {
  readonly libelle: string
  readonly detail?: string
  readonly valeur: string
}

/**
 * Dialogue à choix explicites. Le **seul** endroit de l'app qui porte une ombre
 * (DESIGN §5).
 *
 * Utilisé pour la désambiguïsation d'une heure qui existe deux fois, et
 * uniquement dans ce cas : aucun dialogue de ce genre le reste de l'année
 * (SPEC §5).
 */
export function DialogueChoix({
  titre,
  texte,
  choix,
  onChoisir,
  onAnnuler,
}: {
  readonly titre: string
  readonly texte: string
  readonly choix: readonly Choix[]
  readonly onChoisir: (valeur: string) => void
  readonly onAnnuler: () => void
}): React.JSX.Element {
  const reference = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = reference.current
    if (element !== null && !element.open) {
      element.showModal()
    }
  }, [])

  return (
    <dialog
      className="dialog"
      ref={reference}
      aria-labelledby="dialogue-titre"
      onCancel={(evenement) => {
        evenement.preventDefault()
        onAnnuler()
      }}
    >
      <div className="dialog__corps">
        <h2 className="dialog__titre" id="dialogue-titre">
          {titre}
        </h2>
        <p className="dialog__texte">{texte}</p>
        <div className="dialog__choix">
          {choix.map((option) => (
            <button
              key={option.valeur}
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                onChoisir(option.valeur)
              }}
            >
              {option.libelle}
              {option.detail === undefined ? null : (
                <span className="valeur-double__centiemes">{option.detail}</span>
              )}
            </button>
          ))}
          <button type="button" className="btn btn-ghost" onClick={onAnnuler}>
            Annuler
          </button>
        </div>
      </div>
    </dialog>
  )
}
