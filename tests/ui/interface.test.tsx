// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  MENTIONS,
  minutes,
  partial,
  qualifierJournee,
  unknown,
  type Minutes,
} from '../../src/engine'
import { ChampHeure } from '../../src/ui/composants/ChampHeure'
import { SaisieDuree } from '../../src/ui/composants/SaisieDuree'
import { ResultatDuree } from '../../src/ui/composants/Duree'
import { TagStatut } from '../../src/ui/composants/Statut'
import { rangees } from '../../src/ui/ecrans/rangees'
import { aQualificationManuelle, aWorkDay, PARIS, reinitialiserCompteur } from '../fixtures/builders'


const LUNDI = '2027-03-15'
/** Chiffres — sert à vérifier qu'un `unknown` n'en montre aucun. */
const UN_CHIFFRE = /\d/

/**
 * Texte affiché, espaces insécables ramenés à des espaces ordinaires.
 *
 * Les assertions restent ainsi lisibles — `'151 h 40'` — sans qu'on puisse
 * confondre un test qui passe avec un test dont le littéral contient par hasard
 * le bon caractère invisible. La présence des insécables, elle, est vérifiée à
 * la source par `NUM-14`.
 */
function texteRendu(): string {
  return (document.body.textContent ?? '').replaceAll(' ', ' ')
}

beforeEach(reinitialiserCompteur)
afterEach(cleanup)

describe('INT — restitution des résultats', () => {
  it('INT-01 — la mention des écrans de durées est au mot près', () => {
    expect(MENTIONS.durees).toBe(
      'Ces durées sont indicatives. Cette version ne vérifie pas la conformité au règlement européen.',
    )
  })

  it('INT-02 — la mention de l’écran Vérifier ma paie est au mot près', () => {
    expect(MENTIONS.ecarts).toBe(
      "Un écart n'est pas forcément une erreur. Compare avec ton contrat, puis vois avec ton employeur ou tes représentants du personnel.",
    )
  })

  it('INT-03 — un unknown ne montre aucun chiffre, mais une phrase et un lien', () => {
    const surReglage = vi.fn()
    render(
      <ResultatDuree
        resultat={unknown<Minutes>({
          code: 'taux_absent',
          message: "Le taux horaire n'est pas renseigné.",
          reglageManquant: 'tauxHoraireBaseCents',
        })}
        surReglageManquant={surReglage}
      />,
    )

    expect(screen.getByText('INCALCULABLE')).toBeDefined()
    expect(screen.getByText("Le taux horaire n'est pas renseigné.")).toBeDefined()

    // Ni 0, ni tiret, ni valeur grisée (DESIGN §6, §14).
    const rendu = texteRendu()
    expect(rendu).not.toMatch(UN_CHIFFRE)
    expect(rendu).not.toContain('—')

    fireEvent.click(screen.getByRole('button'))
    expect(surReglage).toHaveBeenCalledWith('tauxHoraireBaseCents')
  })

  it('INT-04 — un partial montre l’intervalle, jamais une valeur seule', () => {
    render(
      <ResultatDuree
        resultat={partial<Minutes>({ min: minutes(500), max: minutes(590) })}
      />,
    )

    const rendu = texteRendu()
    expect(rendu).toContain('8 h 20')
    expect(rendu).toContain('9 h 50')
    expect(rendu).toContain('–')
  })

  it('INT-05 — un complete montre la valeur dans les deux notations', () => {
    render(<ResultatDuree resultat={partial<Minutes>({ min: minutes(500), max: minutes(500) })} />)

    const rendu = texteRendu()
    expect(rendu).toContain('8 h 20')
    expect(rendu).toContain('8,33 h')
  })

  it('INT-06 — le statut est écrit en toutes lettres', () => {
    render(
      <>
        <TagStatut statut="complete" />
        <TagStatut statut="partial" />
        <TagStatut statut="unknown" />
      </>,
    )

    expect(screen.getByText('CERTAIN')).toBeDefined()
    expect(screen.getByText('PARTIEL')).toBeDefined()
    expect(screen.getByText('INCALCULABLE')).toBeDefined()
  })
})

