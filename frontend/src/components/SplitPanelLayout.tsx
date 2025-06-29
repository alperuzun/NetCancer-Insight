import React, { useState, useRef, useEffect } from 'react'
import { Panel, PanelGroup, PanelResizeHandle } from 'react-resizable-panels'
import Program from './Program'
import { getSharedGenes, uploadExpressionData } from '../services/api'
import ComparativeAnalysis from './ComparativeAnalysis'
import ExpressionColumnSelectorModal from './ExpressionColumnSelectorModal'
import TargetGraphSelectorModal from './TargetGraphSelectorModal'
import Papa from 'papaparse'

function MenuBar({ onMenuItemClick }: { onMenuItemClick: (menu: string, item: string) => void }) {
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menus = [
    {
      label: 'File',
      items: ['New', 'Add/Remove Panel', 'Add Expression File', 'Open', 'Save']
    },
    {
      label: 'Edit',
      items: ['Undo', 'Redo', 'Cut', 'Copy', 'Paste']
    },
    {
      label: 'Analyze',
      items: ['Search', 'Show Genes', 'Graphlet Analysis', 'Comparative Analysis'],
    },
    {
      label: 'Export',
      items: ['Export as PNG', 'Export as SVG'],
    }
  ];

  return (
    <div ref={menuRef} className="w-full bg-black text-white flex items-center space-x-8 px-8 py-2 select-none" style={{fontFamily: 'system-ui, sans-serif', fontSize: '1.15rem', fontWeight: 500, letterSpacing: '0.01em', position: 'relative', zIndex: 50}}>
      {menus.map(menu => (
        <div key={menu.label} className="relative">
          <span
            className={`px-2 py-1 rounded cursor-pointer transition-colors duration-100 ${openMenu === menu.label ? 'bg-gray-700' : 'hover:bg-gray-700'}`}
            onMouseEnter={() => setOpenMenu(menu.label)}
            onMouseLeave={() => openMenu !== menu.label && setOpenMenu(null)}
            onClick={() => setOpenMenu(openMenu === menu.label ? null : menu.label)}
          >
            {menu.label}
          </span>
          {openMenu === menu.label && (
            <div className="absolute left-0 mt-2 bg-white text-black rounded shadow-lg min-w-[160px] py-2" style={{top: '100%', zIndex: 100}} onMouseLeave={() => setOpenMenu(null)}>
              {menu.items.map(item => (
                <div
                  key={item}
                  className="px-4 py-2 hover:bg-gray-200 cursor-pointer whitespace-nowrap"
                  onClick={() => {
                    setOpenMenu(null);
                    onMenuItemClick(menu.label, item);
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function SplitPanelLayout() {
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Add refs for the Program components
  const program1Ref = useRef<any>(null);
  const program2Ref = useRef<any>(null);

  // Fetch shared genes when both graphs are loaded
  useEffect(() => {
    const fetchSharedGenes = async () => {
      // Only fetch if the second panel is shown and both graphs have been uploaded
      if (showSecond && hasUploaded1 && hasUploaded2) {
        try {
          const res = await getSharedGenes();
          console.log('SplitPanelLayout - Received shared genes:', res.data.genes);
          setSharedGenes(res.data.genes);
        } catch (error) {
          console.error('SplitPanelLayout - Error fetching shared genes:', error);
        }
      }
    };
    fetchSharedGenes();
  }, [showSecond, hasUploaded1, hasUploaded2]); // Depend on whether the second panel is shown and both graphs are uploaded

  const handleShowSharedGenesChange = (panelIndex: number, value: boolean) => {
    console.log(`SplitPanelLayout - Setting showSharedGenes for panel ${panelIndex} to:`, value);
    setShowSharedGenes(prev => {
      const newState = [...prev] as [boolean, boolean];
      newState[panelIndex] = value;
      return newState;
    });
  };

  // Menu action handler
  const handleMenuItemClick = (menu: string, item: string) => {
    if (menu === 'File') {
      if (item === 'New') {
        // Do something for New
      } else if (item === 'Open') {
        // Do something for Open
      } else if (item === 'Add/Remove Panel') {
        setShowSecond(!showSecond)
      } else if (item === 'Add Expression File') {
        if (showSecond) {
          setIsTargetSelectorOpen(true);
        } else {
          setTargetGraphForExpression(0);
          fileInputRef.current?.click();
        }
      }
      // ...etc
    } else if (menu === 'Edit') {
      // ...etc
    } else if (menu === 'Export') {
      if (item === 'Export as PNG') {
        // Check if there are multiple graphs
        if (showSecond && hasUploaded1 && hasUploaded2) {
          setExportType('PNG');
          setIsExportSelectorOpen(true);
        } else {
          // Single graph - export directly
          const activeProgram = program1Ref.current;
          if (activeProgram) {
            activeProgram.handleExportGraph();
          }
        }
      } else if (item === 'Export as SVG') {
        // Check if there are multiple graphs
        if (showSecond && hasUploaded1 && hasUploaded2) {
          setExportType('SVG');
          setIsExportSelectorOpen(true);
        } else {
          // Single graph - export directly
          const activeProgram = program1Ref.current;
          if (activeProgram) {
            activeProgram.exportAsSVG();
          }
        }
      }
    } else if (menu === 'Analyze') {
      if (item === 'Show Genes') {
        setShowGeneList1((v) => !v)
      } else if (item === 'Search') {
        // Handle search if needed, but search bar is already present
      } else if (item === 'Comparative Analysis') {
        setShowComparativeAnalysis(true);
      }
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setCsvColumns(results.meta.fields || []);
          setParsedCsvData(results.data);
          setIsColumnSelectorOpen(true);
        },
      });
      // Reset file input to allow uploading the same file again
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
        const upperCaseGeneName = geneName.toUpperCase();
        expressionData[upperCaseGeneName] = {};
        expressionColumns.forEach(col => {
          const value = parseFloat(row[col]);
          if (!isNaN(value)) {
            expressionData[upperCaseGeneName][col] = value;
          }
        });
      }
    });

    try {
      await uploadExpressionData(targetGraphForExpression, expressionData);
      console.log(`Expression data for graph ${targetGraphForExpression} uploaded successfully.`);
      setExpressionDataVersion(v => v + 1); // Trigger re-fetch
    } catch (error) {
      console.error('Failed to upload expression data:', error);
    }
  };

  const handleTargetGraphSelected = (graphIndex: number) => {
    setTargetGraphForExpression(graphIndex);
    setIsTargetSelectorOpen(false);
    fileInputRef.current?.click();
  };

  const handleExportGraphSelected = (graphIndex: number) => {
    setIsExportSelectorOpen(false);
    
    // Get the selected program
    const selectedProgram = graphIndex === 0 ? program1Ref.current : program2Ref.current;
    
    if (selectedProgram && exportType) {
      if (exportType === 'PNG') {
        selectedProgram.handleExportGraph();
      } else if (exportType === 'SVG') {
        selectedProgram.exportAsSVG();
      }
    }
    
    setExportType(null);
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Menu Bar */}
      <MenuBar onMenuItemClick={handleMenuItemClick} />
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handleFileChange}
        accept=".csv"
      />
      {/* Show "Add Panel" only after the first upload */}
      {/* <div className="flex justify-start p-0 m-0">
        {hasUploaded1 && (
          <button
            onClick={() => setShowSecond((v) => !v)}
            className="bg-green-500 text-white px-4 py-2 rounded m-0"
          >
            {showSecond ? 'Remove Panel' : 'Add Panel'}
          </button>
        )}
      </div> */}

      {/* This container fills the rest of the viewport */}
      <div className="flex-1">
        <PanelGroup direction="horizontal">
          <Panel defaultSize={showSecond ? 50 : 100} minSize={20} order={1}>
            <Program
              ref={program1Ref}
              onUploaded={() => setHasUploaded1(true)}
              paneSplit={showSecond}
              panelIndex={0}
              searchQuery={searchQuery1}
              onSearchChange={setSearchQuery1}
              showGeneList={showGeneList1}
              setShowGeneList={setShowGeneList1}
              sharedGenes={sharedGenes}
              showSharedGenes={showSharedGenes[0]}
              onShowSharedGenesChange={(value) => handleShowSharedGenesChange(0, value)}
              graph={graph1}
              onGraphChange={setGraph1}
              expressionDataVersion={expressionDataVersion}
            />
          </Panel>
          
          {showSecond && (
            <>
              <PanelResizeHandle style={{backgroundColor: "black", width: "4px"}} />
              <Panel defaultSize={50} minSize={20} order={2}>
                <Program
                  ref={program2Ref}
                  onUploaded={() => setHasUploaded2(true)}
                  paneSplit={showSecond}
                  panelIndex={1}
                  searchQuery={searchQuery2}
                  onSearchChange={setSearchQuery2}
                  showGeneList={showGeneList2}
                  setShowGeneList={setShowGeneList2}
                  sharedGenes={sharedGenes}
                  showSharedGenes={showSharedGenes[1]}
                  onShowSharedGenesChange={(value) => handleShowSharedGenesChange(1, value)}
                  graph={graph2}
                  onGraphChange={setGraph2}
                  expressionDataVersion={expressionDataVersion}
                />
              </Panel>
            </>
          )}
        </PanelGroup>
      </div>
      {showComparativeAnalysis && (
        <ComparativeAnalysis
          onClose={() => setShowComparativeAnalysis(false)}
          graph1={graph1}
          graph2={graph2}
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
        onClose={() => {
          setIsExportSelectorOpen(false);
          setExportType(null);
        }}
        onSelect={handleExportGraphSelected}
        title="Select Graph to Export"
        description={`Which graph do you want to export as ${exportType}?`}
        button1Text="Graph 1"
        button2Text="Graph 2"
      />
    </div>
  )
} 