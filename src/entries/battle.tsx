// Preview entry for the battle builder: renders only its own segments at their GLOBAL frame positions.
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Segments} from '../Segments';
import {TIMELINE} from '../theme';
import {Battle1, Battle2, Battle3, Evolve} from '../scenes/Battle';
const Only: React.FC = () => <Segments map={{battle1: Battle1, battle2: Battle2, battle3: Battle3, evolve: Evolve}} />;
registerRoot(() => <Composition id="Only" component={Only} durationInFrames={TIMELINE.total} fps={30} width={1080} height={1920} />);
