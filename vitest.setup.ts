// Filet de sécurité : si le fuseau du processus de test redevenait Europe/Paris,
// une fuite de fuseau dans le moteur passerait inaperçue. On refuse de démarrer.
const zoneDuProcessus = Intl.DateTimeFormat().resolvedOptions().timeZone

if (zoneDuProcessus === 'Europe/Paris') {
  throw new Error(
    "Les tests doivent tourner dans un fuseau différent de Europe/Paris (voir CLAUDE.md §8). " +
      `Fuseau détecté : ${zoneDuProcessus}.`,
  )
}

export { zoneDuProcessus }
