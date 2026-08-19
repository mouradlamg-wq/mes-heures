# Mes Heures

PWA locale et hors ligne, sans compte ni serveur : un conducteur d'autocar saisit sa
journée en quinze secondes le soir, et vérifie sa fiche de paie ligne par ligne.

## Les trois règles qui tiennent tout le reste

1. **Juste ou absent.** Aucun chiffre plausible et faux. Tout résultat porte un statut —
   `complete`, `partial` avec une fourchette, ou `unknown` avec sa cause.
2. **Le moteur produit des preuves, pas des nombres.** Chaque valeur affichée se déplie
   jusqu'aux saisies et aux réglages qui l'ont produite.
3. **Aucune valeur réglementaire ou tarifaire en dur.** Ni un taux, ni un seuil, ni une
   majoration, ni le montant d'une indemnité. Réglage absent = donnée absente, jamais
   zéro. Tout se règle dans l'app, y compris la liste des indemnités.

## Où vont les données

Nulle part. Elles vivent dans l'IndexedDB du navigateur, sur l'appareil. Pas de compte,
pas de synchronisation, pas d'analytics, aucun appel réseau au runtime. La sauvegarde est
un export JSON que tu déclenches toi-même.

## Architecture

```
src/engine/   100 % pur — aucun import de React, Dexie, window, Date.now()
src/db/       Dexie, schéma versionné, export/import validé par Zod
src/ui/       écrans et composants — zéro arithmétique métier
src/pdf/      relevé imprimable — consomme la sortie du moteur, ne recalcule rien
tests/cases/  la table de cas limites, écrite avant le code, un test par ligne
```

Un test d'architecture échoue si un calcul, une constante métier ou une dépendance
navigateur entre dans `src/engine`.

## Commandes

```
pnpm dev · pnpm test · pnpm typecheck · pnpm lint · pnpm build · pnpm preview
pnpm verify   # typecheck + lint + test + build
```

## Installer sur Android sans rien mettre en ligne

`pnpm build` puis `pnpm preview` sur le PC. Active le débogage USB sur le téléphone,
branche-le, puis dans Chrome sur le PC : `chrome://inspect/#devices` → Port forwarding →
`4173` vers `localhost:4173`. Sur le téléphone, ouvre `http://localhost:4173` : l'origine
est vue comme locale, donc sécurisée, et le menu propose « Installer l'application ».
Débranche — l'app démarre et fonctionne sans réseau.

## Documents de référence

`SPEC-mes-heures-v4.md` est la vérité métier. `Claude.md` dit comment travailler,
`DESIGN.md` décrit le rendu. `docs/phases/` contient un rapport par phase livrée.
