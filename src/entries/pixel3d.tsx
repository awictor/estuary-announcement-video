// Preview entry for the pixel3d builder: renders only its own segments at their GLOBAL frame positions.
import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Segments} from '../Segments';
import {TIMELINE} from '../theme';
import {Boot, River, Check} from '../scenes/Pixel3D';
const Only: React.FC = () => <Segments map={{boot: Boot, river: River, check: Check}} />;
registerRoot(() => <Composition id="Only" component={Only} durationInFrames={TIMELINE.total} fps={30} width={1080} height={1920} />);
