# DESIGN.md — Mes Heures, direction visuelle « Le compteur »

> Spec visuelle de l'app. À lire avec `CLAUDE.md` (règles de travail) et `SPEC.md` (métier).
> Maquettes de référence : direction **1c** — « Aujourd'hui » (mardi 17 mars) et « Vérifier ma paie » (option `2a`, mars). Elles priment sur toute description ambiguë de ce fichier.

---

## 1. La direction en trois phrases

Le mois d'abord, la journée ensuite. L'écran ouvre sur le **compteur** — les heures sup cumulées en typographie display — puis descend vers la saisie du jour, réduite à une liste de lignes réglées. Pas de carte, pas d'ombre, pas de coin arrondi : ce sont les filets et l'alignement qui organisent.

Tout est **calé à gauche**. Les chiffres sont l'illustration : il n'y a aucune image dans l'app.

---

## 2. Provenance des valeurs

Le design system **Modernist** est la seule source. Sa feuille de styles est liée depuis chaque page, et **chaque** couleur, graisse, espacement, rayon et ombre vient de ses variables :

`var(--color-bg | --color-surface | --color-text | --color-accent | --color-divider)`, les rampes `--color-neutral-100…900` et `--color-accent-100…900`, `var(--font-heading | --font-body)`, `var(--space-1|2|3|4|6|8)`, `var(--radius-*)` (= 0), `var(--shadow-sm|md|lg)`.

Interdit : un hex, un nom de police ou un px que les tokens portent déjà. Les classes du system (`.btn`, `.btn-primary`, `.btn-secondary`, `.btn-ghost`, `.tag`, `.tag-accent`, `.tag-outline`, `.tag-neutral`, `.input`, `.field`, `.seg`, `.radio`, `.table`, `.hr`, `.card`, `.dialog`) se composent, ne se réécrivent pas.

Icônes : Lucide, inline, sur `currentColor`. Aucun autre jeu, aucun emoji.

---

## 3. Couleur — ce que le rouge fait et ne fait pas

