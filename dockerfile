FROM denoland/deno:alpine

WORKDIR /app

COPY . .

RUN deno cache main.ts

RUN deno task cacheDb

CMD [ "run", "-A", "--unstable-cron", "main.ts" ]