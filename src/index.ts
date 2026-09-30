import React from 'react';
import {Composition, registerRoot} from 'remotion';
import {Main} from './Main';
import {TIMELINE} from './theme';
const Root = () => React.createElement(Composition, {id: 'Main', component: Main, durationInFrames: TIMELINE.total, fps: 30, width: 1080, height: 1920});
registerRoot(Root);
