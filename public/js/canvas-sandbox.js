/**
 * Interactive HTML5 Canvas Sandbox for Pack-Parikshak AI
 * Renders PaddleOCR polygon bounding boxes, supports hover highlighting,
 * zoom/pan, and dynamic synchronization with editable correction inputs.
 */

class OcrCanvasSandbox {
  constructor(canvasId, imageUrl, boxes, imageDims) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) return;

    this.ctx = this.canvas.getContext("2d");
    this.imageUrl = imageUrl;
    this.boxes = boxes || [];
    this.imageDims = imageDims || { width: 800, height: 600 };

    this.img = new Image();
    this.zoom = 1.0;
    this.showBoxes = true;
    this.hoveredBoxIndex = -1;
    this.selectedBoxIndex = -1;

    this.tooltip = document.getElementById("canvasTooltip");

    this.init();
  }

  init() {
    this.img.crossOrigin = "anonymous";
    this.img.src = this.imageUrl;
    this.img.onload = () => {
      this.resizeCanvas();
      this.render();
      this.attachEvents();
    };
  }

  resizeCanvas() {
    const container = this.canvas.parentElement;
    const containerWidth = container.clientWidth || 800;
    
    // Maintain aspect ratio
    const aspect = this.img.height / this.img.width;
    this.canvas.width = Math.min(containerWidth, this.img.width) * this.zoom;
    this.canvas.height = this.canvas.width * aspect;

    this.scaleX = this.canvas.width / this.img.width;
    this.scaleY = this.canvas.height / this.img.height;
  }

  render() {
    if (!this.ctx || !this.img.complete) return;

    // Clear
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    // Draw background image
    this.ctx.drawImage(this.img, 0, 0, this.canvas.width, this.canvas.height);

    if (!this.showBoxes) return;

    // Draw all bounding boxes
    this.boxes.forEach((item, index) => {
      const isHovered = index === this.hoveredBoxIndex;
      const isSelected = index === this.selectedBoxIndex;
      const pts = item.box;
      if (!pts || pts.length < 4) return;

      this.ctx.beginPath();
      this.ctx.moveTo(pts[0][0] * this.scaleX, pts[0][1] * this.scaleY);
      for (let i = 1; i < pts.length; i++) {
        this.ctx.lineTo(pts[i][0] * this.scaleX, pts[i][1] * this.scaleY);
      }
      this.ctx.closePath();

      // Style determination
      if (isHovered || isSelected) {
        this.ctx.fillStyle = "rgba(249, 115, 22, 0.35)"; // Saffron highlight
        this.ctx.fill();
        this.ctx.strokeStyle = "#f97316";
        this.ctx.lineWidth = 2.5;
        this.ctx.stroke();
      } else {
        // Subtle blue default box
        this.ctx.fillStyle = "rgba(59, 130, 246, 0.12)";
        this.ctx.fill();
        this.ctx.strokeStyle = "rgba(59, 130, 246, 0.85)";
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
      }
    });
  }

  attachEvents() {
    this.canvas.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    this.canvas.addEventListener("mouseleave", () => this.handleMouseLeave());
    this.canvas.addEventListener("click", (e) => this.handleClick(e));

    // Window resize observer
    window.addEventListener("resize", () => {
      this.resizeCanvas();
      this.render();
    });
  }

  getCanvasCoords(e) {
    const rect = this.canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / this.scaleX;
    const y = (e.clientY - rect.top) / this.scaleY;
    return { x, y, clientX: e.clientX, clientY: e.clientY };
  }

  isPointInPolygon(x, y, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i][0], yi = pts[i][1];
      const xj = pts[j][0], yj = pts[j][1];
      const intersect = ((yi > y) !== (yj > y)) && (x < ((xj - xi) * (y - yi)) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  handleMouseMove(e) {
    const { x, y, clientX, clientY } = this.getCanvasCoords(e);
    let foundIndex = -1;

    for (let i = 0; i < this.boxes.length; i++) {
      if (this.isPointInPolygon(x, y, this.boxes[i].box)) {
        foundIndex = i;
        break;
      }
    }

    if (foundIndex !== this.hoveredBoxIndex) {
      this.hoveredBoxIndex = foundIndex;
      this.render();

      if (foundIndex >= 0 && this.tooltip) {
        const item = this.boxes[foundIndex];
        const confPct = Math.round((item.confidence || 0.9) * 100);
        this.tooltip.innerHTML = `
          <div class="font-bold text-amber-400 mb-0.5">${item.text}</div>
          <div class="text-[10px] text-slate-300">Confidence: ${confPct}%</div>
        `;
        this.tooltip.style.display = "block";
        this.tooltip.style.left = `${clientX + 12}px`;
        this.tooltip.style.top = `${clientY + 12}px`;

        // Highlight matching raw line item if present
        this.syncRawTextHighlight(foundIndex);
      } else if (this.tooltip) {
        this.tooltip.style.display = "none";
      }
    } else if (foundIndex >= 0 && this.tooltip) {
      this.tooltip.style.left = `${clientX + 12}px`;
      this.tooltip.style.top = `${clientY + 12}px`;
    }
  }

  handleMouseLeave() {
    this.hoveredBoxIndex = -1;
    this.render();
    if (this.tooltip) this.tooltip.style.display = "none";
  }

  handleClick(e) {
    const { x, y } = this.getCanvasCoords(e);
    for (let i = 0; i < this.boxes.length; i++) {
      if (this.isPointInPolygon(x, y, this.boxes[i].box)) {
        this.selectedBoxIndex = i;
        this.render();
        console.log(`[Sandbox] Selected Box #${i}: "${this.boxes[i].text}"`);
        break;
      }
    }
  }

  syncRawTextHighlight(boxIdx) {
    document.querySelectorAll(".raw-box-item").forEach((el, idx) => {
      if (idx === boxIdx) {
        el.classList.add("bg-amber-100", "border-amber-400");
        el.scrollIntoView({ behavior: "smooth", block: "nearest" });
      } else {
        el.classList.remove("bg-amber-100", "border-amber-400");
      }
    });
  }

  zoomIn() {
    if (this.zoom < 2.5) {
      this.zoom += 0.25;
      this.resizeCanvas();
      this.render();
    }
  }

  zoomOut() {
    if (this.zoom > 0.75) {
      this.zoom -= 0.25;
      this.resizeCanvas();
      this.render();
    }
  }

  resetZoom() {
    this.zoom = 1.0;
    this.resizeCanvas();
    this.render();
  }

  toggleBoxes() {
    this.showBoxes = !this.showBoxes;
    this.render();
    return this.showBoxes;
  }
}

window.OcrCanvasSandbox = OcrCanvasSandbox;

