import { useEffect, useRef } from 'react'
import {
  ecrireMontantSaisie,
  ecrirePourcentageSaisie,
  lireEntierSaisie,
  lireMontantSaisie,
  lirePourcentageSaisie,
  type Cents,
  type Minutes,
  zoneValide,
  type ModeDecompteHS,
  type RattachementSemaineChevauchante,
  type Settings,
} from '../../engine'
import { useDonnees } from '../../app/contexteDonnees'
import { SaisieDuree } from '../composants/SaisieDuree'
import { Sauvegarde } from '../composants/Sauvegarde'
import { EditeurIndemnites } from '../composants/EditeurIndemnites'
import { EditeurTranches, EditeurPaliersCoupure } from '../composants/EditeurListes'

/**
 * Écran « Réglages » (DESIGN §10).
 *
 * **Un champ vide n'est pas neutre** : sous chaque champ non renseigné, une
 * ligne dit ce que son absence désactive. C'est la contrepartie visible de la
 * règle « absence de configuration = absence de donnée ».
 *
 * Aucun champ n'est prérempli avec une valeur plausible. L'app ne connaît ni ta
 * convention, ni tes tarifs.
 */
export function Reglages({
  reglageVise,
  onRetour,
}: {
  readonly reglageVise?: string | undefined
  readonly onRetour: () => void
}): React.JSX.Element {
  const { repo, settings, modeSaisieHeure } = useDonnees()
  const cible = useRef<HTMLDivElement>(null)

  useEffect(() => {
    cible.current?.scrollIntoView({ block: 'center' })
  }, [reglageVise])

  const modifier = (modification: Partial<Settings>): void => {
    void repo.ecrireSettings({ ...settings, ...modification })
  }

  const retirer = (champ: keyof Settings): void => {
    const copie = { ...settings }
    delete copie[champ]
    void repo.ecrireSettings(copie)
  }

  return (
    <>
      <div className="gouttiere jour-entete">
        <h1 className="jour-entete__date">Réglages</h1>
        <button type="button" className="btn btn-ghost" onClick={onRetour}>
          ← Ma journée
        </button>
      </div>

      <hr className="hr-section" />

      <Section titre="Période de paie">
        <ChampNombre
          identifiant="payPeriodConfig"
          vise={reglageVise}
          reference={cible}
          label="Jour de début de la période"
          aide="1 pour le mois civil, 26 si ton entreprise décompte du 26 au 25."
          consequence="Sans ce jour, aucune période ne peut être construite : ni heures sup, ni comparaison de fiche."
          valeur={settings.payPeriodConfig?.jourDebut}
          onChange={(valeur) => {
            if (valeur === undefined) {
              retirer('payPeriodConfig')
              return
            }
            modifier({ payPeriodConfig: { jourDebut: valeur } })
          }}
        />
      </Section>

      <hr className="hr-section" />

      <Section titre="Heures supplémentaires">
        <div className="field">
          <span className="field-label">Mode de décompte</span>
          <div className="seg">
            {(['hebdomadaire', 'mensuel', 'periode_reference'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={settings.modeDecompteHS === mode}
                onClick={() => {
                  modifier({ modeDecompteHS: mode })
                }}
              >
                {libelleMode(mode)}
              </button>
            ))}
          </div>
          {settings.modeDecompteHS === undefined ? (
            <span className="field-consequence">
              Sans ce mode, l'app ne sait pas sur quelle durée compter tes heures
              supplémentaires.
            </span>
          ) : null}
        </div>

        <ChampNombre
          identifiant="debutSemaine"
          vise={reglageVise}
          reference={cible}
          label="Premier jour de la semaine"
          aide="1 = lundi. Le lundi est le régime supplétif, mais un accord peut en décider autrement."
          consequence="Sans ce jour, le décompte hebdomadaire reste incalculable. L'app ne suppose pas le lundi."
          valeur={settings.debutSemaine}
          onChange={(valeur) => {
            if (valeur === undefined || valeur < 1 || valeur > 7) {
              retirer('debutSemaine')
              return
            }
            modifier({ debutSemaine: valeur as 1 | 2 | 3 | 4 | 5 | 6 | 7 })
          }}
        />

        <ChampDuree
          identifiant="dureeReferenceMinutes"
          vise={reglageVise}
          reference={cible}
          label="Durée de référence de la période de décompte"
          aide="En heures et minutes. C'est la durée à partir de laquelle tes heures deviennent supplémentaires."
          consequence="Sans elle, l'app ne peut pas dire à partir de quand tes heures deviennent supplémentaires."
          valeur={settings.dureeReferenceMinutes}
          onChange={(valeur) => {
            if (valeur === undefined) {
              retirer('dureeReferenceMinutes')
              return
            }
            modifier({ dureeReferenceMinutes: valeur })
          }}
        />

        {settings.modeDecompteHS !== 'periode_reference' ? null : (
          <>
            <ChampNombre
              identifiant="periodeReferenceSemaines"
              vise={reglageVise}
              reference={cible}
              label="Nombre de semaines du cycle"
              aide="4 pour un cycle de quatre semaines."
              consequence="Sans ce nombre, le cycle ne peut pas être découpé."
              valeur={settings.periodeReferenceSemaines}
              onChange={(valeur) => {
                if (valeur === undefined || valeur < 1) {
                  retirer('periodeReferenceSemaines')
                  return
                }
                modifier({ periodeReferenceSemaines: valeur })
              }}
            />

            <ChampDate
              identifiant="periodeReferenceDebut"
              label="Date de début du cycle"
              aide="Le point d'ancrage : sans lui, « 4 semaines » ne désigne aucune période précise."
              valeur={settings.periodeReferenceDebut}
              onChange={(valeur) => {
                if (valeur === undefined) {
                  retirer('periodeReferenceDebut')
                  return
                }
                modifier({ periodeReferenceDebut: valeur })
              }}
            />
          </>
        )}

        <div className="field">
          <span className="field-label">Semaine à cheval sur deux paies</span>
          <div className="seg seg--colonne">
            {(['periode_de_fin', 'periode_de_debut', 'prorata'] as const).map((regle) => (
              <button
                key={regle}
                type="button"
                aria-pressed={settings.rattachementSemaineChevauchante === regle}
                onClick={() => {
                  modifier({ rattachementSemaineChevauchante: regle })
                }}
              >
                {libelleRattachement(regle)}
              </button>
            ))}
          </div>
          {settings.rattachementSemaineChevauchante === undefined ? (
            <span className="field-consequence">
              Non réglé : l’app affichera les deux hypothèses et te laissera reconnaître la
              tienne sur ta fiche. C’est volontaire — elle ne tranche pas à ta place.
            </span>
          ) : (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                retirer('rattachementSemaineChevauchante')
              }}
            >
              Revenir aux deux hypothèses
            </button>
          )}
        </div>

        <ChampMontant
          identifiant="tauxHoraireBaseCents"
          vise={reglageVise}
          reference={cible}
          label="Taux horaire de base"
          aide="Celui qui figure sur ta fiche de paie."
          consequence="Sans ce taux, le brut et le montant des heures supplémentaires restent incalculables."
          valeur={settings.tauxHoraireBaseCents}
          onChange={(valeur) => {
            if (valeur === undefined) {
              retirer('tauxHoraireBaseCents')
              return
            }
            modifier({ tauxHoraireBaseCents: valeur })
          }}
        />

        <EditeurTranches
          tranches={settings.tranchesHS}
          onChanger={(tranches) => {
            if (tranches === undefined) {
              retirer('tranchesHS')
              return
            }
            modifier({ tranchesHS: tranches })
          }}
        />

        <label className="radio">
          <input
            type="checkbox"
            checked={settings.estForfaitJours === true}
            onChange={(evenement) => {
              modifier({ estForfaitJours: evenement.target.checked })
            }}
          />
          Je suis au forfait jours
        </label>
        {settings.estForfaitJours === true ? (
          <span className="field-consequence">
            Au forfait jours, le décompte ne se fait pas en heures : l’app ne comptera aucune
            heure supplémentaire, et le dira.
          </span>
        ) : null}
      </Section>

      <hr className="hr-section" />

      <Section titre="Saisie">
        <div className="field">
          <span className="field-label">Comment tu tapes tes heures</span>
          <div className="seg">
            {(['clavier', 'selecteur'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-pressed={modeSaisieHeure === mode}
                onClick={() => {
                  void repo.ecrireModeSaisieHeure(mode)
                }}
              >
                {mode === 'clavier' ? 'Clavier' : 'Sélecteur'}
              </button>
            ))}
          </div>
          <span className="field-consequence">
            {modeSaisieHeure === 'clavier'
              ? 'Quatre chiffres au clavier numérique : « 0540 » devient 05:40. Le plus rapide le soir, à une main.'
              : 'Le sélecteur d’heure de ton téléphone. Plus lent, mais impossible de se tromper de chiffre.'}
          </span>
          <span className="field-consequence">
            Ce choix reste sur cet appareil : il ne part pas dans la sauvegarde.
          </span>
        </div>
      </Section>

      <hr className="hr-section" />

      <Section titre="Coupures et disponibilité">
        <ChampFraction
          identifiant="fractionDisponibiliteRemuneree"
          vise={reglageVise}
          reference={cible}
          label="Part rémunérée de la disponibilité"
          aide="En pourcentage. 50 si une heure d'attente est payée une demi-heure."
          consequence="Sans elle, toute journée contenant de la disponibilité devient incalculable. L'app ne choisit ni 0 %, ni 100 %."
          valeur={settings.fractionDisponibiliteRemuneree}
          onChange={(valeur) => {
            if (valeur === undefined) {
              retirer('fractionDisponibiliteRemuneree')
              return
            }
            modifier({ fractionDisponibiliteRemuneree: valeur })
          }}
        />

        <EditeurPaliersCoupure
          paliers={settings.coupuresRemunerees}
          onChanger={(paliers) => {
            if (paliers === undefined) {
              retirer('coupuresRemunerees')
              return
            }
            modifier({ coupuresRemunerees: paliers })
          }}
        />
      </Section>

      <hr className="hr-section" />

      <Section titre="Indemnités">
        <p className="mention">
          L'app ne fournit aucun montant, aucune plage, aucun seuil. Tout se règle ici, depuis
          ta convention ou une fiche de paie.
        </p>
        <EditeurIndemnites />
      </Section>

      <hr className="hr-section" />

      <Section titre="Mon entreprise">
        <ChampTexte
          identifiant="entreprise"
          label="Nom de l'entreprise"
          aide="Il figure en tête du relevé imprimé."
          valeur={settings.entreprise}
          onChange={(valeur) => {
            if (valeur === undefined) {
              retirer('entreprise')
              return
            }
            modifier({ entreprise: valeur })
          }}
        />
        <ChampTexte
          identifiant="domicile"
          label="Lieu de rattachement"
          aide="Ton point de départ habituel."
          valeur={settings.domicile}
          onChange={(valeur) => {
            if (valeur === undefined) {
              retirer('domicile')
              return
            }
            modifier({ domicile: valeur })
          }}
        />
      </Section>

      <hr className="hr-section" />

      <Section titre="Sauvegarde">
        <Sauvegarde />
      </Section>

      <hr className="hr-section" />

      <Section titre="Fuseau de référence">
        <ChampTexte
          identifiant="timeZoneReference"
          label="Fuseau horaire"
          aide="Semaine, période et journée y sont définies — jamais dans le fuseau de ton téléphone."
          valeur={settings.timeZoneReference}
          onChange={(valeur) => {
            // Le seul réglage obligatoire : on refuse de le vider ou de le
            // remplacer par un fuseau que le système ne connaît pas.
            if (valeur !== undefined && zoneValide(valeur)) {
              modifier({ timeZoneReference: valeur })
            }
          }}
        />
        {zoneValide(settings.timeZoneReference) ? null : (
          <span className="field-consequence">
            Ce fuseau est inconnu : plus rien ne peut être daté tant qu’il n’est pas corrigé.
          </span>
        )}
      </Section>
    </>
  )
}

