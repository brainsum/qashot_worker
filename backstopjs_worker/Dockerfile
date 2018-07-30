FROM node:10.7.0

WORKDIR /home/node/app

COPY package*.json ./

RUN npm install
#RUN npm install --only=production

COPY . .

EXPOSE 8080

USER node

CMD ["npm", "start"]
