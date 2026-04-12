import { GameMapSize, GameMapType, TeamGameSpawnAreas } from "./Game";
import { GameMap, GameMapImpl } from "./GameMap";
import { GameMapLoader } from "./GameMapLoader";

export type TerrainMapData = {
  nations: Nation[];
  gameMap: GameMap;
  miniGameMap: GameMap;
  teamGameSpawnAreas?: TeamGameSpawnAreas;
};

const loadedMaps = new Map<string, TerrainMapData>();

export interface MapMetadata {
  width: number;
  height: number;
  num_land_tiles: number;
}

export interface MapManifest {
  name: string;
  map: MapMetadata;
  map4x: MapMetadata;
  map16x: MapMetadata;
  nations: Nation[];
  teamGameSpawnAreas?: TeamGameSpawnAreas;
}

export interface Nation {
  coordinates: [number, number];
  flag: string;
  name: string;
}

export async function loadTerrainMap(
  map: GameMapType,
  mapSize: GameMapSize,
  terrainMapFileLoader: GameMapLoader,
): Promise<TerrainMapData> {
  const cacheKey = `${map}:${mapSize}`;
  const cached = loadedMaps.get(cacheKey);
  if (cached !== undefined) return cached;
  const mapFiles = terrainMapFileLoader.getMapData(map);
  const manifest = await mapFiles.manifest();

  const gameMap =
    mapSize === GameMapSize.Normal
      ? await genTerrainFromBin(manifest.map, await mapFiles.mapBin())
      : await genTerrainFromBin(manifest.map4x, await mapFiles.map4xBin());

  const miniMap =
    mapSize === GameMapSize.Normal
      ? await genTerrainFromBin(
          mapSize === GameMapSize.Normal ? manifest.map4x : manifest.map16x,
          await mapFiles.map4xBin(),
        )
      : await genTerrainFromBin(manifest.map16x, await mapFiles.map16xBin());

  if (mapSize === GameMapSize.Compact) {
    manifest.nations.forEach((nation) => {
      nation.coordinates = [
        Math.floor(nation.coordinates[0] / 2),
        Math.floor(nation.coordinates[1] / 2),
      ];
    });
  }

  // Scale spawn areas for compact maps
  let teamGameSpawnAreas = manifest.teamGameSpawnAreas;
  if (mapSize === GameMapSize.Compact && teamGameSpawnAreas) {
    const scaled: TeamGameSpawnAreas = {};
    for (const [key, areas] of Object.entries(teamGameSpawnAreas)) {
      scaled[key] = areas.map((a) => ({
        x: Math.floor(a.x / 2),
        y: Math.floor(a.y / 2),
        width: Math.max(1, Math.floor(a.width / 2)),
        height: Math.max(1, Math.floor(a.height / 2)),
      }));
    }
    teamGameSpawnAreas = scaled;
  }

  const result = {
    nations: manifest.nations,
    gameMap: gameMap,
    miniGameMap: miniMap,
    teamGameSpawnAreas,
  };
  loadedMaps.set(cacheKey, result);
  return result;
}

export async function genTerrainFromBin(
  mapData: MapMetadata,
  data: Uint8Array,
): Promise<GameMap> {
  const expected = mapData.width * mapData.height;
  if (data.length !== expected) {
    // Git on Windows with core.autocrlf may expand 0x0A bytes to 0x0D 0x0A,
    // inflating binary map files. Strip only the 0x0D that precedes 0x0A
    // (the CRLF pair git inserts) so the map loads from a corrupted checkout.
    const clean = new Uint8Array(data.length);
    let j = 0;
    for (let i = 0; i < data.length; i++) {
      if (data[i] === 0x0d && i + 1 < data.length && data[i + 1] === 0x0a) {
        continue; // skip \r that's part of \r\n
      }
      clean[j++] = data[i];
    }
    if (j === expected) {
      data = clean.subarray(0, j);
    } else {
      throw new Error(
        `Invalid data: buffer size ${data.length} incorrect for ${mapData.width}x${mapData.height} terrain (expected ${expected} bytes).`,
      );
    }
  }

  return new GameMapImpl(
    mapData.width,
    mapData.height,
    data,
    mapData.num_land_tiles,
  );
}