function Section({
  titre,
  children,
}: {
  readonly titre: string
  readonly children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="gouttiere reglages__section">
      <p className="kicker reglages__titre">{titre}</p>
      {children}
    </section>
  )
}

type ProprietesChamp<T> = {
  readonly identifiant: string
  readonly vise: string | undefined
  readonly reference: React.RefObject<HTMLDivElement | null>
  readonly label: string
  readonly aide: string
  readonly consequence: string
  readonly valeur: T | undefined
  readonly onChange: (valeur: T | undefined) => void
}

function Enveloppe({
  identifiant,
  vise,
  reference,
  label,
  aide,
  consequence,
  rempli,
  children,
}: {
  readonly identifiant: string
  readonly vise: string | undefined
  readonly reference: React.RefObject<HTMLDivElement | null>
  readonly label: string
  readonly aide: string
  readonly consequence: string
  readonly rempli: boolean
  readonly children: React.ReactNode
}): React.JSX.Element {
  const estVise = vise === identifiant
  return (
    <div className="field" ref={estVise ? reference : undefined} data-reglage={identifiant}>
      <label className="field-label" htmlFor={identifiant}>
        {label}
      </label>
      {children}
      <span className="field-consequence">{aide}</span>
      {rempli ? null : <span className="field-consequence">{consequence}</span>}
    </div>
  )
}

