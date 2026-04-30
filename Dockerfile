FROM node:20-alpine
WORKDIR /app
COPY server/package.json server/package.json
RUN cd server && npm install --production
COPY server/ server/
EXPOSE 8768
CMD ["node", "server/src/index.js"]
