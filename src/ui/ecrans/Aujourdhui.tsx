import { useEffect, useMemo, useRef, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  decalerDate,
  formatDuree,
  heureMuraleDe,
  MENTIONS,
  parseHeureLocale,
  qualifierJournee,
  tempsRemunere,
  TYPES_SEGMENT,
  type ISODate,
  type ISODateTime,
  type JourneeQualifiee,
  type Segment,
  type TypeSegment,
  type WorkDay,
  type ZoneIndeterminee,
} from '../../engine'
import { nouvelId, useDonnees } from '../../app/contexteDonnees'
import type { ModeSaisieHeure } from '../../db'
import { libelleDate, libelleType } from '../libelles'
import { plage, rangees, segmentSous } from './rangees'
import { ChampHeure } from '../composants/ChampHeure'
import { DialogueChoix } from '../composants/DialogueChoix'
import { ResultatDuree } from '../composants/Duree'
import { TagStatut } from '../composants/Statut'
import { CompteurDuMois } from './CompteurDuMois'

/**
 * Écran « Aujourd'hui » — la saisie (DESIGN §8).
 *
 * Ordre vertical imposé : compteur du mois, filet 2 px, date et statut, bloc
 * horaire, liste des segments, pied. **Aucun calcul ici** : tout vient du
 * moteur (CLAUDE.md §4).
 */
