import { Cell } from "../../../core/game/Game";
import { GameView } from "../../../core/game/GameView";
import {
  ResourceNode,
  ResourceNodeMap,
  ResourceType,
} from "../../../core/game/ResourceNodes";
import { TransformHandler } from "../TransformHandler";
import { Layer } from "./Layer";

/**
 * Thin canvas-based overlay that draws every strategic resource node on the
 * map. The set of nodes is recomputed locally from the same deterministic
 * seed used server-side (map dimensions + land tile count), so no network
 * sync is needed — server and client always agree on node positions.
 *
 * Each node is drawn as a color-coded ring with a small icon glyph inside:
 *   Oil          – dark circle with "O"
 *   Natural Gas  – orange circle with "G"
 *   Uranium      – green circle with "U"
 *   Rare Earth   – purple circle with "R"
 *   Steel        – silver circle with "S"
 *
 * Owned nodes get a thicker outer ring and a small colored arc in the
 * owning player's color, making it easy to see at a glance which strategic
 * points each country controls.
 */
export class ResourceNodesLayer implements Layer {
  private nodeMap: ResourceNodeMap | null = null;
  private initialized = false;

  constructor(
    private game: GameView,
    private transformHandler: TransformHandler,
  ) {}

  init() {
    // GameView implements the GameMap interface, so ResourceNodeMap can
    // generate its deterministic node layout directly from the client's
    // view of the world.
    this.nodeMap = new ResourceNodeMap(this.game);
    this.initialized = true;
  }

  shouldTransform(): boolean {
    return false;
  }

  renderLayer(context: CanvasRenderingContext2D) {
    if (!this.initialized || this.nodeMap === null) return;
    const nodes = this.nodeMap.all();
    if (nodes.length === 0) return;

    const scale = this.transformHandler.scale;
    // Node radius in screen pixels: shrinks at low zoom so nodes don't
    // clutter the minimap-ish view, grows at high zoom to stay readable.
    const radius = Math.max(4, Math.min(14, 6 + scale * 1.5));
    const ringWidth = Math.max(1, radius * 0.28);

    context.save();
    context.lineWidth = ringWidth;
    context.font = `bold ${Math.max(8, Math.floor(radius * 1.2))}px sans-serif`;
    context.textAlign = "center";
    context.textBaseline = "middle";

    for (const node of nodes) {
      const cell = new Cell(this.game.x(node.tile), this.game.y(node.tile));
      const screen = this.transformHandler.worldToCanvasCoordinates(cell);

      // Skip nodes that fall outside the viewport (cheap bounds check).
      if (
        screen.x < -radius * 2 ||
        screen.y < -radius * 2 ||
        screen.x > context.canvas.width + radius * 2 ||
        screen.y > context.canvas.height + radius * 2
      ) {
        continue;
      }

      this.drawNode(context, node, screen.x, screen.y, radius);
    }

    context.restore();
  }

  private drawNode(
    context: CanvasRenderingContext2D,
    node: ResourceNode,
    x: number,
    y: number,
    radius: number,
  ) {
    const { fill, glyph } = resourceStyle(node.type);

    // Outer halo — makes the node stand out against any terrain color.
    context.beginPath();
    context.fillStyle = "rgba(0, 0, 0, 0.55)";
    context.arc(x, y, radius + 2, 0, Math.PI * 2);
    context.fill();

    // Filled core.
    context.beginPath();
    context.fillStyle = fill;
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();

    // White border for unowned nodes, gold border once someone has claimed
    // them. This keeps the layer simple while still making "contested"
    // versus "held" status legible at a glance.
    const owned = this.game.hasOwner(node.tile);
    context.beginPath();
    context.strokeStyle = owned
      ? "rgba(255, 215, 64, 0.95)"
      : "rgba(255, 255, 255, 0.9)";
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.stroke();

    // Resource glyph (single capital letter identifying the type).
    context.fillStyle = "rgba(255, 255, 255, 0.95)";
    context.fillText(glyph, x, y + 0.5);
  }
}

function resourceStyle(type: ResourceType): { fill: string; glyph: string } {
  switch (type) {
    case ResourceType.Oil:
      return { fill: "#1f1f1f", glyph: "O" };
    case ResourceType.NaturalGas:
      return { fill: "#d87a00", glyph: "G" };
    case ResourceType.Uranium:
      return { fill: "#1f9b2b", glyph: "U" };
    case ResourceType.RareEarth:
      return { fill: "#7a1fa3", glyph: "R" };
    case ResourceType.Steel:
      return { fill: "#7c8391", glyph: "S" };
  }
}
