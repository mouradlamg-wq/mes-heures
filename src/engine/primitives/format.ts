import type { Cents, Minutes } from './brands'
import { arrondir, centiemesEntiers } from './roundingPolicy'
import type { CalculationResult, RuleSource, Statut } from './calculationResult'

/**
 * Le seul module de formatage de l'app (CLAUDE.md §9). Aucun composant React,
 * aucun gabarit PDF ne met en forme un nombre lui-même.
 */

/** Espace insécable U+00A0 — celui qu'exige la typographie française. */
const INSECABLE = ' '
/** Signe moins typographique U+2212, pas le trait d'union du clavier. */
const MOINS = '−'
/** Tiret demi-cadratin U+2013, pour les intervalles (DESIGN §4). */
const DEMI_CADRATIN = '–'

/**
 * Écrit un entier de centièmes sous forme décimale française : `833 → "8,33"`.
 * Aucun `toFixed`, aucun flottant : le formatage découpe un entier, donc il ne
 * peut pas introduire d'arrondi que le moteur n'aurait pas décidé.
 */
function decimalDepuisCentiemes(centiemes: number): string {
  const absolu = Math.abs(centiemes)
  const entier = Math.trunc(absolu / 100)
  const fraction = absolu - entier * 100
  return `${String(entier)},${String(fraction).padStart(2, '0')}`
}

function signe(valeur: number): string {
  return valeur < 0 ? MOINS : ''
}

/**
 * Double affichage systématique d'une durée (SPEC §10, DESIGN §4). Les deux
 * formes sortent ensemble : une fiche de paie française est en centièmes, le
 * conducteur ne doit pas convertir de tête.
 *
 * Jamais de remise à zéro modulo 24 : `2000 min` s'écrit `33 h 20`.
 */
export type DureeFormatee = {
  /** `8 h 20` */
  readonly sexagesimal: string
  /** `8,33 h` */
  readonly centiemes: string
}

export function formatDuree(duree: Minutes): DureeFormatee {
  const heures = Math.trunc(duree / 60)
  const reste = duree - heures * 60
  return {
    sexagesimal: `${String(heures)}${INSECABLE}h${INSECABLE}${String(reste).padStart(2, '0')}`,
    centiemes: `${decimalDepuisCentiemes(centiemesEntiers(duree))}${INSECABLE}h`,
  }
}

/** `8 h 20 – 9 h 50` */
export function formatIntervalleDuree(min: Minutes, max: Minutes): DureeFormatee {
  const a = formatDuree(min)
  const b = formatDuree(max)
  return {
    sexagesimal: `${a.sexagesimal}${INSECABLE}${DEMI_CADRATIN} ${b.sexagesimal}`,
    centiemes: `${a.centiemes}${INSECABLE}${DEMI_CADRATIN} ${b.centiemes}`,
  }
}

/** `148,20 €`, `−12,50 €`. */
export function formatMontant(montant: Cents): string {
  return `${signe(montant)}${decimalDepuisCentiemes(montant)}${INSECABLE}€`
}

export function formatIntervalleMontant(min: Cents, max: Cents): string {
  return `${formatMontant(min)}${INSECABLE}${DEMI_CADRATIN} ${formatMontant(max)}`
}

/** Écart signé : le `+` est explicite, c'est une information pour le conducteur. */
export function formatEcartMontant(ecart: number): string {
  if (ecart === 0) {
    return `0,00${INSECABLE}€`
  }
  const prefixe = ecart > 0 ? '+' : MOINS
  return `${prefixe}${decimalDepuisCentiemes(ecart)}${INSECABLE}€`
}

export function formatEcartDuree(ecart: number): DureeFormatee {
  const prefixe = ecart > 0 ? '+' : ecart < 0 ? MOINS : ''
  const absolu = Math.abs(ecart)
  const heures = Math.trunc(absolu / 60)
  const reste = absolu - heures * 60
  return {
    sexagesimal: `${prefixe}${String(heures)}${INSECABLE}h${INSECABLE}${String(reste).padStart(2, '0')}`,
    centiemes: `${prefixe}${decimalDepuisCentiemes(arrondir((absolu * 100) / 60))}${INSECABLE}h`,
  }
}

/** `08:20` — l'heure d'horloge d'un segment, jamais une durée. */
export function formatHeureHorloge(heure: number, minute: number): string {
  return `${String(heure).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

// ————————————————————————————————————————————————————————————————
// Statuts
// ————————————————————————————————————————————————————————————————

/** Le mot est obligatoire, l'icône n'est qu'un renfort (DESIGN §6, §13). */
export function libelleStatut(statut: Statut): string {
  switch (statut) {
    case 'complete':
      return 'CERTAIN'
    case 'partial':
      return 'PARTIEL'
    case 'unknown':
      return 'INCALCULABLE'
  }
}

/**
 * Rendu d'un résultat de durée, prêt à afficher.
 *
 * Un `unknown` ne rend **aucun chiffre** : ni `0`, ni `—`, ni valeur grisée
 * (DESIGN §6). Il rend la phrase et le réglage à remplir.
 */
export type AffichageResultat =
  | { readonly statut: 'complete'; readonly libelle: string; readonly duree: DureeFormatee }
  | { readonly statut: 'partial'; readonly libelle: string; readonly duree: DureeFormatee }
  | {
      readonly statut: 'unknown'
      readonly libelle: string
      readonly phrase: string
      readonly reglageManquant?: string
    }

export function afficherDuree(resultat: CalculationResult<Minutes>): AffichageResultat {
  const libelle = libelleStatut(resultat.status)
  switch (resultat.status) {
    case 'complete':
      return { statut: 'complete', libelle, duree: formatDuree(resultat.value) }
    case 'partial':
      return {
        statut: 'partial',
        libelle,
        duree: formatIntervalleDuree(resultat.range.min, resultat.range.max),
      }
    case 'unknown': {
      const cause = resultat.warnings.at(-1)
      const reglage = cause?.reglageManquant
      return {
        statut: 'unknown',
        libelle,
        phrase: cause?.message ?? "Cette valeur ne peut pas être calculée.",
        ...(reglage === undefined ? {} : { reglageManquant: reglage }),
      }
    }
  }
}

// ————————————————————————————————————————————————————————————————
// Sources
// ————————————————————————————————————————————————————————————————

/**
 * Une source `personnalise` n'est **jamais** présentée comme légale : dès que
 * l'utilisateur a touché la valeur, l'app cesse de s'appuyer sur le texte.
 */
export function formatSource(source: RuleSource): string {
  switch (source.kind) {
    case 'legal':
      return `${source.texte}, ${source.article}`
    case 'convention':
      return `${source.libelle} (saisi par toi)`
    case 'personnalise':
      return source.base === undefined
        ? 'personnalisé'
        : `personnalisé (à partir de : ${formatSource(source.base)})`
  }
}

export const MENTIONS = {
  /** Au mot près (CLAUDE.md §10, DESIGN §12). Ni raccourcie, ni mise en accordéon. */
  durees:
    'Ces durées sont indicatives. Cette version ne vérifie pas la conformité au règlement européen.',
  ecarts:
    "Un écart n'est pas forcément une erreur. Compare avec ton contrat, puis vois avec ton employeur ou tes représentants du personnel.",
} as const

export const TYPOGRAPHIE = {
  INSECABLE,
  MOINS,
  DEMI_CADRATIN,
} as const
