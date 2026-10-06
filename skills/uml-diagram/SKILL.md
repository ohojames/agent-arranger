---
name: uml-diagram
description: "Workflow for creating, editing, and aligning UML Diagrams (Use Case and Workflow/Activity Diagram) in Draw.io XML format."
---

# UML Diagram Design Agent Workflow

This workflow ensures that the AI designs, modifies, and refines Draw.io UML diagrams (both Use Case and Workflow/Activity Diagrams) to meet the exact technical and aesthetic standards of the project.

## 🚀 Diagram Execution Rules

When the user asks to create or modify a UML diagram, you must operate through the following structured sequence:

---

### 1. Structure and Logic Check (UML Compliance)
- **Workflow / Activity Diagrams**:
  - Every conditional branch (e.g., Yes/No, Approved/Rejected, Success/Failure) **must originate from a Decision Diamond (Rhombus)**.
  - Do NOT draw conditional pathways branching directly out of process rectangles/boxes.
- **Use Case Diagrams**:
  - Use standard stick-figure Actors (`shape=umlActor`) and oval Use Cases (`ellipse`).
  - Correctly direct relationship arrows:
    - Normal association (solid line, no arrow).
    - `<<extend>>` (dashed arrow pointing back to the Base Use Case).
    - `<<include>>` (dashed arrow pointing to the Included Use Case).

---

### 2. Use Case Diagram Layout & Port Specifications
To support standard UML Use Case layouts (like in `moc_usecase.drawio`), you must configure the following properties:
- **System Boundary Box**:
  - Use a large rectangle (`rounded=0;whiteSpace=wrap;html=1;`) as the System Boundary enclosing the Use Cases.
- **Diagram Title Suffix Rules**:
  - Always append the `(Level x)` suffix (e.g., `(Level 0)`, `(Level 1)`, `(Level 2)`) to the title box text of all diagrams for clear context separation.
- **Diagram Title Spacing & Padding**:
  - Ensure a clear vertical gap of at least `50`px to `60`px between the bottom of the title box and the top of the first use case (or actor) to prevent crowding or overlapping. Shift use cases downwards (e.g., first use case `y` starting at `-160` or `-170`) to keep the layout clean and balanced.
- **Thai Word Wrapping (การตัดคำภาษาไทย)**:
  - หากข้อความในกล่อง Use Case (`ellipse`) ยาวเกินขอบเขตกล่องทรงวงรี ให้ดำเนินการแทรกการตัดบรรทัดใหม่ (`\n` หรือ `<br>`) ณ จุดที่เหมาะสมตามหลักไวยากรณ์และความหมายภาษาไทย (ตัวอย่างเช่น แยก `จัดการข่าวประชาสัมพันธ์กลาง` และ `และการแจ้ง Broadcast` เป็นคนละบรรทัด) เพื่อให้อ่านง่ายและไม่หลุดขอบรูปทรง
  - สำหรับชื่อ Actor (โดยเฉพาะกรณีนักเรียนทุนที่มีวงเล็บคำอธิบายยาว เช่น `"นักเรียนทุน (ทุนรัฐบาล/ข้าราชการลาศึกษา/นักเรียนทุนฝาก)"`) ให้แบ่งข้อความเป็น 2 บรรทัดโดยแทรกตัวขึ้นบรรทัดใหม่: `"นักเรียนทุน\n(ทุนรัฐบาล/ข้าราชการลาศึกษา/นักเรียนทุนฝาก)"` (หรือแปลงเป็น `<br>` ใน XML) เพื่อให้ป้ายชื่อกระชับ ไม่ทับซ้อนกับหุ่น Actor และจัดระเบียบองค์ประกอบได้เรียบร้อย
- **Actor Connection Ports (Crucial for Stick Figures)**:
  - **Left-side Actors**: When connecting an Actor on the left to a Use Case inside the boundary:
    - Exit point on Actor (right arm): `exitX=1;exitY=0.3333333333333333;exitDx=0;exitDy=0;exitPerimeter=0;`
    - Entry point on Use Case (left edge): `entryX=0;entryY=0.5;entryDx=0;entryDy=0;`
  - **Right-side Actors**: When connecting an Actor on the right to a Use Case:
    - Exit point on Actor (left arm): `exitX=0;exitY=0.3333333333333333;exitDx=0;exitDy=0;exitPerimeter=0;`
    - Entry point on Use Case (right edge): `entryX=1;entryY=0.5;entryDx=0;entryDy=0;`
- **Association Edge Style**:
  - Use `edgeStyle=none;shape=connector;rounded=0;endArrow=none;endFill=0;` for normal Actor-to-Use-Case lines to keep them straight without wiggles.
- **Dashed Relationships (`<<extend>>` / `<<include>>`)**:
  - Use `dashed=1;endArrow=open;endFill=0;` with text label value `<<extend>>` or `<<include>>`.
- **Text Notes (Notes & Explanations)**:
  - Add text boxes (`text;html=1;strokeColor=none;fillColor=none;`) for explanatory notes with custom colors (e.g. red font `fontColor=#FF0000;` for TOR highlights).

---

### 3. Connector Layout & Path Alignment (Anti-Wiggle Standards)
- **Eliminate Wiggles (0.5px - 22px bends)**:
  - All horizontal and vertical lines must be perfectly straight. No crooked lines or accidental staircase steps.
