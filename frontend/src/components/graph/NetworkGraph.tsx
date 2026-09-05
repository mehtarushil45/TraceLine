import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import cytoscape from 'cytoscape';
import type { Core, EventObject } from 'cytoscape';
import {
  AlertCircle, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ExternalLink,
  GitCommit, Hand, Layers, Link2, Maximize2, Minimize2, MousePointer, Network,
  Route, RotateCcw, ScanSearch, Search, Share2, Target, Timer,
  X, ZoomIn, ZoomOut,
} from 'lucide-react';
import type { CommunityGraphResponse, GraphEdge, GraphNode, EvidenceItem } from '../../types/api';
import { Badge, Button } from '../common';
import { isAccountId, getEvidenceSubject } from '../../utils/forensicUtils';

// ---------------------------------------------------------------------------
// Investigation Intelligence — Lens Definitions
// ---------------------------------------------------------------------------
export type InvestigationLens =
  | 'relationship'          // Focal account's observed 1-hop neighborhood
  | 'flow-of-funds'         // Direct inter-account funds movement
  | 'shared-infrastructure' // Shared hardware, tokens, or IP addresses
  | 'temporal'              // Concurrent activity calendar days
  | 'community';            // Full Louvain community partition structure

const LENS_CONFIG: {
  id: InvestigationLens;
  label: string;
  icon: React.ElementType;
  question: string;
  description: string;
}[] = [
  {
    id: 'relationship',
    label: 'Relationship',
    icon: Link2,
    question: 'Why are these accounts connected?',
    description: '1-hop observed relationship neighborhood centered on the focal account.',
  },
  {
    id: 'flow-of-funds',
    label: 'Flow of Funds',
    icon: Route,
    question: 'Where did direct fund movement occur between accounts?',
    description: 'Direct transaction flow and transfer velocity between accounts.',
  },
  {
    id: 'shared-infrastructure',
    label: 'Shared Infrastructure',
    icon: Share2,
    question: 'What hardware, tokens, or IPs are shared?',
    description: 'Hardware fingerprints, payment instruments, and IP addresses common to multiple accounts.',
  },
  {
    id: 'temporal',
    label: 'Temporal Convergence',
    icon: Timer,
    question: 'When did concurrent transaction activity occur?',
    description: 'Calendar days on which both accounts engaged in transaction activity.',
  },
  {
    id: 'community',
    label: 'Community Structure',
    icon: Network,
    question: 'What is the full Louvain partition structure?',
    description: 'Structural graph modularity partition. Community membership reflects network topology, not a fraud determination.',
  },
];

// ---------------------------------------------------------------------------
// Edge Relationship Types
// ---------------------------------------------------------------------------
type EdgeRelType =
  | 'TRANSACTION_FLOW'
  | 'SHARED_DEVICE'
  | 'SHARED_INSTRUMENT'
  | 'SHARED_IP'
  | 'SHARED_MERCHANT'
  | 'TEMPORAL_OVERLAP'
  | 'MULTI_LAYER'
  | 'WEIGHT_ONLY';

const EDGE_REL_COLORS: Record<EdgeRelType, string> = {
  TRANSACTION_FLOW:  '#10b981', // emerald
  SHARED_DEVICE:     '#fb923c', // orange
  SHARED_INSTRUMENT: '#fbbf24', // amber
  SHARED_IP:         '#60a5fa', // blue
  SHARED_MERCHANT:   '#34d399', // green
  TEMPORAL_OVERLAP:  '#38bdf8', // sky
  MULTI_LAYER:       '#c084fc', // purple
  WEIGHT_ONLY:       '#4b5563', // gray
};

const EDGE_REL_LABELS: Record<EdgeRelType, string> = {
  TRANSACTION_FLOW:  'TRANSACTION FLOW',
  SHARED_DEVICE:     'SHARED DEVICE',
  SHARED_INSTRUMENT: 'SHARED INSTRUMENT',
  SHARED_IP:         'SHARED IP ADDRESS',
  SHARED_MERCHANT:   'SHARED MERCHANT',
  TEMPORAL_OVERLAP:  'TEMPORAL OVERLAP',
  MULTI_LAYER:       'MULTI-LAYER EVIDENCE',
  WEIGHT_ONLY:       'PROJECTED WEIGHT',
};

// ---------------------------------------------------------------------------
// Evidence display config (for backward compat with evidenceFocus)
// ---------------------------------------------------------------------------
const EVIDENCE_DISPLAY_LABELS: Record<string, string> = {
  SHARED_INSTRUMENT_CONCENTRATION: 'Shared Payment Instrument',
  DEVICE_REUSE:                    'Device Reuse',
  IP_CONCENTRATION:                'IP Concentration',
  TEMPORAL_BURST:                  'Temporal Burst',
  RAPID_INTERACTION:               'Rapid Interaction',
  MERCHANT_TEMPORAL_OVERLAP:       'Merchant Temporal Overlap',
  HIGH_EVIDENCE_DENSITY:           'High Evidence Density',
  HUB_ACCOUNT:                     'Hub Account Structure',
  MULTI_LAYER_EVIDENCE:            'Multi-Layer Evidence Signal',
};

const EVIDENCE_COLORS: Record<string, string> = {
  SHARED_INSTRUMENT_CONCENTRATION: '#fbbf24',
  DEVICE_REUSE:                    '#fb7185',
  IP_CONCENTRATION:                '#60a5fa',
  TEMPORAL_BURST:                  '#facc15',
  RAPID_INTERACTION:               '#fb923c',
  MERCHANT_TEMPORAL_OVERLAP:       '#34d399',
  HIGH_EVIDENCE_DENSITY:           '#c084fc',
  HUB_ACCOUNT:                     '#22d3ee',
  MULTI_LAYER_EVIDENCE:            '#f87171',
};

// ---------------------------------------------------------------------------
// Pure helper — derive primary edge relationship type
// ---------------------------------------------------------------------------
function deriveEdgeRelType(edge: GraphEdge): EdgeRelType {
  const hasTx         = Boolean(edge.has_transaction_flow || (edge.transaction_count && edge.transaction_count > 0));
  const hasDevice     = (edge.shared_devices || []).length > 0;
  const hasInstrument = (edge.shared_instruments || []).length > 0;
  const hasIp         = (edge.shared_ips || []).length > 0;
  const hasMerchant   = (edge.shared_merchants || []).length > 0;
  const hasTemporal   = (edge.temporal_overlap || 0) > 0;

  const count = [hasTx, hasDevice, hasInstrument, hasIp, hasMerchant, hasTemporal].filter(Boolean).length;
  if (count >= 2) return 'MULTI_LAYER';
  if (hasTx)         return 'TRANSACTION_FLOW';
  if (hasDevice)     return 'SHARED_DEVICE';
  if (hasInstrument) return 'SHARED_INSTRUMENT';
  if (hasIp)         return 'SHARED_IP';
  if (hasMerchant)   return 'SHARED_MERCHANT';
  if (hasTemporal)   return 'TEMPORAL_OVERLAP';
  return 'WEIGHT_ONLY';
}

function edgeRelClass(rel: EdgeRelType): string {
  return `rel-${rel.toLowerCase().replace(/_/g, '-')}`;
}

