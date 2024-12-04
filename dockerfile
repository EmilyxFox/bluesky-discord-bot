FROM denoland/deno:alpine

WORKDIR /app

COPY . .

RUN deno cache main.ts

CMD [ "run", "-A", "--unstable-cron", "main.ts" ]