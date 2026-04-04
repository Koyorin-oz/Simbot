# CARMINABOT — LA CARMINAUTE

Bot Discord.js v14 : économie SC / SP / LP, rangs, boutique, profil canvas, modération, tickets, jeux, etc.

---

## Économie en bref

| | Rôle |
|---|------|
| **SC** (Simba Coins) | Monnaie pour la **boutique** et les échanges. |
| **SP** (Simba Points) | **Progression de rang** (Hyène → Cardinal, seuils dans `src/config.js`). |
| **LP** (Level Points) | Remplissent la **barre de niveau** ; au palier, niveau +1 et LP repartent. Le coût en LP par niveau monte avec la formule du bot (`levelBase` × niveau^`levelExponent`). |

**Boosts** (café acheté en boutique, couronne / tirelire permanentes) augmentent en % les gains de SC et/ou SP+LP selon les règles du code.

---

## Gains automatiques (sans commande)

- **Messages** : si le message fait au moins **6** caractères et respecte le **cooldown (~45 s)** entre deux gains, tu reçois des montants **aléatoires** de SC, SP et LP (plages dans `src/config.js` → `economy.messageGain`, typ. SC ~35–90, SP ~20–55, LP ~24–65 par tick).
- **Vocal** : toutes les **10 minutes** passées en vocal (hors mute/sourd), un **tick** fixe de SC / SP / LP (`economy.voiceGain` dans la config).
- **Récompenses calendaires** : `/journalier` ou `/quotidien` (même logique : **une fois par jour**, minuit **heure de Paris**), `/hebdomadaire`, `/mensuel` — SC selon `src/config.js` → `rewards`.

**Décroissance SP** (hauts rangs, à partir de Nala) : si tu restes **sans activité** message/vocal qui donne des gains, du SP peut être retiré par paliers (grâce 24 h, puis ticks ; détails dans `economy.spDecay`).

---

## Liste des commandes slash

*Les noms sont ceux affichés dans Discord. Certaines commandes sont réservées **staff / owner** selon les rôles configurés sur le serveur.*

### Économie & progression

| Commande | Utilité |
|----------|---------|
| `/profil` | Carte profil (rang, niveau, SC, SP, etc.), membre optionnel. |
| `/classement` | Classement paginé. |
| `/boutique` | Boutique interactive (objets, boosts). |
| `/inventaire` | Ton inventaire. |
| `/transfert-sc` | Envoyer des SC à un membre. |
| `/donner` | Sous-commandes : donner SC / SP / LP / **item** à un utilisateur. |
| `/pret` | Prêt SC : demander, rembourser, statut. |
| `/journalier` | Récompense journalière SC (1× / jour, Paris). |
| `/quotidien` | Idem journalier (doublon de nom pour les habitudes). |
| `/hebdomadaire` | Récompense hebdo SC. |
| `/mensuel` | Récompense mensuelle SC. |

### Fun & jeux

| Commande | Utilité |
|----------|---------|
| `/blague` | Blagues (planning / révélation selon config). |
| `/dinguerie` | Mini-jeu / thème avec IA (si activée). |
| `/flex` | Flex avec GIF (selon rang). |
| `/compatibilite-amoureuse` | Score entre deux membres. |
| `/morpion` | Morpion vs un adversaire. |
| `/puissance4` | Puissance 4 vs un adversaire. |

### Modération

| Commande | Utilité |
|----------|---------|
| `/warn` | Avertissement + raison. |
| `/mute` | Silence temporel (durée type `10m`, `1h`). |
| `/fin-silence` | Lever un timeout/silence. |
| `/demutre` | Dé-mute vocal (membre). |
| `/expulser` | Kick. |
| `/bannir` | Ban. |
| `/debannir` | Déban par ID utilisateur. |
| `/clear` | Supprimer un lot de messages. |
| `/effacer-message` | Supprimer une plage par IDs de messages. |
| `/salon-verrou` | Verrouiller / fermer / déverrouiller salon + rôle staff. |
| `/profil-moderateur` | Stats modé d’un modérateur. |
| `/sanction-lister` | Liste des sanctions d’un membre. |

### Serveur, accueil, tickets, vote