export function Aujourdhui({
  dateInitiale,
  onOuvrirReglages,
}: {
  /** Journée à ouvrir : renseignée quand on arrive depuis le tableau de période. */
  readonly dateInitiale?: ISODate
  readonly onOuvrirReglages: (reglage?: string) => void
}): React.JSX.Element {
  const { repo, settings, zone, aujourdhui, modeSaisieHeure } = useDonnees()
  const [date, setDate] = useState<ISODate>(dateInitiale ?? aujourdhui)

  const jour = useLiveQuery(async () => repo.lireJourneeDuJour(date), [date], undefined)
  const veille = useLiveQuery(
    async () => repo.lireJourneeDuJour(decalerDate(date, -1)),
    [date],
    undefined,
  )
  const qualifications = useLiveQuery(
    async () => (jour === undefined ? [] : repo.lireQualifications([jour.id])),
    [jour?.id],
    [],
  )

  const [aDesambiguiser, setADesambiguiser] = useState<Ambiguite | undefined>(undefined)
  const [refus, setRefus] = useState<Record<string, string>>({})
  const [zoneAQualifier, setZoneAQualifier] = useState<ZoneIndeterminee | undefined>(undefined)
  const [segmentEnEdition, setSegmentEnEdition] = useState<string | undefined>(undefined)
  const [typeADemander, setTypeADemander] = useState(false)

  const enregistrer = async (modifie: WorkDay): Promise<void> => {
    await repo.enregistrerJournee(modifie)
  }

  /**
   * Journée en cours, ou brouillon si rien n'est encore enregistré.
   *
   * L'identifiant du brouillon est **dérivé de la date** plutôt que tiré au
   * sort : il est donc stable d'une frappe à l'autre, et la contrainte d'unicité
   * de `dateRattachement` en base garantit qu'il ne peut pas entrer en collision.
   */
  const jourOuVide: WorkDay = useMemo(
    () => jour ?? { id: `brouillon-${date}`, dateRattachement: date, segments: [] },
    [jour, date],
  )

  /**
   * La journée est **toujours** qualifiée, même vide. C'est ce qui permet
   * d'afficher un `unknown` argumenté au lieu d'un tiret : une journée sans
   * saisie n'est pas « zéro », c'est « rien à borner » (DESIGN §14).
   */
  const journee: JourneeQualifiee = useMemo(
    () => qualifierJournee(jourOuVide, zone, qualifications),
    [jourOuVide, zone, qualifications],
  )

  /**
   * Résout `HH:mm` en instant, dans la zone de référence. C'est le **seul**
   * endroit où l'ambiguïté d'une nuit de changement d'heure est traitée, et elle
   * ouvre un dialogue au lieu d'être corrigée en silence.
   */
  const resoudre = (
    champ: string,
    dateDuChamp: ISODate,
    heure: string,
    appliquer: (instant: ISODateTime) => void,
  ): void => {
    const resolution = parseHeureLocale(dateDuChamp, heure, zone)

    if (resolution.status === 'ok') {
      setRefus((precedent) => sans(precedent, champ))
      appliquer(resolution.instant)
      return
    }
    if (resolution.status === 'invalid') {
      setRefus((precedent) => ({ ...precedent, [champ]: resolution.reason }))
      return
    }
    setRefus((precedent) => sans(precedent, champ))
    setADesambiguiser({ champ, choix: resolution.choices, appliquer })
  }

  const majPrise = (heure: string | undefined): void => {
    if (heure === undefined) {
      void enregistrer(sansChamp(jourOuVide, 'priseService'))
      return
    }
    resoudre('prise', date, heure, (instant) => {
      void enregistrer({ ...jourOuVide, priseService: instant })
    })
  }

  const majFin = (heure: string | undefined): void => {
    if (heure === undefined) {
      void enregistrer(sansChamp(jourOuVide, 'finService'))
      return
    }
    // Une journée de service peut finir le lendemain : si l'heure de fin est
    // antérieure à la prise, c'est qu'on a passé minuit. On propose, on
    // n'impose pas — le refus reste visible si la prise n'est pas saisie.
    const dateFin = passeMinuit(jourOuVide, heure, zone) ? decalerDate(date, 1) : date
    resoudre('fin', dateFin, heure, (instant) => {
      void enregistrer({ ...jourOuVide, finService: instant })
    })
  }

  /**
   * Crée un segment du type choisi, sans aucune heure, et ouvre son éditeur.
   *
   * Le type est **demandé avant** : l'app ne suppose pas que tout commence par
   * de la conduite, et rien n'est écrit en base tant que l'utilisateur n'a pas
   * dit ce qu'il ajoutait.
   */
  const creerSegment = (type: TypeSegment): void => {
    const segment: Segment = { id: nouvelId('seg'), type }
    void enregistrer({ ...jourOuVide, segments: [...jourOuVide.segments, segment] })
    setTypeADemander(false)
    setSegmentEnEdition(segment.id)
  }

  const majSegment = (id: string, modifie: Partial<Segment>): void => {
    void enregistrer({
      ...jourOuVide,
      segments: jourOuVide.segments.map((s) => (s.id === id ? { ...s, ...modifie } : s)),
    })
  }

  const supprimerSegment = (id: string): void => {
    void enregistrer({
      ...jourOuVide,
      segments: jourOuVide.segments.filter((s) => s.id !== id),
    })
  }

  const dupliquerHier = (): void => {
    if (veille === undefined) {
      return
    }
    void enregistrer(recopier(veille, jourOuVide, date, zone))
  }

  const qualifier = (type: TypeSegment): void => {
    if (zoneAQualifier === undefined) {
      return
    }
    // `requalifier` remplace la qualification qui couvre déjà cette tranche :
    // en superposer une seconde fabriquerait un chevauchement de types, donc une
    // zone indéterminée — exactement l'inverse du geste demandé.
    void repo.requalifier({
      id: nouvelId('qual'),
      dayId: jourOuVide.id,
      debut: zoneAQualifier.debut,
      fin: zoneAQualifier.fin,
      type,
    })
    setZoneAQualifier(undefined)
  }

  const temps = tempsRemunere(journee, settings)

  return (
    <>
      <CompteurDuMois date={date} onOuvrirReglages={onOuvrirReglages} />

      <hr className="hr-section" />

      <div className="gouttiere jour-entete">
        <h1 className="jour-entete__date">{libelleDate(date, zone)}</h1>
        <div className="jour-entete__nav">
          <TagStatut statut={statutDuJour(journee)} />
        </div>
      </div>

      <div className="gouttiere raccourcis">
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setDate(decalerDate(date, -1))
          }}
        >
          ← Veille
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setDate(decalerDate(date, 1))
          }}
        >
          Lendemain →
        </button>
      </div>

      <div className="gouttiere bloc-horaire">
        <ChampHeure
          label="Prise"
          valeur={
            jourOuVide.priseService === undefined
              ? undefined
              : heureMuraleDe(jourOuVide.priseService, zone)
          }
          mode={modeSaisieHeure}
          onChange={majPrise}
          {...(refus['prise'] === undefined ? {} : { refus: refus['prise'] })}
        />
        <div className="bloc-horaire__separateur" aria-hidden="true" />
        <ChampHeure
          label="Fin"
          valeur={
            jourOuVide.finService === undefined
              ? undefined
              : heureMuraleDe(jourOuVide.finService, zone)
          }
          mode={modeSaisieHeure}
          onChange={majFin}
          {...(refus['fin'] === undefined ? {} : { refus: refus['fin'] })}
        />
        <div className="bloc-horaire__amplitude">
          <span className="legende">Amplitude</span>
          <br />
          {/* Jamais de tiret à la place d'un unknown : le tag dit ce qu'il en est. */}
          {journee.amplitude.status === 'complete' ? (
            <span className="valeur">{formatDuree(journee.amplitude.value).sexagesimal}</span>
          ) : (
            <TagStatut statut={journee.amplitude.status} />
          )}
        </div>
      </div>

      <hr className="hr-section" />

      {/* « Dupliquer hier » et « Modèle… » en tête de liste, avant tout champ
          (DESIGN §8) — et un bouton désactivé dit toujours pourquoi (§6). */}
      {jourOuVide.segments.length === 0 ? (
        <div className="gouttiere">
          <div className="raccourcis">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={dupliquerHier}
              disabled={veille === undefined}
            >
              Dupliquer hier
            </button>
            <button type="button" className="btn btn-secondary" disabled>
              Modèle…
            </button>
          </div>
          {veille === undefined ? (
            <span className="field-consequence">
              Rien de saisi la veille : il n'y a pas de journée à dupliquer.
            </span>
          ) : null}
          <span className="field-consequence">
            Aucun modèle enregistré pour l'instant.
          </span>
        </div>
      ) : null}

      <ul className="segments">
        {rangees(jourOuVide, journee).map((rangee) => {
          if (rangee.sorte === 'indeterminee') {
            return (
              <li key={rangee.cle}>
                {/* La hachure veut dire « appuie ici » : un appui ouvre le choix
                    du type, et le pied change de statut dans le même rendu. */}
                <button
                  type="button"
                  className="segment segment--non-qualifie hachure"
                  onClick={() => {
                    setZoneAQualifier(rangee.zone)
                  }}
                >
                  <span
                    className="segment__pastille segment__pastille--non-qualifie"
                    aria-hidden="true"
                  />
                  <span className="segment__plage">
                    {plage(rangee.zone.debut, rangee.zone.fin, zone)}
                  </span>
                  <span className="segment__type">Non qualifié</span>
                  <span className="segment__duree">
                    {formatDuree(rangee.zone.duree).sexagesimal}
                  </span>
                </button>
              </li>
            )
          }

          if (rangee.sorte === 'incomplet') {
            return (
              <li key={rangee.cle}>
                <button
                  type="button"
                  className="segment"
                  onClick={() => {
                    setSegmentEnEdition(rangee.segment.id)
                  }}
                >
                  <span
                    className={`segment__pastille segment__pastille--${rangee.segment.type}`}
                    aria-hidden="true"
                  />
                  <span className="segment__plage">--:-- --:--</span>
                  <span className="segment__type">{libelleType(rangee.segment.type)}</span>
                  {/* Aucune durée : elle n'est pas connue, on ne l'invente pas. */}
                  <span className="segment__duree">
                    <TagStatut statut="unknown" />
                  </span>
                </button>
              </li>
            )
          }

          const sousJacent = segmentSous(jourOuVide, rangee.zone)
          return (
            <li key={rangee.cle}>
              <button
                type="button"
                className="segment"
                onClick={() => {
                  if (sousJacent !== undefined) {
                    setSegmentEnEdition(sousJacent.id)
                    return
                  }
                  // Tranche née d'une qualification manuelle : on la re-qualifie.
                  setZoneAQualifier({
                    debut: rangee.zone.debut,
                    fin: rangee.zone.fin,
                    duree: rangee.zone.duree,
                    cause: 'trou',
                  })
                }}
              >
                <span
                  className={`segment__pastille segment__pastille--${rangee.zone.type}`}
                  aria-hidden="true"
                />
                <span className="segment__plage">
                  {plage(rangee.zone.debut, rangee.zone.fin, zone)}
                </span>
                <span className="segment__type">{libelleType(rangee.zone.type)}</span>
                <span className="segment__duree">{formatDuree(rangee.zone.duree).sexagesimal}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="gouttiere">
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setTypeADemander(true)
          }}
        >
          + Ajouter un segment
        </button>
      </div>

      <div className="pied">
        <hr className="hr-section" />
        <div className="gouttiere pied__ligne">
          <span className="legende">Temps rémunéré</span>
          <ResultatDuree
            resultat={temps}
            classe="pied__valeur"
            surReglageManquant={onOuvrirReglages}
          />
        </div>
        {/* Pas de bouton de validation : la saisie est enregistrée à chaque
            frappe, il n'y a donc rien à valider. Un bouton qui ne fait rien
            laisserait croire qu'une journée non « validée » n'est pas comptée. */}
        <div className="gouttiere pied__mention">
          <p className="mention">{MENTIONS.durees}</p>
        </div>
      </div>

      {/* Le type est demandé avant la création : rien n'est écrit tant que
          l'utilisateur n'a pas dit ce qu'il ajoute. */}
      {typeADemander ? (
        <DialogueChoix
          titre="Tu ajoutes quoi ?"
          texte="Choisis d'abord ce que c'était. Tu mettras les heures juste après."
          choix={TYPES_SEGMENT.map((type) => ({ valeur: type, libelle: libelleType(type) }))}
          onChoisir={(valeur) => {
            creerSegment(valeur as TypeSegment)
          }}
          onAnnuler={() => {
            setTypeADemander(false)
          }}
        />
      ) : null}

      {segmentEnEdition === undefined ? null : (
        <EditeurSegment
          segment={jourOuVide.segments.find((s) => s.id === segmentEnEdition)}
          zone={zone}
          mode={modeSaisieHeure}
          refus={refus}
          onChangerType={(type) => {
            majSegment(segmentEnEdition, { type })
          }}
          onChangerHeure={(bord, heure) => {
            if (heure === undefined) {
              majSegment(segmentEnEdition, { [bord]: undefined })
              return
            }
            const segment = jourOuVide.segments.find((s) => s.id === segmentEnEdition)
            // Un segment de nuit se termine le lendemain : on le déduit de
            // l'ordre des heures murales, pas d'un réglage.
            const dateDuBord =
              bord === 'fin' &&
              segment?.debut !== undefined &&
              heure < heureMuraleDe(segment.debut, zone)
                ? decalerDate(date, 1)
                : date
            resoudre(`${segmentEnEdition}-${bord}`, dateDuBord, heure, (instant) => {
              majSegment(segmentEnEdition, { [bord]: instant })
            })
          }}
          onSupprimer={() => {
            supprimerSegment(segmentEnEdition)
            setSegmentEnEdition(undefined)
          }}
          onFermer={() => {
            setSegmentEnEdition(undefined)
          }}
        />
      )}

      {aDesambiguiser === undefined ? null : (
        <DialogueChoix
          titre="Cette heure existe deux fois"
          texte="Cette nuit-là, les horloges reculent : la même heure revient une seconde fois. Laquelle as-tu vécue ?"
          choix={aDesambiguiser.choix.map((instant, index) => ({
            valeur: instant,
            libelle: index === 0 ? 'Avant le changement d’heure' : 'Après le changement d’heure',
            detail: instant,
          }))}
          onChoisir={(valeur) => {
            aDesambiguiser.appliquer(valeur)
            setADesambiguiser(undefined)
          }}
          onAnnuler={() => {
            setADesambiguiser(undefined)
          }}
        />
      )}

      {zoneAQualifier === undefined ? null : (
        <DialogueChoix
          titre="C'était quoi, ce moment ?"
          texte={`${heureMuraleDe(zoneAQualifier.debut, zone)} → ${heureMuraleDe(zoneAQualifier.fin, zone)}, ${formatDuree(zoneAQualifier.duree).sexagesimal}. L'app ne le devine pas.`}
          choix={TYPES_SEGMENT.map((type) => ({ valeur: type, libelle: libelleType(type) }))}
          onChoisir={(valeur) => {
            qualifier(valeur as TypeSegment)
          }}
          onAnnuler={() => {
            setZoneAQualifier(undefined)
          }}
        />
      )}
    </>
  )
}

