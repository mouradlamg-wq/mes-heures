import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Gardes au niveau de la source des écrans.
 *
 * Ces contrôles existent parce que la règle qu'ils protègent — **l'app ne
 * présume rien** — se viole en une ligne, sans que rien ne casse : un
 * `type: 'conduite'` posé « pour commencer » écrit une donnée que l'utilisateur
 * n'a jamais saisie, et plus personne ne la remet en question ensuite.
 */
const RACINE = fileURLToPath(new URL('../..', import.meta.url))
const AUJOURDHUI = readFileSync(join(RACINE, 'src/ui/ecrans/Aujourdhui.tsx'), 'utf8')

/** Retire commentaires et gabarits : on analyse du code, pas de la prose. */
function codeSeul(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ')
}

describe('INT — aucun défaut présumé à la saisie', () => {
  it('INT-22 — aucun type de segment n’est écrit en dur à la création', () => {
    const code = codeSeul(AUJOURDHUI)

    // Le type vient forcément d'un choix de l'utilisateur : soit le paramètre
    // d'une fonction, soit une valeur du dialogue. Jamais un littéral.
    for (const type of ['conduite', 'autre_travail', 'disponibilite', 'coupure']) {
      expect(code, `type ${type} présumé`).not.toMatch(
        new RegExp(`type:\\s*['"\`]${type}['"\`]`),
      )
    }
  })

  it('INT-22 — le type est demandé avant que le segment existe', () => {
    // `creerSegment` ne peut être appelée qu'avec un type reçu en paramètre, et
    // c'est le dialogue qui le fournit.
    expect(AUJOURDHUI).toMatch(/const creerSegment = \(type: TypeSegment\)/)
    expect(AUJOURDHUI).toContain('setTypeADemander(true)')
    expect(AUJOURDHUI).toContain('Tu ajoutes quoi ?')
  })

  it('INT-23 — un segment neuf ne reçoit ni début ni fin', () => {
    const creation = /const segment: Segment = \{([^}]*)\}/.exec(AUJOURDHUI)

    expect(creation).not.toBeNull()
    expect(creation?.[1]).not.toContain('debut')
    expect(creation?.[1]).not.toContain('fin')
  })

  it('INT-23 — aucune heure par défaut nulle part dans les écrans', () => {
    const code = codeSeul(AUJOURDHUI)

    // Pas de `06:00` ni d'heure ronde glissée comme valeur de départ.
    expect(code).not.toMatch(/(debut|fin|priseService|finService)\s*:\s*['"]\d{2}:\d{2}['"]/)
  })
})
