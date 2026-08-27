#!/usr/bin/env node
// Fase 8 (D4/D17): "grep de CI que falle si aparece [el cliente Prisma
// crudo] fuera de PrismaService" (plan.md, tarea 1). Un `grep -q` a secas
// falla hoy mismo: AuthService usa el cliente crudo dos veces (login/
// refresh, corre ANTES de que exista un usuario autenticado, sobre tablas
// sin RLS) -- excepción legítima y ya documentada en prisma.service.ts.
// La nota operativa de la Fase 6 amplía el alcance: también hay que
// vigilar forSystem() (solo NotificationsModule) y forUserRaw() (metrics/
// exports/audit).
//
// Node plano, no tsx (Fase 7: tsx no emite emitDecoratorMetadata y este
// script no necesita bootear Nest -- es análisis estático de texto).
//
// La allowlist vive ACÁ, versionada: agregar una excepción nueva es un
// cambio visible en el diff de este archivo, que es el punto del control.

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC_DIR = join(fileURLToPath(new URL('.', import.meta.url)), '..', 'src');

// Implementación de la puerta -- $connect/$extends/$transaction/$executeRaw
// sobre `this` (no `this.prisma.<modelo>.`) son la herramienta, no una
// violación.
const EXCLUDE_ENTIRE_FILE = new Set(['prisma/prisma.service.ts']);

const RULES = [
  {
    name: 'cliente-prisma-crudo',
    pattern: /this\.prisma\.[a-zA-Z]+\.|new PrismaClient\(/g,
    description:
      'Acceso directo a un modelo del cliente Prisma base (sin forUser/forSystem/forUserRaw)',
    allowlist: new Set(['auth/auth.service.ts']),
  },
  {
    name: 'forSystem',
    pattern: /\.forSystem\(/g,
    description:
      "forSystem() es un contexto de staff sin usuario HTTP real -- único consumidor legítimo: NotificationsModule",
    allowlist: new Set([
      'notifications/notifications.service.ts',
      'notifications/push-tokens.service.ts',
    ]),
  },
  {
    name: 'forUserRaw',
    pattern: /\.forUserRaw\(/g,
    description: 'SQL crudo con contexto RLS -- reservado a agregados/streams que Prisma no expresa',
    allowlistPrefixes: ['metrics/', 'exports/'],
    allowlist: new Set(['audit/audit.interceptor.ts']),
  },
];

/** @param {string} dir */
function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts')) {
      files.push(full);
    }
  }
  return files;
}

function relPath(absPath) {
  return relative(SRC_DIR, absPath).split(sep).join('/');
}

function isAllowed(rule, rel) {
  if (rule.allowlist?.has(rel)) return true;
  if (rule.allowlistPrefixes?.some((prefix) => rel.startsWith(prefix))) {
    return true;
  }
  return false;
}

function lineNumberAt(content, index) {
  return content.slice(0, index).split('\n').length;
}

function main() {
  const files = walk(SRC_DIR);
  /** @type {string[]} */
  const violations = [];

  for (const file of files) {
    const rel = relPath(file);
    if (EXCLUDE_ENTIRE_FILE.has(rel)) continue;

    const content = readFileSync(file, 'utf8');
    for (const rule of RULES) {
      if (isAllowed(rule, rel)) continue;
      const matches = [...content.matchAll(rule.pattern)];
      for (const match of matches) {
        const line = lineNumberAt(content, match.index ?? 0);
        violations.push(
          `${rel}:${line} -- ${rule.name}: ${rule.description} (\`${match[0]}\`)`,
        );
      }
    }
  }

  if (violations.length > 0) {
    console.error('check-prisma-usage: violaciones encontradas\n');
    for (const violation of violations) console.error(`  ${violation}`);
    console.error(
      '\nSi la excepción es legítima, agregarla a la allowlist en apps/api/scripts/check-prisma-usage.mjs (cambio visible en el diff).',
    );
    process.exit(1);
  }

  console.log('check-prisma-usage: sin violaciones');
}

main();
