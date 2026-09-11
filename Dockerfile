FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

# Render forwards dashboard env vars into the build when a matching ARG exists.
# The placeholder default lets `prisma generate` (triggered automatically by
# installing @prisma/client) pass schema validation even if it isn't forwarded —
# generate only needs a syntactically valid URL, it never connects to a database.
ARG DATABASE_URL=postgresql://user:password@localhost:5432/db
ENV DATABASE_URL=${DATABASE_URL}

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN npm run build

CMD ["npm", "run", "docker-start"]
