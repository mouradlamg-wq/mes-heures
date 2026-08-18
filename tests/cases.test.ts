import { readFileSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, relative, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Relie mécaniquement la table de cas limites aux tests (CLAUDE.md §13).
 *
 * Sans ce test, la table dérive : on ajoute une ligne qu'on n'implémente pas, ou
 * on renomme un identifiant dans un test sans toucher la table, et la promesse
 * « un test par ligne » devient une intention.
 */

const RACINE = fileURLToPath(new URL('..', import.meta.url))
const CASES = join(RACINE, 'tests', 'cases')
const TESTS = join(RACINE, 'tests')

const RE_IDENTIFIANT = /\b(TPS|NUM|PRV|QUA|PER|PAI|IND|DON|ARC|INT|SEM)-(\d{2})\b/g

/**
 * Lignes de la table qui n'ont pas encore de test, avec la phase qui les
 * couvrira. **Cette liste doit être vide à la fin de la phase 4** — c'est le
 * critère de fin, et elle est relue à chaque rapport de phase.
 */
const A_COUVRIR_PLUS_TARD: Readonly<Record<string, string>> = {
  ...report('ARC-08', 'phase 7 — src/pdf n’existe pas encore'),
  ...report('ARC-16', 'phase 3 — contrôle des signatures publiques du moteur'),
  ...report('PAI-40', 'phase 7 — écran Vérifier ma paie'),
  ...report('PAI-41', 'phase 7 — idem'),
  ...report('PAI-42', 'phase 7 — idem'),
}

function report(id: string, raison: string): Record<string, string> {
  return { [id]: raison }
}


async function fichiersSous(dossier: string, motif: RegExp): Promise<string[]> {
  const entrees = await readdir(dossier, { withFileTypes: true, recursive: true })
  return entrees
    .filter((e) => e.isFile() && motif.test(e.name))
    .map((e) => join(e.parentPath, e.name))
}

function identifiantsDe(texte: string): Set<string> {
  const trouves = new Set<string>()
  for (const m of texte.matchAll(RE_IDENTIFIANT)) {
    trouves.add(m[0])
  }
  return trouves
}

const fichiersTable = await fichiersSous(CASES, /\.md$/)
const fichiersTest = (await fichiersSous(TESTS, /\.test\.tsx?$/)).filter(
  (f) => !f.endsWith('cases.test.ts'),
)

/** Identifiants déclarés dans la table : uniquement ceux en tête de ligne. */
const declares = new Set<string>()
for (const fichier of fichiersTable) {
  for (const ligne of readFileSync(fichier, 'utf8').split('\n')) {
    const m = /^\|\s*((?:TPS|NUM|PRV|QUA|PER|PAI|IND|DON|ARC|INT|SEM)-\d{2})\s*\|/.exec(ligne)
    if (m !== null) {
      declares.add(m[1]!)
    }
  }
}

/** Identifiants cités par un titre de test. */
const cites = new Set<string>()
for (const fichier of fichiersTest) {
  const source = readFileSync(fichier, 'utf8')
  for (const m of source.matchAll(/\b(?:it|test)\(\s*(['"`])((?:[^\\]|\\.)*?)\1/g)) {
    for (const id of identifiantsDe(m[2] ?? '')) {
      cites.add(id)
    }
  }
}

describe('Table de cas limites', () => {
  it('la table est lue et contient des lignes', () => {
    expect(fichiersTable.length).toBeGreaterThanOrEqual(8)
    expect(declares.size).toBeGreaterThan(100)
  })

  it('chaque identifiant cité par un test existe dans la table', () => {
    const inventes = [...cites].filter((id) => !declares.has(id)).sort()
    expect(inventes).toEqual([])
  })

  it('chaque ligne de la table a un test, sauf celles explicitement reportées', () => {
    const sansTest = [...declares].filter((id) => !cites.has(id)).sort()
    const nonJustifies = sansTest.filter((id) => !(id in A_COUVRIR_PLUS_TARD))
    expect(nonJustifies).toEqual([])
  })

  it('la liste des reports ne contient pas de ligne déjà couverte', () => {
    // Une fois le test écrit, la ligne doit sortir de la liste : sinon elle
    // masquerait une régression future.
    const perimes = Object.keys(A_COUVRIR_PLUS_TARD)
      .filter((id) => cites.has(id))
      .sort()
    expect(perimes).toEqual([])
  })

  it('aucun identifiant de la liste des reports n’est inconnu de la table', () => {
    const fantomes = Object.keys(A_COUVRIR_PLUS_TARD)
      .filter((id) => !declares.has(id))
      .sort()
    expect(fantomes).toEqual([])
  })

  it('aucun identifiant en double dans la table', () => {
    const compte = new Map<string, string[]>()
    for (const fichier of fichiersTable) {
      const nom = relative(RACINE, fichier).split(sep).join('/')
      for (const ligne of readFileSync(fichier, 'utf8').split('\n')) {
        const m = /^\|\s*((?:TPS|NUM|PRV|QUA|PER|PAI|IND|DON|ARC|INT|SEM)-\d{2})\s*\|/.exec(ligne)
        if (m !== null) {
          compte.set(m[1]!, [...(compte.get(m[1]!) ?? []), nom])
        }
      }
    }
    const doublons = [...compte.entries()].filter(([, ou]) => ou.length > 1)
    expect(doublons).toEqual([])
  })
})
