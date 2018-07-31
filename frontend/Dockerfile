FROM node:10.7.0-alpine

ENV PATH="/home/node/app/node_modules/.bin:$PATH"

RUN apk add --no-cache tini
# Tini is now available at /sbin/tini
ENTRYPOINT ["/sbin/tini", "--"]

WORKDIR /home/node/app

COPY package*.json ./

RUN npm install
#RUN npm install --only=production

COPY . .

EXPOSE 8080

USER node

CMD ["npm", "start"]
