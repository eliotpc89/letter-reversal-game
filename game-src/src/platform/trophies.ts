import type { TrophyId } from "../api";

export type Trophy = { id: TrophyId; name: string; price: number; color: string };
export const TROPHIES: Trophy[] = [
  { id: "star", name: "Power Star", price: 1000, color: "#ffc928" },
  { id: "one-up", name: "1-Up Mushroom", price: 1100, color: "#2f9e68" },
  { id: "fire-flower", name: "Fire Flower", price: 1200, color: "#e64b3c" },
  { id: "tanooki-suit", name: "Tanooki Suit", price: 1300, color: "#a76635" },
  { id: "green-pipe", name: "Green Pipe", price: 1400, color: "#1f9c55" },
  { id: "gold-crown", name: "Golden Crown", price: 1500, color: "#f0ad00" },
  { id: "master-sword", name: "Master Sword", price: 1600, color: "#7fb2e5" },
  { id: "hylian-shield", name: "Hylian Shield", price: 1700, color: "#e8b93c" },
  { id: "heros-cap", name: "Hero's Cap", price: 1800, color: "#2f9e68" },
  { id: "star-rod", name: "Star Rod", price: 1900, color: "#ffd94d" },
  { id: "cappy", name: "Cappy", price: 2000, color: "#e64b3c" },
  { id: "yoshi", name: "Yoshi", price: 2100, color: "#46bc73" },
  { id: "poke-ball", name: "Poké Ball", price: 2200, color: "#e64b3c" },
  { id: "blue-shell", name: "Blue Shell", price: 2300, color: "#2a75bb" },
  { id: "triforce", name: "Triforce", price: 2400, color: "#f0c020" },
  { id: "x-wing", name: "X-Wing", price: 2500, color: "#b9c4d1" },
  { id: "poop-emoji", name: "Poop Emoji", price: 2600, color: "#9a6a3b" },
  { id: "starfox-laser", name: "Star Fox Laser", price: 800, color: "#8fa3b8" },
  { id: "cosmic-compass", name: "Cosmic Compass", price: 2800, color: "#55d6ff" },
  { id: "moon-medal", name: "Moon Medal", price: 2900, color: "#c5b8ff" },
];
