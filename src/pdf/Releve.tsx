import {
  formatDuree,
  formatEcartDuree,
  formatEcartMontant,
  formatIntervalleDuree,
  formatIntervalleMontant,
  formatMontant,
  libelleStatut,
  MENTIONS,
  type Comparaison,
  type DetailIntervalle,
  type LigneEcart,
  type LigneJournaliere,
  type SynthesePeriode,
} from '../engine'
import { libelleAbsence, libelleIntervalleLong, libelleJourCourt } from '../ui/libelles'

/**
 * Relevé imprimable (SPEC §11).
 *
 * **Il ne recalcule rien.** Il reçoit exactement la même sortie moteur que
 * l'écran et se contente de la mettre en page : si une valeur doit figurer ici,
 * elle sort du moteur (SPEC §2). C'est ce qui garantit qu'un relevé remis à un
 * employeur dit la même chose que l'écran qui l'a produit.
 *
 * Rendu par `window.print()` et l'« Enregistrer en PDF » du système : aucune
 * dépendance, aucun réseau, et la mise en page reste celle du navigateur.
 */
export function Releve({
  detail,
  synthese,
  comparaison,
  entreprise,
  imprimeLe,
}: {
  readonly detail: DetailIntervalle
  readonly synthese: SynthesePeriode
  readonly comparaison: Comparaison
  readonly entreprise: string | undefined
  /** Passé en paramètre : le relevé ne lit pas l'horloge. */
  readonly imprimeLe: string
}): React.JSX.Element {
  return (
    <article className="releve">
      <header className="releve__entete">
        <h1 className="releve__titre">Relevé — {synthese.periode.label}</h1>
        <p className="releve__bornes">
          {libelleIntervalleLong(detail.debut, detail.fin)}
          {entreprise === undefined ? '' : ` · ${entreprise}`}
        </p>
      </header>

      <section className="releve__synthese">
        <Poste
          libelle="Temps rémunéré"
          valeur={valeurDuree(detail.total)}
          statut={libelleStatut(detail.total.status)}
        />
        <Poste
          libelle="Heures supplémentaires"
          valeur={valeurDuree(synthese.heuresSup.duree)}
          statut={libelleStatut(synthese.heuresSup.duree.status)}
        />
        <Poste
          libelle="Indemnités"
          valeur={valeurMontant(synthese.totalIndemnites)}
          statut={libelleStatut(synthese.totalIndemnites.status)}
        />
      </section>

      <p className="releve__mention">{MENTIONS.durees}</p>

      <section>
        <h2 className="releve__section">Journées</h2>
        <table className="releve__table">
          <thead>
            <tr>
              <th scope="col">Jour</th>
              <th scope="col">Amplitude</th>
              <th scope="col">Conduite</th>
              <th scope="col">Temps rémunéré</th>
            </tr>
          </thead>
          <tbody>
            {detail.lignes.map((ligne) => (
              <LigneImprimee key={ligne.date} ligne={ligne} />
            ))}
          </tbody>
        </table>
      </section>

      {comparaison.lignesComparees === 0 ? null : (
        <section>
          <h2 className="releve__section">Écarts avec la fiche de paie</h2>
          <p className="releve__mention">{MENTIONS.ecarts}</p>
          <table className="releve__table">
            <thead>
              <tr>
                <th scope="col">Ligne</th>
                <th scope="col">Mes saisies</th>
                <th scope="col">Ma fiche</th>
                <th scope="col">Écart</th>
              </tr>
            </thead>
            <tbody>
              {comparaison.lignes
                .filter((l) => l.ecart !== undefined)
                .map((ligne) => (
                  <tr key={ligne.code}>
                    <th scope="row">{ligne.libelle}</th>
                    <td>{valeurLigne(ligne)}</td>
                    <td>{ficheLigne(ligne)}</td>
                    <td>{ecartLigne(ligne)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </section>
      )}

      <footer className="releve__pied">
        <p>
          Relevé établi le {imprimeLe} à partir de mes propres saisies. Il ne remplace pas un
          bulletin de paie.
        </p>
      </footer>
    </article>
  )
}

function Poste({
  libelle,
  valeur,
  statut,
}: {
  readonly libelle: string
  readonly valeur: string
  readonly statut: string
}): React.JSX.Element {
  return (
    <div className="releve__poste">
      <span className="releve__poste-libelle">{libelle}</span>
      {/* Une valeur absente n'est jamais remplacée par un zéro : c'est le mot du
          statut qui s'imprime (DESIGN §14). */}
      <span className="releve__poste-valeur">{valeur === '' ? statut : valeur}</span>
    </div>
  )
}

function LigneImprimee({ ligne }: { readonly ligne: LigneJournaliere }): React.JSX.Element {
  if (ligne.sorte === 'repos') {
    return (
      <tr>
        <th scope="row">{libelleJourCourt(ligne.date)}</th>
        <td colSpan={3}>Repos</td>
      </tr>
    )
  }
  if (ligne.sorte === 'absence') {
    return (
      <tr>
        <th scope="row">{libelleJourCourt(ligne.date)}</th>
        <td colSpan={3}>{libelleAbsence(ligne.type)} — non valorisé</td>
      </tr>
    )
  }
  return (
    <tr>
      <th scope="row">{libelleJourCourt(ligne.date)}</th>
      <td>{valeurDuree(ligne.amplitude)}</td>
      <td>{valeurDuree(ligne.conduite)}</td>
      <td>{valeurDuree(ligne.tempsRemunere)}</td>
    </tr>
  )
}

// ————————————————————————————————————————————————————————
// Mise en forme — aucune arithmétique, uniquement les formateurs du moteur
// ————————————————————————————————————————————————————————

function valeurDuree(resultat: DetailIntervalle['total']): string {
  switch (resultat.status) {
    case 'complete':
      return formatDuree(resultat.value).sexagesimal
    case 'partial':
      return formatIntervalleDuree(resultat.range.min, resultat.range.max).sexagesimal
    case 'unknown':
      return ''
  }
}

function valeurMontant(resultat: SynthesePeriode['totalIndemnites']): string {
  switch (resultat.status) {
    case 'complete':
      return formatMontant(resultat.value)
    case 'partial':
      return formatIntervalleMontant(resultat.range.min, resultat.range.max)
    case 'unknown':
      return ''
  }
}

function valeurLigne(ligne: LigneEcart): string {
  switch (ligne.unite) {
    case 'duree':
      return valeurDuree(ligne.calcule)
    case 'montant':
      return valeurMontant(ligne.calcule)
    case 'quantite':
      return ligne.calcule.status === 'complete' ? String(ligne.calcule.value) : ''
  }
}

function ficheLigne(ligne: LigneEcart): string {
  if (ligne.fiche === undefined) {
    return ''
  }
  switch (ligne.unite) {
    case 'duree':
      return formatDuree(ligne.fiche).sexagesimal
    case 'montant':
      return formatMontant(ligne.fiche)
    case 'quantite':
      return String(ligne.fiche)
  }
}

function ecartLigne(ligne: LigneEcart): string {
  const ecart = ligne.ecart
  if (ecart === undefined) {
    return ''
  }
  if (ecart.valeur === 0) {
    return ecart.dansIncertitude ? 'compatible' : 'aucun'
  }
  switch (ligne.unite) {
    case 'duree':
      return formatEcartDuree(ecart.valeur).sexagesimal
    case 'montant':
      return formatEcartMontant(ecart.valeur)
    case 'quantite':
      return ecart.valeur > 0 ? `+${String(ecart.valeur)}` : String(ecart.valeur)
  }
}

