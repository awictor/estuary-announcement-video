import React from 'react';
import {Segments} from './Segments';
import {Battle1, Battle2, Battle3, Evolve} from './scenes/Battle';
import {Boot, River, Check} from './scenes/Pixel3D';
import {Reveal, Card} from './scenes/HD';
export const Main: React.FC = () => (
  <Segments map={{boot: Boot, battle1: Battle1, battle2: Battle2, river: River, battle3: Battle3, check: Check, evolve: Evolve, reveal: Reveal, card: Card}} />
);
