export class Input {
  constructor(gameContainer) {
    this.gameContainer = gameContainer;

    this.keys = new Set();
    this.keysPressed = new Set();  // true for exactly one frame
    this.keysReleased = new Set(); // true for exactly one frame

    this.mouse = { x: 0, y: 0, dx: 0, dy: 0 };
    this.mouseButtons = new Set();
    this.mouseButtonsPressed = new Set();
    this.mouseButtonsReleased = new Set();
    this.wheelDelta = 0;

    this._bind();
  }

  _bind() {
    window.addEventListener("keydown", (e) => {
      if (!this.keys.has(e.code)) this.keysPressed.add(e.code);
      this.keys.add(e.code);
    });

    window.addEventListener("keyup", (e) => {
      this.keys.delete(e.code);
      this.keysReleased.add(e.code);
    });

    this.gameContainer.addEventListener("mousemove", (e) => {
      const rect = this.gameContainer.getBoundingClientRect();
      const newX = e.clientX - rect.left;
      const newY = e.clientY - rect.top;
      this.mouse.dx = newX - this.mouse.x;
      this.mouse.dy = newY - this.mouse.y;
      this.mouse.x = newX;
      this.mouse.y = newY;
    });

    this.gameContainer.addEventListener("mousedown", (e) => {
      if (!this.mouseButtons.has(e.button)) this.mouseButtonsPressed.add(e.button);
      this.mouseButtons.add(e.button);
    });

    window.addEventListener("mouseup", (e) => {
      this.mouseButtons.delete(e.button);
      this.mouseButtonsReleased.add(e.button);
    });

    this.gameContainer.addEventListener("wheel", (e) => {
      this.wheelDelta = e.deltaY;
    });

    this.gameContainer.addEventListener("contextmenu", (e) => e.preventDefault());
  }

  // --- keyboard ---
  isKeyDown(code) { return this.keys.has(code); }
  wasKeyPressed(code) { return this.keysPressed.has(code); }
  wasKeyReleased(code) { return this.keysReleased.has(code); }

  // --- mouse ---
  isMouseDown(button = 0) { return this.mouseButtons.has(button); }
  wasMousePressed(button = 0) { return this.mouseButtonsPressed.has(button); }
  wasMouseReleased(button = 0) { return this.mouseButtonsReleased.has(button); }

  // Call once per frame, AFTER all component/script updates read this-frame state
  _endFrame() {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouseButtonsPressed.clear();
    this.mouseButtonsReleased.clear();
    this.mouse.dx = 0;
    this.mouse.dy = 0;
    this.wheelDelta = 0;
  }
}