describe('INT — saisie', () => {
  it('INT-07 — quatre chiffres suffisent, les deux points s’écrivent seuls', () => {
    const onChange = vi.fn()
    render(<ChampHeure label="Prise" valeur={undefined} onChange={onChange} />)

    const champ = screen.getByLabelText<HTMLInputElement>('Prise')
    fireEvent.change(champ, { target: { value:'0540' } })

    expect(champ.value).toBe('05:40')
    expect(onChange).toHaveBeenCalledWith('05:40')
  })

  it('INT-08 — une heure hors plage est refusée en une phrase, sans correction', () => {
    const onChange = vi.fn()
    render(<ChampHeure label="Prise" valeur={undefined} onChange={onChange} />)

    const champ = screen.getByLabelText<HTMLInputElement>('Prise')
    fireEvent.change(champ, { target: { value:'2500' } })

    // La saisie reste telle quelle : pas de 23:00 fabriqué à la place.
    expect(champ.value).toBe('25:00')
    expect(onChange).not.toHaveBeenCalledWith('25:00')
    expect(screen.getByRole('alert').textContent).toContain("pas d'heure au-delà de 23")
  })

  it('INT-16 — une durée se tape chiffre par chiffre, chaque frappe est visible', () => {
    // La régression que ce test verrouille : avec un champ purement contrôlé,
    // les deux premières touches n'ont rien à réécrire (une durée n'est lisible
    // qu'à trois chiffres), l'affichage repart à vide, et le champ devient
    // impossible à remplir.
    const onChange = vi.fn()
    function Hote(): React.JSX.Element {
      const [valeur, setValeur] = useState<Minutes | undefined>(undefined)
      return (
        <SaisieDuree
          identifiant="duree"
          valeur={valeur}
          onChange={(nouvelle) => {
            onChange(nouvelle)
            setValeur(nouvelle)
          }}
        />
      )
    }
    render(<Hote />)

    const champ = screen.getByRole('textbox')
    const frappes = ['1', '15', '151', '1514', '15140']
    const affiches: string[] = []
    for (const frappe of frappes) {
      fireEvent.change(champ, { target: { value: frappe } })
      affiches.push((champ as HTMLInputElement).value)
    }

    expect(affiches).toEqual(frappes)
    // Rien n'est enregistré tant que la saisie ne dit rien : 1 et 15 sont muets.
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(onChange).toHaveBeenLastCalledWith(151 * 60 + 40)
  })

  it('INT-17 — la saisie en cours est relue, centièmes compris', () => {
    render(<SaisieDuree identifiant="duree" valeur={undefined} onChange={vi.fn()} />)

    const champ = screen.getByRole('textbox')
    fireEvent.change(champ, { target: { value: '15' } })
    expect(texteRendu()).toContain('Continue')

    fireEvent.change(champ, { target: { value: '15140' } })
    expect(texteRendu()).toContain('151 h 40')
    expect(texteRendu()).toContain('151,67 h')
  })

  it('INT-18 — à la sortie du champ, l’affichage reprend la forme canonique', () => {
    render(<SaisieDuree identifiant="duree" valeur={minutes(151 * 60 + 40)} onChange={vi.fn()} />)

    const champ = screen.getByRole('textbox')
    expect((champ as HTMLInputElement).value).toBe('151:40')

    fireEvent.change(champ, { target: { value: '15140' } })
    expect((champ as HTMLInputElement).value).toBe('15140')

    fireEvent.blur(champ)
    expect((champ as HTMLInputElement).value).toBe('151:40')
  })

  it('INT-09 — mode clavier : aucun sélecteur, quatre chiffres au pavé numérique', () => {
    render(<ChampHeure label="Prise" valeur="05:40" mode="clavier" onChange={vi.fn()} />)

    const champ = screen.getByLabelText('Prise')
    expect(champ.getAttribute('inputmode')).toBe('numeric')
    expect(champ.getAttribute('type')).toBe('text')
    expect(document.querySelector('select')).toBeNull()
    expect(document.querySelector('input[type="time"]')).toBeNull()
  })

  it('INT-09 — le clavier est le mode par défaut', () => {
    render(<ChampHeure label="Prise" valeur="05:40" onChange={vi.fn()} />)

    expect(screen.getByLabelText('Prise').getAttribute('type')).toBe('text')
  })

  it('INT-19 — mode sélecteur : le champ natif du téléphone', () => {
    render(<ChampHeure label="Prise" valeur="05:40" mode="selecteur" onChange={vi.fn()} />)

    const champ = screen.getByLabelText<HTMLInputElement>('Prise')
    expect(champ.getAttribute('type')).toBe('time')
    expect(champ.value).toBe('05:40')
  })

  it('INT-20 — les deux modes produisent la même chaîne HH:mm', () => {
    const auClavier = vi.fn()
    const { unmount } = render(
      <ChampHeure label="Prise" valeur={undefined} mode="clavier" onChange={auClavier} />,
    )
    fireEvent.change(screen.getByLabelText('Prise'), { target: { value: '0540' } })
    unmount()

    const auSelecteur = vi.fn()
    render(<ChampHeure label="Prise" valeur={undefined} mode="selecteur" onChange={auSelecteur} />)
    fireEvent.change(screen.getByLabelText('Prise'), { target: { value: '05:40' } })

    // Même sortie, donc une seule résolution en instant en aval — et un seul
    // endroit où la nuit du changement d'heure est traitée.
    expect(auClavier).toHaveBeenLastCalledWith('05:40')
    expect(auSelecteur).toHaveBeenLastCalledWith('05:40')
  })

  it('INT-20 — vider le champ produit undefined dans les deux modes', () => {
    const auClavier = vi.fn()
    const { unmount } = render(
      <ChampHeure label="Prise" valeur="05:40" mode="clavier" onChange={auClavier} />,
    )
    fireEvent.change(screen.getByLabelText('Prise'), { target: { value: '' } })
    unmount()

    const auSelecteur = vi.fn()
    render(<ChampHeure label="Prise" valeur="05:40" mode="selecteur" onChange={auSelecteur} />)
    fireEvent.change(screen.getByLabelText('Prise'), { target: { value: '' } })

    expect(auClavier).toHaveBeenLastCalledWith(undefined)
    expect(auSelecteur).toHaveBeenLastCalledWith(undefined)
  })

  it('INT-20 — un refus métier reste affiché quel que soit le mode', () => {
    const refus = "Cette heure n'existe pas cette nuit-là."
    const { unmount } = render(
      <ChampHeure label="Prise" valeur="02:30" mode="clavier" refus={refus} onChange={vi.fn()} />,
    )
    expect(screen.getByRole('alert').textContent).toBe(refus)
    unmount()

    render(
      <ChampHeure label="Prise" valeur="02:30" mode="selecteur" refus={refus} onChange={vi.fn()} />,
    )
    expect(screen.getByRole('alert').textContent).toBe(refus)
  })
})

