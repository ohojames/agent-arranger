#!/usr/bin/env node
// พิมพ์บริบทของโปรเจกต์ที่ cwd — ใช้ได้ทั้งเรียกมือและให้ agent เรียกเอง
// ใช้:  node C:\Users\USER\.agent-arranger\bin\project-context.mjs

import { projectContext, renderContextBlock } from './lib.mjs';

const ctx = projectContext(process.cwd());
process.stdout.write(renderContextBlock(ctx) + '\n');
process.exit(ctx.mismatch ? 1 : 0);
