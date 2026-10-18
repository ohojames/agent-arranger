# Third-party skills / ที่มาของ skill

skill ส่วนใหญ่ในชุดนี้เป็นผลงานของคนอื่น aa รวบรวมมา ตั้งค่าให้แต่ละเครื่องมือ และเพิ่มกฎกับ hook รอบๆ
ตารางนี้บอกต้นทาง ผู้เขียน และสัญญาอนุญาตของทุก skill ตรวจที่มาล่าสุดเมื่อ 2026-10-18
(วิธีตรวจและหลักฐานรายตัวอยู่ใน `research/2026-10-18-aa-skill-provenance.md` ของทะเบียนกลาง)

repo นี้ยังเป็น private แถวที่มี ⚠️ ยังหาต้นทางไม่เจอ ต้องหาให้เจอหรือเอาออกก่อนเปิด public (เหลือ 2 ตัว)

ไม่แจกในนี้ ให้ติดตั้งจากต้นทาง:
- `docx` สัญญาอนุญาต Proprietary ของ Anthropic ได้มาจาก plugin `document-skills@anthropic-agent-skills` แทน
- `react-doctor` ของ millionco/react-doctor ใช้ Modified MIT ของ Million Software ซึ่งห้ามใช้เป็นข้อมูล train AI และห้ามขายเป็นบริการโดยไม่ขออนุญาต
  ติดตั้งเองด้วย `npx react-doctor@latest install`

Plugins และ MCP ไม่ได้อยู่ใน repo นี้ ตัวติดตั้งดาวน์โหลดจากต้นทาง:
- `obra/superpowers` (plugin superpowers), `anthropics/skills` (plugin document-skills)
- npm `@upstash/context7-mcp`, `chrome-devtools-mcp`

คำในตาราง:
- คัดลอกจาก: เนื้อหาตรงกับต้นทางทุกบรรทัด ไฟล์ LICENSE ของต้นทางอยู่ในโฟลเดอร์ skill
- เขียนใหม่โดยอิง: ชื่อหรือแนวคิดมาจากต้นทาง ข้อความในนี้เขียนใหม่
- ทำในชุดนี้: ไม่พบต้นทางภายนอก เนื้อหาผูกกับกฎหรือโปรเจกต์ของผู้รวบรวม (MIT ตาม repo)

