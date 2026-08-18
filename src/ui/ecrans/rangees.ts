import {
  comparerInstants,
  heureMuraleDe,
  type ISODateTime,
  type JourneeQualifiee,
  type Segment,
  type WorkDay,
  type ZoneIndeterminee,
  type ZoneQualifiee,
} from '../../engine'

/**
 * Ce que la liste de l'écran « Aujourd'hui » affiche.
 *
 * Isolé du composant pour être testable sans DOM — et parce que c'est une
 * décision d'affichage à part entière, pas du balisage.
 */
export type Rangee =
  | { readonly cle: string; readonly sorte: 'qualifiee'; readonly zone: ZoneQualifiee }
  | { readonly cle: string; readonly sorte: 'indeterminee'; readonly zone: ZoneIndeterminee }
  /** Segment que le moteur n'a pas pu situer : il lui manque une borne. */
  | { readonly cle: string; readonly sorte: 'incomplet'; readonly segment: Segment }

/**
 * La liste montre **la journée telle que le moteur la voit** : ses zones
 * fusionnées, pas les segments bruts. Deux saisies « coupure » qui se suivent
 * forment une seule tranche, et une tranche qualifiée à la main y prend
 * naturellement sa place — sans quoi elle disparaîtrait de l'écran au moment
 * même où l'utilisateur vient de la renseigner.
 *
 * Les segments auxquels il manque une borne sont ajoutés en fin de liste : le
 * moteur ne peut pas les situer, mais l'utilisateur doit pouvoir les corriger.
 */
export function rangees(jour: WorkDay, journee: JourneeQualifiee): readonly Rangee[] {
  const situees: Rangee[] = [
    ...journee.zones.map(
      (zone): Rangee => ({ cle: `z-${zone.debut}-${zone.fin}`, sorte: 'qualifiee', zone }),
    ),
    ...journee.zonesIndeterminees.map(
      (zone): Rangee => ({ cle: `i-${zone.debut}-${zone.fin}`, sorte: 'indeterminee', zone }),
    ),
  ].sort((a, b) => comparerInstants(debutDe(a), debutDe(b)))

  const incomplets: Rangee[] = jour.segments
    .filter((segment) => segment.debut === undefined || segment.fin === undefined)
    .map((segment) => ({ cle: `s-${segment.id}`, sorte: 'incomplet', segment }))

  return [...situees, ...incomplets]
}

function debutDe(rangee: Rangee): ISODateTime {
  /* c8 ignore next 3 — les rangées triées sont toujours situées. */
  if (rangee.sorte === 'incomplet') {
    return ''
  }
  return rangee.zone.debut
}

/** `05:40–09:20` */
export function plage(debut: ISODateTime, fin: ISODateTime, zone: string): string {
  return `${heureMuraleDe(debut, zone)}–${heureMuraleDe(fin, zone)}`
}

/**
 * Segment sous-jacent à une tranche qualifiée, s'il y en a un.
 * Une tranche née d'une qualification manuelle n'en a pas : on la re-qualifie
 * au lieu de l'éditer.
 */
export function segmentSous(jour: WorkDay, zone: ZoneQualifiee): Segment | undefined {
  return jour.segments.find(
    (segment) =>
      segment.debut !== undefined &&
      segment.fin !== undefined &&
      comparerInstants(segment.debut, zone.debut) <= 0 &&
      comparerInstants(segment.fin, zone.fin) >= 0,
  )
}
