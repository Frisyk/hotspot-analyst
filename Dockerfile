FROM node:20-alpine

WORKDIR /app

# Install dependencies first (better cache)
COPY package.json ./
RUN npm install

# Copy source code
COPY . .

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "dev"]
