/**
 * `navigator.storage.persist()` — **c'est une demande, pas une garantie**
 * (SPEC §12). Le retour est lu, et un refus renforce les rappels de sauvegarde
 * au lieu d'être ignoré.
 *
 * Isolé dans son propre module parce que c'est le seul endroit de l'app qui
 * touche à une API du navigateur pouvant être absente.
 */
export async function demanderStockagePersistant(): Promise<'accorde' | 'refuse'> {
  const stockage: StorageManager | undefined = globalThis.navigator?.storage
  if (stockage === undefined || typeof stockage.persist !== 'function') {
    // API absente : traité comme un refus, jamais comme un succès optimiste.
    return 'refuse'
  }
  try {
    return (await stockage.persist()) ? 'accorde' : 'refuse'
  } catch {
    return 'refuse'
  }
}
