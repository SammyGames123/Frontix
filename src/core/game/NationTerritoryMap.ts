import { Cell, Nation } from "./Game";
import { GameMap, TileRef } from "./GameMap";

/**
 * Precomputes which manifest nation "owns" each land tile on the map.
 *
 * Ownership is determined by a multi-source breadth-first search from every
 * nation's spawn cell, walking only over land tiles. Each land tile is
 * assigned to the nation whose spawn cell is closest to it by land-walking
 * distance. This produces realistic, continent-aware country shapes from
 * the existing per-map manifest coordinates.
 *
 * The result is used at game start so that every player (human or AI) begins
 * already owning the full territory of a real-world country rather than a
 * single dot that must expand outward.
 */
export class NationTerritoryMap {
  /**
   * Nation index + 1 for each tile (so 0 means "no nation"). Indexes refer to
   * positions in the `nations` array passed to the constructor.
   */
  private readonly tileToNationPlusOne: Uint8Array;

  /** Tiles belonging to each nation, keyed by nation index. */
  private readonly tilesByNation: Map<number, TileRef[]> = new Map();

  constructor(
    private readonly map: GameMap,
    private readonly nations: Nation[],
  ) {
    const numTiles = map.width() * map.height();
    if (nations.length > 254) {
      console.warn(
        `[NationTerritoryMap] ${nations.length} nations exceeds supported 254; excess will be unassigned`,
      );
    }
    this.tileToNationPlusOne = new Uint8Array(numTiles);
    this.compute();
  }

  private compute(): void {
    const seeds: Array<{ nationIndex: number; tile: TileRef }> = [];

    for (let i = 0; i < this.nations.length && i < 254; i++) {
      const nation = this.nations[i];
      const cell = nation.spawnCell;
      if (cell === undefined) continue;
      const seed = this.findNearestLand(cell);
      if (seed === null) continue;
      seeds.push({ nationIndex: i, tile: seed });
    }

    // Seed the BFS frontier. If two nations resolve to the same seed tile,
    // the first one wins — subsequent ones are dropped.
    const queue: number[] = new Array(seeds.length);
    let head = 0;
    let tail = 0;
    for (const { nationIndex, tile } of seeds) {
      if (this.tileToNationPlusOne[tile] !== 0) continue;
      this.tileToNationPlusOne[tile] = nationIndex + 1;
      queue[tail++] = tile;
    }

    // Multi-source BFS over land tiles only.
    while (head < tail) {
      const tile = queue[head++];
      const nationPlusOne = this.tileToNationPlusOne[tile];
      const neighbors = this.map.neighbors(tile);
      for (const n of neighbors) {
        if (this.tileToNationPlusOne[n] !== 0) continue;
        if (!this.map.isLand(n)) continue;
        this.tileToNationPlusOne[n] = nationPlusOne;
        queue[tail++] = n;
      }
    }

    // Group tiles by nation for fast claim-all lookups later.
    for (let tile = 0; tile < this.tileToNationPlusOne.length; tile++) {
      const v = this.tileToNationPlusOne[tile];
      if (v === 0) continue;
      const idx = v - 1;
      let list = this.tilesByNation.get(idx);
      if (list === undefined) {
        list = [];
        this.tilesByNation.set(idx, list);
      }
      list.push(tile);
    }
  }

  /**
   * Finds the closest land tile to a given cell. The manifest coordinates
   * for a nation sometimes sit slightly offshore or in a lake, so we spiral
   * outward to find a real land tile.
   */
  private findNearestLand(cell: Cell): TileRef | null {
    if (!this.map.isValidCoord(cell.x, cell.y)) return null;
    const seed = this.map.ref(cell.x, cell.y);
    if (this.map.isLand(seed)) return seed;

    const maxRadius = 40;
    for (let r = 1; r <= maxRadius; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          // Only check the shell of the current ring.
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
          const x = cell.x + dx;
          const y = cell.y + dy;
          if (!this.map.isValidCoord(x, y)) continue;
          const t = this.map.ref(x, y);
          if (this.map.isLand(t)) return t;
        }
      }
    }
    return null;
  }

  /** Returns the nation index that owns the given tile, or -1 if none. */
  nationIndexAt(tile: TileRef): number {
    const v = this.tileToNationPlusOne[tile];
    return v === 0 ? -1 : v - 1;
  }

  /** Returns the nation that owns the given tile, or undefined. */
  nationAt(tile: TileRef): Nation | undefined {
    const idx = this.nationIndexAt(tile);
    return idx < 0 ? undefined : this.nations[idx];
  }

  /** Returns all tiles belonging to the nation at the given index. */
  tilesForNationIndex(nationIndex: number): TileRef[] {
    return this.tilesByNation.get(nationIndex) ?? [];
  }

  /** Returns all tiles belonging to the given nation, or [] if not tracked. */
  tilesForNation(nation: Nation): TileRef[] {
    const idx = this.nations.indexOf(nation);
    if (idx < 0) return [];
    return this.tilesForNationIndex(idx);
  }

  /** True if the territory map has any assignments at all. */
  hasAnyTerritory(): boolean {
    return this.tilesByNation.size > 0;
  }
}
