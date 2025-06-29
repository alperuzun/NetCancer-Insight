import React, { useState } from 'react';

interface FilterPanelProps {
  searchValue: string;
  onSearchChange: (value: string) => void;
  minDegree: number;
  maxDegree: number;
  onMinDegreeChange: (value: number) => void;
  onMaxDegreeChange: (value: number) => void;
  showSharedGenes?: boolean;
  onShowSharedGenesChange?: (value: boolean) => void;
  hasSecondGraph?: boolean;
  isFilterTouched: boolean;
  onResetFilter: () => void;
  expressionColumns: string[];
  selectedExpressionColumn: string | null;
  onExpressionColumnChange: (column: string | null) => void;
}

const FilterPanel: React.FC<FilterPanelProps> = ({
  searchValue,
  onSearchChange,
  minDegree,
  maxDegree,
  onMinDegreeChange,
  onMaxDegreeChange,
  showSharedGenes = false,
  onShowSharedGenesChange,
  hasSecondGraph = false,
  isFilterTouched,
  onResetFilter,
  expressionColumns,
  selectedExpressionColumn,
  onExpressionColumnChange,
}) => {
  const [open, setOpen] = useState(true);
  const [expressionsOpen, setExpressionsOpen] = useState(true);

  return (
    <div className="w-64 bg-white rounded shadow border border-gray-200 mb-2" style={{ fontFamily: 'system-ui, sans-serif', fontSize: '1rem' }}>
      <div
        className="flex items-center justify-between px-4 py-2 cursor-pointer bg-gray-100 border-b border-gray-200 rounded-t"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle Filters"
      >
        <span className="font-semibold">Filters</span>
        <svg
          className={`w-4 h-4 ml-2 transition-transform ${open ? '' : 'rotate-180'}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          viewBox="0 0 24 24"
        >
          <path d="M19 9l-7 7-7-7" />
        </svg>
      </div>
      {open && (
        <div className="px-4 py-3">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <input
              type="text"
              value={searchValue}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Enter keyword..."
            />
          </div>
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Degree Range
            </label>
            <div className="flex space-x-2">
              <input
                type="number"
                value={minDegree}
                onChange={(e) => onMinDegreeChange(Number(e.target.value))}
                className="w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Min"
              />
              <input
                type="number"
                value={maxDegree}
                onChange={(e) => onMaxDegreeChange(Number(e.target.value))}
                className="w-1/2 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Max"
              />
            </div>
          </div>
          {hasSecondGraph && onShowSharedGenesChange && (
            <div className="mb-4">
              <label className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  checked={showSharedGenes}
                  onChange={(e) => onShowSharedGenesChange(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <span className="text-sm font-medium text-gray-700">Show Shared Genes</span>
              </label>
            </div>
          )}

          {/* Expression Controls */}
          {expressionColumns.length > 0 && (
            <div className="border-t border-gray-200 mt-4 pt-3">
              <div
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setExpressionsOpen(!expressionsOpen)}
              >
                <h3 className="text-sm font-medium text-gray-700">Expressions</h3>
                <svg
                  className={`w-4 h-4 ml-2 transition-transform ${expressionsOpen ? '' : 'rotate-180'}`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  viewBox="0 0 24 24"
                >
                  <path d="M19 9l-7 7-7-7" />
                </svg>
              </div>
              {expressionsOpen && (
                <div className="mt-2 space-y-2">
                  <label className="flex items-center space-x-2">
                    <input
                      type="radio"
                      name="expression-column"
                      checked={selectedExpressionColumn === null}
                      onChange={() => onExpressionColumnChange(null)}
                      className="rounded-full border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-600">None</span>
                  </label>
                  {expressionColumns.map(col => (
                    <label key={col} className="flex items-center space-x-2">
                      <input
                        type="radio"
                        name="expression-column"
                        value={col}
                        checked={selectedExpressionColumn === col}
                        onChange={() => onExpressionColumnChange(col)}
                        className="rounded-full border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-600">{col}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {isFilterTouched && (
            <div className="mt-4">
              <button
                onClick={onResetFilter}
                className="w-full bg-red-500 text-white px-3 py-2 rounded-md hover:bg-red-600 focus:outline-none focus:ring-2 focus:ring-red-500"
              >
                Reset Filter
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FilterPanel; 