- **Forced Straight Lines (Linear Connection)**:
  - For horizontal connectors running between shapes on the same vertical level (e.g., Diamond to adjacent Box), set their XML style to `edgeStyle=none;rounded=0;` to force direct linear segment connection and bypass Draw.io's auto-routing engine and prevents any wiggles due to shape boundaries.
- **Center-to-Center Alignment (Mathematical Precision)**:
  - **Horizontal Lines**: Calculate and match the center Y-coordinate of the source shape (`y_src + h_src/2`) and target shape (`y_tgt + h_tgt/2`) to be exactly identical in parent coordinates.
  - **Vertical Lines**: Calculate and match the center X-coordinate of the source shape (`x_src + w_src/2`) and target shape (`x_tgt + w_tgt/2`) to be exactly identical.

---

### 4. Swimlane Geometry & Coordinate Offsets (Swimlane Offset Correction)
- **Understand the Parent Container Scope**:
  - Shapes inside a Swimlane (e.g., stacked lanes under a stackLayout parent `mxCell id="2"`) have coordinates relative to their specific lane.
  - Connectors connecting shapes across different lanes reside under the stackLayout parent (`parent="2"`).
- **Coordinate Conversion (+22px Y-Offset Rule)**:
  - Do NOT write raw lane-relative coordinates in the connector points (`mxPoint` inside `<Array as="points">`).
  - Because each lane is offset downwards by the lane header size (typically `y=22`), you **must add a +22px Y-offset** to the points list in XML to align them in parent coordinate space. Failure to do so will result in a persistent 22px vertical step wiggle at the connector endpoints.

---

### 5. Obstacle Avoidance & Channels (Routing Channels)
- For vertical lines passing between Swimlanes, locate their path coordinate (X-axis) in a clear corridor (e.g., `x = 575` or `x = 380` relative to the parent container).
- Ensure the path has sufficient clearance from process box boundaries to prevent the editor's renderer from automatically adding minor wiggles to bypass shape padding.

---

### 6. Swimlane Workflow Diagram Specifications
- **Connector Styling**:
  - Always enforce **Orthogonal** line routing with rounded corners using `edgeStyle=orthogonalEdgeStyle;shape=connector;rounded=1;` as the style string for all connections to ensure neat routing and avoid wiggles or diagonals.
- **Preceding Login Node Spacing**:
  - Shift the preceding login node coordinates to place the text label at `y = 45` and the ellipse circle at `y = 75` inside the lane content container to keep them compact and slightly away from the swimlane title header boundary (at `y = 38` for lanes with `startSize=38`).
  - Shift subsequent shapes down by `+70px` when a preceding login node is active, or by `+30px` (with start node at `y = 60`) when not active.
  - Set default shape height to `45px` for process boxes to maintain a clean vertical grid alignment.
- **Vertical Spacing Grid**:
  - Standardize on a 120px vertical grid spacing step (e.g. 120, 240, 360, 480, 600, 720, 840) for shape positions to guarantee a clean 75px vertical clearance between process boxes (45px high), giving the auto-router sufficient space to avoid wiggles.
- **Branching Connector Routing**:
  - When branching to multiple vertically stacked process boxes from a single decision diamond (such as in `crud_master`), routing connectors must exit left `(0, 0.5)` and enter left `(0, 0.5)` on target boxes to route around the intermediate shapes and completely eliminate center-box intersections and label overlaps.
- **Warning Dialog Placement & Feedback Loops**:
  - Place all error/warning boxes shown to the user in the user's swimlane (`lane_ids[0]`, lane 0) rather than the system lane to separate them visually.
  - Connect the feedback line from the top center of the warning box `exit=(0.5, 0)` straight up to the bottom center of the input box `entry=(0.5, 1)` in the same lane (lane 0). This prevents horizontal lines from crossing over system lane processes in lane 1.
- **Dynamic Lane and Container Height**:
  - Eliminate excessive empty space at the bottom of the diagram. Calculate the maximum Y-coordinate among all elements (`max_y = max(s_y + s_h)`), then set `lane_height = max_y + 20` (exactly `20px` bottom padding). Set the parent container height to `lane_height + 22` (where 22px is the header startSize).
- **Space-Minimized Thai Grammar**:
  - Avoid raw word spaces before/after subject names or within Thai phrases in process labels (e.g., replace `4. ประมวลผลดึงและกรอง {subject} จากฐานข้อมูล` with `4. ประมวลผล คัดกรอง{subject}จากฐานข้อมูล` and replace English verbs/informal spaces with formal Thai, e.g. `คลิกปุ่มแก้ไข` instead of `กดปุ่มแก้ไข `).
- **Slashed Actor Names in Lane Headers**:
  - If a use case involves multiple actor roles, list them specifically in the lane header separated by a slash `/` (e.g. `"นักเรียนทุน / เจ้าหน้าที่ นทร. 1-4 / ผู้ดูแลระบบ"`). Never use generic names like `"ผู้ใช้งาน"`, `"ผู้บริหาร / เจ้าหน้าที่"`, or `"เจ้าหน้าที่ / ผู้ดูแลระบบ"`.
- **Thai Word Wrapping & User-Facing Labels**:
  - Descriptions inside process boxes must focus on what the user actually sees on screen (e.g. `แสดงหน้ารายการ...`, `แสดงหน้าต่าง...`, `แสดงประวัติทั้งหมดของ...` instead of internal/technical phrases like table-loading or direct DB references).
  - Use simple, concise, and formal Thai vocabulary.