type Ambiguite = {
  readonly champ: string
  readonly choix: readonly ISODateTime[]
  readonly appliquer: (instant: ISODateTime) => void
}

/**
 * Édition d'un segment, ouverte par un appui sur sa ligne. La ligne de liste
 * reste à 46 px et lisible d'un coup d'œil (DESIGN §7) ; les champs vivent ici.
 */
function EditeurSegment({
  segment,
  zone,
  mode,
  refus,
  onChangerType,
  onChangerHeure,
  onSupprimer,
  onFermer,
}: {
  readonly segment: Segment | undefined
  readonly zone: string
  readonly mode: ModeSaisieHeure
  readonly refus: Record<string, string>
  readonly onChangerType: (type: TypeSegment) => void
  readonly onChangerHeure: (bord: 'debut' | 'fin', heure: string | undefined) => void
  readonly onSupprimer: () => void
  readonly onFermer: () => void
}): React.JSX.Element | null {
  const reference = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const element = reference.current
    if (element !== null && !element.open) {
      element.showModal()
    }
  }, [])

  if (segment === undefined) {
    return null
  }

  return (
    <dialog
      className="dialog"
      ref={reference}
      aria-label="Modifier le segment"
      onCancel={(evenement) => {
        evenement.preventDefault()
        onFermer()
      }}
    >
      <div className="dialog__corps">
        <h2 className="dialog__titre">{libelleType(segment.type)}</h2>

        <div className="bloc-horaire">
          <ChampHeure
            label="Début"
            mode={mode}
            valeur={segment.debut === undefined ? undefined : heureMuraleDe(segment.debut, zone)}
            onChange={(heure) => {
              onChangerHeure('debut', heure)
            }}
            {...(refus[`${segment.id}-debut`] === undefined
              ? {}
              : { refus: refus[`${segment.id}-debut`] })}
          />
          <div className="bloc-horaire__separateur" aria-hidden="true" />
          <ChampHeure
            label="Fin"
            mode={mode}
            valeur={segment.fin === undefined ? undefined : heureMuraleDe(segment.fin, zone)}
            onChange={(heure) => {
              onChangerHeure('fin', heure)
            }}
            {...(refus[`${segment.id}-fin`] === undefined
              ? {}
              : { refus: refus[`${segment.id}-fin`] })}
          />
        </div>

        <div className="field">
          <span className="field-label">Type</span>
          <div className="seg">
            {TYPES_SEGMENT.map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={segment.type === type}
                onClick={() => {
                  onChangerType(type)
                }}
              >
                {libelleType(type)}
              </button>
            ))}
          </div>
        </div>

        <div className="dialog__choix">
          <button type="button" className="btn btn-primary" onClick={onFermer}>
            Terminé
          </button>
          <button type="button" className="btn btn-ghost" onClick={onSupprimer}>
            Supprimer ce segment
          </button>
        </div>
      </div>
    </dialog>
  )
}