Fond `--color-bg`, encre `--color-text`, un seul accent `--color-accent` (#ec3013).

Le rouge sert à **quatre** choses, et à rien d'autre :

1. l'action primaire (`.btn-primary`, `.btn-ghost`) ;
2. les kickers de section (10 px, `--color-accent-700` — jamais l'accent pur en petit corps) ;
3. **l'incertitude** : bordure et hachure des zones non qualifiées, `.tag-outline` du statut « partiel » ;
4. le champ plein en aplat, **une seule fois par écran au maximum**, pour un énoncé chiffré (le compteur du mois si on le passe en aplat, la synthèse de période).

Le rouge **n'est pas** une couleur d'erreur. Il ne colore jamais un écart de paie, un solde négatif, un message d'échec. Un écart se lit en encre, avec son signe et son libellé — le vocabulaire du SPEC est « écart », pas « erreur », et le visuel doit rester aussi neutre que le mot.

Neutres : `--color-neutral-300` pour les pastilles de segments non travaillés, `--color-surface` pour les blocs remplis, `--color-divider` pour tout filet.

---

## 4. Typographie

Archivo partout. Trois graisses : 400 corps, 600 libellés et micro-titres, 800 tous les chiffres et titres.

Échelle utilisée, telle quelle (px) :

| Rôle | Taille / graisse |
|---|---|
| Compteur du mois | 76 / 800, unité « h » à 34 |
| Date du jour, totaux de période | 20–22 / 800 |
| Heures de prise et de fin | 32 / 800 |
| Amplitude, durée de segment | 15–20 / 800 |
| Corps, libellé de segment | 13–15 / 400 |
| Kicker de section | 10 / 600, `letter-spacing .11em`, capitales |
| Libellé de champ, légende | 10–11 / 600 |
| Mention légale | 10 / 400, encre à 50 % |

Règles dures :

- `font-variant-numeric: tabular-nums` sur **tout** chiffre, sans exception. Les colonnes de durées doivent s'aligner à la virgule.
- **Double affichage systématique** des durées : la forme sexagésimale en gros (`8 h 20`), les centièmes juste dessous ou à côté, plus petit et en encre atténuée (`8,33 h`). Jamais l'une sans l'autre sur un écran de paie.
- Un intervalle s'écrit avec un tiret demi-cadratin entouré d'espaces : `8 h 20 – 9 h 50`.
- Espaces insécables dans `8 h 20`, `148,20 €`, `18,25 h`. Virgule décimale, jamais de point.
- Aucun texte centré. Aucun libellé de bouton centré, même sur un bouton pleine largeur.

---

## 5. Grille, filets, densité

- Gouttière d'écran : `var(--space-4)` (16 px) à gauche et à droite, partout, sans exception.
- **Filet 2 px `--color-divider` entre deux sections** (compteur / jour / liste / pied). **Filet 1 px entre deux lignes d'une même liste.** Ne jamais remplacer un filet par du blanc, ne jamais l'affiner en hairline.
- Rayon 0 partout. Aucune ombre dans les écrans de saisie ; `--shadow-lg` réservé au dialogue modal.
- Rythme vertical par `--space-*` uniquement.
- Référence de maquette : 390 × 844. Tout doit tenir sans scroll sur l'écran « Aujourd'hui » d'une journée à cinq segments ; au-delà, seule la liste de segments défile.

---

## 6. Les trois statuts — le cœur visuel de l'app

Le SPEC impose qu'un résultat porte toujours un statut. Chaque statut a **un** traitement, identique sur tous les écrans :

| Statut | Marque | Valeur affichée | Signification du visuel |
|---|---|---|---|
| `complete` | `.tag-accent` « CERTAIN » | la valeur, en 800 | on peut s'appuyer dessus |
| `partial` | `.tag-outline` « PARTIEL » | l'intervalle `min – max`, jamais une valeur seule | l'écart possible est borné et lisible |
| `unknown` | `.tag-neutral` « INCALCULABLE » + bordure 1 px pointillée | **aucun chiffre** — une phrase et un lien vers le réglage manquant | l'app ne sait pas, et le dit |

Zone non qualifiée : hachure 45° en `--color-accent-200` / `--color-accent-100`, texte et durée en `--color-accent-700`, pastille en `--color-accent`.

**La hachure veut dire « appuie ici ».** Elle n'est jamais décorative, jamais sur une zone qu'on ne peut pas qualifier. Un appui ouvre le choix du type (coupure / disponibilité / autre travail) ; au retour, la ligne perd sa hachure, passe en neutre, et **le total en pied change de statut dans le même rendu** — un en-tête « certain » au-dessus d'une ligne encore hachurée est un bug.

Interdit : afficher `0` ou `—` pour un `unknown`, désactiver un champ sans dire pourquoi, mettre une valeur grisée en attendant.

---

## 7. Motifs propres à l'app

- **Compteur** — kicker rouge, chiffre 76 px, rangée de `.tag-neutral` dessous (centièmes, repas, indemnités). Un seul par écran, en haut.
- **Bloc horaire** — `Prise` / séparateur vertical 2 px × 26 / `Fin`, chiffres 32 px, `Amplitude` poussée à droite en 20 px. C'est le seul endroit où trois valeurs partagent une ligne.
- **Ligne de segment** — pastille 8 × 24 px, plage horaire 13 px (colonne fixe 96 px, tabulaire), type, durée en 800 poussée à droite, filet 1 px en bas. Pastilles : encre = conduite, `--color-neutral-300` = coupure et disponibilité, `--color-accent` = autre travail, `--color-accent` + hachure = non qualifié.
- **Pied de journée** — filet 2 px, « Temps rémunéré » + valeur en 22 px, la mention légale, puis le bouton primaire pleine largeur libellé à gauche.
- **Ligne d'écart** — un libellé, son tag de statut, puis trois valeurs sur une ligne : `Toi` · `Ta fiche` (encadrée 1 px : c'est la seule valeur saisie par l'utilisateur) · `Écart` poussé à droite en 22 px. Dépliable sur ses preuves. Détaillée au §11.
- **Dépliant de preuves** — bloc `--color-surface`, kicker rouge « Comment j'arrive à … », les `CalculationStep` numérotés en 11,5 px (le résultat de chaque étape en 800), puis la ligne de sources en 10 px sur filet 1 px, et un `.btn-secondary` vers les journées concernées.

---

## 8. Écran « Aujourd'hui » — la saisie

Ordre vertical imposé :

1. compteur du mois (heures sup cumulées, tags secondaires) — **c'est ce qu'on voit en ouvrant l'app** ;
2. filet 2 px ;
3. date + tag de statut du jour ;
4. bloc horaire prise / fin / amplitude ;
5. filet 2 px, liste des segments, `+ Ajouter un segment` en `.btn-ghost` à la fin de la liste ;
6. filet 2 px, pied : temps rémunéré, mention, `Valider la journée`.

- Saisie : champs numériques (`inputmode="numeric"`, `HH:mm`), **aucun sélecteur à faire défiler**. Le clavier système est le seul clavier.
- `Dupliquer hier` et `Modèle…` accessibles depuis une journée vide, en tête de la liste de segments, avant tout champ.
- Cible tactile minimale 44 px de haut sur toute ligne ou bouton actionnable — une ligne de segment fait 46 px, elle est cliquable sur toute sa largeur.
- Ambiguïté DST : dialogue `.dialog` à deux choix explicites (« avant le changement d'heure » / « après »), et seulement dans ce cas. Heure inexistante : refus en une phrase sous le champ, en encre, jamais de correction automatique.

## 9. Écran « Ma période »

Maquette de référence : direction 1c, option `3a`. Ordre vertical imposé :

1. bandeau fixe : bornes de période + `.seg` `Semaine` / `Période` (le libellé vient des réglages — « 26 févr. → 25 mars » — jamais d'un mois déduit) ;
2. **le total de la période d'abord** — même logique que le compteur d'Aujourd'hui : chiffre 32 px en double affichage, tag de statut, décompte honnête (`19 jours certains`, `1 incalculable`) ;
3. filet implicite (bord de table), la liste des jours — **seule zone qui défile** ;
4. filet 2 px, pied fixe : la mention obligatoire puis `Voir l'écart avec ma fiche →` en `.btn-secondary`.

### La table

`.table` — colonnes `Jour` · `Amplitude` · `Conduite` · `Temps rémunéré`, chiffres tabulaires alignés à droite, cellule `Jour` en `white-space:nowrap`. Une ligne fait 38 px, filet 1 px entre les lignes.

Quatre états de ligne, un traitement chacun — **jamais de `0 h 00` ou de tiret pour masquer un cas particulier** :

| Cas | Rendu |
|---|---|
| Jour travaillé, `complete` | les trois durées, `Temps rémunéré` en 800 |
| Repos / congé | `colspan` sur les trois colonnes, un mot en encre 50 % (« Repos », « Congé payé — non valorisé ») — jamais une ligne vide |
| `partial` | hachure `--color-accent-100/200` sur toute la ligne, cliquable ; `Temps rémunéré` affiche l'intervalle en `--color-accent-700` + `.tag-outline` ; un appui qualifie et repasse la ligne en `complete` dans le même rendu |
| `unknown` | `Amplitude`/`Conduite` en tiret 45 % gris (ici seulement — jamais ailleurs), `.tag-neutral` `INCALCULABLE`, et sous le tag la cause en 10 px avec `→` (« fin de service manquante ») |

Le mardi 17 mars de cette table est la même journée que l'écran Aujourd'hui : ses deux états (partiel / qualifié) doivent rester synchronisés entre les deux écrans, et l'appui y qualifie sans y naviguer.

### Interdits propres à cet écran

Aucune couleur de conformité, aucun feu tricolore, aucun badge de dépassement : la v1 ne qualifie pas le règlement européen. Aucun total qui mélange des jours `complete` et `partial` sans le dire — le tag `PARTIEL` du total reste tant qu'un seul jour l'est.

## 10. Écran « Réglages »


- Une section par famille (Entreprise, Période de paie, Heures supplémentaires, Coupures et disponibilité, Indemnités, Sauvegarde), séparées par un filet 2 px, titre en kicker rouge.
- Champs `.field` + `.input`, `.radio` pour les modes, `.seg` pour un choix à deux ou trois options courtes.
- **Un champ vide n'est pas neutre.** Sous chaque champ non renseigné : une ligne 11 px indiquant ce que son absence désactive (« sans ce taux, le brut reste incalculable »). C'est la contrepartie visible de la règle « absence de configuration = absence de donnée ».
- Chaque valeur issue d'un texte porte sa source en 10 px sous le champ. Dès qu'elle est modifiée, la mention devient « personnalisé » — et le visuel cesse de la présenter comme légale.
- Indemnités : liste de lignes réglées, code + libellé + montant à droite. Une indemnité sans montant s'affiche avec le tag `INCALCULABLE`, jamais `0,00 €`.
- Sauvegarde : dernier export daté, bouton primaire `Exporter mes données`. Passé 30 jours, la ligne passe en aplat rouge — c'est le seul usage d'alerte du rouge dans l'app, et il porte sur la perte de données, pas sur un calcul.

---

## 11. Écran « Vérifier ma paie »

L'écran le plus délicat de l'app : il met en cause une fiche de paie. Le visuel doit être **froid**. Aucune couleur d'alarme, aucun ton accusateur, aucun point d'exclamation.

Ordre vertical imposé :

1. titre + bornes de la période (issues des réglages, jamais un mois déduit) ;
2. filet 2 px, **compteur d'écart** ;
3. **la mention obligatoire**, en tête de la liste — jamais en pied, jamais en accordéon ;
4. filet 2 px, liste des lignes d'écart (seule zone qui défile) ;
5. filet 2 px, pied : `Éditer le relevé de <mois>` en primaire pleine largeur.

### Le compteur d'écart ne porte que du certain

Chiffre 68 px : **l'écart en heures supplémentaires**, statut `complete`, signe toujours explicite (`+1 h 15`). Sous-ligne 13 px pour l'écart monétaire, puis les tags : `PARTIEL` s'il reste une ligne non comparable, et le décompte honnête (`1 ligne incalculable`, `3 lignes comparées`).

**Interdit d'additionner des heures et des euros dans un même total**, et interdit de convertir des heures en euros sans taux horaire renseigné. Si aucune ligne n'est comparable, le compteur devient un `unknown` : une phrase, pas de chiffre.

### Les quatre états d'une ligne

| Cas | Traitement |
|---|---|
| Écart, `complete` | trois valeurs, écart signé en 800, ligne dépliable |
| Aucun écart | même ligne, l'écart s'écrit « aucun » en 13 px encre 55 % — **pas** `0,00 €`, pas de coche verte |
| `partial` | `Toi` affiche l'intervalle, `Écart` affiche un intervalle (`0 – 1 h 30`), la colonne `Ta fiche` **disparaît** — on ne compare pas une borne ; sous la ligne, l'encadré hachuré cliquable qui mène à la qualification |
| `unknown` | tag `INCALCULABLE`, aucune valeur, aucune colonne ; un encadré pointillé 1 px avec la phrase à la première personne (« Je ne peux pas calculer ton brut : … »), puis un `.btn-ghost` vers le réglage manquant, libellé terminé par `→` |

### Règles de ligne

- Une ligne dépliable dit qu'elle l'est, en 11 px sous les valeurs (`3 étapes · appuie pour voir le détail` ↔ `Replier le détail`). Pas de chevron seul.
- **Une seule ligne dépliée à la fois** : ouvrir la suivante replie la précédente.
- Cible tactile : toute la ligne, sur toute sa largeur.
- Le dépliant remonte jusqu'aux journées : chaque preuve se termine par un accès aux `dayId` qui la composent. C'est la traduction visuelle de l'exigence « le moteur produit des preuves, pas des nombres ».
- La valeur `Ta fiche` est un champ de saisie, `inputmode="numeric"`, jamais préremplie par une estimation.
- L'écart ne prend jamais la couleur accent, ni en positif ni en négatif. Un écart favorable et un écart défavorable ont **exactement** le même traitement : c'est le signe qui informe, pas la couleur.

---

## 12. Thème — suit le système

Un seul jeu de composants, deux jeux de tokens. En sombre, on redéfinit **uniquement** `--color-bg`, `--color-surface`, `--color-text` et `--color-divider` ; rien d'autre ne change de structure.

- L'accent reste #ec3013 pour les aplats, mais tout **texte** rouge sur fond sombre passe à `--color-accent-400`, et les états pressés à `--color-accent-400` (au lieu de `-600` / `-700` en clair).
- La hachure d'incertitude se construit sur `--color-accent-900` / `--color-accent-800`.
- Les filets restent à 2 px et 1 px : on ne compense pas le fond sombre en baissant l'opacité.
- Aucun aplat blanc pleine surface en sombre, aucune ombre : la hiérarchie vient des filets, comme en clair.

---

## 13. Mentions obligatoires, au mot près

- Écrans de durées (Aujourd'hui, Ma semaine / Ma période) : *« Ces durées sont indicatives. Cette version ne vérifie pas la conformité au règlement européen. »* — 10 px, encre 50 %, juste au-dessus de l'action principale.
- Écran Vérifier ma paie : *« Un écart n'est pas forcément une erreur. Compare avec ton contrat, puis vois avec ton employeur ou tes représentants du personnel. »* — même traitement, en tête de la liste d'écarts.

Ces phrases ne sont ni raccourcies, ni mises en accordéon, ni reléguées dans un écran d'aide.

---

## 14. Interdits

Coin arrondi · ombre dans un écran de saisie · couleur sur un écart (favorable ou non) · total mélangeant heures et euros · libellé de bouton centré · filet remplacé par du blanc · rouge comme couleur d'erreur ou d'écart · deux aplats rouges sur un même écran · chiffre non tabulaire · durée affichée dans une seule des deux notations · `0` ou `—` à la place d'un `unknown` · sélecteur d'heure à faire défiler · image, illustration, dégradé, emoji · icône seule pour un statut (le mot est obligatoire, l'icône est un renfort) · animation d'apparition sur un chiffre de paie.

---

## 15. À maquetter ensuite

Dessinés : « Aujourd'hui », « Vérifier ma paie », « Ma période ». Spécifiés mais pas encore dessinés : « Réglages », le détail « Ma semaine » (probablement la même table filtrée sur sept jours), et le relevé PDF — à faire avant la phase 6 du SPEC.

Question ouverte, à trancher avant la phase 6 : la ligne d'écart doit-elle afficher **aussi** le montant à côté des heures supplémentaires ? Cela suppose un taux majoré dans les réglages, donc une valeur qui passera souvent en `INCALCULABLE`. En l'état, la spec ne compare que ce qui est certain.
