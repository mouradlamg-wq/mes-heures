import { createContext, useContext } from 'react'
import type { BaseMesHeures, Repository } from '../db'
import type { ISODate, Settings } from '../engine'

/**
 * Contexte de données, séparé du composant qui le fournit : un fichier sans JSX
 * n'a pas de contrainte de rafraîchissement à chaud, et le hook peut y vivre
 * avec ses types.
 */
export type Donnees = {
  readonly repo: Repository
  readonly base: BaseMesHeures
  readonly settings: Settings
  /** Zone de référence, issue des réglages. Jamais celle du navigateur. */
  readonly zone: string
  /** Date du jour **dans la zone de référence**. */
  readonly aujourdhui: ISODate
  /** Instant courant : le moteur ne lit jamais l'horloge, on la lui passe. */
  readonly maintenantMillis: number
}

export const ContexteDonnees = createContext<Donnees | undefined>(undefined)

export function useDonnees(): Donnees {
  const donnees = useContext(ContexteDonnees)
  if (donnees === undefined) {
    throw new Error('useDonnees doit être appelé sous <FournisseurDonnees>')
  }
  return donnees
}

/** Identifiant stable pour une nouvelle entité. */
export function nouvelId(prefixe: string): string {
  return `${prefixe}-${crypto.randomUUID()}`
}