// ————————————————————————————————————————————————————————
// Petites fonctions d'affichage — aucune arithmétique métier
// ————————————————————————————————————————————————————————

function statutDuJour(journee: JourneeQualifiee): 'complete' | 'partial' | 'unknown' {
  if (journee.complete) {
    return 'complete'
  }
  return journee.zones.length === 0 && journee.zonesIndeterminees.length === 0
    ? 'unknown'
    : 'partial'
}

function passeMinuit(jour: WorkDay, heureFin: string, zone: string): boolean {
  if (jour.priseService === undefined) {
    return false
  }
  return heureFin <= heureMuraleDe(jour.priseService, zone)
}

function sans(source: Record<string, string>, cle: string): Record<string, string> {
  const copie = { ...source }
  delete copie[cle]
  return copie
}

function sansChamp(jour: WorkDay, champ: 'priseService' | 'finService'): WorkDay {
  const copie = { ...jour }
  delete copie[champ]
  return copie
}

/**
 * « Dupliquer hier » recopie la **forme** de la veille sur la date du jour : les
 * heures murales, pas les instants. Un service de 05:40 reste un service de
 * 05:40 même si le changement d'heure est passé entre-temps.
 */
function recopier(source: WorkDay, cible: WorkDay, date: ISODate, zone: string): WorkDay {
  const reporter = (instant: ISODateTime | undefined, jours: number): ISODateTime | undefined => {
    if (instant === undefined) {
      return undefined
    }
    const resolution = parseHeureLocale(
      decalerDate(date, jours),
      heureMuraleDe(instant, zone),
      zone,
    )
    return resolution.status === 'ok' ? resolution.instant : undefined
  }

  const decalageJour = (instant: ISODateTime): number =>
    instant.slice(0, 10) === source.dateRattachement ? 0 : 1

  const prise = reporter(source.priseService, 0)
  const fin =
    source.finService === undefined
      ? undefined
      : reporter(source.finService, decalageJour(source.finService))

  return {
    ...cible,
    dateRattachement: date,
    ...(prise === undefined ? {} : { priseService: prise }),
    ...(fin === undefined ? {} : { finService: fin }),
    ...(source.decouche === undefined ? {} : { decouche: source.decouche }),
    segments: source.segments.map((segment) => {
      const debut = segment.debut === undefined ? undefined : reporter(segment.debut, decalageJour(segment.debut))
      const finSeg = segment.fin === undefined ? undefined : reporter(segment.fin, decalageJour(segment.fin))
      return {
        id: nouvelId('seg'),
        type: segment.type,
        ...(debut === undefined ? {} : { debut }),
        ...(finSeg === undefined ? {} : { fin: finSeg }),
      }
    }),
  }
}
