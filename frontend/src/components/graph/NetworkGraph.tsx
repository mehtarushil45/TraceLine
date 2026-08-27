import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import cytoscape from 'cytoscape';
import type { Core, EventObject } from 'cytoscape';
import {
  ExternalLink,
  Maximize2,
  RotateCcw,
  ScanSearch,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import type { CommunityGraphResponse, GraphEdge, GraphNode, EvidenceItem } from '../../types/api';

// Evidence-type → display label for the focus banner
const EVIDENCE_DISPLAY_LABELS: Record<string, string> = {
  SHARED_INSTRUMENT_CONCENTRATION: 'Shared Payment Instrument',
  DEVICE_REUSE: 'Device Reuse',
  IP_CONCENTRATION: 'IP Concentration',
  TEMPORAL_BURST: 'Temporal Burst',
  RAPID_INTERACTION: 'Rapid Interaction',
  MERCHANT_TEMPORAL_OVERLAP: 'Merchant Overlap',
  HIGH_EVIDENCE_DENSITY: 'Evidence Density',
  HUB_ACCOUNT: 'Hub Account',
  MULTI_LAYER_EVIDENCE: 'Multi-Layer Signal',
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
  onClearFocus?: () => void;
}

export const NetworkGraph: React.FC<NetworkGraphProps> = ({
  graphData,
  height = '560px',
  evidenceFocus = null,
  onClearFocus,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const navigate = useNavigate();

  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [selectedEdge, setSelectedEdge] = useState<GraphEdge | null>(null);
  const [layoutName, setLayoutName] = useState<'cose' | 'concentric' | 'circle'>('cose');

  // Build a set of node IDs that exist in the graph — used to validate supporting entities
  const availableNodeIds = useMemo(() => new Set(graphData.nodes.map((n) => n.id)), [graphData.nodes]);

  // ---------------------------------------------------------------------------
  // Initialize Cytoscape
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!containerRef.current) return;

    const elements: cytoscape.ElementDefinition[] = [];

    graphData.nodes.forEach((node) => {
      const size = Math.min(52, Math.max(18, 18 + node.degree * 2.2));
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
      });
    });

    graphData.edges.forEach((edge, idx) => {
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
    });

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      style: [
        // ---------- Base node ----------
        {
          selector: 'node',
          style: {
            'background-color': '#1e293b',
            'border-width': 2,
            'border-color': '#38bdf8',
            'label': 'data(label)',
            'color': '#94a3b8',
            'font-size': '9px',
            'font-family': 'JetBrains Mono, monospace',
            'text-valign': 'bottom',
            'text-margin-y': 4,
            'width': 'data(size)',
            'height': 'data(size)',
            'transition-property': 'background-color, border-color, width, height, opacity, border-width',
            'transition-duration': 180,
          },
        },
        // ---------- Selected node ----------
        {
          selector: 'node:selected',
          style: {
            'background-color': '#f59e0b',
            'border-color': '#fde68a',
            'border-width': 3,
            'color': '#fde68a',
            'font-size': '10px',
            'font-weight': 'bold',
          },
        },
        // ---------- Focused node (evidence highlight) ----------
        {
          selector: 'node.ev-focus',
          style: {
            'background-color': '#1d4ed8', // overridden per-evidence via custom style
            'border-width': 3.5,
            'border-color': '#93c5fd',
            'color': '#e2e8f0',
            'font-size': '10px',
            'font-weight': 'bold',
            'opacity': 1,
          },
        },
        // ---------- Dimmed node ----------
        {
          selector: 'node.ev-dim',
          style: {
            'opacity': 0.12,
          },
        },
        // ---------- Base edge ----------
        {
          selector: 'edge',
          style: {
            'width': 'mapData(weight, 1, 15, 1.2, 6)',
            'line-color': '#282b30',
            'curve-style': 'bezier',
            'opacity': 0.65,
            'transition-property': 'line-color, opacity, width',
            'transition-duration': 180,
          },
        },
        // ---------- Dimmed edge ----------
        {
          selector: 'edge.ev-dim',
          style: {
            'opacity': 0.06,
          },
        },
        // ---------- Focused edge ----------
        {
          selector: 'edge.ev-focus',
          style: {
            'line-color': '#38bdf8',
            'opacity': 0.95,
            'width': 3,
          },
        },
        // ---------- Selected edge ----------
        {
          selector: 'edge:selected',
          style: {
            'line-color': '#38bdf8',
            'opacity': 1,
            'width': 3.5,
          },
        },
      ],
      layout: { name: layoutName, animate: false, padding: 40 },
      minZoom: 0.2,
      maxZoom: 3.5,
    });

    cy.on('tap', 'node', (evt: EventObject) => {
      const id = evt.target.id();
      const match = graphData.nodes.find((n) => n.id === id);
      if (match) { setSelectedNode(match); setSelectedEdge(null); }
    });

    cy.on('tap', 'edge', (evt: EventObject) => {
      const d = evt.target.data();
      setSelectedEdge({
        source: d.source, target: d.target, weight: d.weight,
        shared_instruments: d.shared_instruments || [],
        shared_devices: d.shared_devices || [],
        shared_ips: d.shared_ips || [],
        shared_merchants: d.shared_merchants || [],
        temporal_overlap: d.temporal_overlap || 0,
      });
      setSelectedNode(null);
    });

    cy.on('tap', (evt: EventObject) => {
      if (evt.target === cy) { setSelectedNode(null); setSelectedEdge(null); }
    });

    cyRef.current = cy;
    return () => { cy.destroy(); };
  }, [graphData, layoutName]);

  // ---------------------------------------------------------------------------
  // Apply / clear evidence focus when evidenceFocus changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    // Clear all focus/dim classes first
    cy.elements().removeClass('ev-focus ev-dim');

    if (!evidenceFocus) return;

    const focusColor = EVIDENCE_COLORS[evidenceFocus.type] || '#3b82f6';

    // Resolve which node IDs to highlight.
    // For account-based evidence, supporting_entities contains account IDs.
    // For burst/interaction/density, we highlight ALL nodes (community-wide signal).
    const rawSupport = (evidenceFocus.supporting_entities || []).filter((id) =>
      availableNodeIds.has(id)
    );

    const isAllNodes = rawSupport.length === 0;
    const focusedIds = isAllNodes
      ? new Set<string>(graphData.nodes.map((n) => n.id))
      : new Set<string>(rawSupport);

    // Apply classes
    cy.nodes().forEach((n: any) => {
      if (focusedIds.has(n.id())) {
        n.addClass('ev-focus');
        n.removeClass('ev-dim');
        // Dynamically set color to match evidence type
        n.style({ 'background-color': focusColor, 'border-color': `${focusColor}cc` });
      } else {
        n.removeClass('ev-focus');
        n.addClass('ev-dim');
      }
    });

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

    // Fit to highlighted subgraph (unless it's an all-nodes highlight)
    if (!isAllNodes) {
      try {
        const focusNodes = cy.nodes().filter((n: any) => focusedIds.has(n.id()));
        if (focusNodes.length > 0) cy.fit(focusNodes, 60);
      } catch {}
    } else {
      try { cy.fit(undefined, 40); } catch {}
    }
  }, [evidenceFocus, graphData]);

  // ---------------------------------------------------------------------------
  // Toolbar actions
  // ---------------------------------------------------------------------------
  const handleZoomIn = () => cyRef.current?.zoom(cyRef.current.zoom() * 1.25);
  const handleZoomOut = () => cyRef.current?.zoom(cyRef.current.zoom() * 0.8);
  const handleFit = () => { try { cyRef.current?.fit(undefined, 40); } catch {} };
  const handleReset = useCallback(() => {
    if (!cyRef.current) return;
    cyRef.current.elements().removeClass('ev-focus ev-dim');
    cyRef.current.elements().removeStyle();
    try { cyRef.current.fit(undefined, 40); } catch {}
    onClearFocus?.();
  }, [onClearFocus]);

  const hasFocus = !!evidenceFocus;
  const focusLabel = evidenceFocus ? (EVIDENCE_DISPLAY_LABELS[evidenceFocus.type] || evidenceFocus.type.replace(/_/g, ' ')) : '';
  const focusColor = evidenceFocus ? (EVIDENCE_COLORS[evidenceFocus.type] || '#3b82f6') : '#3b82f6';
  const focusedNodeCount = evidenceFocus
    ? (evidenceFocus.supporting_entities || []).filter((id) => availableNodeIds.has(id)).length
    : 0;

  return (
    <div
      className="dash-card"
      style={{
        display: 'flex',
        flexDirection: 'column',
        position: 'relative',
        overflow: 'hidden',
        border: hasFocus ? `1px solid ${focusColor}50` : '1px solid var(--border)',
        transition: 'border-color 0.25s ease',
      }}
    >
      {/* ------------------------------------------------------------------ */}
      {/* Graph Toolbar                                                        */}
      {/* ------------------------------------------------------------------ */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '10px 16px',
          borderBottom: `1px solid ${hasFocus ? `${focusColor}30` : 'var(--border)'}`,
          backgroundColor: '#050a18',
          fontSize: '12px',
          gap: 12,
          flexWrap: 'wrap',
          transition: 'border-color 0.25s ease',
        }}
      >
        {/* Left: title + stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontWeight: 800, color: 'var(--text-main)', letterSpacing: '0.02em', fontSize: 12 }}>
            Topology Canvas
          </span>
          <span
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: '#162447',
              color: 'var(--accent-cyan)',
              fontSize: '11px',
              fontWeight: 700,
              fontFamily: 'var(--font-mono)',
            }}
          >
            {graphData.nodes.length} nodes · {graphData.edges.length} edges
          </span>
        </div>

        {/* Right: controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          {/* Reset focus */}
          <button
            onClick={handleReset}
            title="Reset view — clear evidence focus"
            disabled={!hasFocus}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px',
              backgroundColor: hasFocus ? 'rgba(239,68,68,0.12)' : '#0f172a',
              border: hasFocus ? '1px solid rgba(239,68,68,0.35)' : '1px solid var(--border-light)',
              borderRadius: '6px',
              color: hasFocus ? '#f87171' : 'var(--text-dim)',
              cursor: hasFocus ? 'pointer' : 'default',
              fontSize: '11px',
              fontWeight: hasFocus ? 700 : 400,
              transition: 'all 0.15s ease',
              opacity: hasFocus ? 1 : 0.5,
            }}
          >
            <RotateCcw size={12} />
            Reset
          </button>

          {/* Layout selector */}
          <select
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value as any)}
            style={{
              backgroundColor: '#0f172a',
              border: '1px solid var(--border-light)',
              color: 'var(--text-main)',
              padding: '5px 10px',
              borderRadius: '6px',
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

          <button onClick={handleZoomIn} title="Zoom In"
            style={{ padding: '5px 8px', backgroundColor: '#0f172a', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <ZoomIn size={13} />
          </button>
          <button onClick={handleZoomOut} title="Zoom Out"
            style={{ padding: '5px 8px', backgroundColor: '#0f172a', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <ZoomOut size={13} />
          </button>
          <button onClick={handleFit} title="Fit to Screen"
            style={{ padding: '5px 8px', backgroundColor: '#0f172a', border: '1px solid var(--border-light)', borderRadius: '6px', color: 'var(--text-muted)', cursor: 'pointer' }}>
            <Maximize2 size={13} />
          </button>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Evidence Focus Context Banner                                        */}
      {/* ------------------------------------------------------------------ */}
      {hasFocus && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            backgroundColor: `${focusColor}0e`,
            borderBottom: `1px solid ${focusColor}28`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ScanSearch size={13} style={{ color: focusColor, flexShrink: 0 }} />
            <span style={{ fontSize: 11, fontWeight: 700, color: focusColor, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Graph Focus:
            </span>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
              {focusLabel}
            </span>
            {focusedNodeCount > 0 && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                · {focusedNodeCount} highlighted account{focusedNodeCount !== 1 ? 's' : ''}
              </span>
            )}
            {focusedNodeCount === 0 && evidenceFocus && (
              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontFamily: 'monospace' }}>
                · community-wide signal
              </span>
            )}
          </div>
          <button
            onClick={() => { handleReset(); }}
            style={{
              padding: '3px 9px',
              borderRadius: 4,
              background: 'transparent',
              border: `1px solid ${focusColor}40`,
              color: focusColor,
              cursor: 'pointer',
              fontSize: 11,
              fontWeight: 600,
            }}
          >
            Clear
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Graph Canvas                                                         */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ position: 'relative', width: '100%', height }}>
        <div ref={containerRef} style={{ width: '100%', height: '100%', backgroundColor: '#030712' }} />

        {/* Legend */}
        <div
          style={{
            position: 'absolute', bottom: 14, left: 14,
            backgroundColor: 'rgba(5,10,24,0.88)',
            backdropFilter: 'blur(8px)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            padding: '9px 13px',
            fontSize: 11,
            color: 'var(--text-muted)',
            display: 'flex', flexDirection: 'column', gap: 5,
            pointerEvents: 'none',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#38bdf8', border: '1px solid #38bdf8', flexShrink: 0 }} />
            <span>Node size = connection degree</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ width: 14, height: 2, backgroundColor: '#38bdf8', flexShrink: 0 }} />
            <span>Edge weight = relationship strength</span>
          </div>
          {hasFocus && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, borderTop: '1px solid rgba(255,255,255,0.07)', paddingTop: 4, marginTop: 2 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: focusColor, flexShrink: 0 }} />
              <span style={{ color: focusColor }}>Evidence: {focusLabel}</span>
            </div>
          )}
        </div>

        {/* Selected Node Side-Card */}
        {selectedNode && (
          <div
            style={{
              position: 'absolute', top: 14, right: 14,
              width: 290,
              backgroundColor: 'var(--bg-panel)',
              border: '1px solid var(--border-light)',
              borderRadius: 6,
              padding: 16,
              display: 'flex', flexDirection: 'column', gap: 12,
              boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Account Node
              </span>
              <button onClick={() => setSelectedNode(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>{selectedNode.id}</span>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{selectedNode.customer_name}</span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 11, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              <div>
                <span style={{ color: 'var(--text-dim)', display: 'block' }}>Degree:</span>
                <span style={{ fontWeight: 700, color: 'var(--text-main)', fontFamily: 'var(--font-mono)' }}>{selectedNode.degree} edges</span>
              </div>
              <div>
                <span style={{ color: 'var(--text-dim)', display: 'block' }}>Balance:</span>
                <span style={{ fontWeight: 700, color: '#34d399', fontFamily: 'var(--font-mono)' }}>${selectedNode.balance?.toLocaleString() || '0.00'}</span>
              </div>
            </div>

            <button
              onClick={() => navigate(`/accounts/${selectedNode.id}`)}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '7px 12px',
                backgroundColor: 'var(--accent)',
                border: '1px solid var(--accent-border)',
                borderRadius: 5,
                color: '#ffffff', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Open Account Profile
              <ExternalLink size={13} />
            </button>
          </div>
        )}

        {/* Selected Edge Side-Card */}
        {selectedEdge && (
          <div
            style={{
              position: 'absolute', top: 14, right: 14,
              width: 320,
              backgroundColor: 'rgba(5,10,24,0.95)',
              backdropFilter: 'blur(12px)',
              border: '1px solid rgba(251,191,36,0.4)',
              borderRadius: 8,
              padding: 16,
              display: 'flex', flexDirection: 'column', gap: 12,
              boxShadow: '0 12px 36px rgba(0,0,0,0.7), 0 0 16px rgba(251,191,36,0.15)',
              zIndex: 10,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 11, fontWeight: 800, color: '#fbbf24', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Evidence Link</span>
              <button onClick={() => setSelectedEdge(null)} style={{ background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 14 }}>✕</button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'monospace' }}>
              <span style={{ color: '#f8fafc', fontWeight: 700 }}>{selectedEdge.source}</span>
              <span style={{ color: 'var(--text-dim)' }}>⇄</span>
              <span style={{ color: '#f8fafc', fontWeight: 700 }}>{selectedEdge.target}</span>
            </div>

            <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', justifyContent: 'space-between' }}>
              <span>Evidence Weight:</span>
              <span style={{ color: '#fbbf24', fontWeight: 700, fontFamily: 'monospace' }}>{selectedEdge.weight.toFixed(2)}</span>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, fontSize: 11, paddingTop: 8, borderTop: '1px solid var(--border)' }}>
              {selectedEdge.shared_instruments.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared Instruments ({selectedEdge.shared_instruments.length}):</span>
                  <div style={{ color: '#fbbf24', fontSize: 10, marginTop: 2, fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedEdge.shared_instruments.join(', ')}</div>
                </div>
              )}
              {selectedEdge.shared_devices.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared Devices ({selectedEdge.shared_devices.length}):</span>
                  <div style={{ color: '#fb7185', fontSize: 10, marginTop: 2, fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedEdge.shared_devices.join(', ')}</div>
                </div>
              )}
              {selectedEdge.shared_ips.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared IPs ({selectedEdge.shared_ips.length}):</span>
                  <div style={{ color: '#c084fc', fontSize: 10, marginTop: 2, fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedEdge.shared_ips.join(', ')}</div>
                </div>
              )}
              {selectedEdge.shared_merchants.length > 0 && (
                <div>
                  <span style={{ color: 'var(--text-dim)' }}>Shared Merchants ({selectedEdge.shared_merchants.length}):</span>
                  <div style={{ color: '#94a3b8', fontSize: 10, marginTop: 2, fontFamily: 'monospace', wordBreak: 'break-all' }}>{selectedEdge.shared_merchants.join(', ')}</div>
                </div>
              )}
              {selectedEdge.temporal_overlap > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-dim)' }}>Same-Day Overlap:</span>
                  <span style={{ color: '#38bdf8', fontWeight: 700, fontFamily: 'monospace' }}>{selectedEdge.temporal_overlap} days</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