// ---------------------------------------------------------------------------
// Pure helper — build "WHY THIS CONNECTION?" evidence lines
// ---------------------------------------------------------------------------
function buildEdgeWhyLines(edge: GraphEdge): string[] {
  const lines: string[] = [];

  // 1. Direct transaction flow
  if (edge.has_transaction_flow || (edge.transaction_count && edge.transaction_count > 0)) {
    const count = edge.transaction_count || 1;
    const amtStr = edge.total_amount != null
      ? ` totaling $${edge.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      : '';
    let dirStr = '';
    if (edge.flow_direction === 'source_to_target') {
      dirStr = ` (${edge.source} → ${edge.target})`;
    } else if (edge.flow_direction === 'target_to_source') {
      dirStr = ` (${edge.target} → ${edge.source})`;
    } else if (edge.flow_direction === 'bidirectional') {
      dirStr = ' (Bidirectional flow)';
    }
    lines.push(`Direct transaction flow: ${count} transfer${count !== 1 ? 's' : ''}${amtStr}${dirStr}`);
  }

  // 2. Hardware / Device sharing
  if (edge.shared_devices && edge.shared_devices.length > 0) {
    const extra = edge.shared_devices.length > 3 ? ` (+${edge.shared_devices.length - 3} more)` : '';
    lines.push(`Shared device hardware: ${edge.shared_devices.slice(0, 3).join(', ')}${extra}`);
  }

  // 3. Payment instrument sharing
  if (edge.shared_instruments && edge.shared_instruments.length > 0) {
    const extra = edge.shared_instruments.length > 3 ? ` (+${edge.shared_instruments.length - 3} more)` : '';
    lines.push(`Shared payment instrument: ${edge.shared_instruments.slice(0, 3).join(', ')}${extra}`);
  }

  // 4. IP address sharing
  if (edge.shared_ips && edge.shared_ips.length > 0) {
    const extra = edge.shared_ips.length > 3 ? ` (+${edge.shared_ips.length - 3} more)` : '';
    lines.push(`Shared IP address: ${edge.shared_ips.slice(0, 3).join(', ')}${extra}`);
  }

  // 5. Merchant sharing
  if (edge.shared_merchants && edge.shared_merchants.length > 0) {
    const extra = edge.shared_merchants.length > 3 ? ` (+${edge.shared_merchants.length - 3} more)` : '';
    lines.push(`Shared merchant activity: ${edge.shared_merchants.slice(0, 3).join(', ')}${extra}`);
  }

  // 6. Temporal overlap
  if (edge.temporal_overlap && edge.temporal_overlap > 0) {
    lines.push(
      `Temporal convergence: ${edge.temporal_overlap} calendar day${edge.temporal_overlap !== 1 ? 's' : ''} with concurrent transaction activity`
    );
  }

  // Fallback when telemetry does not contain specific lists
  return lines.length > 0
    ? lines
    : ['Relationship established by projected evidence weight; specific shared entity telemetry is unavailable in current records.'];
}

// ---------------------------------------------------------------------------
// Pure helper — build deterministic investigative thread for focal account
// ---------------------------------------------------------------------------
function buildInvestigativeThread(
  graphData: CommunityGraphResponse,
  focalId: string,
  allEvidence: EvidenceItem[]
): string[] {
  const obs: string[] = [];
  const focalEdges = graphData.edges.filter(
    (e) => e.source === focalId || e.target === focalId
  );
  const getPeer = (e: GraphEdge) => (e.source === focalId ? e.target : e.source);

  // Total direct relationships
  const peerSet = new Set(focalEdges.map(getPeer));
  if (peerSet.size > 0) {
    obs.push(
      `${focalId} has ${peerSet.size} directly observed relationship${peerSet.size !== 1 ? 's' : ''} within this community partition.`
    );
  }

  // Direct transaction flow
  const txEdges = focalEdges.filter((e) => Boolean(e.has_transaction_flow || (e.transaction_count && e.transaction_count > 0)));
  if (txEdges.length > 0) {
    const totalTx = txEdges.reduce((sum, e) => sum + (e.transaction_count || 1), 0);
    const totalAmt = txEdges.reduce((sum, e) => sum + (e.total_amount || 0), 0);
    obs.push(
      `Direct transaction flow observed across ${txEdges.length} relationship${txEdges.length !== 1 ? 's' : ''} ` +
      `(${totalTx} direct transfer${totalTx !== 1 ? 's' : ''} totaling $${totalAmt.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}).`
    );
  }

  // Device sharing
  const deviceEdges = focalEdges.filter((e) => (e.shared_devices || []).length > 0);
  if (deviceEdges.length > 0) {
    const peers = deviceEdges.map(getPeer);
    obs.push(
      `Observed device infrastructure shared with ${peers.length} account${peers.length !== 1 ? 's' : ''}: ` +
      `${peers.slice(0, 3).join(', ')}${peers.length > 3 ? ` (+${peers.length - 3} more)` : ''}.`
    );
  }

  // Instrument sharing
  const instrEdges = focalEdges.filter((e) => (e.shared_instruments || []).length > 0);
  if (instrEdges.length > 0) {
    obs.push(
      `Observed payment instrument infrastructure shared with ${instrEdges.length} account${instrEdges.length !== 1 ? 's' : ''} in this partition.`
    );
  }

  // IP sharing
  const ipEdges = focalEdges.filter((e) => (e.shared_ips || []).length > 0);
  if (ipEdges.length > 0) {
    obs.push(
      `Observed IP address sharing across ${ipEdges.length} relationship${ipEdges.length !== 1 ? 's' : ''} in this partition.`
    );
  }

  // Temporal overlap
  const temporalEdges = focalEdges.filter((e) => (e.temporal_overlap || 0) > 0);
  if (temporalEdges.length > 0) {
    const totalDays = temporalEdges.reduce((s, e) => s + (e.temporal_overlap || 0), 0);
    obs.push(
      `Same-day transaction activity overlap observed across ${temporalEdges.length} relationship${temporalEdges.length !== 1 ? 's' : ''} ` +
      `(total: ${totalDays} concurrent day${totalDays !== 1 ? 's' : ''}).`
    );
  }

  // Multi-layer links
  const multiEdges = focalEdges.filter((e) => {
    const n = ((e.shared_devices || []).length > 0 ? 1 : 0)
      + ((e.shared_instruments || []).length > 0 ? 1 : 0)
      + ((e.shared_ips || []).length > 0 ? 1 : 0)
      + ((e.temporal_overlap || 0) > 0 ? 1 : 0)
      + (Boolean(e.has_transaction_flow || (e.transaction_count && e.transaction_count > 0)) ? 1 : 0);
    return n >= 2;
  });
  if (multiEdges.length > 0) {
    obs.push(
      `${multiEdges.length} multi-layer evidence relationship${multiEdges.length !== 1 ? 's' : ''} ` +
      `— corroborated by two or more distinct observable signals.`
    );
  }

  // Strongest link
  const sorted = [...focalEdges].sort((a, b) => b.weight - a.weight);
  if (sorted.length > 0) {
    obs.push(
      `Strongest observed relationship: ${getPeer(sorted[0])} (evidence weight: ${sorted[0].weight.toFixed(2)}).`
    );
  }

  // Deterministic rule triggers from community evidence engine
  const nodeEvidence = allEvidence.filter(
    (e) => (e.supporting_entities || []).includes(focalId)
  );
  for (const ev of nodeEvidence.slice(0, 2)) {
    obs.push(ev.description);
  }

  return obs;
}

// ---------------------------------------------------------------------------
// Pure helper — BFS path between two accounts over graph edges
// ---------------------------------------------------------------------------
function findGraphPath(
  graphData: CommunityGraphResponse,
  fromId: string,
  toId: string
): string[] | null {
  const nodeIds = new Set(graphData.nodes.map((n) => n.id));
  if (!nodeIds.has(fromId) || !nodeIds.has(toId)) return null;
  if (fromId === toId) return [fromId];

  const adj = new Map<string, string[]>();
  for (const n of graphData.nodes) adj.set(n.id, []);
  for (const e of graphData.edges) {
    adj.get(e.source)?.push(e.target);
    adj.get(e.target)?.push(e.source);
  }

  const visited = new Set<string>([fromId]);
  const queue: string[][] = [[fromId]];
  while (queue.length > 0) {
    const path = queue.shift()!;
    const last = path[path.length - 1];
    for (const nbr of adj.get(last) || []) {
      if (!visited.has(nbr)) {
        const next = [...path, nbr];
        if (nbr === toId) return next;
        visited.add(nbr);
        queue.push(next);
      }
    }
  }
  return null;
}

function getEdgeBetween(
  graphData: CommunityGraphResponse,
  a: string,
  b: string
): GraphEdge | null {
  return (
    graphData.edges.find(
      (e) => (e.source === a && e.target === b) || (e.source === b && e.target === a)
    ) || null
  );
}

// ---------------------------------------------------------------------------
// Cytoscape lens application (pure function called inside effects)
// ---------------------------------------------------------------------------
function applyLens(
  cy: Core,
  lens: InvestigationLens,
  focalId: string | null
): { statusMessage?: string } {
  cy.elements().removeClass('lens-focus lens-dim');

  if (lens === 'community') {
    return {};
  }

  if (lens === 'relationship') {
    let focal: any = focalId ? cy.nodes().filter((n: any) => n.id() === focalId) : cy.collection();
    if (focal.length === 0) {
      // If no focal is specified, highlight the highest degree hub as contextual start
      focal = cy.nodes().sort((a: any, b: any) => (b.data('degree') || 0) - (a.data('degree') || 0)).slice(0, 1);
    }
    if (!focal || focal.length === 0) return {};
    const neighborhood = focal.neighborhood().add(focal);
    cy.elements().difference(neighborhood).addClass('lens-dim');
    neighborhood.addClass('lens-focus');
    return {};
  }

  if (lens === 'flow-of-funds') {
    let flowEdges = cy.edges().filter((e: any) => {
      const hasTx = Boolean(e.data('has_transaction_flow'));
      const count = (e.data('transaction_count') as number) || 0;
      return hasTx || count > 0;
    });

    // If focal account is specified, isolate direct fund movement involving this account
    if (focalId) {
      const focalFlowEdges = flowEdges.filter(
        (e: any) => e.data('source') === focalId || e.data('target') === focalId
      );
      if (focalFlowEdges.length > 0) {
        flowEdges = focalFlowEdges;
      }
    }

    if (flowEdges.length === 0) {
      if (focalId) {
        const focalNode = cy.nodes().filter((n: any) => n.id() === focalId);
        if (focalNode.length > 0) {
          cy.elements().difference(focalNode).addClass('lens-dim');
          focalNode.addClass('lens-focus');
          return { statusMessage: `Account ${focalId} has no direct fund transfers recorded in current telemetry window.` };
        }
      }
      cy.elements().addClass('lens-dim');
      return { statusMessage: 'No direct inter-account fund transfers recorded between these nodes in available telemetry.' };
    }

    const flowNodes = flowEdges.connectedNodes();
    let flowSet = flowNodes.add(flowEdges);
    if (focalId) {
      const focalNode = cy.nodes().filter((n: any) => n.id() === focalId);
      if (focalNode.length > 0) {
        flowSet = flowSet.add(focalNode);
      }
    }
    cy.elements().difference(flowSet).addClass('lens-dim');
    flowSet.addClass('lens-focus');
    return {};
  }

  if (lens === 'shared-infrastructure') {
    const infraEdges = cy.edges().filter((e: any) => {
      const sd  = (e.data('shared_devices') as string[]) || [];
      const si  = (e.data('shared_instruments') as string[]) || [];
      const sip = (e.data('shared_ips') as string[]) || [];
      return sd.length > 0 || si.length > 0 || sip.length > 0;
    });
    if (infraEdges.length === 0) {
      cy.elements().addClass('lens-dim');
      return { statusMessage: 'No shared hardware, token, or IP telemetry recorded among current nodes.' };
    }
    const infraNodes = infraEdges.connectedNodes();
    const infraSet   = infraNodes.add(infraEdges);
    cy.elements().difference(infraSet).addClass('lens-dim');
    infraSet.addClass('lens-focus');
    return {};
  }

  if (lens === 'temporal') {
    const temporalEdges = cy.edges().filter(
      (e: any) => ((e.data('temporal_overlap') as number) || 0) > 0
    );
    if (temporalEdges.length === 0) {
      cy.elements().addClass('lens-dim');
      return { statusMessage: 'No same-day transaction activity overlap observed among current nodes.' };
    }
    const temporalNodes = temporalEdges.connectedNodes();
    const temporalSet   = temporalNodes.add(temporalEdges);
    cy.elements().difference(temporalSet).addClass('lens-dim');
    temporalSet.addClass('lens-focus');
    return {};
  }

  return {};
}

// ---------------------------------------------------------------------------
// NetworkGraph Props
// ---------------------------------------------------------------------------
interface NetworkGraphProps {
  graphData: CommunityGraphResponse;
  height?: string | number;
  evidenceFocus?: EvidenceItem | null;
  allEvidenceItems?: EvidenceItem[];
  communityId?: number | string;
  /** Node ID to center graph on and set as investigation focal */
  initialSelectedNodeId?: string | null;
  onClearFocus?: () => void;
  /** Pre-selected investigation lens (from URL ?lens= param) */
  initialLens?: InvestigationLens;
  /** Notification callbacks to keep URL params synchronized */
  onFocalChange?: (nodeId: string | null) => void;
  onLensChange?: (lens: InvestigationLens) => void;
}

// ---------------------------------------------------------------------------
// NetworkGraph Component — Evidence-Bearing Relationship Investigation Surface
// ---------------------------------------------------------------------------
export const NetworkGraph: React.FC<NetworkGraphProps> = ({
  graphData,
  height = 'calc(100vh - 215px)',
  evidenceFocus = null,
  allEvidenceItems = [],
  communityId,
  initialSelectedNodeId = null,
  onClearFocus,
  initialLens = 'community',
  onFocalChange,
  onLensChange,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef        = useRef<Core | null>(null);
  const navigate     = useNavigate();

  // ── Internal state ────────────────────────────────────────────────────────
  const safeInitialFocal = isAccountId(initialSelectedNodeId) ? initialSelectedNodeId : null;
  const [focalNodeId, setFocalNodeId]       = useState<string | null>(safeInitialFocal);
  const [activeLens, setActiveLens]         = useState<InvestigationLens>(initialLens);
  const [lensStatusMessage, setLensStatusMessage] = useState<string | null>(null);
  const [selectedNode, setSelectedNode]     = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge]     = useState<GraphEdge | null>(null);
  const [layoutName, setLayoutName]         = useState<'cose' | 'concentric' | 'circle'>('cose');
  const [graphSearchQuery, setGraphSearchQuery] = useState('');
  const [isFullscreen, setIsFullscreen]     = useState(false);
  const [showThreadPanel, setShowThreadPanel] = useState(Boolean(safeInitialFocal || evidenceFocus));
  const [showPathPanel, setShowPathPanel]   = useState(false);
  const [pathFrom, setPathFrom]             = useState(safeInitialFocal || '');
  const [pathTo, setPathTo]                 = useState('');
  const [pathResult, setPathResult]         = useState<string[] | null | 'not-found'>(null);

  // ── Pan & Zoom Interaction State ──────────────────────────────────────────
  const [interactionMode, setInteractionMode] = useState<'select' | 'pan'>('select');
  const interactionModeRef = useRef<'select' | 'pan'>('select');
  interactionModeRef.current = interactionMode;

  const [zoomLevel, setZoomLevel]             = useState<number>(100);
  const [isSpaceHeld, setIsSpaceHeld]         = useState(false);
  const isSpacePressedRef                     = useRef(false);
  const isCanvasDraggingRef                   = useRef(false);
  const pointerStartRef                       = useRef<{ x: number; y: number; time: number } | null>(null);
  const lastPanPosRef                         = useRef<{ x: number; y: number } | null>(null);

  // Sync state if initial props change via URL navigation
  useEffect(() => {
    if (initialSelectedNodeId !== undefined) {
      const valid = isAccountId(initialSelectedNodeId) ? initialSelectedNodeId : null;
      setFocalNodeId(valid);
      if (valid) {
        setPathFrom(valid);
        setShowThreadPanel(true);
      }
    }
  }, [initialSelectedNodeId]);

  useEffect(() => {
    if (initialLens) {
      setActiveLens(initialLens);
    }
  }, [initialLens]);

  // ── Derived: available node IDs for focus checks ──────────────────────────
  const availableNodeIds = useMemo(
    () => new Set(graphData.nodes.map((n) => n.id)),
    [graphData.nodes]
  );

  // ── Pre-compute initial neighbor and shared-infra sets ───────────────────
  const { neighborIds: initNeighborIds, sharedInfraIds: initInfraIds } = useMemo(() => {
    if (!initialSelectedNodeId) return { neighborIds: new Set<string>(), sharedInfraIds: new Set<string>() };
    const neighborIds   = new Set<string>();
    const sharedInfraIds = new Set<string>();
    for (const e of graphData.edges) {
      const isFocal = e.source === initialSelectedNodeId || e.target === initialSelectedNodeId;
      if (!isFocal) continue;
      const peer = e.source === initialSelectedNodeId ? e.target : e.source;
      neighborIds.add(peer);
      if (
        (e.shared_devices || []).length > 0 ||
        (e.shared_instruments || []).length > 0 ||
        (e.shared_ips || []).length > 0
      ) {
        sharedInfraIds.add(peer);
      }
    }
    return { neighborIds, sharedInfraIds };
  }, [initialSelectedNodeId, graphData.edges]);

  // ── Initialize Cytoscape ──────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const elements: cytoscape.ElementDefinition[] = [];

    graphData.nodes.forEach((node) => {
      const size  = Math.min(52, Math.max(22, 20 + node.degree * 2.6));
      const isHub = node.degree >= 4;

      let roleClass = 'role-peripheral';
      if (node.id === initialSelectedNodeId)       roleClass = 'role-focal';
      else if (initInfraIds.has(node.id))          roleClass = 'role-shared-infra';
      else if (initNeighborIds.has(node.id))       roleClass = 'role-counterparty';

      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.id,
          customer_name: node.customer_name || node.id,
          balance: node.balance,
          degree: node.degree,
          size,
        },
        classes: `${roleClass}${isHub ? ' hub-node' : ''}`,
      });
    });

    graphData.edges.forEach((edge, idx) => {
      const relType = deriveEdgeRelType(edge);
      elements.push({
        group: 'edges',
        data: {
          id: `e_${edge.source}_${edge.target}_${idx}`,
          source: edge.source,
          target: edge.target,
          weight: edge.weight,
          shared_instruments: edge.shared_instruments || [],
          shared_devices: edge.shared_devices || [],
          shared_ips: edge.shared_ips || [],
          shared_merchants: edge.shared_merchants || [],
          temporal_overlap: edge.temporal_overlap || 0,
          has_transaction_flow: edge.has_transaction_flow,
          transaction_count: edge.transaction_count,
          total_amount: edge.total_amount,
          flow_direction: edge.flow_direction,
        },
        classes: edgeRelClass(relType),
      });
    });

    const coseOpts = {
      name: 'cose', animate: false, padding: 60,
      nodeRepulsion: () => 8000, idealEdgeLength: () => 65,
      edgeElasticity: () => 100, gravity: 0.3,
      numIter: 1000, initialTemp: 200, coolingFactor: 0.95, fit: false,
      randomize: false,
    };

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // ── Base node ──
        {
          selector: 'node',
          style: {
            'background-color': '#1e293b',
            'border-width': 2,
            'border-color': '#374151',
            label: 'data(label)',
            color: '#64748b',
            'font-size': '10px',
            'font-family': 'JetBrains Mono, monospace',
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'text-background-color': '#0d1117',
            'text-background-opacity': 0.75,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            width: 'data(size)',
            height: 'data(size)',
            'transition-property': 'background-color, border-color, opacity, border-width',
            'transition-duration': 180,
          },
        },
        // ── Focal ──
        {
          selector: 'node.role-focal',
          style: {
            'background-color': '#1d4ed8',
            'border-color': '#60a5fa',
            'border-width': 4,
            color: '#ffffff',
            'font-size': '12px',
            'font-weight': 'bold',
            'text-background-color': '#0f172a',
            'text-background-opacity': 0.9,
            'text-background-padding': '3px',
            'text-background-shape': 'roundrectangle',
            'z-index': 150,
          },
        },
        // ── Counterparty ──
        {
          selector: 'node.role-counterparty',
          style: {
            'background-color': '#065f46',
            'border-color': '#34d399',
            'border-width': 3,
            color: '#a7f3d0',
            'font-size': '11px',
            'font-weight': 'bold',
            'text-background-color': '#0f172a',
            'text-background-opacity': 0.85,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'z-index': 120,
          },
        },
        // ── Shared Infrastructure ──
        {
          selector: 'node.role-shared-infra',
          style: {
            'background-color': '#2d1a0f',
            'border-color': '#fb923c',
            'border-width': 2.5,
            color: '#fdba74',
          },
        },
        // ── Hub node ──
        { selector: 'node.hub-node', style: { 'border-width': 3 } },
        // ── Selected ──
        {
          selector: 'node:selected',
          style: {
            'border-color': '#ffffff',
            'border-width': 3.5,
            color: '#ffffff',
            'font-size': '11px',
            'z-index': 110,
          },
        },
        // ── Evidence focus ──
        {
          selector: 'node.ev-focus',
          style: {
            'border-width': 4,
            'border-color': '#ffffff',
            color: '#ffffff',
            'font-size': '11px',
            'font-weight': 'bold',
            opacity: 1,
            'z-index': 100,
          },
        },
        // ── Lens dim ──
        { selector: 'node.lens-dim', style: { opacity: 0.09 } },
        // ── Evidence dim ──
        { selector: 'node.ev-dim',   style: { opacity: 0.07 } },
        // ── Path node ──
        {
          selector: 'node.path-node',
          style: {
            'border-color': '#22c55e',
            'border-width': 4,
            color: '#86efac',
            'z-index': 200,
          },
        },

        // ── Base edge ──
        {
          selector: 'edge',
          style: {
            width: 'mapData(weight, 1, 15, 1.4, 5.5)',
            'line-color': '#374151',
            'curve-style': 'bezier',
            opacity: 0.55,
            'transition-property': 'line-color, opacity, width',
            'transition-duration': 180,
          },
        },
        // ── Edge relationship type colors ──
        {
          selector: 'edge.rel-transaction-flow',
          style: {
            'line-color': '#10b981',
            opacity: 0.95,
            width: 3.2,
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#10b981',
            'arrow-scale': 1.25,
            'curve-style': 'bezier',
            'z-index': 100,
          },
        },
        { selector: 'edge.rel-shared-device',         style: { 'line-color': '#fb923c', opacity: 0.8 } },
        { selector: 'edge.rel-shared-instrument',     style: { 'line-color': '#fbbf24', opacity: 0.8 } },
        { selector: 'edge.rel-shared-ip',             style: { 'line-color': '#60a5fa', opacity: 0.8 } },
        { selector: 'edge.rel-shared-merchant',       style: { 'line-color': '#34d399', opacity: 0.8 } },
        { selector: 'edge.rel-temporal-overlap',      style: { 'line-color': '#38bdf8', opacity: 0.8 } },
        { selector: 'edge.rel-multi-layer',           style: { 'line-color': '#c084fc', opacity: 0.85 } },
        { selector: 'edge.rel-weight-only',           style: { 'line-color': '#4b5563', opacity: 0.45 } },
        // ── Lens dim edge ──
        { selector: 'edge.lens-dim',  style: { opacity: 0.04 } },
        // ── Lens focus edge ──
        {
          selector: 'edge.lens-focus',
          style: {
            opacity: 1,
            width: 3.2,
            'line-color': '#10b981',
            'target-arrow-shape': 'triangle',
            'target-arrow-color': '#10b981',
            'arrow-scale': 1.25,
            'curve-style': 'bezier',
            'z-index': 100,
          },
        },
        // ── Evidence ──
        { selector: 'edge.ev-dim',   style: { opacity: 0.03 } },
        { selector: 'edge.ev-focus', style: { opacity: 1, width: 3.5, 'z-index': 90 } },
        // ── Selected edge ──
        { selector: 'edge:selected', style: { opacity: 1, width: 4, 'z-index': 95 } },
        // ── Path edge ──
        { selector: 'edge.path-edge', style: { 'line-color': '#22c55e', width: 5, opacity: 1, 'z-index': 200 } },
      ],
      layout: layoutName === 'cose'
        ? (coseOpts as any)
        : { name: layoutName, animate: false, padding: 50 },
      minZoom: 0.15, maxZoom: 4.0, wheelSensitivity: 0.15,
    });

    // ── Tap events with drag & pan suppression ──
    cy.on('tap', 'node', (evt: EventObject) => {
      if (interactionModeRef.current === 'pan' || isSpacePressedRef.current || isCanvasDraggingRef.current) {
        return;
      }
      const id = evt.target.id();
      const match = graphData.nodes.find((n) => n.id === id);
      if (match) { setSelectedNode(match); setSelectedEdge(null); }
    });

    cy.on('tap', 'edge', (evt: EventObject) => {
      if (interactionModeRef.current === 'pan' || isSpacePressedRef.current || isCanvasDraggingRef.current) {
        return;
      }
      const d = evt.target.data();
      setSelectedEdge({
        source: d.source,
        target: d.target,
        weight: d.weight,
        shared_instruments: d.shared_instruments || [],
        shared_devices: d.shared_devices || [],
        shared_ips: d.shared_ips || [],
        shared_merchants: d.shared_merchants || [],
        temporal_overlap: d.temporal_overlap || 0,
        has_transaction_flow: d.has_transaction_flow,
        transaction_count: d.transaction_count,
        total_amount: d.total_amount,
        flow_direction: d.flow_direction,
      });
      setSelectedNode(null);
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy && !isCanvasDraggingRef.current) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });

    cy.on('zoom', () => {
      setZoomLevel(Math.round(cy.zoom() * 100));
    });

    cyRef.current = cy;

    // Resize observer to keep Cytoscape canvas dimensions in sync with container bounds
    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        try {
          if (cyRef.current) {
            cyRef.current.resize();
          }
        } catch { /* ignore */ }
      });
      resizeObserver.observe(containerRef.current);
    }

    // Mount & Layout completion handler: focus lens and center camera
    let hasAppliedInitial = false;
    const applyInitialFocus = () => {
      if (hasAppliedInitial) return;
      hasAppliedInitial = true;
      try {
        cy.resize();
        const res = applyLens(cy, initialLens, initialSelectedNodeId);
        setLensStatusMessage(res.statusMessage || null);
        if (initialSelectedNodeId) {
          const focal = cy.nodes().filter((n: any) => n.id() === initialSelectedNodeId);
          if (focal.length > 0) {
            focal.select();
            let targetSet = focal.neighborhood().add(focal);
            if (initialLens === 'flow-of-funds') {
              const flowEdges = cy.edges('.lens-focus');
              if (flowEdges.length > 0) {
                targetSet = flowEdges.connectedNodes().add(flowEdges).add(focal);
              }
            }
            cy.fit(targetSet, 80);
            const z = cy.zoom();
            if (z < 0.95) {
              cy.zoom(1.15);
              cy.center(focal);
            } else if (z > 1.6) {
              cy.zoom(1.4);
              cy.center(focal);
            }
            setZoomLevel(Math.round(cy.zoom() * 100));
          } else {
            cy.fit(undefined, 50);
            setZoomLevel(Math.round(cy.zoom() * 100));
          }
        } else {
          cy.fit(undefined, 50);
          setZoomLevel(Math.round(cy.zoom() * 100));
        }
      } catch { /* ignore */ }
    };

    cy.one('layoutstop', applyInitialFocus);
    const initTimer = setTimeout(applyInitialFocus, 100);

    return () => {
      clearTimeout(initTimer);
      resizeObserver?.disconnect();
      cy.destroy();
    };
  // Re-init only when graphData or layout actually change — lens is applied separately
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graphData, layoutName]);

  // ── Lens & Focal Camera effect ───────────────────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const res = applyLens(cy, activeLens, focalNodeId);
    setLensStatusMessage(res.statusMessage || null);

    // When focalNodeId is present, ensure camera centers and zooms into the focused structure
    if (focalNodeId) {
      const focal = cy.nodes().filter((n: any) => n.id() === focalNodeId);
      if (focal.length > 0) {
        focal.select();
        let targetSet = focal.neighborhood().add(focal);
        if (activeLens === 'flow-of-funds') {
          const flowEdges = cy.edges('.lens-focus');
          if (flowEdges.length > 0) {
            targetSet = flowEdges.connectedNodes().add(flowEdges).add(focal);
          }
        }
        cy.fit(targetSet, 80);
        const z = cy.zoom();
        if (z < 0.95) {
          cy.zoom(1.15);
          cy.center(focal);
        } else if (z > 1.6) {
          cy.zoom(1.4);
          cy.center(focal);
        }
        setZoomLevel(Math.round(cy.zoom() * 100));
      }
    }
  }, [activeLens, focalNodeId, graphData]);

  // ── Node role update when focalNodeId changes ─────────────────────────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    if (!focalNodeId) {
      // Clear all role classes → reset to peripheral
      cy.nodes().forEach((n: any) => {
        n.removeClass('role-focal role-counterparty role-shared-infra');
        n.addClass('role-peripheral');
      });
      return;
    }

    const focalEdges = graphData.edges.filter(
      (e) => e.source === focalNodeId || e.target === focalNodeId
    );
    const neighborSet = new Set(
      focalEdges.map((e) => (e.source === focalNodeId ? e.target : e.source))
    );
    const infraSet = new Set(
      focalEdges
        .filter((e) => (e.shared_devices || []).length > 0 || (e.shared_instruments || []).length > 0 || (e.shared_ips || []).length > 0)
        .map((e) => (e.source === focalNodeId ? e.target : e.source))
    );

    cy.nodes().forEach((n: any) => {
      const id = n.id();
      n.removeClass('role-focal role-counterparty role-shared-infra role-peripheral');
      if (id === focalNodeId)        n.addClass('role-focal');
      else if (infraSet.has(id))     n.addClass('role-shared-infra');
      else if (neighborSet.has(id))  n.addClass('role-counterparty');
      else                           n.addClass('role-peripheral');
    });
  }, [focalNodeId, graphData.edges]);

  // ── Evidence focus effect (preserved from prior implementation) ───────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('ev-focus ev-dim');
    if (!evidenceFocus) return;

    const focusColor = EVIDENCE_COLORS[evidenceFocus.type] || '#3b82f6';
    const rawSupport = (evidenceFocus.supporting_entities || []).filter((id) => availableNodeIds.has(id));
    const isAllNodes = rawSupport.length === 0;
    const focusedIds = isAllNodes
      ? new Set<string>(graphData.nodes.map((n) => n.id))
      : new Set<string>(rawSupport);

    cy.nodes().forEach((n: any) => {
      if (focusedIds.has(n.id())) {
        n.addClass('ev-focus'); n.removeClass('ev-dim');
        n.style({ 'background-color': focusColor, 'border-color': '#ffffff' });
      } else {
        n.addClass('ev-dim'); n.removeClass('ev-focus');
      }
    });
    cy.edges().forEach((e: any) => {
      const s = e.data('source'), t = e.data('target');
      if (focusedIds.has(s) && focusedIds.has(t)) {
        e.addClass('ev-focus'); e.style({ 'line-color': focusColor });
      } else {
        e.addClass('ev-dim');
      }
    });

    if (!isAllNodes && focusedIds.size > 0) {
      try {
        const focusNodes = cy.nodes().filter((n: any) => focusedIds.has(n.id()));
        if (focusNodes.length > 0) cy.fit(focusNodes, 80);
      } catch { /* ignore */ }
    } else {
      try { cy.fit(undefined, 50); } catch { /* ignore */ }
    }
  }, [evidenceFocus, graphData, availableNodeIds]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleLensSelect = (lens: InvestigationLens) => {
    setActiveLens(lens);
    onLensChange?.(lens);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = graphSearchQuery.trim().toLowerCase();
    if (!q || !cyRef.current) return;
    const cy = cyRef.current;
    const target = cy.nodes().filter((n: any) =>
      n.id().toLowerCase().includes(q) ||
      ((n.data('customer_name') as string) || '').toLowerCase().includes(q)
    ).first();
    if (target.length > 0) {
      cy.nodes().unselect(); target.select();
      cy.center(target); cy.zoom(1.8);
      const match = graphData.nodes.find((n) => n.id === target.id());
      if (match) { setSelectedNode(match); setSelectedEdge(null); }
    }
  };

  const handleFocusNeighborhood = (nodeId: string) => {
    const cy = cyRef.current;
    if (!cy) return;
    const center = cy.nodes().filter((n: any) => n.id() === nodeId);
    if (center.length === 0) return;
    const neighborhood = center.neighborhood().add(center);
    cy.elements().removeClass('ev-focus ev-dim lens-focus lens-dim');
    cy.elements().difference(neighborhood).addClass('lens-dim');
    neighborhood.addClass('lens-focus');
    cy.fit(neighborhood, 70);
  };

  const handleSetFocal = useCallback((nodeId: string) => {
    // Strict invariant: only genuine account/entity IDs can be focal. Never transaction IDs.
    if (!isAccountId(nodeId)) return;
    setFocalNodeId(nodeId);
    setShowThreadPanel(true);
    setPathFrom(nodeId);
    onFocalChange?.(nodeId);
    const cy = cyRef.current;
    if (!cy) return;
    const focal = cy.nodes().filter((n: any) => n.id() === nodeId);
    if (focal.length > 0) {
      focal.select();
      let targetSet = focal.neighborhood().add(focal);
      if (activeLens === 'flow-of-funds') {
        const flowEdges = cy.edges('.lens-focus');
        if (flowEdges.length > 0) {
          targetSet = flowEdges.connectedNodes().add(flowEdges).add(focal);
        }
      }
      cy.fit(targetSet, 80);
      const z = cy.zoom();
      if (z < 0.95) {
        cy.zoom(1.15);
        cy.center(focal);
      } else if (z > 1.6) {
        cy.zoom(1.4);
        cy.center(focal);
      }
      setZoomLevel(Math.round(cy.zoom() * 100));
    }
  }, [onFocalChange, activeLens]);

  const handleTracePath = () => {
    if (!pathFrom.trim() || !pathTo.trim()) return;
    const result = findGraphPath(graphData, pathFrom.trim(), pathTo.trim());
    setPathResult(result || 'not-found');
    if (result && cyRef.current) {
      const cy = cyRef.current;
      cy.elements().removeClass('path-node path-edge');
      for (const id of result) {
        cy.nodes().filter((n: any) => n.id() === id).addClass('path-node');
      }
      for (let i = 0; i < result.length - 1; i++) {
        const a = result[i], b = result[i + 1];
        cy.edges().filter((e: any) =>
          (e.data('source') === a && e.data('target') === b) ||
          (e.data('source') === b && e.data('target') === a)
        ).addClass('path-edge');
      }
      const pathNodes = cy.nodes().filter((n: any) => result.includes(n.id()));
      if (pathNodes.length > 0) try { cy.fit(pathNodes, 80); } catch { /* ignore */ }
    }
  };

  const handleReset = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass('ev-focus ev-dim lens-focus lens-dim path-node path-edge');
    cy.elements().removeStyle();
    cy.nodes().unselect(); cy.edges().unselect();
    setSelectedNode(null); setSelectedEdge(null);
    setGraphSearchQuery(''); setPathResult(null); setLensStatusMessage(null);
    onClearFocus?.();

    // Re-apply lens and node roles after style flush
    setTimeout(() => {
      if (!cyRef.current) return;
      applyLens(cyRef.current, activeLens, focalNodeId);
      if (focalNodeId) {
        const focalEdges = graphData.edges.filter(
          (e) => e.source === focalNodeId || e.target === focalNodeId
        );
        const neighborSet = new Set(focalEdges.map((e) => (e.source === focalNodeId ? e.target : e.source)));
        const infraSet = new Set(
          focalEdges.filter((e) => (e.shared_devices || []).length > 0 || (e.shared_instruments || []).length > 0 || (e.shared_ips || []).length > 0)
            .map((e) => (e.source === focalNodeId ? e.target : e.source))
        );
        cyRef.current.nodes().forEach((n: any) => {
          const id = n.id();
          n.removeClass('role-focal role-counterparty role-shared-infra role-peripheral');
          if (id === focalNodeId)        n.addClass('role-focal');
          else if (infraSet.has(id))     n.addClass('role-shared-infra');
          else if (neighborSet.has(id))  n.addClass('role-counterparty');
          else                           n.addClass('role-peripheral');
        });
      }
      try { cyRef.current.fit(undefined, 50); } catch { /* ignore */ }
    }, 0);
  }, [activeLens, focalNodeId, graphData.edges, onClearFocus]);

  // ── Zoom & Pan Helpers (anchored to viewport center) ──────────────────────
  const zoomAroundCenter = useCallback((factor: number) => {
    const cy = cyRef.current;
    if (!cy) return;
    const currentZoom = cy.zoom();
    const targetZoom = Math.min(4.0, Math.max(0.15, currentZoom * factor));
    cy.zoom({
      level: targetZoom,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
    setZoomLevel(Math.round(targetZoom * 100));
  }, []);

  const handleZoomIn  = useCallback(() => zoomAroundCenter(1.25), [zoomAroundCenter]);
  const handleZoomOut = useCallback(() => zoomAroundCenter(0.8), [zoomAroundCenter]);
  const handleZoomReset = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.zoom({
      level: 1.0,
      renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 },
    });
    setZoomLevel(100);
  }, []);

  const handleFit = useCallback(() => {
    const cy = cyRef.current;
    if (!cy) return;
    try {
      cy.fit(undefined, 50);
      setZoomLevel(Math.round(cy.zoom() * 100));
    } catch { /* ignore */ }
  }, []);

  const handleCenterFocal = useCallback(() => {
    const cy = cyRef.current;
    if (!cy || !focalNodeId) return;
    const node = cy.getElementById(focalNodeId);
    if (node && node.length > 0) {
      cy.center(node);
      cy.zoom(Math.min(cy.zoom(), 1.8));
      setZoomLevel(Math.round(cy.zoom() * 100));
    }
  }, [focalNodeId]);

  // ── Sync interaction mode with Cytoscape autoungrabify & cursor ───────────
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    const isPan = interactionMode === 'pan' || isSpaceHeld;
    cy.autoungrabify(isPan);
    if (containerRef.current) {
      containerRef.current.style.cursor = isPan ? 'grab' : 'default';
    }
  }, [interactionMode, isSpaceHeld]);

  // ── Global keyboard shortcuts: Space (hold to pan), H/V, +/-, 0, Arrows ───
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

      if (e.code === 'Space' && !e.repeat) {
        e.preventDefault();
        isSpacePressedRef.current = true;
        setIsSpaceHeld(true);
      } else if (e.key === 'h' || e.key === 'H') {
        setInteractionMode('pan');
      } else if (e.key === 'v' || e.key === 'V') {
        setInteractionMode('select');
      } else if (e.key === '=' || e.key === '+') {
        e.preventDefault();
        handleZoomIn();
      } else if (e.key === '-') {
        e.preventDefault();
        handleZoomOut();
      } else if (e.key === '0') {
        e.preventDefault();
        handleFit();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        cyRef.current?.panBy({ x: 0, y: 70 });
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        cyRef.current?.panBy({ x: 0, y: -70 });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        cyRef.current?.panBy({ x: 70, y: 0 });
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        cyRef.current?.panBy({ x: -70, y: 0 });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        isSpacePressedRef.current = false;
        setIsSpaceHeld(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [handleZoomIn, handleZoomOut, handleFit]);

  // ── Canvas Drag-to-Pan (Works anywhere: background, nodes, edges) ───────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onMouseDown = (e: MouseEvent) => {
      const isPanTrigger =
        interactionModeRef.current === 'pan' ||
        isSpacePressedRef.current ||
        e.button === 1 || // Middle mouse button
        e.buttons === 4;

      pointerStartRef.current = { x: e.clientX, y: e.clientY, time: Date.now() };
      lastPanPosRef.current = { x: e.clientX, y: e.clientY };
      isCanvasDraggingRef.current = false;

      if (isPanTrigger) {
        container.style.cursor = 'grabbing';
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (!lastPanPosRef.current || !pointerStartRef.current) return;

      const totalDist = Math.hypot(
        e.clientX - pointerStartRef.current.x,
        e.clientY - pointerStartRef.current.y
      );

      if (totalDist > 4) {
        isCanvasDraggingRef.current = true;
      }

      const isPanTrigger =
        interactionModeRef.current === 'pan' ||
        isSpacePressedRef.current ||
        e.buttons === 4 ||
        (interactionModeRef.current === 'select' && (e.buttons === 1 && isSpacePressedRef.current));

      if (isPanTrigger && cyRef.current) {
        const dx = e.clientX - lastPanPosRef.current.x;
        const dy = e.clientY - lastPanPosRef.current.y;
        cyRef.current.panBy({ x: dx, y: dy });
        lastPanPosRef.current = { x: e.clientX, y: e.clientY };
        container.style.cursor = 'grabbing';
      }
    };

    const onMouseUp = () => {
      lastPanPosRef.current = null;
      const isPan = interactionModeRef.current === 'pan' || isSpacePressedRef.current;
      container.style.cursor = isPan ? 'grab' : 'default';

      // Keep dragging buffer so pending node/edge tap is suppressed
      setTimeout(() => {
        isCanvasDraggingRef.current = false;
        pointerStartRef.current = null;
      }, 70);
    };

    container.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mouseup', onMouseUp, true);

    return () => {
      container.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mouseup', onMouseUp, true);
    };
  }, []);

  // ── Derived display values ────────────────────────────────────────────────
  const hasFocus       = Boolean(evidenceFocus);
  const focusLabel     = evidenceFocus
    ? (EVIDENCE_DISPLAY_LABELS[evidenceFocus.type] || evidenceFocus.type.replace(/_/g, ' '))
    : '';
  const focusColor     = evidenceFocus ? (EVIDENCE_COLORS[evidenceFocus.type] || '#3b82f6') : '#3b82f6';
  const focusedCount   = evidenceFocus
    ? (evidenceFocus.supporting_entities || []).filter((id) => availableNodeIds.has(id)).length
    : 0;

  const evidenceSubject = useMemo(() => {
    if (!evidenceFocus) return { primary: '' };
    return getEvidenceSubject(evidenceFocus);
  }, [evidenceFocus]);

  const isZeroRelationships = Boolean(lensStatusMessage) || graphData.nodes.length === 0;

  const nodeEvidenceTriggers = useMemo(() => {
    if (!selectedNode || !allEvidenceItems.length) return [];
    return allEvidenceItems.filter((item) =>
      (item.supporting_entities || []).includes(selectedNode.id)
    );
  }, [selectedNode, allEvidenceItems]);

  const selectedEdgeRelType  = selectedEdge ? deriveEdgeRelType(selectedEdge) : null;
  const selectedEdgeWhyLines = selectedEdge ? buildEdgeWhyLines(selectedEdge) : [];

  const investigativeThread = useMemo(() => {
    if (!focalNodeId) return [];
    return buildInvestigativeThread(graphData, focalNodeId, allEvidenceItems);
  }, [focalNodeId, graphData, allEvidenceItems]);

  const focalNode = focalNodeId ? graphData.nodes.find((n) => n.id === focalNodeId) : null;

  const pathHops = useMemo(() => {
    if (!pathResult || pathResult === 'not-found') return [];
    return (pathResult as string[]).slice(0, -1).map((id, i) => {
      const nextId  = (pathResult as string[])[i + 1];
      const edge    = getEdgeBetween(graphData, id, nextId);
      const relType = edge ? deriveEdgeRelType(edge) : ('WEIGHT_ONLY' as EdgeRelType);
      return { from: id, to: nextId, relType, edge };
    });
  }, [pathResult, graphData]);

  const activeLensConfig = LENS_CONFIG.find((l) => l.id === activeLens) || LENS_CONFIG[0];

  // ── Toolbar button shared style helpers ───────────────────────────────────
  const tbBtn = (active: boolean, activeColor: string) => ({
    display: 'flex', alignItems: 'center', gap: '5px',
    padding: '8px 13px',
    background: active ? `${activeColor}18` : 'transparent',
    border: 'none',
    borderBottom: active ? `2px solid ${activeColor}` : '2px solid transparent',
    color: active ? activeColor : 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '11px',
    fontWeight: active ? 700 : 500,
    whiteSpace: 'nowrap',
    transition: 'all 0.15s ease',
    flexShrink: 0,
  } as React.CSSProperties);

  const iconBtn = {
    padding: '5px 7px',
    backgroundColor: 'var(--bg-subtle)',
    border: '1px solid var(--border)',
    borderRadius: '5px',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
  } as React.CSSProperties;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div
      className="dash-card"
      style={{
        display: 'flex', flexDirection: 'column',
        position: isFullscreen ? 'fixed' : 'relative',
        inset: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 9999 : 1,
        height: isFullscreen ? '100vh' : (typeof height === 'number' ? `${height}px` : height),
        minHeight: isFullscreen ? '100vh' : '640px',
        overflow: 'hidden',
        border: hasFocus ? `1px solid ${focusColor}50` : '1px solid var(--border)',
        transition: 'border-color 0.25s ease',
      }}
    >
      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', flexDirection: 'column',
        borderBottom: `1px solid ${hasFocus ? `${focusColor}30` : 'var(--border)'}`,
        backgroundColor: 'var(--bg-sidebar)',
        flexShrink: 0,
      }}>
        {/* Row 1: Lens tabs */}
        <div style={{
          display: 'flex', alignItems: 'stretch',
          borderBottom: '1px solid var(--border)', overflowX: 'auto',
        }}>
          {LENS_CONFIG.map((lens) => {
            const Icon     = lens.icon;
            const isActive = activeLens === lens.id;
            return (
              <button
                key={lens.id}
                onClick={() => handleLensSelect(lens.id)}
                title={lens.description}
                style={tbBtn(isActive, '#60a5fa')}
              >
                <Icon size={11} />
                <span>{lens.label}</span>
              </button>
            );
          })}

          <div style={{ flex: 1 }} />

          {/* Path investigation toggle */}
          <button
            onClick={() => setShowPathPanel(!showPathPanel)}
            title="Trace observed relationship path between two accounts"
            style={tbBtn(showPathPanel, '#86efac')}
          >
            <Route size={11} />
            <span>Trace Path</span>
          </button>

          {/* Investigative thread toggle (available when focal set OR evidenceFocus active) */}
          {(focalNodeId || evidenceFocus) && (
            <button
              onClick={() => setShowThreadPanel(!showThreadPanel)}
              title="Toggle investigative thread"
              style={tbBtn(showThreadPanel, '#a5b4fc')}
            >
              <Layers size={11} />
              <span>Thread</span>
            </button>
          )}
        </div>

        {/* Row 2: Search + lens question + controls */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '12px',
          padding: '7px 14px', flexWrap: 'wrap',
        }}>
          {/* Search */}
          <form onSubmit={handleSearchSubmit} style={{ position: 'relative', flexShrink: 0 }}>
            <Search size={11} style={{ position: 'absolute', left: '9px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={graphSearchQuery}
              onChange={(e) => setGraphSearchQuery(e.target.value)}
              placeholder="Search account in graph…"
              style={{
                padding: '5px 9px 5px 27px', width: '220px',
                backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)',
                borderRadius: '5px', color: 'var(--text-primary)',
                fontSize: '11px', fontFamily: 'var(--font-mono)', outline: 'none',
              }}
            />
          </form>

          {/* Active lens question & description */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{
              fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {activeLensConfig.question}
            </span>
            <span style={{
              fontSize: '10px', color: 'var(--text-dim)',
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              — {activeLensConfig.description}
            </span>
          </div>

          {/* Controls */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
            {/* Tool Mode: Select vs Pan */}
            <div style={{
              display: 'flex', alignItems: 'center',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '5px', padding: '2px',
              border: '1px solid var(--border)',
            }}>
              <button
                type="button"
                onClick={() => setInteractionMode('select')}
                title="Select Tool (V) — Click accounts or edges to inspect"
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 8px', borderRadius: '4px', border: 'none',
                  backgroundColor: interactionMode === 'select' ? 'var(--accent)' : 'transparent',
                  color: interactionMode === 'select' ? '#fff' : 'var(--text-muted)',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                <MousePointer size={11} />
                <span>Select</span>
              </button>
              <button
                type="button"
                onClick={() => setInteractionMode('pan')}
                title="Hand / Pan Tool (H / Space) — Drag anywhere to move graph"
                style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  padding: '4px 8px', borderRadius: '4px', border: 'none',
                  backgroundColor: interactionMode === 'pan' ? 'var(--accent)' : 'transparent',
                  color: interactionMode === 'pan' ? '#fff' : 'var(--text-muted)',
                  fontSize: '11px', fontWeight: 600, cursor: 'pointer',
                  transition: 'all 0.12s ease',
                }}
              >
                <Hand size={11} />
                <span>Pan</span>
              </button>
            </div>

            <button
              onClick={handleReset}
              title="Reset all view state"
              style={{
                ...iconBtn,
                gap: '5px', padding: '5px 9px', fontSize: '11px', fontWeight: 600,
                backgroundColor: hasFocus ? 'rgba(239,68,68,0.1)' : 'var(--bg-subtle)',
                border: hasFocus ? '1px solid rgba(239,68,68,0.3)' : '1px solid var(--border)',
                color: hasFocus ? '#f87171' : 'var(--text-muted)',
              }}
            >
              <RotateCcw size={11} /><span>Reset</span>
            </button>

            <select
              value={layoutName}
              onChange={(e) => setLayoutName(e.target.value as typeof layoutName)}
              style={{
                backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)',
                color: 'var(--text-primary)', padding: '5px 7px',
                borderRadius: '5px', fontSize: '11px', outline: 'none', cursor: 'pointer',
              }}
            >
              <option value="cose">Force-Directed</option>
              <option value="concentric">Concentric</option>
              <option value="circle">Circular</option>
            </select>

            {/* Zoom Controls */}
            <div style={{
              display: 'flex', alignItems: 'center',
              backgroundColor: 'var(--bg-subtle)',
              borderRadius: '5px', border: '1px solid var(--border)',
              overflow: 'hidden',
            }}>
              <button
                type="button"
                onClick={handleZoomOut}
                title="Zoom Out (-)"
                style={{ ...iconBtn, border: 'none', borderRadius: 0, padding: '5px 7px' }}
              >
                <ZoomOut size={12} />
              </button>
              <button
                type="button"
                onClick={handleZoomReset}
                title="Zoom Level (Click to reset to 100%)"
                style={{
                  background: 'none', border: 'none',
                  color: 'var(--text-muted)',
                  fontSize: '10px', fontWeight: 700,
                  fontFamily: 'var(--font-mono)',
                  padding: '0 6px', cursor: 'pointer',
                  minWidth: '38px', textAlign: 'center',
                }}
              >
                {zoomLevel}%
              </button>
              <button
                type="button"
                onClick={handleZoomIn}
                title="Zoom In (+ / =)"
                style={{ ...iconBtn, border: 'none', borderRadius: 0, padding: '5px 7px' }}
              >
                <ZoomIn size={12} />
              </button>
            </div>

            <button onClick={handleFit} title="Fit to screen (0)" style={iconBtn}><Maximize2 size={12} /></button>

            {focalNodeId && (
              <button
                onClick={handleCenterFocal}
                title={`Center on focal ${focalNodeId}`}
                style={{ ...iconBtn, color: '#86efac', borderColor: 'rgba(34,197,94,0.3)' }}
              >
                <Target size={12} />
              </button>
            )}

            <button onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} style={iconBtn}>
              {isFullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
            </button>
          </div>
        </div>

        {/* Informational status for sparse lens matches */}
        {lensStatusMessage && (
          <div style={{
            padding: '6px 14px', backgroundColor: 'rgba(234,179,8,0.08)',
            borderTop: '1px solid rgba(234,179,8,0.2)', display: 'flex', alignItems: 'center', gap: '8px',
            fontSize: '11px', color: '#facc15',
          }}>
            <AlertCircle size={13} style={{ flexShrink: 0 }} />
            <span>{lensStatusMessage}</span>
          </div>
        )}
      </div>

      {/* ── Evidence focus banner — clearly distinguishes active lens, focal, and evidence ───────── */}
      {hasFocus && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '7px 16px', backgroundColor: `${focusColor}14`,
          borderBottom: `1px solid ${focusColor}35`,
          flexWrap: 'wrap', gap: '8px',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {/* Active Lens tag */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Lens:</span>
              <span style={{ fontSize: '10px', fontWeight: 600, color: '#93c5fd' }}>{activeLensConfig.label}</span>
            </div>

            {/* Investigation Focal tag */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '2px 6px', backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: '3px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>Investigation Focal:</span>
              <span className="font-mono" style={{ fontSize: '10px', fontWeight: 600, color: focalNodeId ? '#86efac' : 'var(--text-muted)' }}>
                {focalNodeId || 'None (Signal Focus)'}
              </span>
            </div>

            {/* Evidence Focus info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ScanSearch size={13} style={{ color: focusColor, flexShrink: 0 }} />
              <span style={{ fontSize: '10px', fontWeight: 800, color: focusColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Evidence Focus:</span>
              <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 700 }}>{focusLabel}</span>
              {evidenceSubject.primary && (
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                  ({evidenceSubject.primary}{evidenceSubject.secondary ? ` · ${evidenceSubject.secondary}` : ''})
                </span>
              )}
              {focusedCount > 0 && (
                <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                  · {focusedCount} highlighted
                </span>
              )}
            </div>
          </div>

          <button
            onClick={() => onClearFocus ? onClearFocus() : handleReset()}
            style={{
              padding: '3px 9px', borderRadius: '4px', background: 'transparent',
              border: `1px solid ${focusColor}50`, color: focusColor, cursor: 'pointer',
              fontSize: '11px', fontWeight: 600,
            }}
          >
            Clear Evidence Focus
          </button>
        </div>
      )}

      {/* ── Path investigation panel ─────────────────────────────────────── */}
      {showPathPanel && (
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          backgroundColor: 'rgba(17,24,39,0.97)',
          display: 'flex', alignItems: 'flex-start', gap: '16px', flexWrap: 'wrap',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <span style={{ fontSize: '10px', fontWeight: 700, color: '#86efac', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Trace Observed Relationship Path
            </span>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <input
                type="text" value={pathFrom}
                onChange={(e) => setPathFrom(e.target.value)}
                placeholder="From account…"
                style={{ padding: '5px 9px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text-primary)', fontSize: '11px', fontFamily: 'var(--font-mono)', outline: 'none', width: '165px' }}
              />
              <span style={{ color: 'var(--text-dim)' }}>→</span>
              <input
                type="text" value={pathTo}
                onChange={(e) => setPathTo(e.target.value)}
                placeholder="To account…"
                style={{ padding: '5px 9px', backgroundColor: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text-primary)', fontSize: '11px', fontFamily: 'var(--font-mono)', outline: 'none', width: '165px' }}
              />
              <button
                onClick={handleTracePath}
                disabled={!pathFrom.trim() || !pathTo.trim()}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '5px 12px', borderRadius: '5px', fontSize: '11px', fontWeight: 700,
                  backgroundColor: 'rgba(34,197,94,0.14)', border: '1px solid rgba(34,197,94,0.35)',
                  color: '#86efac', cursor: 'pointer',
                  opacity: (!pathFrom.trim() || !pathTo.trim()) ? 0.4 : 1,
                }}
              >
                <Route size={11} /><span>Trace</span>
              </button>
              {pathResult && (
                <button
                  onClick={() => { setPathResult(null); cyRef.current?.elements().removeClass('path-node path-edge'); }}
                  style={{ padding: '5px 7px', backgroundColor: 'transparent', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>

          {/* Result */}
          {pathResult === 'not-found' && (
            <div style={{ padding: '8px 12px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: '5px', fontSize: '11px', color: '#fca5a5', alignSelf: 'flex-end' }}>
              No observed relationship path found in available evidence.
            </div>
          )}
          {pathResult && pathResult !== 'not-found' && pathHops.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', alignSelf: 'flex-end' }}>
              <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontWeight: 700, textTransform: 'uppercase' }}>
                {(pathResult as string[]).length} node{(pathResult as string[]).length !== 1 ? 's' : ''} · {pathHops.length} hop{pathHops.length !== 1 ? 's' : ''}
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '5px', flexWrap: 'wrap' }}>
                {pathHops.map((hop, i) => (
                  <React.Fragment key={i}>
                    <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: '#86efac' }}>{hop.from}</span>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                      <span style={{ fontSize: '9px', color: EDGE_REL_COLORS[hop.relType], fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', lineHeight: 1.1 }}>
                        {EDGE_REL_LABELS[hop.relType]}
                      </span>
                      <span style={{ color: '#22c55e', fontSize: '11px' }}>→</span>
                    </div>
                    {i === pathHops.length - 1 && (
                      <span className="font-mono" style={{ fontSize: '11px', fontWeight: 700, color: '#86efac' }}>{hop.to}</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Main canvas area ─────────────────────────────────────────────── */}
      <div style={{
        position: 'relative', flex: 1, minHeight: 0,
        width: '100%',
        display: 'flex', overflow: 'hidden',
      }}>

        {/* ── Investigative Thread panel (left) ───────────────────────── */}
        {showThreadPanel && (focalNodeId || evidenceFocus) && (
          <div style={{
            width: '280px', flexShrink: 0,
            backgroundColor: 'rgba(13,17,23,0.97)',
            backdropFilter: 'blur(12px)',
            borderRight: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', zIndex: 10,
            height: '100%',
            overflow: 'hidden',
          }}>
            {/* Panel header */}
            <div style={{
              padding: '12px 14px', borderBottom: '1px solid var(--border)',
              display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', minWidth: 0, flex: 1 }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>
                  Investigative Thread
                </span>

                {/* Account focal section: strictly account entities, never transactions */}
                {focalNodeId ? (
                  <div style={{ padding: '6px 8px', backgroundColor: 'rgba(59,130,246,0.1)', border: '1px solid rgba(59,130,246,0.25)', borderRadius: '4px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                      INVESTIGATION FOCAL
                    </span>
                    <span className="font-mono" style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>
                      {focalNodeId}
                    </span>
                    {focalNode?.customer_name && focalNode.customer_name !== focalNodeId && (
                      <span style={{ fontSize: '11px', color: 'var(--text-dim)', display: 'block' }}>
                        {focalNode.customer_name}
                      </span>
                    )}
                  </div>
                ) : null}

                {/* Evidence Focus section */}
                {evidenceFocus && (
                  <div style={{
                    padding: '6px 8px',
                    backgroundColor: `${focusColor}14`,
                    border: `1px solid ${focusColor}35`,
                    borderRadius: '4px',
                  }}>
                    <span style={{ fontSize: '9px', fontWeight: 700, color: focusColor, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block' }}>
                      {focalNodeId ? 'EVIDENCE FOCUS' : `SIGNAL FOCUS — ${focusLabel}`}
                    </span>
                    {focalNodeId && (
                      <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', marginTop: '2px' }}>
                        {focusLabel}
                      </span>
                    )}
                    <div style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '1px' }}>
                      <span style={{ fontSize: '9px', color: 'var(--text-dim)', textTransform: 'uppercase', fontWeight: 600 }}>
                        Evidence subject:
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 500 }}>
                        {evidenceSubject.primary}
                      </span>
                      {evidenceSubject.secondary && (
                        <span style={{ fontSize: '10px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                          {evidenceSubject.secondary}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>
              <button onClick={() => setShowThreadPanel(false)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px', flexShrink: 0 }}>
                <ChevronLeft size={14} />
              </button>
            </div>

            {/* Observations */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {investigativeThread.map((obs, i) => (
                <div key={`thread-obs-${i}`} style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: '#818cf8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Deterministic Observation
                  </span>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
                    {obs}
                  </p>
                </div>
              ))}

              {evidenceFocus && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                  <span style={{ fontSize: '9px', fontWeight: 700, color: focusColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Observable Evidence Signal
                  </span>
                  <p style={{ fontSize: '11px', color: 'var(--text-secondary)', margin: 0, lineHeight: 1.55 }}>
                    {evidenceFocus.description}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Graph canvas ────────────────────────────────────────────────── */}
        <div style={{ flex: 1, position: 'relative', minWidth: 0, height: '100%' }}>
          <div ref={containerRef} style={{ width: '100%', height: '100%', backgroundColor: '#0d1117' }} />

          {/* ── Empty state overlay for zero relationships ─────────────────── */}
          {isZeroRelationships && (
            <div
              data-testid="graph-empty-state"
              style={{
                position: 'absolute',
                inset: 0,
                backgroundColor: 'rgba(13, 17, 23, 0.92)',
                backdropFilter: 'blur(6px)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '24px',
                textAlign: 'center',
                zIndex: 25,
                gap: '14px',
              }}
            >
              <div style={{
                width: '44px', height: '44px', borderRadius: '50%',
                backgroundColor: 'rgba(234, 179, 8, 0.12)',
                border: '1px solid rgba(234, 179, 8, 0.3)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: '#facc15',
              }}>
                <Network size={22} />
              </div>

              <div>
                <h3 style={{ fontSize: '14px', fontWeight: 800, color: 'var(--text-primary)', margin: '0 0 6px 0', letterSpacing: '0.04em' }}>
                  NO OBSERVED RELATIONSHIPS
                </h3>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', maxWidth: '420px', margin: 0, lineHeight: 1.5 }}>
                  {lensStatusMessage || 'No observed relationships match the active investigation lens and evidence focus.'}
                </p>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', justifyContent: 'center' }}>
                <button
                  onClick={() => handleLensSelect('community')}
                  style={{
                    padding: '6px 12px', borderRadius: '5px',
                    backgroundColor: 'var(--bg-card)', border: '1px solid var(--border)',
                    color: 'var(--text-primary)', fontSize: '11px', fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  <Network size={12} />
                  <span>View Community Structure</span>
                </button>

                {evidenceFocus && (
                  <button
                    onClick={() => {
                      if (onClearFocus) onClearFocus();
                      else handleReset();
                    }}
                    style={{
                      padding: '6px 12px', borderRadius: '5px',
                      backgroundColor: 'rgba(59, 130, 246, 0.12)', border: '1px solid rgba(59, 130, 246, 0.3)',
                      color: '#60a5fa', fontSize: '11px', fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                    }}
                  >
                    <RotateCcw size={12} />
                    <span>Clear Evidence Focus</span>
                  </button>
                )}

                <button
                  onClick={handleReset}
                  style={{
                    padding: '6px 12px', borderRadius: '5px',
                    backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)',
                    color: 'var(--text-muted)', fontSize: '11px', fontWeight: 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px',
                  }}
                >
                  <RotateCcw size={12} />
                  <span>Reset Lens</span>
                </button>
              </div>
            </div>
          )}

          {/* ── Legend ────────────────────────────────────────────────────── */}
          <div style={{
            position: 'absolute', bottom: '14px', left: '14px',
            backgroundColor: 'rgba(13,17,23,0.93)', backdropFilter: 'blur(8px)',
            border: '1px solid var(--border)', borderRadius: '6px',
            padding: '10px 14px', fontSize: '11px', color: 'var(--text-muted)',
            display: 'flex', flexDirection: 'column', gap: '5px',
            pointerEvents: 'none', zIndex: 10, maxWidth: '210px',
          }}>
            <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '2px' }}>Node Roles</span>
            {[
              { bg: '#1e3a5f', border: '#3b82f6', label: 'Investigation Focal' },
              { bg: '#0f2942', border: '#38bdf8', label: 'Counterparty' },
              { bg: '#2d1a0f', border: '#fb923c', label: 'Shared Infrastructure' },
            ].map(({ bg, border, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: bg, border: `2px solid ${border}`, flexShrink: 0 }} />
                <span>{label}</span>
              </div>
            ))}
            <div style={{ borderTop: '1px solid var(--border)', marginTop: '4px', paddingTop: '6px' }}>
              <span style={{ fontSize: '9px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '4px' }}>Edge Types</span>
              {(Object.entries(EDGE_REL_COLORS) as [EdgeRelType, string][])
                .map(([rel, color]) => (
                  <div key={rel} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '3px' }}>
                    <span style={{ width: '14px', height: '2px', backgroundColor: color, flexShrink: 0 }} />
                    <span style={{ fontSize: '10px' }}>{EDGE_REL_LABELS[rel]}</span>
                  </div>
                ))}
            </div>
            {hasFocus && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', borderTop: '1px solid var(--border)', paddingTop: '5px', marginTop: '2px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: focusColor, flexShrink: 0 }} />
                <span style={{ color: focusColor, fontWeight: 600 }}>Evidence: {focusLabel}</span>
              </div>
            )}
          </div>

          {/* ── Thread panel collapsed button ──────────────────────────────── */}
          {(focalNodeId || evidenceFocus) && !showThreadPanel && (
            <button
              onClick={() => setShowThreadPanel(true)}
              title="Show investigative thread"
              style={{
                position: 'absolute', top: '14px', left: '14px',
                display: 'flex', alignItems: 'center', gap: '5px',
                padding: '6px 10px',
                backgroundColor: 'rgba(99,102,241,0.14)', backdropFilter: 'blur(8px)',
                border: '1px solid rgba(99,102,241,0.35)', borderRadius: '6px',
                color: '#a5b4fc', cursor: 'pointer', fontSize: '11px', fontWeight: 600,
                zIndex: 20,
              }}
            >
              <ChevronRight size={12} />
              <Layers size={12} />
              <span>Thread</span>
            </button>
          )}

          {/* ── Floating Navigation / Pan D-Pad (Bottom-Right) ── */}
          <div
            style={{
              position: 'absolute', bottom: '14px', right: '14px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              backgroundColor: 'rgba(13,17,23,0.92)', backdropFilter: 'blur(8px)',
              border: '1px solid var(--border)', borderRadius: '6px',
              padding: '4px', zIndex: 10,
              boxShadow: '0 4px 16px rgba(0,0,0,0.5)',
            }}
          >
            <button
              type="button"
              onClick={() => cyRef.current?.panBy({ x: 0, y: 70 })}
              title="Pan Canvas Up (ArrowUp)"
              style={iconBtn}
            >
              <ChevronUp size={14} />
            </button>
            <div style={{ display: 'flex', gap: '2px' }}>
              <button
                type="button"
                onClick={() => cyRef.current?.panBy({ x: 70, y: 0 })}
                title="Pan Canvas Left (ArrowLeft)"
                style={iconBtn}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                onClick={handleFit}
                title="Fit View to Screen (0)"
                style={{ ...iconBtn, fontSize: '9px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}
              >
                FIT
              </button>
              <button
                type="button"
                onClick={() => cyRef.current?.panBy({ x: -70, y: 0 })}
                title="Pan Canvas Right (ArrowRight)"
                style={iconBtn}
              >
                <ChevronRight size={14} />
              </button>
            </div>
            <button
              type="button"
              onClick={() => cyRef.current?.panBy({ x: 0, y: -70 })}
              title="Pan Canvas Down (ArrowDown)"
              style={iconBtn}
            >
              <ChevronDown size={14} />
            </button>
          </div>

          {/* ── Node Inspector ─────────────────────────────────────────────── */}
          {selectedNode && (
            <div style={{
              position: 'absolute', top: '14px', right: '14px',
              width: '350px',
              maxWidth: 'calc(100% - 28px)',
              maxHeight: 'calc(100% - 28px)',
              overflowY: 'auto',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px', padding: '16px',
              display: 'flex', flexDirection: 'column', gap: '12px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.7)', zIndex: 20,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Account Node
                  </span>
                  {communityId != null && (
                    <Badge variant="neutral">COMMUNITY #{communityId}</Badge>
                  )}
                  {selectedNode.id === focalNodeId && (
                    <Badge variant="accent">FOCAL</Badge>
                  )}
                </div>
                <button onClick={() => setSelectedNode(null)} title="Close Inspector" style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}>
                  <X size={14} />
                </button>
              </div>

              <div>
                <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block', wordBreak: 'break-all' }}>
                  {selectedNode.id}
                </span>
                {selectedNode.customer_name && selectedNode.customer_name !== selectedNode.id && (
                  <span style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'block', marginTop: '1px' }}>
                    {selectedNode.customer_name}
                  </span>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <div>
                  <span style={{ color: 'var(--text-dim)', display: 'block' }}>Community Connections:</span>
                  <span className="font-mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedNode.degree} links</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-dim)', display: 'block' }}>Ledger Balance:</span>
                  <span className="font-mono" style={{ fontWeight: 700, color: '#34d399' }}>
                    {selectedNode.balance != null
                      ? `$${selectedNode.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                      : '—'}
                  </span>
                </div>
              </div>

              {/* Evidence triggers — 100% visible, structured cards with full text wrap */}
              {nodeEvidenceTriggers.length > 0 && (
                <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                    Associated Evidence Rules ({nodeEvidenceTriggers.length})
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '180px', overflowY: 'auto', paddingRight: '2px' }}>
                    {nodeEvidenceTriggers.map((item) => (
                      <div
                        key={item.evidence_id}
                        style={{
                          padding: '6px 8px',
                          borderRadius: '5px',
                          backgroundColor: item.severity === 'HIGH' ? 'var(--risk-high-bg)' : 'var(--risk-med-bg)',
                          border: `1px solid ${item.severity === 'HIGH' ? 'var(--risk-high-border)' : 'var(--risk-med-border)'}`,
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '2px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                          <span
                            style={{
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              backgroundColor: item.severity === 'HIGH' ? '#ef4444' : '#f59e0b',
                              flexShrink: 0,
                            }}
                          />
                          <span
                            style={{
                              fontSize: '9px',
                              fontWeight: 700,
                              textTransform: 'uppercase',
                              color: item.severity === 'HIGH' ? 'var(--risk-high)' : 'var(--risk-med)',
                              letterSpacing: '0.04em',
                            }}
                          >
                            {item.type.replace(/_/g, ' ')}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            lineHeight: 1.45,
                            color: 'var(--text-primary)',
                            fontWeight: 500,
                            wordBreak: 'break-word',
                          }}
                        >
                          {item.title}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Actions — strictly investigative analysis, NO case/SAR creation */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <Button
                  variant="primary"
                  size="sm"
                  icon={ExternalLink}
                  iconPosition="right"
                  onClick={() => navigate(`/accounts/${selectedNode.id}`, {
                    state: {
                      fromForensics: true,
                      communityId: communityId != null ? String(communityId) : undefined,
                      forensicView: 'network',
                    },
                  })}
                >
                  Inspect Account Profile
                </Button>
                <Button variant="secondary" size="sm" icon={ScanSearch} onClick={() => handleFocusNeighborhood(selectedNode.id)}>
                  Focus 1-Hop Neighborhood
                </Button>
                <Button variant="secondary" size="sm" icon={GitCommit} onClick={() => handleSetFocal(selectedNode.id)}>
                  Set as Investigation Focal
                </Button>
              </div>
            </div>
          )}

          {/* ── Edge Inspector ─────────────────────────────────────────────── */}
          {selectedEdge && !selectedNode && (
            <div style={{
              position: 'absolute', top: '14px', right: '14px',
              width: '350px',
              maxWidth: 'calc(100% - 28px)',
              maxHeight: 'calc(100% - 28px)',
              overflowY: 'auto',
              boxSizing: 'border-box',
              backgroundColor: 'var(--bg-panel)',
              border: `1px solid ${selectedEdgeRelType ? `${EDGE_REL_COLORS[selectedEdgeRelType]}45` : 'rgba(251,191,36,0.35)'}`,
              borderRadius: '8px', padding: '16px',
              display: 'flex', flexDirection: 'column', gap: '12px',
              boxShadow: '0 12px 32px rgba(0,0,0,0.72)', zIndex: 20,
            }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                <div>
                  <span style={{ fontSize: '10px', fontWeight: 700, color: selectedEdgeRelType ? EDGE_REL_COLORS[selectedEdgeRelType] : '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>
                    Why This Connection?
                  </span>
                  {selectedEdgeRelType && (
                    <span style={{ fontSize: '9px', color: 'var(--text-dim)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: '2px', display: 'block' }}>
                      {EDGE_REL_LABELS[selectedEdgeRelType]}
                    </span>
                  )}
                </div>
                <button onClick={() => setSelectedEdge(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}>
                  <X size={14} />
                </button>
              </div>

              {/* Accounts */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '12px' }}>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedEdge.source}</span>
                <span style={{ color: 'var(--text-dim)', padding: '0 4px' }}>
                  {selectedEdge.flow_direction === 'source_to_target' ? '→' : selectedEdge.flow_direction === 'target_to_source' ? '←' : '⇄'}
                </span>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedEdge.target}</span>
              </div>

              {/* Provenance classification */}
              <div style={{ padding: '6px 10px', backgroundColor: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)', borderRadius: '4px' }}>
                <span style={{ fontSize: '9px', fontWeight: 700, color: '#86efac', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: '2px' }}>
                  Classification
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                  OBSERVED — Deterministic payment network telemetry
                </span>
              </div>

              {/* Evidence weight */}
              <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <span style={{ color: 'var(--text-muted)' }}>Evidence Weight:</span>
                <span className="font-mono" style={{ color: selectedEdgeRelType ? EDGE_REL_COLORS[selectedEdgeRelType] : '#fbbf24', fontWeight: 700 }}>
                  {selectedEdge.weight.toFixed(2)} pts
                </span>
              </div>

              {/* Observable evidence lines */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '7px', fontSize: '11px', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Observable Relationship Evidence
                </span>
                {selectedEdgeWhyLines.map((line, i) => (
                  <div key={i} style={{ display: 'flex', gap: '7px', alignItems: 'flex-start' }}>
                    <span style={{ color: selectedEdgeRelType ? EDGE_REL_COLORS[selectedEdgeRelType] : '#fbbf24', flexShrink: 0, marginTop: '1px' }}>•</span>
                    <span style={{ color: 'var(--text-secondary)', lineHeight: 1.45, wordBreak: 'break-all' }}>{line}</span>
                  </div>
                ))}
              </div>

              {/* Quick action: pre-fill path trace */}
              <button
                onClick={() => {
                  setPathFrom(selectedEdge.source);
                  setPathTo(selectedEdge.target);
                  setShowPathPanel(true);
                }}
                style={{
                  display: 'flex', alignItems: 'center', gap: '5px',
                  padding: '6px 10px', borderRadius: '5px', fontSize: '11px', fontWeight: 600,
                  backgroundColor: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)',
                  color: '#86efac', cursor: 'pointer',
                }}
              >
                <Route size={11} /><span>Trace Path Between These Accounts</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
