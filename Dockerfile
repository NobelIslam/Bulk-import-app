FROM node:20-alpine

RUN apk add --no-cache openssl

WORKDIR /app

ENV NODE_ENV=production

# Prisma generate only needs a syntactically valid URL during the image build.
# Render provides the real DATABASE_URL at runtime.
ARG DATABASE_URL=postgresql://user:password@localhost:5432/db
ENV DATABASE_URL=${DATABASE_URL}

COPY package.json package-lock.json ./

# Install dev dependencies for the production build.
RUN npm ci

COPY . .

# Generate the Prisma client inside the final image before building or starting.
RUN npx prisma generate

RUN npm run build

# Keep the generated Prisma client and its runtime dependencies intact.
RUN npm cache clean --force

EXPOSE 3000

# Database migrations run separately through Render's pre-deploy command:
# npm run migrate
CMD ["npm", "run", "start"]
