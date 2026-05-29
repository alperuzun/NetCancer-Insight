import React, { useState, useRef, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import {
  Network, Settings, Sun, Moon,
  BarChart2, FileUp, X, Save, FolderOpen,
} from 'lucide-react'
import Program from './Program'
import { getSharedGenes, uploadExpressionData, promoteGraph } from '../services/api'
import ComparativeAnalysis from './ComparativeAnalysis'
import ExpressionColumnSelectorModal from './ExpressionColumnSelectorModal'
import TargetGraphSelectorModal from './TargetGraphSelectorModal'
import LLMSettingsModal from './LLMSettingsModal'
import Papa from 'papaparse'
import { useTheme } from '../context/ThemeContext'

// ── Sidebar ───────────────────────────────────────────────────────────────────

interface SidebarItemProps {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  onClick: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}

function SidebarItem({ icon, label, active, onClick, colors }: SidebarItemProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div className="relative flex items-center" style={{ marginBottom: 2 }}>
      {/* Active indicator */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: '50%',
          transform: 'translateY(-50%)',
          width: 3,
          height: active ? 24 : 0,
          borderRadius: '0 3px 3px 0',
          background: colors.accent,
          transition: 'height 0.15s ease',
        }}
      />
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 52,
          height: 52,
          borderRadius: 10,
          marginLeft: 6,
          border: 'none',
          cursor: 'pointer',
          color: active ? colors.accent : hovered ? colors.textPrimary : colors.textMuted,
          background: active ? colors.bgActive : hovered ? colors.bgHover : 'transparent',
          transition: 'all 0.15s ease',
        }}
        title={label}
      >
        {icon}
      </button>
      {/* Tooltip */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            left: 56,
            top: '50%',
            transform: 'translateY(-50%)',
            background: colors.bgPanel,
            color: colors.textPrimary,
            border: `1px solid ${colors.border}`,
            borderRadius: 8,
            padding: '5px 10px',
            fontSize: 12,
            fontWeight: 500,
            whiteSpace: 'nowrap',
            zIndex: 1000,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
            pointerEvents: 'none',
          }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

// ── Main layout ───────────────────────────────────────────────────────────────