| Commande | Utilité |
|----------|---------|
| `/verification` | Flux / panneau vérification (selon config). |
| `/verification-telephone` | Niveau de vérif téléphone : activer / désactiver / état. |
| `/panel-infos-verif` | Déployer le panneau infos vérif. |
| `/anniversaire` | Modal pour enregistrer ta date d’anniversaire. |
| `/anniversaires` | Liste / gestion anniversaires (affichage). |
| `/panel-repertoire` | Panneau répertoire. |
| `/panel-ticket` | Panneau tickets. |
| `/panel-deban` | Panneau demandes de deban. |
| `/vote` | Configurer / lancer panneau de vote (salon). |
| `/suggestion` | Suggestion (salon dédié selon logique bot). |
| `/infos-serveur` | Infos serveur ; sous-commande rôle pour détail d’un rôle. |
| `/message` | Envoyer un message (texte / fichier / réponse). |
| `/citer` | Citer un message par ID. |
| `/voc-panel` | Panneau vocal. |
| `/bienvenue` (`dev-bienvenue`) | Test / déploiement panneau bienvenue. |

### Admin économie & rôles (staff)

| Commande | Utilité |
|----------|---------|
| `/admin-give` | Ajouter SC (`money`), SP ou LP à un membre. |
| `/admin-remove` | Retirer SC (`money`), SP ou LP. |
| `/adminargent` | Ajouter SC (membre / rôle / serveur), définir solde, reset. |
| `/give-away` | Créer un giveaway (modes, rôle, salon). |
| `/pause-economie` | Mettre l’économie en pause (confirmation). |
| `/resume-economie` | Reprendre l’économie. |
| `/admin-reset-recompenses` | Reset périodes de récompenses (quotidien / hebdo / mensuel / tout). |
| `/admin-reset-saison` | Reset de saison (confirm). |
| `/admin-add-role` | Ajouter un rôle à un membre. |
| `/admin-remove-role` | Retirer un rôle. |
| `/admin-role-masse` | Ajouter / retirer un rôle selon un rôle condition. |
| `/admin-rank-roles-create` | Créer les rôles de rang. |
| `/admin-rank-roles-remove` | Retirer les rôles de rang. |
| `/adminanniversaire` | Définir / supprimer l’anniversaire d’un membre. |

### Bot, déploiement, maintenance (owner / dev)

| Commande | Utilité |
|----------|---------|
| `/setup` | Setup salons / suppression avec confirm. |
| `/setup-salons` | Création / réinit pack de salons. |
| `/deployer-vrai-ids` | Appliquer les IDs « prod » depuis `realServerIds`. |
| `/dev-deployer` | Déploiement de panneaux (commande admin déploiement). |
| `/dev-comptage-membre-deployer` | Déployer compteur de membres. |
| `/dev-settings` | Voir l’état des modules (`view`). |
| `/ia-prompt` | Voir / définir / reset le prompt Groq. |
| `/pause-ia` | Pause / reprendre / restart IA (`dinguerie`, etc.). |
| `/mode-maj` | Mode maintenance : activer / désactiver / statut. |
| `/desactiver` | Désactiver le bot (selon logique). |
| `/arreter-simbot` | Arrêt contrôlé (confirm). |
| `/restart-simbot` | Redémarrage SimBot. |
| `/admin-restart` | Redémarrage filtré (process). |
| `/admin-stop` | Stop filtré (process). |

*Les fichiers `give-sc` / `give-sp` / `give-lp` et `remove-sc` / `remove-sp` / `remove-lp` sont **désactivés** dans le handler : utiliser `/admin-give` et `/admin-remove`.*

---

## Installation (développeur)

1. Copier `.env.example` → `.env` et remplir les variables.  
2. `npm install`  
3. `npx prisma generate` puis `npx prisma migrate dev --name init`  
4. `npm run deploy:commands`  
5. `npm start`

Prix, boosts, seuils de rang, cooldowns : **`src/config.js`**.  
Arborescence utile : `src/commands/*`, `src/services/economyService.js`, `src/events/client/*`, `prisma/schema.prisma`.

---

## Notes

- ModLog et actions modération peuvent logger dans le salon configuré.  
- Discord ne permet plus de masquer les slash par API : réglages serveur → Intégrations → bot → Commandes.
