# Phase 4 — Persistance

`pnpm verify` vert. 241 tests (+29). **La liste des lignes non couvertes est
réduite à trois**, toutes en phase 7.

## Fait

**Aucun résultat de calcul n'est persisté** (`DON-03`, `DON-04`), et le test le
vérifie mécaniquement : il balaie toutes les tables et échoue si un champ
s'appelle `tempsRemunere`, `heuresSup`, `amplitude` ou `statut`. C'est ce qui
garantit qu'une correction de règle corrige aussi le passé — et qu'un chiffre
affiché aujourd'hui n'est jamais un chiffre calculé il y a six mois par une
version antérieure de l'app.

**Les instants sont stockés en ISO 8601 avec offset** (`DON-02`), contrôlé sur le
contenu brut de la base et pas seulement sur l'objet relu. Un instant sans
décalage est refusé à l'import avec le champ nommé (`DON-08`) : c'est exactement
le piège du SPEC §5, une chaîne sans offset serait réinterprétée dans le fuseau du
téléphone.

**L'import est validé avant d'écrire quoi que ce soit.** `DON-11` le prouve sur le
cas méchant : un fichier dont le premier jour est valide et le second ne l'est
pas. Si la validation se faisait au fil de l'écriture, la base serait déjà vidée
au moment de l'erreur. Ici elle est intacte, aux trois journées près.

**Le mode d'import est explicite** — `remplacement` ou `fusion`, jamais implicite
(`DON-12`). Et **un import ne se fait pas passer pour une sauvegarde** (`DON-18`) :
la date du dernier export n'est pas touchée, sinon le conducteur perdrait son
rappel juste après avoir changé de téléphone.

**Supprimer une journée emporte ses qualifications et ses saisies** dans une
transaction (`DON-20`). Une journée par date de rattachement, garanti par un index
unique Dexie (`DON-21`).

**`navigator.storage.persist()` est traité comme une demande, pas une garantie**
(SPEC §12). Le retour est lu ; API absente, exception ou refus donnent tous
`refuse`, et un refus **allonge** le message de rappel de sauvegarde
(`DON-14`, `DON-15`) au lieu de disparaître.

**Volume** : 800 journées — trois ans — s'exportent, se relisent et s'interrogent
par période sans difficulté (`DON-22`).

**Parité schéma ↔ moteur vérifiée à la compilation.** `satisfies z.ZodType<WorkDay>`
est impossible ici : Zod produit un `number` là où le moteur veut un `Cents`
nominal, et un `T | undefined` là où `exactOptionalPropertyTypes` veut une
propriété absente. À la place, `PARITE_SCHEMA_MOTEUR` compare les **noms de
champs** : ajouter un champ au modèle sans l'ajouter au schéma casse la
compilation, avec le nom du champ dans le message.

## Supposé

1. **Un seul `as` dans toute l'app**, dans `versFichierExport`, et il est
   commenté et cerné. Les trois divergences qu'il absorbe (facultatif,
   `readonly`, types nominaux) sont de type et non de forme : après un
   aller-retour JSON les clés facultatives sont réellement absentes. Ce qui
   compte est vérifié à l'exécution par `DON-05`, `DON-08` et `DON-19`.
2. **Le stockage refuse un `personnalise` dont la base est elle-même
   `personnalise`**, alors que le type du moteur l'autorise. Empiler les couches
   ne dirait plus rien de l'origine de la valeur.
3. **La table `meta` n'est pas exportée** (`DON-24`) : date du dernier export et
   état du stockage persistant sont des faits *de cet appareil*, pas des données
   du conducteur.
4. **Rappel à 14 jours, alerte à 30**, tels que le CLAUDE.md §16.5 les proposait.
   Ce sont des constantes de l'app, pas des réglages — dis-moi si tu veux les
   régler.

## Ambigu

Une question opérationnelle, et elle t'appartient (CLAUDE.md §16.5) :

**Où doit aller l'export ?** Trois options, et elles ne se valent pas sur un
téléphone :

- **partage système** (`navigator.share`) — tu choisis toi-même : WhatsApp à toi,
  Drive, mail. Le plus souple, mais le partage de fichier n'existe pas sur tous
  les navigateurs ;
- **téléchargement** dans le dossier Téléchargements — marche partout, mais le
  fichier reste sur le téléphone que tu es censé protéger, donc ça ne protège de
  rien tant que tu ne le déplaces pas ;
- **les deux**, avec le partage en premier et le téléchargement en repli.

Ma recommandation : **les deux**, partage d'abord. Mais c'est ton usage, pas une
décision technique.

## Dette

- **La migration Dexie n'a qu'une version.** `DON-13` teste une vraie montée de
  v1 vers v2 sur une base peuplée, en rouvrant la même base sous une classe qui
  déclare la v2 — donc le mécanisme est éprouvé. Mais aucune transformation de
  données n'a encore été écrite, seulement un ajout d'index.
- **`migrer()` est l'identité.** La fonction existe pour que la première
  migration de format soit un `case` de plus, pas une réécriture.
- **`lireAbsencesEntre` charge toutes les absences en mémoire** avant de filtrer :
  une absence qui chevauche la fenêtre sans y commencer n'est pas trouvable par un
  index Dexie simple. Sans conséquence sur trois ans de données, à revoir si ça
  grossit.
- **Les icônes PWA manquent toujours** (`public/` est vide), et
  `src/app/main.tsx` reste l'écran d'attente. Les deux relèvent des phases 5 et 8.
