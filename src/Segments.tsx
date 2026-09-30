// Maps timeline segments to components. Shared contract: do not edit from a builder agent.
import React from 'react';
import {AbsoluteFill, Sequence} from 'remotion';
import {TIMELINE, C} from './theme';

export type SegName = keyof typeof TIMELINE.segments;
export const Segments: React.FC<{map: Partial<Record<SegName, React.FC>>}> = ({map}) => (
  <AbsoluteFill style={{background: C.black}}>
    {(Object.keys(TIMELINE.segments) as SegName[]).map(name => {
      const Comp = map[name];
      const s = TIMELINE.segments[name];
      return Comp ? <Sequence key={name} from={s.start} durationInFrames={s.end - s.start} name={name}><Comp /></Sequence> : null;
    })}
  </AbsoluteFill>
);
