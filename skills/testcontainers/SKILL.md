---
name: testcontainers
description: Run integration tests against real services in throwaway Docker containers — Postgres, Redis, Kafka, or any image. Use when the user invokes /testcontainers, asks for integration tests, or wants to test against a real database instead of a mock.
---

# Testcontainers — Integration Tests Against Real Services

Reference: https://github.com/testcontainers/testcontainers-java
Node: `testcontainers` · Python: `testcontainers` · Go: `testcontainers-go`

## ก่อนเริ่ม — ตรวจให้ครบ

1. `docker info` ต้องผ่าน **ถ้า Docker ไม่ทำงาน ให้หยุดและบอกผู้ใช้**
   ห้ามถอยไปใช้ mock เงียบ ๆ เพราะผลที่ผ่านด้วย mock จะรายงานผิดว่าตรวจอะไรไปแล้ว
2. ปักหมุด tag ของ image เสมอ ห้ามใช้ `latest`
3. ตั้ง timeout ของ hook อย่างน้อย 120 วินาที การดึง image ครั้งแรกช้ากว่าค่าเริ่มต้นมาก
4. หนึ่ง container ต่อหนึ่ง suite แล้วล้างข้อมูลระหว่างเทสต์ ไม่ใช่หนึ่ง container ต่อเทสต์

**ในรายงานต้องระบุว่าเทสต์รันกับ image และเวอร์ชันอะไร** ผลจากฐานข้อมูลจริง
กับผลจาก mock เป็นหลักฐานคนละชั้น

Start a real Postgres, run the test against it, throw it away. Use this when
the thing under test is the interaction with a service — a migration, a query,
a transaction, an RLS policy — where a mock would only prove that the mock
matches the code that wrote it.

## Requires Docker

Docker Desktop must be running. Check before doing anything else:

```bash
docker info
```

If it is not up, say so plainly and stop — do not silently fall back to mocks,
because a passing mock-based run would misrepresent what was verified.

## Node / TypeScript

```bash
npm i -D testcontainers @testcontainers/postgresql
```

```ts
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { afterAll, beforeAll, expect, it } from 'vitest';

let pg: StartedPostgreSqlContainer;

beforeAll(async () => {
    pg = await new PostgreSqlContainer('postgres:16-alpine').start();
    await runMigrations(pg.getConnectionUri());
}, 120_000);          // pulling an image the first time is slow

afterAll(async () => { await pg?.stop(); });

it('row-level security hides another project\'s rows', async () => {
    // …connect with an anon-role client and assert it sees nothing
});
```

## Java

```java
@Testcontainers
class RepositoryTest {
    @Container
    static PostgreSQLContainer<?> pg = new PostgreSQLContainer<>("postgres:16-alpine");
}
```

## Rules that keep it fast and honest

1. **One container per suite, not per test.** Starting Postgres costs seconds;
   truncating tables costs milliseconds. Share the container, reset the data.
2. **Pin the image tag.** `postgres:latest` makes a green suite go red for
   reasons unrelated to the change.
3. **Let the library pick the port.** Never hard-code 5432 — parallel runs and
   a locally installed Postgres will collide.
4. **Wait for readiness, not for a timer.** The library's wait strategies know
   when the service is actually accepting connections.
5. **Raise the hook timeout.** The default is far below an image pull.

## When not to use it

If the code under test only formats a string, a container is pure cost. Use
`/vitest`. Testcontainers earns its seconds when the database itself is part of
the behaviour being checked.
