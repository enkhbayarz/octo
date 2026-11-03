import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Mascot, type MascotMood } from '@/components/mascot';
import type { ItemStatus } from '@/progress/types';
import { makeStyles, useColors } from '@/theme/theme';
import { gutter, space } from '@/theme/tokens';

import { connectorPath, type PathNodeLayout } from './path-layout';
import { PathNode } from './path-node';

export type UnitPathNode = {
  id: string;
  kind: 'lesson' | 'quiz';
  status: ItemStatus;
  title: string;
  badge?: string;
  layout: PathNodeLayout;
};

type UnitPathProps = {
  nodes: UnitPathNode[];
  height: number;
  mirrored: boolean;
  mascotMood?: MascotMood;
  celebrateId?: string;
  onPressNode: (id: string) => void;
};

export function UnitPath({
  nodes,
  height,
  mirrored,
  mascotMood,
  celebrateId,
  onPressNode,
}: UnitPathProps) {
  const styles = useStyles();
  const colors = useColors();
  return (
    <View style={[styles.path, { height }]}>
      <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
        {nodes.slice(1).map((node, index) => {
          const previous = nodes[index]!;
          const walked = previous.status === 'done' && node.status !== 'locked';
          return (
            <Path
              // Keyed by state: react-native-svg keeps a removed strokeDasharray, so remount instead.
              key={`${node.id}-${walked}`}
              d={connectorPath(previous.layout, node.layout)}
              stroke={walked ? colors.primaryMid : colors.lockDark}
              strokeWidth={4}
              strokeLinecap="round"
              strokeDasharray={walked ? undefined : [0.5, 12]}
              fill="none"
            />
          );
        })}
      </Svg>
      {mascotMood ? (
        <View
          style={[styles.mascot, mirrored ? styles.mascotRight : styles.mascotLeft]}
          pointerEvents="none"
        >
          <Mascot mood={mascotMood} size={96} floating />
        </View>
      ) : null}
      {nodes.map((node) => (
        <PathNode
          key={node.id}
          layout={node.layout}
          kind={node.kind}
          status={node.status}
          title={node.title}
          badge={node.badge}
          celebrate={node.id === celebrateId}
          onPress={() => onPressNode(node.id)}
        />
      ))}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  path: {
    marginHorizontal: gutter,
    marginTop: space[6],
  },
  mascot: {
    position: 'absolute',
    top: 144,
  },
  mascotLeft: { left: 0 },
  mascotRight: { right: 0 },
}));