function ChampNombre(proprietes: ProprietesChamp<number>): React.JSX.Element {
  return (
    <Enveloppe {...proprietes} rempli={proprietes.valeur !== undefined}>
      <input
        id={proprietes.identifiant}
        className="input"
        type="text"
        inputMode="numeric"
        value={proprietes.valeur === undefined ? '' : String(proprietes.valeur)}
        onChange={(evenement) => {
          proprietes.onChange(lireEntierSaisie(evenement.target.value))
        }}
      />
    </Enveloppe>
  )
}


/**
 * Saisie d'une durée en heures et minutes. Le champ lui-même vit dans
 * `composants/SaisieDuree` : il porte une logique de frappe qui mérite d'être
 * testée sans écran.
 */
function ChampDuree(proprietes: ProprietesChamp<Minutes>): React.JSX.Element {
  return (
    <Enveloppe {...proprietes} rempli={proprietes.valeur !== undefined}>
      <SaisieDuree
        identifiant={proprietes.identifiant}
        valeur={proprietes.valeur}
        onChange={proprietes.onChange}
      />
    </Enveloppe>
  )
}

/**
 * Saisie en euros, stockée en centimes entiers : aucun flottant ne passe.
 * La frappe est cumulative comme sur un terminal de paiement — `1`, `3`, `4`,
 * `5` compose `13,45` — donc chaque touche a un effet visible, sans séparateur
 * à placer soi-même.
 */
