// ============================================================================
// Color Class & Pool
// ============================================================================

class Color {
  constructor(r, g, b, name = null) {
    this.r = r;
    this.g = g;
    this.b = b;
    this.name = name;
  }

  distanceTo(other) {
    const dr = this.r - other.r;
    const dg = this.g - other.g;
    const db = this.b - other.b;
    return Math.sqrt(2 * dr * dr + 4 * dg * dg + 3 * db * db);
  }

  clone() {
    return new Color(this.r, this.g, this.b, this.name);
  }

  toHex() {
    const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0');
    return `#${toHex(this.r)}${toHex(this.g)}${toHex(this.b)}`;
  }

  toHexARGB() {
    const toHex = v => Math.round(v * 255).toString(16).padStart(2, '0').toUpperCase();
    return `#${toHex(this.r)}${toHex(this.g)}${toHex(this.b)}FF`;
  }
}

const COLOR_POOL = [
  new Color(1.0, 1.0, 1.0, 'white'),
  new Color(0.0, 0.0, 0.0, 'black'),
  new Color(0.9, 0.1, 0.1, 'red'),
  new Color(1.0, 0.5, 0.0, 'orange'),
  new Color(1.0, 0.9, 0.0, 'yellow'),
  new Color(0.2, 0.7, 0.2, 'green'),
  new Color(0.35, 0.2, 0.1, 'dark_brown'),
  new Color(0.65, 0.45, 0.25, 'light_brown'),
  new Color(0.96, 0.92, 0.82, 'cream'),
  new Color(0.1, 0.2, 0.5, 'dark_blue'),
  new Color(0.4, 0.7, 0.9, 'light_blue'),
  new Color(0.5, 0.5, 0.5, 'gray'),
  new Color(1.0, 0.6, 0.7, 'pink'),
];