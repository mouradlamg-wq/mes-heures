import { registerSW } from 'virtual:pwa-register'

/**
 * Service worker et mise à jour.
 *
 * `registerType: 'prompt'` : une nouvelle version ne s'installe **jamais sous
 * les doigts** de l'utilisateur. Un rechargement silencieux en pleine saisie
 * ferait perdre la journée en cours, et sur cette app une journée perdue est
 * une journée à ressaisir de mémoire.
 *
 * Le service worker sert un precache complet, sans aucun appel réseau au
 * runtime : l'app démarre dans un tunnel comme sur le parking.
 */
export type EtatMiseAJour = {
  readonly disponible: boolean
  readonly appliquer: () => void
}

export function enregistrerServiceWorker(
  onMiseAJour: (etat: EtatMiseAJour) => void,
): void {
  // Le développement n'enregistre rien : un service worker qui met en cache un
  // module chaud rend le rechargement à chaud imprévisible.
  if (import.meta.env.DEV) {
    return
  }

  const rafraichir = registerSW({
    onNeedRefresh() {
      onMiseAJour({
        disponible: true,
        appliquer: () => {
          // `rafraichir` recharge la page une fois le nouveau worker actif :
          // sa promesse ne se résout donc jamais vraiment.
          void rafraichir(true)
        },
      })
    },
  })
}