export default function SplitPanelLayout() {
  const { mode, colors, toggle } = useTheme();

  // Panel state
  const [hasUploaded1, setHasUploaded1] = useState(false)
  const [hasUploaded2, setHasUploaded2] = useState(false)
  const [showSecond, setShowSecond] = useState(false)
  const [searchQuery1, setSearchQuery1] = useState('')
  const [searchQuery2, setSearchQuery2] = useState('')
  const [showGeneList1, setShowGeneList1] = useState(false);
  const [showGeneList2, setShowGeneList2] = useState(false);
  const [sharedGenes, setSharedGenes] = useState<string[]>([]);
  const [showSharedGenes, setShowSharedGenes] = useState<[boolean, boolean]>([false, false]);
  const [graph1, setGraph1] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [graph2, setGraph2] = useState<{ nodes: any[]; links: any[] }>({ nodes: [], links: [] });
  const [showComparativeAnalysis, setShowComparativeAnalysis] = useState(false);
  const [isColumnSelectorOpen, setIsColumnSelectorOpen] = useState(false);
  const [csvColumns, setCsvColumns] = useState<string[]>([]);
  const [parsedCsvData, setParsedCsvData] = useState<any[]>([]);
  const [isTargetSelectorOpen, setIsTargetSelectorOpen] = useState(false);
  const [targetGraphForExpression, setTargetGraphForExpression] = useState<number | null>(null);
  const [expressionDataVersion, setExpressionDataVersion] = useState(0);
  const [isExportSelectorOpen, setIsExportSelectorOpen] = useState(false);
  const [exportType, setExportType] = useState<'PNG' | 'SVG' | null>(null);
  const [showLLMSettings, setShowLLMSettings] = useState(false);
  const [sim1Running, setSim1Running] = useState(false);
  const [sim2Running, setSim2Running] = useState(false);
  const simRunning = sim1Running || (showSecond && sim2Running);

  // Sidebar active section
  const [activeSection, setActiveSection] = useState<'analyze' | 'settings'>('analyze');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionInputRef = useRef<HTMLInputElement>(null);
  const program1Ref = useRef<any>(null);
  const program2Ref = useRef<any>(null);

  // Fetch shared genes
  useEffect(() => {
    if (showSecond && hasUploaded1 && hasUploaded2) {
      getSharedGenes()
        .then(res => setSharedGenes(res.data.genes))
        .catch(() => {});
    }
  }, [showSecond, hasUploaded1, hasUploaded2]);

  const handleShowSharedGenesChange = (panelIndex: number, value: boolean) => {
    setShowSharedGenes(prev => {
      const n = [...prev] as [boolean, boolean];
      n[panelIndex] = value;
      return n;
    });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true, skipEmptyLines: true,
        complete: (results) => {
          setCsvColumns(results.meta.fields || []);
          setParsedCsvData(results.data);
          setIsColumnSelectorOpen(true);
        },
      });
      event.target.value = '';
    }
  };

  const handleColumnSelectionConfirm = async (selection: { expressionColumns: string[]; geneColumn: string }) => {
    if (targetGraphForExpression === null) return;
    const { expressionColumns, geneColumn } = selection;
    const expressionData: { [gene: string]: { [exprCol: string]: number } } = {};
    parsedCsvData.forEach(row => {
      const geneName = row[geneColumn];
      if (geneName) {
        const upper = geneName.toUpperCase();
        expressionData[upper] = {};
        expressionColumns.forEach(col => {
          const value = parseFloat(row[col]);
          if (!isNaN(value)) expressionData[upper][col] = value;
        });
      }
    });
    try {
      await uploadExpressionData(targetGraphForExpression, expressionData);
      setExpressionDataVersion(v => v + 1);
    } catch {}
  };

  const handleTargetGraphSelected = (graphIndex: number) => {
    setTargetGraphForExpression(graphIndex);
    setIsTargetSelectorOpen(false);
    fileInputRef.current?.click();
  };

  const handleExportGraphSelected = (graphIndex: number) => {
    setIsExportSelectorOpen(false);
    const prog = graphIndex === 0 ? program1Ref.current : program2Ref.current;
    if (prog && exportType) {
      exportType === 'PNG' ? prog.handleExportGraph() : prog.exportAsSVG();
    }
    setExportType(null);
  };

  // ── Session save / load ───────────────────────────────────────────────────────

  const handleSaveSession = () => {
    const session = { version: 1, timestamp: new Date().toISOString(), showSecond, graph1, graph2 };
    const blob = new Blob([JSON.stringify(session)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netcancer-session-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleLoadSession = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const session = JSON.parse(ev.target?.result as string);
        if (session.version === 1) {
          // Pin nodes at their saved positions so the physics sim doesn't scatter them
          const pinNodes = (g: { nodes: any[]; links: any[] }) => ({
            ...g,
            nodes: g.nodes.map((n: any) => ({ ...n, fx: n.x, fy: n.y })),
          });
          if (session.graph1) {
            const g1 = pinNodes(session.graph1);
            setGraph1(g1);
            setHasUploaded1(g1.nodes.length > 0);
          }
          if (session.graph2) {
            const g2 = pinNodes(session.graph2);
            setGraph2(g2);
            setHasUploaded2(g2.nodes.length > 0);
          }
          setShowSecond(session.showSecond ?? false);
        }
      } catch {}
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  // ── Subgraph handler ─────────────────────────────────────────────────────────

  const handleSubgraphCreate = (panelIdx: number) => (subgraph: { nodes: any[]; links: any[] }) => {
    if (panelIdx === 0) {
      // panel 1's subgraph → load into panel 2
      setGraph2(subgraph);
      setHasUploaded2(subgraph.nodes.length > 0);
      setShowSecond(true);
    } else {
      // panel 2's subgraph → load into panel 1
      setGraph1(subgraph);
      setHasUploaded1(subgraph.nodes.length > 0);
    }
  };

  // ── Panel close ──────────────────────────────────────────────────────────────

  const handleClosePanel = async (panelIdx: 0 | 1) => {
    if (panelIdx === 1) {
      setShowSecond(false);
      setHasUploaded2(false);
      setGraph2({ nodes: [], links: [] });
      setSearchQuery2('');
      setShowGeneList2(false);
      setShowSharedGenes(prev => [prev[0], false]);
      setSharedGenes([]);
    } else {
      // Panel 1 closed: promote Panel 2 into slot 0 on the backend, then mirror in UI
      try { await promoteGraph(); } catch {}
      setGraph1(graph2);
      setHasUploaded1(hasUploaded2);
      setSearchQuery1('');
      setShowGeneList1(false);
      setGraph2({ nodes: [], links: [] });
      setHasUploaded2(false);
      setSearchQuery2('');
      setShowGeneList2(false);
      setShowSecond(false);
      setShowSharedGenes([false, false]);
      setSharedGenes([]);
    }
  };

  // ── Sidebar actions ──────────────────────────────────────────────────────────

  const addExpressionFile = () => {
    if (showSecond) setIsTargetSelectorOpen(true);
    else { setTargetGraphForExpression(0); fileInputRef.current?.click(); }
  };

  const doExportPNG = () => {
    if (showSecond && hasUploaded1 && hasUploaded2) { setExportType('PNG'); setIsExportSelectorOpen(true); }
    else program1Ref.current?.handleExportGraph();
  };

  const doExportSVG = () => {
    if (showSecond && hasUploaded1 && hasUploaded2) { setExportType('SVG'); setIsExportSelectorOpen(true); }
    else program1Ref.current?.exportAsSVG();
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  const SIDEBAR_W = 60;

  return (
    <div
      className="h-screen flex"
      style={{ background: colors.bgBase, color: colors.textPrimary, fontFamily: 'system-ui, -apple-system, sans-serif' }}
    >
      {/* ── Left sidebar ─────────────────────────────────────────────────────── */}
      <aside
        style={{
          width: SIDEBAR_W,
          minWidth: SIDEBAR_W,
          background: colors.sidebarBg,
          borderRight: `1px solid ${colors.sidebarBorder}`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 12,
          paddingBottom: 12,
          zIndex: 50,
        }}
      >
        {/* Logo */}
        <div
          style={{
            width: 40,
            height: 40,
            borderRadius: 11,
            background: `linear-gradient(135deg, ${colors.accent}, #818cf8)`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 20,
            flexShrink: 0,
          }}
        >
          <Network size={20} color="#fff" />
        </div>

        {/* Nav items */}
        <div style={{ flex: 1, width: '100%' }}>
          <SidebarItem
            icon={<Network size={26} />}
            label="Network Analysis"
            active={activeSection === 'analyze'}
            onClick={() => setActiveSection('analyze')}
            colors={colors}
          />
          <SidebarItem
            icon={<BarChart2 size={26} />}
            label={showSecond ? 'Remove Panel' : 'Add Panel'}
            onClick={showSecond ? () => handleClosePanel(1) : () => setShowSecond(true)}
            colors={colors}
          />
          <SidebarItem
            icon={<FileUp size={26} />}
            label="Add Expression Data"
            onClick={addExpressionFile}
            colors={colors}
          />
        </div>

        {/* Bottom actions */}
        <div style={{ width: '100%' }}>
          <SidebarItem
            icon={<Save size={26} />}
            label="Save Session"
            onClick={handleSaveSession}
            colors={colors}
          />
          <SidebarItem
            icon={<FolderOpen size={26} />}
            label="Load Session"
            onClick={() => sessionInputRef.current?.click()}
            colors={colors}
          />
          <SidebarItem
            icon={<Settings size={26} />}
            label="LLM Settings"
            active={activeSection === 'settings'}
            onClick={() => { setActiveSection('settings'); setShowLLMSettings(true); }}
            colors={colors}
          />
          <SidebarItem
            icon={mode === 'dark' ? <Sun size={26} /> : <Moon size={26} />}
            label={mode === 'dark' ? 'Light mode' : 'Dark mode'}
            onClick={toggle}
            colors={colors}
          />
        </div>
      </aside>

      {/* ── Main content ─────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Top bar */}
        <header
          style={{
            height: 44,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 16px',
            background: colors.bgPanel,
            borderBottom: `1px solid ${colors.border}`,
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: colors.textMuted, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            NetCancer Insight
          </span>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {hasUploaded1 && <TopBarBtn label="Export PNG" onClick={doExportPNG} colors={colors} disabled={simRunning} />}
            {hasUploaded1 && <TopBarBtn label="Export SVG" onClick={doExportSVG} colors={colors} disabled={simRunning} />}
            {showSecond && hasUploaded1 && hasUploaded2 && (
              <TopBarBtn label="Comparative Analysis" onClick={() => setShowComparativeAnalysis(true)} colors={colors} />
            )}
          </div>
        </header>

        {/* Panel area */}
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={showSecond ? 50 : 100} minSize={20} order={1}>
              <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                {showSecond && (
                  <PanelLabel label="Panel 1" onClose={() => handleClosePanel(0)} colors={colors} />
                )}
                <Program
                  ref={program1Ref}
                  onUploaded={() => { setHasUploaded1(true); setExpressionDataVersion(v => v + 1); }}
                  paneSplit={showSecond}
                  panelIndex={0}
                  searchQuery={searchQuery1}
                  onSearchChange={setSearchQuery1}
                  showGeneList={showGeneList1}
                  setShowGeneList={setShowGeneList1}
                  sharedGenes={sharedGenes}
                  showSharedGenes={showSharedGenes[0]}
                  onShowSharedGenesChange={v => handleShowSharedGenesChange(0, v)}
                  graph={graph1}
                  onGraphChange={setGraph1}
                  expressionDataVersion={expressionDataVersion}
                  onSubgraphCreate={handleSubgraphCreate(0)}
                  onSimulationChange={setSim1Running}
                />
              </div>
            </Panel>

            {showSecond && (
              <>
                <PanelResizeHandle
                  style={{
                    width: 4,
                    background: colors.border,
                    cursor: 'col-resize',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => ((e.currentTarget as unknown as HTMLDivElement).style.background = colors.accent)}
                  onMouseLeave={e => ((e.currentTarget as unknown as HTMLDivElement).style.background = colors.border)}
                />
                <Panel defaultSize={50} minSize={20} order={2}>
                  <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                    <PanelLabel label="Panel 2" onClose={() => handleClosePanel(1)} colors={colors} />
                    <Program
                      ref={program2Ref}
                      onUploaded={() => { setHasUploaded2(true); setExpressionDataVersion(v => v + 1); }}
                      paneSplit={showSecond}
                      panelIndex={1}
                      searchQuery={searchQuery2}
                      onSearchChange={setSearchQuery2}
                      showGeneList={showGeneList2}
                      setShowGeneList={setShowGeneList2}
                      sharedGenes={sharedGenes}
                      showSharedGenes={showSharedGenes[1]}
                      onShowSharedGenesChange={v => handleShowSharedGenesChange(1, v)}
                      graph={graph2}
                      onGraphChange={setGraph2}
                      expressionDataVersion={expressionDataVersion}
                      onSubgraphCreate={handleSubgraphCreate(1)}
                      onSimulationChange={setSim2Running}
                    />
                  </div>
                </Panel>
              </>
            )}
          </PanelGroup>
        </div>
      </div>

      {/* Hidden file inputs */}
      <input type="file" ref={fileInputRef} style={{ display: 'none' }} onChange={handleFileChange} accept=".csv" />
      <input type="file" ref={sessionInputRef} style={{ display: 'none' }} onChange={handleLoadSession} accept=".json" />

      {/* Comparative Analysis drawer — fixed right panel, non-blocking */}
      {showComparativeAnalysis && (
        <ComparativeAnalysis
          onClose={() => setShowComparativeAnalysis(false)}
          graph1={graph1}
          graph2={graph2}
          onHubGeneClick={(gene) => {
            program1Ref.current?.selectGene?.(gene);
            program2Ref.current?.selectGene?.(gene);
          }}
        />
      )}
      <ExpressionColumnSelectorModal
        columns={csvColumns}
        isOpen={isColumnSelectorOpen}
        onClose={() => setIsColumnSelectorOpen(false)}
        onConfirm={handleColumnSelectionConfirm}
      />
      <TargetGraphSelectorModal
        isOpen={isTargetSelectorOpen}
        onClose={() => setIsTargetSelectorOpen(false)}
        onSelect={handleTargetGraphSelected}
      />
      <TargetGraphSelectorModal
        isOpen={isExportSelectorOpen}
        onClose={() => { setIsExportSelectorOpen(false); setExportType(null); }}
        onSelect={handleExportGraphSelected}
        title="Select Graph to Export"
        description={`Which graph do you want to export as ${exportType}?`}
        button1Text="Graph 1"
        button2Text="Graph 2"
      />
      <LLMSettingsModal isOpen={showLLMSettings} onClose={() => { setShowLLMSettings(false); setActiveSection('analyze'); }} />
    </div>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────

function TopBarBtn({ label, onClick, colors, disabled }: { label: string; onClick: () => void; colors: ReturnType<typeof useTheme>['colors']; disabled?: boolean }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={disabled ? undefined : onClick}
      onMouseEnter={() => !disabled && setHov(true)}
      onMouseLeave={() => setHov(false)}
      title={disabled ? 'Waiting for physics to settle…' : undefined}
      style={{
        fontSize: 12,
        fontWeight: 500,
        padding: '4px 10px',
        borderRadius: 6,
        border: `1px solid ${colors.border}`,
        background: hov && !disabled ? colors.bgHover : 'transparent',
        color: disabled ? colors.textMuted : colors.textMuted,
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'all 0.15s',
      }}
    >
      {label}
    </button>
  );
}

function PanelLabel({ label, onClose, colors }: {
  label: string;
  onClose: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}) {
  return (
    <div
      style={{
        padding: '4px 8px 4px 12px',
        fontSize: 11,
        fontWeight: 600,
        color: colors.textFaint,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        background: colors.bgPanel,
        borderBottom: `1px solid ${colors.border}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}
    >
      {label}
      <button
        onClick={onClose}
        title="Close panel"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: colors.textMuted,
          padding: '2px 4px',
          borderRadius: 4,
          display: 'flex',
          alignItems: 'center',
          transition: 'color 0.15s',
        }}
      >
        <X size={12} />
      </button>
    </div>
  );
}
