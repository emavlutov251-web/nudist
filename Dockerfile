# «Нудист» в контейнере: один образ запускается где угодно — на VPS, в облаке, на ноутбуке.
# Сборка:  docker build -t nudist .
# Запуск:  docker run -d --name nudist -p 3000:3000 -v nudist-data:/data nudist
FROM node:20-alpine

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data

WORKDIR /app
# Зависимостей из npm нет, поэтому npm install не нужен: копируем только то, что работает на сервере.
COPY package.json ./
COPY server ./server
COPY public ./public

# База и загруженные файлы живут в /data — это том, он переживает пересоздание контейнера.
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server/boot.js"]
