FROM node:20-alpine
WORKDIR /app
COPY package.json package.json
# install curl for debugging and CA certs for HTTPS requests
RUN apk add --no-cache curl ca-certificates
RUN npm install --production
COPY . .
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD curl -f http://localhost:3000/health || exit 1
CMD ["node", "server.js"]