| skill | ที่มา / สัญญาอนุญาต |
|---|---|
| `accessibility` | คัดลอกจาก addyosmani/web-quality-skills, MIT |
| `accidental-data-loss-prevention` | ระบุใน SKILL.md: Apache-2.0 |
| `ai-proceed` | ทำในชุดนี้ (MIT) |
| `ai-tools-knowledge` | SKILL.md ทำในชุดนี้, `references/awesome-ai-tools.md` คัดลอกจาก README ฉบับเก่าของ ai-for-developers/awesome-ai-coding-tools, MIT (Copyright (c) 2025 aifordevelopers.org) |
| `browser-use` | ทำในชุดนี้ เป็นคู่มือใช้ browser-use/browser-use (ไม่ได้รวมโค้ดของเครื่องมือ) |
| `building-data-apps` | ระบุใน SKILL.md: Apache-2.0 |
| `claude-bughunter` | เขียนใหม่โดยอิง elementalsouls/Claude-BugHunter, MIT ฉบับนี้เป็นสรุปสั้น ใช้ฉบับเต็มจากต้นทาง |
| `claude-gauge` | ⚠️ ต้นทางบน GitHub ยังหาไม่เจอ (ชื่อพ้องกับเครื่องมือวัดโควตาหลายตัว แต่ไม่ใช่ skill) |
| `code` | ทำในชุดนี้ ขั้นตอนแก้โค้ดเขียนใหม่โดยอิงแนวทางของ Aider-AI/aider (Apache-2.0), OpenHands/OpenHands (MIT) และ SWE-agent/SWE-agent (MIT) ไม่ได้รวมโค้ดของเครื่องมือ |
| `common-ground` | เขียนใหม่โดยอิงคำสั่ง common-ground ของ Jeffallan/claude-skills, MIT |
| `data-migration` | คัดลอกจาก TerminalSkills/skills@a021875, Apache-2.0 |
| `dev-pipeline` | ⚠️ ต้นทางบน GitHub ยังหาไม่เจอ |
| `diagram-design` | ระบุใน SKILL.md: MIT |
| `domain-modeling` | คัดลอกจาก mattpocock/skills@006a52b, MIT (Copyright (c) 2026 Matt Pocock) |
| `ecc` | เขียนใหม่โดยอิง affaan-m/ECC (เดิมชื่อ everything-claude-code), MIT ฉบับนี้เป็นสรุปสั้น |
| `gemini-api-dev` | คัดลอกจาก google-gemini/gemini-skills@832c8f9, Apache-2.0 |
| `gemini-image` | ทำในชุดนี้ (MIT) |
| `gemini-tts` | ทำในชุดนี้ (MIT) |
| `gha-security-review` | คัดลอกจาก getsentry/skills, Apache-2.0 |
| `grilling` | คัดลอกจาก mattpocock/skills@006a52b, MIT (Copyright (c) 2026 Matt Pocock) |
| `html-slides` | คัดลอกจาก proyecto26/slides-ai-plugin@1f8505f, MIT (Copyright (c) 2026 Proyecto 26) |
| `hyperframes`, `hyperframes-core`, `hyperframes-cli`, `hyperframes-audio`, `media-use`, `embedded-captions`, `faceless-explainer`, `general-video` | คัดลอกจาก heygen-com/hyperframes@6ae1af7, Apache-2.0 |
| `legacy-migration` | ทำในชุดนี้ (MIT) |
| `managing-python-dependencies` | ระบุใน SKILL.md: Apache-2.0 |
| `microservices-architect` | เขียนใหม่โดยอิง skill microservices-architect ของ Jeffallan/claude-skills, MIT |
| `midscene` | ทำในชุดนี้ เป็นคู่มือใช้ web-infra-dev/midscene (ไม่ได้รวมโค้ดของเครื่องมือ) |
| `ml-best-practices` | ระบุใน SKILL.md: Apache-2.0 |
| `notebook-guidance` | ระบุใน SKILL.md: Apache-2.0 |
| `playwright` | ทำในชุดนี้ เป็นคู่มือใช้ microsoft/playwright, Apache-2.0 (ไม่ได้รวมโค้ดของเครื่องมือ) |
| `ponytail` | เขียนใหม่โดยอิง DietrichGebert/ponytail, MIT |
| `postgres-database-migration` | คัดลอกจาก timescale/pg-aiguide@187be00, Apache-2.0 |
| `pptx-slides` | คัดลอกจาก proyecto26/slides-ai-plugin@1f8505f, MIT (Copyright (c) 2026 Proyecto 26) |
| `prototype` | คัดลอกจาก mattpocock/skills@006a52b, MIT (Copyright (c) 2026 Matt Pocock) |
| `research` | คัดลอกจาก mattpocock/skills@006a52b, MIT (Copyright (c) 2026 Matt Pocock) |
| `run_page_number` | ทำในชุดนี้ (MIT) |
| `security-check` | ทำในชุดนี้ (MIT) |
| `setup-matt-pocock-skills` | คัดลอกจาก mattpocock/skills@006a52b, MIT (Copyright (c) 2026 Matt Pocock) |
| `slide-design` | คัดลอกจาก proyecto26/slides-ai-plugin@1f8505f, MIT (Copyright (c) 2026 Proyecto 26) |
| `sqlserver-to-postgresql-playbook` | คัดลอกจาก aws-samples/sample-dbmig-aidlc@4bd3911, MIT-0 |
| `supabase` | คัดลอกจาก supabase/agent-skills (skills/supabase), MIT (Copyright (c) 2026 Supabase) |
| `supabase-postgres-best-practices` | ระบุใน SKILL.md: MIT |
| `testcontainers` | ทำในชุดนี้ เป็นคู่มือใช้ Testcontainers (ไม่ได้รวมโค้ดของเครื่องมือ) |
| `token-saver` | ทำในชุดนี้ (MIT) |
| `ui-ux-pro-max` | เขียนใหม่โดยอิงชื่อของ nextlevelbuilder/ui-ux-pro-max-skill, MIT ไม่ได้คัดลอกเนื้อหา |
| `uml-diagram` | ทำในชุดนี้ (MIT) |
| `verify-merge-main` | ทำในชุดนี้ (MIT) |
| `verify-push` | ทำในชุดนี้ (MIT) |
| `vitest` | ทำในชุดนี้ เป็นคู่มือใช้ vitest-dev/vitest (ไม่ได้รวมโค้ดของเครื่องมือ) |
| `wayfinder` | คัดลอกจาก mattpocock/skills@006a52b, MIT (Copyright (c) 2026 Matt Pocock) |
| `web-perf` | คัดลอกจาก cloudflare/skills, Apache-2.0 |
