import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import cytoscape from 'cytoscape';
import type { Core, EventObject } from 'cytoscape';
import {
  ExternalLink,
  Filter,
  Maximize2,
  Minimize2,
  RotateCcw,
  ScanSearch,
  Search,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { CommunityGraphResponse, GraphEdge, GraphNode, EvidenceItem } from '../../types/api';
import { AddToInvestigationButton, Badge, Button } from '../common';

// Evidence-type → display label for the focus banner
const EVIDENCE_DISPLAY_LABELS: Record<string, string> = {
  SHARED_INSTRUMENT_CONCENTRATION: 'Shared Payment Instrument',
  DEVICE_REUSE: 'Device Reuse',
  IP_CONCENTRATION: 'IP Concentration',
  TEMPORAL_BURST: 'Temporal Burst',
  RAPID_INTERACTION: 'Rapid Interaction',
  MERCHANT_TEMPORAL_OVERLAP: 'Merchant Temporal Overlap',
  HIGH_EVIDENCE_DENSITY: 'High Evidence Density',
  HUB_ACCOUNT: 'Hub Account Structure',
  MULTI_LAYER_EVIDENCE: 'Multi-Layer Evidence Signal',
};

// Evidence-type → color used for graph highlight
const EVIDENCE_COLORS: Record<string, string> = {
  SHARED_INSTRUMENT_CONCENTRATION: '#fbbf24',
  DEVICE_REUSE: '#fb7185',
  IP_CONCENTRATION: '#60a5fa',
  TEMPORAL_BURST: '#facc15',
  RAPID_INTERACTION: '#fb923c',
  MERCHANT_TEMPORAL_OVERLAP: '#34d399',
  HIGH_EVIDENCE_DENSITY: '#c084fc',
  HUB_ACCOUNT: '#22d3ee',
  MULTI_LAYER_EVIDENCE: '#f87171',
};

interface NetworkGraphProps {
  graphData: CommunityGraphResponse;
  height?: string | number;
  evidenceFocus?: EvidenceItem | null;
  allEvidenceItems?: EvidenceItem[];
  communityId?: number | string;
  initialSelectedNodeId?: string | null;
  onClearFocus?: () => void;
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({
  graphData,
  height = '620px',
  evidenceFocus = null,
  allEvidenceItems = [],
  initialSelectedNodeId = null,
  onClearFocus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const navigate = useNavigate();

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [layoutName, setLayoutName] = useState<'cose' | 'concentric' | 'circle'>('cose');
  const [graphSearchQuery, setGraphSearchQuery] = useState('');
  const [graphScope, setGraphScope] = useState<'all' | 'hubs'>('all');
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Build a set of node IDs in the graph
  const availableNodeIds = useMemo(() => new Set(graphData.nodes.map((n) => n.id)), [graphData.nodes]);

  // ---------------------------------------------------------------------------
  // Initialize Cytoscape Instance
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const elements: cytoscape.ElementDefinition[] = [];

    // Filter nodes based on graphScope if hubs mode is selected
    const visibleNodes = graphScope === 'hubs'
      ? graphData.nodes.filter((n) => n.degree >= 3 || n.degree === Math.max(...graphData.nodes.map((x) => x.degree)))
      : graphData.nodes;

    const visibleNodeIds = new Set(visibleNodes.map((n) => n.id));

    visibleNodes.forEach((node) => {
      // Degree-proportional sizing: min 22px, max 50px
      const size = Math.min(50, Math.max(22, 20 + node.degree * 2.6));
      const isHub = node.degree >= 4;

      elements.push({
        group: 'nodes',
        data: {
          id: node.id,
          label: node.id,
          customer_name: node.customer_name || node.id,
          balance: node.balance,
          degree: node.degree,
          size,
          isHub,
        },
      });
    });

    graphData.edges.forEach((edge, idx) => {
      if (visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target)) {
        elements.push({
          group: 'edges',
          data: {
            id: `e_${edge.source}_${edge.target}_${idx}`,
            source: edge.source,
            target: edge.target,
            weight: edge.weight,
            shared_instruments: edge.shared_instruments,
            shared_devices: edge.shared_devices,
            shared_ips: edge.shared_ips,
            shared_merchants: edge.shared_merchants,
            temporal_overlap: edge.temporal_overlap,
          },
        });
      }
    });

    const coseLayoutOptions = {
      name: 'cose',
      animate: false,
      padding: 60,
      nodeRepulsion: () => 8000,
      idealEdgeLength: () => 65,
      edgeElasticity: () => 100,
      gravity: 0.3,
      numIter: 1000,
      initialTemp: 200,
      coolingFactor: 0.95,
      fit: true,
    };

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // ---------- Base Node ----------
        {
          selector: 'node',
          style: {
            'background-color': '#1e293b',
            'border-width': 2,
            'border-color': '#3b82f6',
            'label': 'data(label)',
            'color': '#f1f5f9',
            'font-size': '10px',
            'font-family': 'JetBrains Mono, monospace',
            'text-valign': 'bottom',
            'text-margin-y': 5,
            'text-background-color': '#0d1117',
            'text-background-opacity': 0.75,
            'text-background-padding': '2px',
            'text-background-shape': 'roundrectangle',
            'width': 'data(size)',
            'height': 'data(size)',
            'transition-property': 'background-color, border-color, width, height, opacity, border-width',
            'transition-duration': 180,
          },
        },
        // ---------- High Degree / Hub Node ----------
        {
          selector: 'node[?isHub]',
          style: {
            'background-color': '#0f2942',
            'border-color': '#06b6d4',
            'border-width': 2.5,
          },
        },
        // ---------- Selected Node ----------
        {
          selector: 'node:selected',
          style: {
            'background-color': '#3b82f6',
            'border-color': '#ffffff',
            'border-width': 3.5,
            'color': '#60a5fa',
            'font-size': '11px',
            'font-weight': 'bold',
          },
        },
        // ---------- Focused Node (Evidence Highlight) ----------
        {
          selector: 'node.ev-focus',
          style: {
            'border-width': 4,
            'border-color': '#ffffff',
            'color': '#ffffff',
            'font-size': '11px',
            'font-weight': 'bold',
            'opacity': 1,
            'z-index': 100,
          },
        },
        // ---------- Dimmed Node ----------
        {
          selector: 'node.ev-dim',
          style: {
            'opacity': 0.12,
          },
        },
        // ---------- Base Edge ----------
        {
          selector: 'edge',
          style: {
            'width': 'mapData(weight, 1, 15, 1.4, 6)',
            'line-color': '#282b30',
            'curve-style': 'bezier',
            'opacity': 0.7,
            'transition-property': 'line-color, opacity, width',
            'transition-duration': 180,
          },
        },
        // ---------- Dimmed Edge ----------
        {
          selector: 'edge.ev-dim',
          style: {
            'opacity': 0.05,
          },
        },
        // ---------- Focused Edge ----------
        {
          selector: 'edge.ev-focus',
          style: {
            'line-color': '#38bdf8',
            'opacity': 1,
            'width': 3.5,
            'z-index': 90,
          },
        },
        // ---------- Selected Edge ----------
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#60a5fa',
            'opacity': 1,
            'width': 4,
            'z-index': 95,
          },
        },
      ],
      layout: layoutName === 'cose' ? (coseLayoutOptions as any) : { name: layoutName, animate: false, padding: 50 },
      minZoom: 0.15,
      maxZoom: 4.0,
      wheelSensitivity: 0.25,
    });

    // Tap Events
    cy.on('tap', 'node', (evt: EventObject) => {
      const id = evt.target.id();
      const match = graphData.nodes.find((n) => n.id === id);
      if (match) {
        setSelectedNode(match);
        setSelectedEdge(null);
      }
    });

    cy.on('tap', 'edge', (evt: EventObject) => {
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
      });
      setSelectedNode(null);
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) {
        setSelectedNode(null);
        setSelectedEdge(null);
      }
    });

    // If initial selected node was passed, select it
    if (initialSelectedNodeId) {
      const targetNode = cy.$(`node[id = "${initialSelectedNodeId}"]`);
      if (targetNode.length > 0) {
        targetNode.select();
        const match = graphData.nodes.find((n) => n.id === initialSelectedNodeId);
        if (match) setSelectedNode(match);
      }
    }

    cyRef.current = cy;

    // Automatic Center & Fit on Mount
    setTimeout(() => {
      try {
        cy.resize();
        cy.fit(undefined, 50);
      } catch {}
    }, 100);

    return () => {
      cy.destroy();
    };
  }, [graphData, layoutName, graphScope, initialSelectedNodeId]);

  // ---------------------------------------------------------------------------
  // Apply Evidence Focus Highlighting
  // ---------------------------------------------------------------------------
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

    // Style focused nodes
    cy.nodes().forEach((n: any) => {
      if (focusedIds.has(n.id())) {
        n.addClass('ev-focus');
        n.removeClass('ev-dim');
        n.style({ 'background-color': focusColor, 'border-color': '#ffffff' });
      } else {
        n.removeClass('ev-focus');
        n.addClass('ev-dim');
      }
    });

    // Style focused edges
    cy.edges().forEach((e: any) => {
      const s = e.data('source');
      const t = e.data('target');
      if (focusedIds.has(s) && focusedIds.has(t)) {
        e.addClass('ev-focus');
        e.removeClass('ev-dim');
        e.style({ 'line-color': focusColor });
      } else {
        e.removeClass('ev-focus');
        e.addClass('ev-dim');
      }
    });

    // Fit smoothly to highlighted subgraph
    if (!isAllNodes && focusedIds.size > 0) {
      try {
        const focusNodes = cy.nodes().filter((n: any) => focusedIds.has(n.id()));
        if (focusNodes.length > 0) {
          cy.fit(focusNodes, 80);
        }
      } catch {}
    } else {
      try {
        cy.fit(undefined, 50);
      } catch {}
    }
  }, [evidenceFocus, graphData, availableNodeIds]);

  // ---------------------------------------------------------------------------
  // Graph Search Handler
  // ---------------------------------------------------------------------------
  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = graphSearchQuery.trim().toLowerCase();
    if (!q || !cyRef.current) return;

    const cy = cyRef.current;
    const targetNode = cy.nodes().filter((n: any) => {
      const id = n.id().toLowerCase();
      const name = (n.data('customer_name') || '').toLowerCase();
      return id.includes(q) || name.includes(q);
    }).first();

    if (targetNode.length > 0) {
      cy.nodes().unselect();
      targetNode.select();
      cy.center(targetNode);
      cy.zoom(1.8);

      const match = graphData.nodes.find((n) => n.id === targetNode.id());
      if (match) {
        setSelectedNode(match);
        setSelectedEdge(null);
      }
    }
  };

  // Focus 1-Hop Neighborhood around a selected node
  const handleFocusNeighborhood = (nodeId: string) => {
    const cy = cyRef.current;
    if (!cy) return;

    const centerNode = cy.$(`node[id = "${nodeId}"]`);
    if (centerNode.length === 0) return;

    const neighborhood = centerNode.neighborhood().add(centerNode);
    cy.elements().removeClass('ev-focus ev-dim');
    cy.elements().difference(neighborhood).addClass('ev-dim');
    neighborhood.addClass('ev-focus');
    cy.fit(neighborhood, 70);
  };

  // Toolbar actions
  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleFit = () => {
    try {
      cyRef.current?.fit(undefined, 50);
    } catch {}
  };

  const handleReset = useCallback(() => {
    if (!cyRef.current) return;
    cyRef.current.elements().removeClass('ev-focus ev-dim');
    cyRef.current.elements().removeStyle();
    cyRef.current.nodes().unselect();
    cyRef.current.edges().unselect();
    setSelectedNode(null);
    setSelectedEdge(null);
    setGraphSearchQuery('');
    setGraphScope('all');
    try {
      cyRef.current.fit(undefined, 50);
    } catch {}
    onClearFocus?.();
  }, [onClearFocus]);

  const hasFocus = !!evidenceFocus;
  const focusLabel = evidenceFocus ? (EVIDENCE_DISPLAY_LABELS[evidenceFocus.type] || evidenceFocus.type.replace(/_/g, ' ')) : '';
  const focusColor = evidenceFocus ? (EVIDENCE_COLORS[evidenceFocus.type] || '#3b82f6') : '#3b82f6';
  const focusedNodeCount = evidenceFocus
    ? (evidenceFocus.supporting_entities || []).filter((id) => availableNodeIds.has(id)).length
    : 0;

  // Find evidence triggers associated with the selected node
  const nodeEvidenceTriggers = useMemo(() => {
    if (!selectedNode || !allEvidenceItems.length) return [];
    return allEvidenceItems.filter((item) =>
      (item.supporting_entities || []).includes(selectedNode.id)
    );
  }, [selectedNode, allEvidenceItems]);

  return (
    <div
      className="dash-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: isFullscreen ? 'fixed' : 'relative',
        inset: isFullscreen ? 0 : 'auto',
        zIndex: isFullscreen ? 9999 : 1,
        height: isFullscreen ? '100vh' : 'auto',
        overflow: 'hidden',
        border: hasFocus ? `1px solid ${focusColor}50` : '1px solid var(--border)',
        transition: 'border-color 0.25s ease',
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* 1. GRAPH TOOLBAR                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: `1px solid ${hasFocus ? `${focusColor}30` : 'var(--border)'}`,
          backgroundColor: 'var(--bg-sidebar)',
          fontSize: '12px',
          gap: '12px',
          flexWrap: 'wrap',
        }}
      >
        {/* Left: Search & Scope */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1, minWidth: '280px' }}>
          <form onSubmit={handleSearchSubmit} style={{ display: 'flex', alignItems: 'center', position: 'relative', width: '260px' }}>
            <Search size={13} style={{ position: 'absolute', left: '10px', color: 'var(--text-dim)' }} />
            <input
              type="text"
              value={graphSearchQuery}
              onChange={(e) => setGraphSearchQuery(e.target.value)}
              placeholder="Search account in graph (e.g. acc_...)..."
              style={{
                width: '100%',
                padding: '6px 10px 6px 30px',
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderRadius: '5px',
                color: 'var(--text-primary)',
                fontSize: '11px',
                fontFamily: 'var(--font-mono)',
                outline: 'none',
              }}
            />
          </form>

          {/* Scope Selector */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Filter size={12} style={{ color: 'var(--text-dim)' }} />
            <select
              value={graphScope}
              onChange={(e) => setGraphScope(e.target.value as any)}
              style={{
                backgroundColor: 'var(--bg-input)',
                border: '1px solid var(--border)',
                color: 'var(--text-primary)',
                padding: '5px 8px',
                borderRadius: '5px',
                fontSize: '11px',
                fontWeight: 600,
                outline: 'none',
                cursor: 'pointer',
              }}
            >
              <option value="all">All Partition Nodes ({graphData.nodes.length})</option>
              <option value="hubs">High Connectivity Hubs (Degree ≥ 3)</option>
            </select>
          </div>
        </div>

        {/* Right: Layout & Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
          {/* Reset focus */}
          <button
            onClick={handleReset}
            title="Reset view — clear evidence focus"
            disabled={!hasFocus && !selectedNode && !selectedEdge}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '5px',
              padding: '5px 10px',
              backgroundColor: hasFocus ? 'rgba(239,68,68,0.12)' : 'var(--bg-subtle)',
              border: hasFocus ? '1px solid rgba(239,68,68,0.35)' : '1px solid var(--border)',
              borderRadius: '5px',
              color: hasFocus ? '#f87171' : 'var(--text-muted)',
              cursor: hasFocus || selectedNode || selectedEdge ? 'pointer' : 'default',
              fontSize: '11px',
              fontWeight: 600,
              opacity: hasFocus || selectedNode || selectedEdge ? 1 : 0.5,
            }}
          >
            <RotateCcw size={12} />
            <span>Reset View</span>
          </button>

          {/* Layout selector */}
          <select
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value as any)}
            style={{
              backgroundColor: 'var(--bg-input)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              padding: '5px 8px',
              borderRadius: '5px',
              fontSize: '11px',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="cose">Force-Directed</option>
            <option value="concentric">Concentric (Degree)</option>
            <option value="circle">Circular</option>
          </select>

          <button onClick={handleZoomIn} title="Zoom In" style={{ padding: '5px 8px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <ZoomIn size={13} />
          </button>
          <button onClick={handleZoomOut} title="Zoom Out" style={{ padding: '5px 8px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <ZoomOut size={13} />
          </button>
          <button onClick={handleFit} title="Fit to Screen" style={{ padding: '5px 8px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <Maximize2 size={13} />
          </button>
          <button onClick={() => setIsFullscreen(!isFullscreen)} title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'} style={{ padding: '5px 8px', backgroundColor: 'var(--bg-subtle)', border: '1px solid var(--border)', borderRadius: '5px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* 2. EVIDENCE FOCUS BANNER                                            */}
      {/* ------------------------------------------------------------------ */}
      {hasFocus && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            backgroundColor: `${focusColor}12`,
            borderBottom: `1px solid ${focusColor}30`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <ScanSearch size={14} style={{ color: focusColor, flexShrink: 0 }} />
            <span style={{ fontSize: '11px', fontWeight: 700, color: focusColor, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Graph Focus:
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text-primary)', fontWeight: 600 }}>
              {focusLabel}
            </span>
            {focusedNodeCount > 0 ? (
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                · {focusedNodeCount} highlighted account{focusedNodeCount !== 1 ? 's' : ''}
              </span>
            ) : (
              <span style={{ fontSize: '11px', color: 'var(--text-dim)', fontFamily: 'var(--font-mono)' }}>
                · community-wide observable signal
              </span>
            )}
          </div>
          <button
            onClick={handleReset}
            style={{
              padding: '3px 9px',
              borderRadius: '4px',
              background: 'transparent',
              border: `1px solid ${focusColor}50`,
              color: focusColor,
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
            }}
          >
            Clear Focus
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* 3. GRAPH CANVAS WORKSPACE                                          */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ position: 'relative', width: '100%', height: isFullscreen ? 'calc(100vh - 90px)' : height }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%', backgroundColor: '#0d1117' }} />

        {/* Graph Legend */}
        <div
          style={{
            position: 'absolute',
            bottom: '14px',
            left: '14px',
            backgroundColor: 'rgba(17, 18, 20, 0.92)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border)',
            borderRadius: '6px',
            padding: '10px 14px',
            fontSize: '11px',
            color: 'var(--text-muted)',
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
            pointerEvents: 'none',
            zIndex: 10,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#1e293b', border: '2px solid #3b82f6', flexShrink: 0 }} />
            <span>Account Node (size = degree)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: '#0f2942', border: '2px solid #06b6d4', flexShrink: 0 }} />
            <span>High-Degree Hub Account</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ width: '16px', height: '2px', backgroundColor: '#282b30', flexShrink: 0 }} />
            <span>Edge (thickness = link weight)</span>
          </div>
          {hasFocus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', borderTop: '1px solid var(--border)', paddingTop: '5px', marginTop: '2px' }}>
              <span style={{ width: '9px', height: '9px', borderRadius: '50%', backgroundColor: focusColor, flexShrink: 0 }} />
              <span style={{ color: focusColor, fontWeight: 600 }}>Evidence Highlight: {focusLabel}</span>
            </div>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* 4. INVESTIGATOR NODE INSPECTOR PANEL                             */}
        {/* ---------------------------------------------------------------- */}
        {selectedNode && (
          <div
            style={{
              position: 'absolute',
              top: '14px',
              right: '14px',
              width: '320px',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-light)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)',
              zIndex: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Account Node Inspector
              </span>
              <button
                onClick={() => setSelectedNode(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
              >
                <X size={14} />
              </button>
            </div>

            <div>
              <span className="font-mono" style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)', display: 'block' }}>
                {selectedNode.id}
              </span>
              <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{selectedNode.customer_name}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '11px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <div>
                <span style={{ color: 'var(--text-dim)', display: 'block' }}>Connectivity:</span>
                <span className="font-mono" style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{selectedNode.degree} links</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', display: 'block' }}>Account Balance:</span>
                <span className="font-mono" style={{ fontWeight: 700, color: '#34d399' }}>
                  ${selectedNode.balance ? selectedNode.balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                </span>
              </div>
            </div>

            {/* Associated Evidence Triggers */}
            {nodeEvidenceTriggers.length > 0 && (
              <div style={{ paddingTop: '8px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-dim)', textTransform: 'uppercase' }}>
                  Associated Evidence Rules ({nodeEvidenceTriggers.length}):
                </span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
                  {nodeEvidenceTriggers.map((item) => (
                    <Badge key={item.evidence_id} variant={item.severity === 'HIGH' ? 'high' : 'med'} size="sm">
                      {item.title}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Inspector Actions */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              <Button
                variant="primary"
                size="sm"
                icon={ExternalLink}
                iconPosition="right"
                onClick={() => navigate(`/accounts/${selectedNode.id}`)}
              >
                Inspect Account Profile
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={ScanSearch}
                onClick={() => handleFocusNeighborhood(selectedNode.id)}
              >
                Focus 1-Hop Neighborhood
              </Button>
              <AddToInvestigationButton
                targetType="ACCOUNT"
                targetId={selectedNode.id}
                targetLabel={selectedNode.id}
                size="sm"
              />
            </div>
          </div>
        )}

        {/* ---------------------------------------------------------------- */}
        {/* 5. INVESTIGATOR EDGE INSPECTOR PANEL                             */}
        {/* ---------------------------------------------------------------- */}
        {selectedEdge && (
          <div
            style={{
              position: 'absolute',
              top: '14px',
              right: '14px',
              width: '320px',
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid rgba(251, 191, 36, 0.4)',
              borderRadius: '8px',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              boxShadow: '0 12px 32px rgba(0, 0, 0, 0.7)',
              zIndex: 20,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Evidence Relationship Link
              </span>
              <button
                onClick={() => setSelectedEdge(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', padding: '2px' }}
              >
                <X size={14} />
              </button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', fontFamily: 'var(--font-mono)' }}>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{selectedEdge.source}</span>
              <span style={{ color: 'var(--text-dim)' }}>⇄</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{selectedEdge.target}</span>
            </div>

            <div style={{ fontSize: '12px', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '8px' }}>
              <span style={{ color: 'var(--text-muted)' }}>Evidence Weight:</span>
              <span className="font-mono" style={{ color: '#fbbf24', fontWeight: 700 }}>{selectedEdge.weight.toFixed(2)} pts</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '11px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
              {selectedEdge.shared_instruments.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared Instruments ({selectedEdge.shared_instruments.length}):</span>
                  <div style={{ color: '#fbbf24', fontSize: '10px', marginTop: '2px', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    {selectedEdge.shared_instruments.join(', ')}
                  </div>
                </div>
              )}
              {selectedEdge.shared_devices.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared Devices ({selectedEdge.shared_devices.length}):</span>
                  <div style={{ color: '#fb7185', fontSize: '10px', marginTop: '2px', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    {selectedEdge.shared_devices.join(', ')}
                  </div>
                </div>
              )}
              {selectedEdge.shared_ips.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared IPs ({selectedEdge.shared_ips.length}):</span>
                  <div style={{ color: '#c084fc', fontSize: '10px', marginTop: '2px', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    {selectedEdge.shared_ips.join(', ')}
                  </div>
                </div>
              )}
              {selectedEdge.shared_merchants.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared Merchants ({selectedEdge.shared_merchants.length}):</span>
                  <div style={{ color: '#94a3b8', fontSize: '10px', marginTop: '2px', fontFamily: 'var(--font-mono)', wordBreak: 'break-all' }}>
                    {selectedEdge.shared_merchants.join(', ')}
                  </div>
                </div>
              )}
              {selectedEdge.temporal_overlap > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Same-Day Activity Overlap:</span>
                  <span className="font-mono" style={{ color: '#38bdf8', fontWeight: 700 }}>{selectedEdge.temporal_overlap} days</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
