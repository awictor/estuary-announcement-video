// Preview entry for the hd builder: renders only its own segments at their GLOBAL frame positions.
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Segments} from '../Segments';
import {TIMELINE} from '../theme';
import {Reveal, Card} from '../scenes/HD';
const Only: React.FC = () => <Segments map={{reveal: Reveal, card: Card}} />;
registerRoot(() => <Composition id="Only" component={Only} durationInFrames={TIMELINE.total} fps={30} width={1080} height={1920} />);