function ChampMontant(proprietes: ProprietesChamp<Cents>): React.JSX.Element {
  return (
    <Enveloppe {...proprietes} rempli={proprietes.valeur !== undefined}>
      <input
        id={proprietes.identifiant}
        className="input"
        type="text"
        inputMode="decimal"
        // Jamais « 0,00 » en filigrane : un champ vide ne doit pas ressembler à
        // un montant nul (DESIGN §14).
        placeholder="--,--"
        value={proprietes.valeur === undefined ? '' : ecrireMontantSaisie(proprietes.valeur)}
        onChange={(evenement) => {
          proprietes.onChange(lireMontantSaisie(evenement.target.value))
        }}
      />
    </Enveloppe>
  )
}

/** Saisie en pourcentage, stockée en fraction 0..1. */
function ChampFraction(proprietes: ProprietesChamp<number>): React.JSX.Element {
  return (
    <Enveloppe {...proprietes} rempli={proprietes.valeur !== undefined}>
      <input
        id={proprietes.identifiant}
        className="input"
        type="text"
        inputMode="numeric"
        placeholder="-- %"
        value={
          proprietes.valeur === undefined ? '' : ecrirePourcentageSaisie(proprietes.valeur)
        }
        onChange={(evenement) => {
          const lue = lirePourcentageSaisie(evenement.target.value)
          if (lue !== undefined || evenement.target.value.replace(/\D/g, '') === '') {
            proprietes.onChange(lue)
          }
        }}
      />
    </Enveloppe>
  )
}

/** Champ libre : nom d'entreprise, lieu, fuseau. Vide = réglage absent. */
function ChampTexte({
  identifiant,
  label,
  aide,
  valeur,
  onChange,
}: {
  readonly identifiant: string
  readonly label: string
  readonly aide: string
  readonly valeur: string | undefined
  readonly onChange: (valeur: string | undefined) => void
}): React.JSX.Element {
  return (
    <div className="field">
      <label className="field-label" htmlFor={identifiant}>
        {label}
      </label>
      <input
        id={identifiant}
        className="input"
        type="text"
        autoComplete="off"
        value={valeur ?? ''}
        onChange={(evenement) => {
          const texte = evenement.target.value
          onChange(texte.trim() === '' ? undefined : texte)
        }}
      />
      <span className="field-consequence">{aide}</span>
    </div>
  )
}

/**
 * Date d'ancrage. Le sélecteur natif est ici sans réserve : il s'agit d'une date
 * unique et rare, pas d'une saisie répétée le soir.
 */
function ChampDate({
  identifiant,
  label,
  aide,
  valeur,
  onChange,
}: {
  readonly identifiant: string
  readonly label: string
  readonly aide: string
  readonly valeur: string | undefined
  readonly onChange: (valeur: string | undefined) => void
}): React.JSX.Element {
  return (
    <div className="field">
      <label className="field-label" htmlFor={identifiant}>
        {label}
      </label>
      <input
        id={identifiant}
        className="input"
        type="date"
        value={valeur ?? ''}
        onChange={(evenement) => {
          const texte = evenement.target.value
          onChange(texte === '' ? undefined : texte)
        }}
      />
      <span className="field-consequence">{aide}</span>
    </div>
  )
}

function libelleRattachement(regle: RattachementSemaineChevauchante): string {
  switch (regle) {
    case 'periode_de_fin':
      return 'Sur la paie où la semaine se termine'
    case 'periode_de_debut':
      return 'Sur la paie où la semaine commence'
    case 'prorata':
      return 'Répartie au prorata des jours'
  }
}

function libelleMode(mode: ModeDecompteHS): string {
  switch (mode) {
    case 'hebdomadaire':
      return 'Semaine'
    case 'mensuel':
      return 'Mois'
    case 'periode_reference':
      return 'Cycle'
  }
}
