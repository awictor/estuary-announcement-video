// Shared contract for all v5 builders. Do not edit from a builder agent.
import {loadFont as loadDisplay} from '@remotion/google-fonts/ArchivoBlack';
import {loadFont as loadMono} from '@remotion/google-fonts/JetBrainsMono';
import {loadFont as loadSans} from '@remotion/google-fonts/Inter';
import {loadFont as loadPixelTitle} from '@remotion/google-fonts/PressStart2P';
import {loadFont as loadPixelBody} from '@remotion/google-fonts/VT323';
import TL from './timeline.json';

export const TIMELINE = TL;
export const FPS = 30, W = 1080, H = 1920;
// Pixel sections use a logical grid of 270x480 "pixels", each 4 real pixels.
export const PX = 4, PW = W / PX, PH = H / PX;

export const DISPLAY = loadDisplay().fontFamily;
export const MONO = loadMono('normal', {weights: ['400', '700'], subsets: ['latin']}).fontFamily;
export const SANS = loadSans('normal', {weights: ['500', '700'], subsets: ['latin']}).fontFamily;
export const PIXEL_TITLE = loadPixelTitle().fontFamily;
// VT323: Pixelify Sans made C read as O and B as G at phone size (QA finding TYP-1)
export const PIXEL_BODY = loadPixelBody().fontFamily;

// Estuary-leaning palette from v4, plus a retro handheld-RPG palette for pixel sections.
export const C = {
  black: '#07090F', cream: '#EFEAE0', blue: '#4E6CF2', mint: '#5BE3B5', navy: '#0A1F3A',
  ice: '#DCE6FF', cyan: '#3FD6F0', orange: '#FF7A1A', white: '#FFFFFF', ink: '#0B0D12',
  // retro RPG
  sky: '#F8F0D8', grass: '#8CD07A', grassDark: '#58A048', platform: '#C8E0A0', platformEdge: '#78B058',
  boxFill: '#F8F8F8', boxInk: '#303848', boxFrame: '#4E6CF2', boxFrameDark: '#2A3C9C', shadow: '#A8A8B8',
  hpGreen: '#58D068', hpYellow: '#F8C030', hpRed: '#F05838', expBlue: '#48A8F8',
};

export const seg = (name: keyof typeof TL.segments) => TL.segments[name];
// Convert a global timeline frame into a Sequence-local frame for the given segment.
export const local = (globalFrame: number, segName: keyof typeof TL.segments) => globalFrame - TL.segments[segName].start;
export const text = (id: string) => TL.texts.find(t => t.id === id)!;
// Characters of a text entry visible at a GLOBAL frame (lines joined with a line break counted as 0 chars).
export const visibleChars = (id: string, globalFrame: number) => {
  const t = text(id);
  return Math.max(0, Math.floor((globalFrame - t.start) * t.cpf));
};
export const rand = (i: number, k = 0) => {
  const x = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
  return x - Math.floor(x);
};
