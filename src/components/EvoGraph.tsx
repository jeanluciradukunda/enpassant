// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  type NodeTypes,
  type EdgeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphData } from '@/types/model';
import { layoutGraph } from '@/lib/layout';
import { EvoNode } from './EvoNode';
import { EvoEdge } from './EvoEdge';

/**
 * Wraps React Flow with our custom node/edge renderers and the layout
 * pipeline. Pure presentational — graph data flows in via props.
 *
 * Memoized nodeTypes/edgeTypes are declared at module scope (SPEC anti-pattern
 * §24: inline arrow functions in nodeTypes cause full graph remount).
 */
const nodeTypes: NodeTypes = {
  trunk: EvoNode,
  alt: EvoNode,
};

const edgeTypes: EdgeTypes = {
  evo: EvoEdge,
};

export interface EvoGraphProps {
  graph: GraphData;
  /** Optional fixed viewport bounds for deterministic golden screenshots. */
  fitToBounds?: boolean;
}

export function EvoGraph({ graph, fitToBounds = true }: EvoGraphProps) {
  const { nodes, edges } = useMemo(() => layoutGraph(graph), [graph]);

  return (
    <ReactFlowProvider>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView={fitToBounds}
        fitViewOptions={{ padding: 0.08, includeHiddenNodes: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag
        zoomOnScroll
        minZoom={0.4}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg-graph)' }}
      >
        <Background gap={0} size={0} color="transparent" />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
