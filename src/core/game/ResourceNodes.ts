import { PseudoRandom } from "../PseudoRandom";
import { Game, Player } from "./Game";
import { GameMap, TileRef } from "./GameMap";

/**
 * Strategic resource types that spawn as fixed-point nodes across the map.
 * Owning a tile containing a resource node grants the owning player a
 * per-tick gold and/or troop bonus. The values below are tuned so that
 * controlling 3-4 good nodes is roughly equivalent to controlling a large
 * country's worth of plain territory — small nations stay competitive by
 * fighting over resource nodes instead of raw square footage.
 */
export enum ResourceType {
  Oil = "Oil",
  NaturalGas = "NaturalGas",
  Uranium = "Uranium",
  RareEarth = "RareEarth",
  Steel = "Steel",
}

export interface ResourceBonus {
  gold: bigint;
  troops: number;
}

/** Per-tick income bonus granted by owning one node of the given type. */
export function resourceBonus(type: ResourceType): ResourceBonus {
  switch (type) {
    case ResourceType.Oil:
      return { gold: 60n, troops: 0 };
    case ResourceType.NaturalGas:
      return { gold: 40n, troops: 0 };
    case ResourceType.Uranium:
      return { gold: 20n, troops: 8 };
    case ResourceType.RareEarth:
      return { gold: 30n, troops: 5 };
    case ResourceType.Steel:
      return { gold: 0n, troops: 12 };
  }
}

export interface ResourceNode {
  readonly id: number;
  readonly tile: TileRef;
  readonly type: ResourceType;
}

const RESOURCE_TYPE_CYCLE: readonly ResourceType[] = [
  ResourceType.Oil,
  ResourceType.NaturalGas,
  ResourceType.Uranium,
  ResourceType.RareEarth,
  ResourceType.Steel,
];

/**
 * Holds the generated resource nodes for a game and exposes O(1) lookup by
 * tile. Nodes are generated deterministically at game start based on the
 * map dimensions so every client sees the same layout.
 */
export class ResourceNodeMap {
  private readonly nodes: ResourceNode[] = [];
  private readonly byTile: Map<TileRef, ResourceNode> = new Map();

  constructor(map: GameMap) {
    const targetCount = ResourceNodeMap.targetNodeCount(map);
    if (targetCount === 0) return;

    // Seed purely from stable map characteristics so results are
    // reproducible across server and client-side replays.
    const seed =
      map.width() * 73856093 + map.height() * 19349663 + map.numLandTiles();
    const random = new PseudoRandom(seed);

    const minDistance = Math.max(
      20,
      Math.floor(Math.min(map.width(), map.height()) / 8),
    );
    const minDistanceSq = minDistance * minDistance;

    const placedTiles: TileRef[] = [];
    const maxAttempts = targetCount * 400;
    let attempts = 0;
    while (this.nodes.length < targetCount && attempts < maxAttempts) {
      attempts++;
      const x = random.nextInt(0, map.width());
      const y = random.nextInt(0, map.height());
      if (!map.isValidCoord(x, y)) continue;
      const tile = map.ref(x, y);
      if (!map.isLand(tile)) continue;
      if (this.byTile.has(tile)) continue;

      // Enforce a minimum spacing between nodes so they feel like distinct
      // strategic points rather than clusters.
      let tooClose = false;
      for (const other of placedTiles) {
        if (map.euclideanDistSquared(tile, other) < minDistanceSq) {
          tooClose = true;
          break;
        }
      }
      if (tooClose) continue;

      const type =
        RESOURCE_TYPE_CYCLE[this.nodes.length % RESOURCE_TYPE_CYCLE.length];
      const node: ResourceNode = {
        id: this.nodes.length,
        tile,
        type,
      };
      this.nodes.push(node);
      this.byTile.set(tile, node);
      placedTiles.push(tile);
    }
  }

  /**
   * Target number of nodes to place for a given map. Scales with the map's
   * land area so large maps get ~20 nodes and compact maps get ~8.
   */
  static targetNodeCount(map: GameMap): number {
    const land = map.numLandTiles();
    if (land <= 0) return 0;
    // Roughly: World (~650k land) -> 20, Europe (~150k) -> 12, Compact (~40k) -> 8
    if (land >= 500_000) return 20;
    if (land >= 200_000) return 16;
    if (land >= 100_000) return 12;
    if (land >= 25_000) return 8;
    return 5;
  }

  all(): readonly ResourceNode[] {
    return this.nodes;
  }

  at(tile: TileRef): ResourceNode | undefined {
    return this.byTile.get(tile);
  }

  count(): number {
    return this.nodes.length;
  }
}

/**
 * Computes the total per-tick gold and troop bonus a player earns from
 * currently controlling resource nodes. Iterating all nodes is cheap
 * (target count is ~20 on the largest maps) and avoids any per-tile
 * bookkeeping.
 */
export function playerResourceBonus(
  game: Game,
  player: Player,
): ResourceBonus {
  let gold = 0n;
  let troops = 0;
  const nodes = game.resourceNodes();
  for (const node of nodes) {
    if (!game.hasOwner(node.tile)) continue;
    const owner = game.owner(node.tile);
    if (!owner.isPlayer()) continue;
    if ((owner as Player).id() !== player.id()) continue;
    const bonus = resourceBonus(node.type);
    gold += bonus.gold;
    troops += bonus.troops;
  }
  return { gold, troops };
}

