FROM node:20-alpine

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances
RUN npm install --production

# Copier le reste des fichiers
COPY . .

# Créer le dossier data pour la persistance
RUN mkdir -p /app/data

# Exposer le port
EXPOSE 3000

# Démarrer le serveur
CMD ["npm", "start"]
