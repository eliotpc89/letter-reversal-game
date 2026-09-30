import type { TrophyId } from "../api";
import trophyCatalogJson from "./trophy-catalog.json";
import { TROPHY_ICONS } from "./trophy-icons";

export type Trophy = {
  id: TrophyId;
  name: string;
  price: number;
  color: string;
  /** Raw SVG artwork for the trophy. */
  svg: string;
};

type CatalogRow = { id: TrophyId; name: string; price: number; color: string };

const catalog = trophyCatalogJson as CatalogRow[];
const icons = TROPHY_ICONS as unknown as Record<string, string>;

/**
 * The shop catalog. Costs live in trophy-catalog.json and artwork in
 * trophy-icons.ts — adding a trophy means one JSON row plus one SVG string,
 * no price-map or icon-component edits.
 */
export const TROPHIES: Trophy[] = catalog.map((row) => ({
  ...row,
  svg: icons[row.id] ?? icons["star"] ?? "",
}));

export function trophyById(id: TrophyId): Trophy | undefined {
  return TROPHIES.find((trophy) => trophy.id === id);
}

export function trophySvg(id: TrophyId): string {
  return icons[id] ?? icons["star"] ?? "";
}
