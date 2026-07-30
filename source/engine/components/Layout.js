import { Component } from "../types/Component.js";

const MODE_OPTIONS = [
  { value: "flow", label: "Flow" },
  { value: "grid", label: "Grid" },
];

const DIRECTION_OPTIONS = [
  { value: "row", label: "Row" },
  { value: "column", label: "Column" },
];

const JUSTIFY_OPTIONS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
  { value: "space-between", label: "Space Between" },
  { value: "space-around", label: "Space Around" },
];

const ALIGN_OPTIONS = [
  { value: "start", label: "Start" },
  { value: "center", label: "Center" },
  { value: "end", label: "End" },
];

/**
 * Automatically positions an entity's direct children, flexbox-style
 * ("flow": wraps along one main axis) or grid-style ("grid": fixed
 * row/column count, tracks auto-sized to content). Runs every tick,
 * writing into each child's own Transform.x/y.
 *
 * Child Transform.x/y are already parent-relative (see Transform.js), so
 * this positions children in the Layout entity's own local space starting
 * at (paddingX, paddingY) — it does NOT add the Layout entity's own
 * Transform position, which getWorldTransform composes in separately.
 */
export class Layout extends Component {
  static schema = {
    mode: { type: "select", default: "flow", description: "\"flow\" wraps children flexbox-style; \"grid\" places them into a fixed row/column grid with content-sized tracks.", options: MODE_OPTIONS },
    direction: { type: "select", default: "row", description: "Main axis for flow mode; row-major vs column-major fill order for grid mode.", options: DIRECTION_OPTIONS },
    wrap: { type: "boolean", default: true, description: "Flow mode only: wrap onto a new line, instead of flowing on a single endless line." },
    width: { type: "number", default: 0, description: "Container box width. 0 = unbounded. Flow+row mode: triggers a wrap when exceeded." },
    height: { type: "number", default: 0, description: "Container box height. 0 = unbounded. Flow+column mode: triggers a wrap when exceeded." },
    gapX: { type: "number", default: 0, description: "Horizontal spacing between items." },
    gapY: { type: "number", default: 0, description: "Vertical spacing between items (between wrapped lines in flow; row gap in grid)." },
    maxCols: { type: "number", default: 0, description: "Flow: caps items per row before wrapping (row direction). Grid: fixed column count. 0 = unbounded/auto." },
    maxRows: { type: "number", default: 0, description: "Flow: caps items per column before wrapping (column direction). Grid: fixed row count. 0 = unbounded/auto." },
    justify: { type: "select", default: "start", description: "Main-axis distribution in flow mode. Horizontal in-cell alignment in grid mode (space-between/space-around behave as start there).", options: JUSTIFY_OPTIONS },
    align: { type: "select", default: "start", description: "Cross-axis alignment within a line (flow) or vertical in-cell alignment (grid).", options: ALIGN_OPTIONS },
    paddingX: { type: "number", default: 0, description: "Inset from the Layout entity's own position, horizontal." },
    paddingY: { type: "number", default: 0, description: "Inset from the Layout entity's own position, vertical." },
  };

  onTick(entity) {
    const children = entity.children.filter((c) => c.getComponent("Transform"));
    if (children.length === 0) return;

    if (this.mode === "grid") this._layoutGrid(children);
    else this._layoutFlow(children);
  }

  // ---- flow mode ----

  _layoutFlow(children) {
    const horizontal = this.direction === "row";
    const rawBound = horizontal ? this.width : this.height;
    const paddingMain = horizontal ? this.paddingX : this.paddingY;
    const contentBound = rawBound > 0 ? Math.max(0, rawBound - 2 * paddingMain) : 0;

    const lines = this._packLines(children, horizontal, contentBound);
    this._placeLines(lines, horizontal, contentBound);
  }

  // Packs children into lines along the main axis, breaking to a new line
  // when the next item would exceed contentBound (if wrap) or the
  // configured max-items-per-line count.
  _packLines(children, horizontal, contentBound) {
    const lines = [];
    let line = [];
    let mainSize = 0;
    const maxCount = horizontal ? this.maxCols : this.maxRows;
    const gapMain = horizontal ? this.gapX : this.gapY;

    for (const child of children) {
      const dims = child.getDimensions();
      const size = horizontal ? dims.width : dims.height;
      const nextMainSize = line.length === 0 ? size : mainSize + gapMain + size;

      const overByBound = this.wrap && contentBound > 0 && line.length > 0 && nextMainSize > contentBound;
      const overByCount = maxCount > 0 && line.length >= maxCount;

      if (line.length > 0 && (overByBound || overByCount)) {
        lines.push({ items: line, mainSize });
        line = [{ entity: child, dims }];
        mainSize = size;
      } else {
        line.push({ entity: child, dims });
        mainSize = nextMainSize;
      }
    }
    if (line.length > 0) lines.push({ items: line, mainSize });
    return lines;
  }

