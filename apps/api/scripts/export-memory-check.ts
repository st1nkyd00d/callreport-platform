// Medición reproducible del criterio de aceptación de Fase 7: "Seed
// inflado a ~50 000 reportes: la descarga CSV completa termina sin que el
// proceso Node supere memoria estable" (plan-fase-7.md D8).
//
// Un consumidor RÁPIDO no prueba nada -- el streaming keyset por lotes
// (D1) ya es correcto en ese caso aunque falte el backpressure de D2. El
// caso que realmente rompe sin `await` en el drain es un cliente LENTO:
// este script fuerza justamente eso pausando el socket de respuesta la
// mayor parte del tiempo, mientras muestrea process.memoryUsage() cada
// 250ms del lado del servidor (el mismo proceso Node que corre ExportsService).
//
// Prerequisito: `npm run inflate -- --count=50000` corrido antes (si no,
// el CSV sale chico y la medición no dice nada útil).
//
// Uso: npm run export-memory-check
//
// Gotcha: este script arranca el AppModule completo de Nest (login real +
// endpoint real), así que necesita inyección de dependencias funcionando
// -- y ESO exige `emitDecoratorMetadata` real. `tsx` (esbuild) NO lo emite
// (Reflect.getMetadata('design:paramtypes', Cls) da `undefined`), lo que
// rompe JwtStrategy (recibe `config: undefined` en vez de un ConfigService)
// con un error de DI confuso. `ts-node` tampoco alcanza acá: sin la
// resolución de módulos de Jest (moduleNameMapper para los imports con
// `.js` del cliente Prisma generado), falla al requerir
// `generated/prisma/internal/class.js` porque en disco solo existe el
// `.ts`. La única combinación que funciona fuera de Jest es compilar de
// verdad (`nest build`, mismo tsc que usa `npm run build`/`start:prod`) y
// correr el JS ya compilado con `node` -- por eso el script de package.json
// hace `nest build && node dist/scripts/...` en vez de `tsx ...`.
import 'dotenv/config';
import http from 'node:http';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';

const PASSWORD = 'Password123!';
const READ_WINDOW_MS = 20; // el socket queda abierto (leyendo) esta ventana...
const PAUSE_INTERVAL_MS = 150; // ...cada este intervalo -- el resto del tiempo está pausado.
const SAMPLE_INTERVAL_MS = 250;

interface MemSample {
  t: number;
  rssMb: number;
  heapUsedMb: number;
}

function toMb(bytes: number): number {
  return Math.round((bytes / 1024 / 1024) * 10) / 10;
}

function postJson<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(
      `${baseUrl}${path}`,
      { method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } },
      (res) => {
        let raw = '';
        res.on('data', (chunk: Buffer) => (raw += chunk.toString('utf8')));
        res.on('end', () => {
          if (res.statusCode !== 200 && res.statusCode !== 201) {
            reject(new Error(`POST ${path} -> ${res.statusCode}: ${raw}`));
            return;
          }
          resolve(JSON.parse(raw) as T);
        });
      },
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

interface DownloadResult {
  bytes: number;
  rows: number;
  durationMs: number;
}

// Consumidor lento: pausa el stream de respuesta la mayor parte del
// tiempo (node:http real, no un mock) -- si ExportsService.streamReportsCsv
// no esperara 'drain' en cada write(), la memoria del proceso crecería
// mientras la base entrega lotes más rápido de lo que este cliente lee.
function downloadSlow(baseUrl: string, path: string, token: string): Promise<DownloadResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const req = http.get(`${baseUrl}${path}`, { headers: { Authorization: `Bearer ${token}` } }, (res) => {
      if (res.statusCode !== 200) {
        reject(new Error(`GET ${path} -> ${res.statusCode}`));
        return;
      }
      let bytes = 0;
      let rows = 0;
      res.pause();
      const pump = setInterval(() => {
        res.resume();
        setTimeout(() => res.pause(), READ_WINDOW_MS);
      }, PAUSE_INTERVAL_MS);
      res.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        for (let i = 0; i < chunk.length; i++) if (chunk[i] === 0x0a) rows++;
      });
      res.on('end', () => {
        clearInterval(pump);
        resolve({ bytes, rows: Math.max(0, rows - 1), durationMs: Date.now() - start }); // -1 por la fila de cabecera
      });
      res.on('error', (err) => {
        clearInterval(pump);
        reject(err);
      });
    });
    req.on('error', reject);
  });
}

function summarizeGrowth(samples: MemSample[]): string {
  if (samples.length < 6) return 'muestras insuficientes para evaluar tendencia';
  const mid = Math.floor(samples.length / 2);
  const firstHalf = samples.slice(0, mid);
  const secondHalf = samples.slice(mid);
  const avg = (xs: MemSample[]) => xs.reduce((s, x) => s + x.heapUsedMb, 0) / xs.length;
  const firstAvg = avg(firstHalf);
  const secondAvg = avg(secondHalf);
  const growthPct = firstAvg > 0 ? ((secondAvg - firstAvg) / firstAvg) * 100 : 0;
  const verdict = growthPct < 20 ? 'OK (sin crecimiento monótono significativo)' : 'REVISAR (heap creció > 20% entre la primera y la segunda mitad de la descarga)';
  return `heap promedio primera mitad: ${firstAvg.toFixed(1)} MB, segunda mitad: ${secondAvg.toFixed(1)} MB (${growthPct.toFixed(1)}%) -- ${verdict}`;
}

async function main() {
  const app = await NestFactory.create(AppModule, { logger: ['error', 'warn'] });
  app.enableCors({ exposedHeaders: ['Content-Disposition'] });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  await app.listen(0);
  const baseUrl = await app.getUrl();

  console.log('Login como super_admin...');
  const { accessToken } = await postJson<{ accessToken: string }>(baseUrl, '/auth/login', {
    email: 'admin@callreport.demo',
    password: PASSWORD,
  });

  const samples: MemSample[] = [];
  const sampler = setInterval(() => {
    const m = process.memoryUsage();
    samples.push({ t: Date.now(), rssMb: toMb(m.rss), heapUsedMb: toMb(m.heapUsed) });
  }, SAMPLE_INTERVAL_MS);

  console.log('Descargando /exports/reports.csv con consumidor lento (esto tarda varios minutos con 50k filas)...');
  const result = await downloadSlow(baseUrl, '/exports/reports.csv', accessToken);
  clearInterval(sampler);
  await app.close();

  const maxRss = Math.max(...samples.map((s) => s.rssMb));
  const maxHeap = Math.max(...samples.map((s) => s.heapUsedMb));

  console.log('');
  console.log('=== Resultado ===');
  console.log(`Filas descargadas: ${result.rows}`);
  console.log(`Bytes descargados: ${(result.bytes / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Duración: ${(result.durationMs / 1000).toFixed(1)} s`);
  console.log(`Muestras de memoria: ${samples.length}`);
  console.log(`RSS máximo: ${maxRss} MB`);
  console.log(`Heap usado máximo: ${maxHeap} MB`);
  console.log(summarizeGrowth(samples));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
