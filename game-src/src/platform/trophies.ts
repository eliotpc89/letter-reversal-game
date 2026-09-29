import type { TrophyId } from "../api";

export type Trophy = { id: TrophyId; name: string; price: number; color: string };
export const TROPHIES: Trophy[] = [
  { id: "star", name: "Power Star", price: 15, color: "#ffc928" },
  { id: "one-up", name: "1-Up Mushroom", price: 30, color: "#2f9e68" },
  { id: "fire-flower", name: "Fire Flower", price: 50, color: "#e64b3c" },
  { id: "tanooki-suit", name: "Tanooki Suit", price: 75, color: "#a76635" },
  { id: "green-pipe", name: "Green Pipe", price: 100, color: "#1f9c55" },
  { id: "gold-crown", name: "Golden Crown", price: 150, color: "#f0ad00" },
  { id: "master-sword", name: "Master Sword", price: 200, color: "#7fb2e5" },
  { id: "hylian-shield", name: "Hylian Shield", price: 250, color: "#e8b93c" },
  { id: "heros-cap", name: "Hero's Cap", price: 300, color: "#2f9e68" },
  { id: "star-rod", name: "Star Rod", price: 350, color: "#ffd94d" },
  { id: "cappy", name: "Cappy", price: 400, color: "#e64b3c" },
  { id: "yoshi", name: "Yoshi", price: 450, color: "#46bc73" },
  { id: "poke-ball", name: "Pok\u00e9 Ball", price: 500, color: "#e64b3c" },
  { id: "blue-shell", name: "Blue Shell", price: 600, color: "#2a75bb" },
  { id: "triforce", name: "Triforce", price: 750, color: "#f0c020" },
  { id: "x-wing", name: "X-Wing", price: 900, color: "#b9c4d1" },
  { id: "poop-emoji", name: "Poop Emoji", price: 1200, color: "#9a6a3b" },
  { id: "starfox-laser", name: "Star Fox Laser", price: 9999, color: "#8fa3b8" },
];
