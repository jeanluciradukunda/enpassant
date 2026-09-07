// SPDX-License-Identifier: GPL-3.0-or-later
import { useMemo } from 'react';
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  type EdgeTypes,
  type NodeTypes,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import type { GraphData } from '@/types/model';
import { layoutGraph } from '@/lib/layout';
import { EvoEdge } from './EvoEdge';
import { EvoNode } from './EvoNode';

const nodeTypes: NodeTypes = {
  trunk: EvoNode,
  alt: EvoNode,
};

const edgeTypes: EdgeTypes = {
  paper: EvoEdge,
};

export interface EvoGraphProps {
  graph: GraphData;
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
        fitViewOptions={{ padding: 0.04, includeHiddenNodes: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={true}
        panOnDrag
        zoomOnScroll
        minZoom={0.1}
        maxZoom={4}
        proOptions={{ hideAttribution: true }}
        style={{ background: 'var(--bg-graph)' }}
      >
        <Background gap={0} size={0} color="transparent" />
      </ReactFlow>
    </ReactFlowProvider>
  );
}