  _placeLines(lines, horizontal, contentBound) {
    const gapMain = horizontal ? this.gapX : this.gapY;
    const gapCross = horizontal ? this.gapY : this.gapX;
    const paddingMain = horizontal ? this.paddingX : this.paddingY;
    const paddingCross = horizontal ? this.paddingY : this.paddingX;
    let crossCursor = paddingCross;

    for (const line of lines) {
      const crossSize = Math.max(0, ...line.items.map(({ dims }) => (horizontal ? dims.height : dims.width)));
      const offsets = this._distributeMain(line, gapMain, paddingMain, contentBound, horizontal);

      for (let i = 0; i < line.items.length; i++) {
        const { entity: child, dims } = line.items[i];
        const mainOffset = offsets[i];
        const crossItemSize = horizontal ? dims.height : dims.width;
        const crossOffset = this._alignOffset(crossItemSize, crossSize, this.align);

        const transform = child.getComponent("Transform");
        if (horizontal) {
          transform.x = mainOffset + dims.width / 2;
          transform.y = crossCursor + crossOffset + dims.height / 2;
        } else {
          transform.y = mainOffset + dims.height / 2;
          transform.x = crossCursor + crossOffset + dims.width / 2;
        }
      }

      crossCursor += crossSize + gapCross;
    }
  }

  // Returns each item's main-axis top-left offset within its line, applying `justify`.
  _distributeMain(line, gapMain, paddingMain, contentBound, horizontal) {
    const n = line.items.length;
    const offsets = new Array(n);
    const slack = contentBound > 0 ? Math.max(0, contentBound - line.mainSize) : 0;

    let cursor = paddingMain;
    let extraGap = 0;
    if (slack > 0) {
      if (this.justify === "center") cursor = paddingMain + slack / 2;
      else if (this.justify === "end") cursor = paddingMain + slack;
      else if (this.justify === "space-between" && n > 1) extraGap = slack / (n - 1);
      else if (this.justify === "space-around" && n > 0) {
        extraGap = slack / n;
        cursor = paddingMain + extraGap / 2;
      }
    }

    for (let i = 0; i < n; i++) {
      offsets[i] = cursor;
      const size = horizontal ? line.items[i].dims.width : line.items[i].dims.height;
      cursor += size + gapMain + extraGap;
    }
    return offsets;
  }

  _alignOffset(itemSize, trackSize, mode) {
    if (mode === "center") return (trackSize - itemSize) / 2;
    if (mode === "end") return trackSize - itemSize;
    return 0; // "start", and any space-* value (not meaningful for single-item cells)
  }

  // ---- grid mode ----

  _layoutGrid(children) {
    let cols = this.maxCols;
    let rows = this.maxRows;
    if (cols <= 0 && rows <= 0) {
      cols = children.length;
      rows = 1;
    } else if (cols <= 0) {
      cols = Math.ceil(children.length / rows);
    } else if (rows <= 0) {
      rows = Math.ceil(children.length / cols);
    }

    const rowMajor = this.direction === "row";
    const primary = rowMajor ? cols : rows;

    const cells = [];
    for (let r = 0; r < rows; r++) cells.push(new Array(cols).fill(undefined));

    children.forEach((child, index) => {
      if (index >= rows * cols) return; // beyond grid capacity: not placed
      const dims = child.getDimensions();
      let r, c;
      if (rowMajor) {
        r = Math.floor(index / primary);
        c = index % primary;
      } else {
        c = Math.floor(index / primary);
        r = index % primary;
      }
      cells[r][c] = { entity: child, dims };
    });

    const colWidths = new Array(cols).fill(0);
    const rowHeights = new Array(rows).fill(0);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells[r][c];
        if (!cell) continue;
        colWidths[c] = Math.max(colWidths[c], cell.dims.width);
        rowHeights[r] = Math.max(rowHeights[r], cell.dims.height);
      }
    }

    const colX = new Array(cols).fill(0);
    let cursorX = this.paddingX;
    for (let c = 0; c < cols; c++) {
      colX[c] = cursorX;
      cursorX += colWidths[c] + this.gapX;
    }
    const rowY = new Array(rows).fill(0);
    let cursorY = this.paddingY;
    for (let r = 0; r < rows; r++) {
      rowY[r] = cursorY;
      cursorY += rowHeights[r] + this.gapY;
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const cell = cells[r][c];
        if (!cell) continue;
        const transform = cell.entity.getComponent("Transform");
        const cellX = colX[c] + this._alignOffset(cell.dims.width, colWidths[c], this.justify);
        const cellY = rowY[r] + this._alignOffset(cell.dims.height, rowHeights[r], this.align);
        transform.x = cellX + cell.dims.width / 2;
        transform.y = cellY + cell.dims.height / 2;
      }
    }
  }
}
