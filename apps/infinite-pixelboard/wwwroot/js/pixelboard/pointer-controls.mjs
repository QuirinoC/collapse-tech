export function attachPointerControls(canvas, handlers) {
  let active = null;
  let keyboardPixel = { row: 0, column: 0 };

  canvas.addEventListener("pointerdown", (event) => {
    if (active) return;
    active = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      moved: false,
    };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("is-panning");
  });

  canvas.addEventListener("pointermove", (event) => {
    handlers.hover(event.clientX, event.clientY);
    if (!active || active.id !== event.pointerId) return;
    const deltaX = event.clientX - active.lastX;
    const deltaY = event.clientY - active.lastY;
    if (Math.hypot(event.clientX - active.startX, event.clientY - active.startY) > 5) {
      active.moved = true;
    }
    active.lastX = event.clientX;
    active.lastY = event.clientY;
    if (active.moved) handlers.pan(deltaX, deltaY);
  });

  canvas.addEventListener("pointerup", (event) => {
    if (!active || active.id !== event.pointerId) return;
    if (!active.moved) {
      handlers.hover(event.clientX, event.clientY);
      handlers.paint(event.clientX, event.clientY);
    }
    active = null;
    canvas.classList.remove("is-panning");
  });

  canvas.addEventListener("pointercancel", () => {
    active = null;
    canvas.classList.remove("is-panning");
  });

  canvas.addEventListener("wheel", (event) => {
    event.preventDefault();
    handlers.zoom(event.clientX, event.clientY, Math.exp(-event.deltaY * .0015));
  }, { passive: false });

  canvas.addEventListener("contextmenu", (event) => event.preventDefault());

  canvas.addEventListener("keydown", (event) => {
    const panKeys = {
      ArrowLeft: [24, 0],
      ArrowRight: [-24, 0],
      ArrowUp: [0, 24],
      ArrowDown: [0, -24],
    };
    if (panKeys[event.key]) {
      event.preventDefault();
      if (event.shiftKey) {
        handlers.pan(...panKeys[event.key]);
      } else {
        keyboardPixel = moveKeyboardPixel(keyboardPixel, event.key);
        handlers.select(keyboardPixel);
      }
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      handlers.zoom(canvas.clientWidth / 2, canvas.clientHeight / 2, 1.2);
    } else if (event.key === "-") {
      event.preventDefault();
      handlers.zoom(canvas.clientWidth / 2, canvas.clientHeight / 2, 1 / 1.2);
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      handlers.paintBoard(keyboardPixel);
    }
  });

  return {
    setKeyboardPixel(pixel) {
      keyboardPixel = pixel;
    },
  };
}

function moveKeyboardPixel(pixel, key) {
  return {
    row: pixel.row + (key === "ArrowDown" ? 1 : key === "ArrowUp" ? -1 : 0),
    column: pixel.column + (key === "ArrowRight" ? 1 : key === "ArrowLeft" ? -1 : 0),
  };
}
