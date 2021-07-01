FROM node:14-buster-slim
WORKDIR /app

#
# install app dependencies
COPY package*.json ./
RUN npm install

#
# copy app source
COPY *.js ./
COPY inc inc
VOLUME [ "/live" ]

CMD [ "/usr/local/bin/node", "start.js" ]
