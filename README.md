# CARMINABOT - LA CARMINAUTE

Bot Discord.js v14 modulaire avec:
- Economie SC / SP / LP
- Rangs auto par SP
- Boutique interactive (select + boutons)
- Profil image canvas
- Moderation + ModLog interactif (modals)
- Leaderboard pagine

## 1) Installation

1. Copier `.env.example` vers `.env`
2. Remplir les variables
3. Installer les dependances:
   - `npm install`
4. Generer Prisma:
   - `npx prisma generate`
   - `npx prisma migrate dev --name init`
5. Deployer les slash commandes:
   - `npm run deploy:commands`
6. Lancer le bot:
   - `npm run start`

## 2) Configuration importante

- Les prix et boosts sont dans `src/config.js`
- Les seuils de rang SP sont dans `src/config.js` -> `rankSystem.thresholds`
- Les IDs de roles Discord sont dans `src/config.js` -> `rankSystem.roleMap`
- Le channel de logs economie premium se configure via `ECONOMY_LOG_CHANNEL_ID`

## 3) Arborescence

- `src/index.js` : bootstrap
- `src/handlers/*` : handlers commandes/evenements
- `src/events/client/*` : listeners Discord
- `src/commands/economy/*` : commandes economie
- `src/commands/moderation/*` : commandes moderation
- `src/services/economyService.js` : logique SC/SP/LP + level + rang
- `src/services/profileCard.js` : rendu image profil
- `prisma/schema.prisma` : base de donnees

## 4) Notes

- Anti-spam: cooldown de gain message et longueur minimale
- Vocal: gains periodiques seulement si membre non mute/deaf
- ModLog interactif: suppression/modification via modals
