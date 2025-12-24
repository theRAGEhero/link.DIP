FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
COPY client/package*.json ./client/

RUN npm install
RUN npm --prefix client install

COPY . .

RUN npm --prefix client run build

ENV NODE_ENV=production
EXPOSE 3100

CMD ["node", "server/index.js"]
