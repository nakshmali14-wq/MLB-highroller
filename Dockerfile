FROM mcr.microsoft.com/playwright:v1.55.0-noble
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY src ./src
COPY .env.example ./
RUN mkdir -p data
CMD ["node", "src/index.js"]