describe('INT — liste de la journée', () => {
  const journeeAvecTrou = () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '05:40',
      fin: '18:10',
      segments: [
        { type: 'conduite', de: '05:40', a: '09:20' },
        { type: 'coupure', de: '09:20', a: '12:00' },
        { type: 'conduite', de: '13:30', a: '17:50' },
        { type: 'autre_travail', de: '17:50', a: '18:10' },
      ],
    })
    return jour
  }

  it('INT-10 — la liste montre les zones du moteur, pas les segments bruts', () => {
    const jour = journeeAvecTrou()

    const avant = rangees(jour, qualifierJournee(jour, PARIS))
    expect(avant.map((r) => r.sorte)).toEqual([
      'qualifiee',
      'qualifiee',
      'indeterminee',
      'qualifiee',
      'qualifiee',
    ])

    // Une fois la zone qualifiée en coupure, elle **fusionne** avec la coupure
    // qui la précède : la ligne 09:20–12:00 devient 09:20–13:30.
    const apres = rangees(
      jour,
      qualifierJournee(jour, PARIS, [aQualificationManuelle(jour, '12:00', '13:30', 'coupure')]),
    )

    expect(apres).toHaveLength(4)
    expect(apres.some((r) => r.sorte === 'indeterminee')).toBe(false)
    const coupure = apres[1]
    expect(coupure?.sorte).toBe('qualifiee')
    if (coupure?.sorte === 'qualifiee') {
      expect(coupure.zone.type).toBe('coupure')
      expect(coupure.zone.duree).toBe(4 * 60 + 10)
    }
  })

  it('INT-11 — une zone non qualifiée est une ligne à part, avec sa durée', () => {
    const jour = journeeAvecTrou()
    const liste = rangees(jour, qualifierJournee(jour, PARIS))
    const zone = liste.find((r) => r.sorte === 'indeterminee')

    expect(zone).toBeDefined()
    if (zone?.sorte === 'indeterminee') {
      expect(zone.zone.duree).toBe(90)
      expect(zone.zone.cause).toBe('trou')
    }
  })

  it('INT-12 — un segment sans borne reste visible, sans durée inventée', () => {
    const jour = aWorkDay({
      date: LUNDI,
      prise: '06:00',
      fin: '14:00',
      segments: [
        { type: 'conduite', de: '06:00', a: '14:00' },
        { type: 'coupure', de: '10:00' },
      ],
    })

    const liste = rangees(jour, qualifierJournee(jour, PARIS))
    const incomplet = liste.find((r) => r.sorte === 'incomplet')

    expect(incomplet).toBeDefined()
    // Il est en fin de liste : le moteur ne sait pas le situer.
    expect(liste.at(-1)).toBe(incomplet)
  })
})
