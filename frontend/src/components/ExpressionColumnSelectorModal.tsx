import React, { useState, useEffect } from 'react';

interface ExpressionColumnSelectorModalProps {
  columns: string[];
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (selection: { expressionColumns: string[]; geneColumn: string }) => void;
}

const ExpressionColumnSelectorModal: React.FC<ExpressionColumnSelectorModalProps> = ({
  columns,
  isOpen,
  onClose,
  onConfirm,
}) => {
  const [selectedExpressionColumns, setSelectedExpressionColumns] = useState<string[]>([]);
  const [selectedGeneColumn, setSelectedGeneColumn] = useState<string | null>(null);

  // Reset state when modal is opened with new columns
  useEffect(() => {
    if (isOpen) {
      setSelectedExpressionColumns([]);
      setSelectedGeneColumn(null);
    }
  }, [isOpen]);

  const handleCheckboxChange = (column: string) => {
    setSelectedExpressionColumns(prev =>
      prev.includes(column) ? prev.filter(c => c !== column) : [...prev, column]
    );
  };

  const handleConfirm = () => {
    if (selectedGeneColumn) {
      onConfirm({
        expressionColumns: selectedExpressionColumns,
        geneColumn: selectedGeneColumn,
      });
      onClose();
    }
  };

  if (!isOpen) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-1000 flex justify-center items-center">
      <div className="bg-white p-6 rounded-lg shadow-xl w-1/2 max-w-2xl">
        <div className="grid grid-cols-2 gap-8">
          {/* Part 1: Select Expression Columns */}
          <div>
            <h2 className="text-xl font-bold mb-4">Select Expression Columns</h2>
            <p className="mb-4 text-gray-600">Select one or more columns that contain expression values.</p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-6 border p-3 rounded-md">
              {columns.map(column => (
                <label key={`expr-${column}`} className="flex items-center space-x-3 p-2 rounded hover:bg-gray-100 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedExpressionColumns.includes(column)}
                    onChange={() => handleCheckboxChange(column)}
                    className="h-5 w-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-800">{column}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Part 2: Select Gene Identifier Column */}
          <div>
            <h2 className="text-xl font-bold mb-4">Select Gene Identifier Column</h2>
            <p className="mb-4 text-gray-600">Select the column that contains the gene names.</p>
            <div className="space-y-2 max-h-60 overflow-y-auto mb-6 border p-3 rounded-md">
              {columns.map(column => (
                <label key={`gene-${column}`} className="flex items-center space-x-3 p-2 rounded hover:bg-gray-100 cursor-pointer">
                  <input
                    type="radio"
                    name="gene-column-selector"
                    checked={selectedGeneColumn === column}
                    onChange={() => setSelectedGeneColumn(column)}
                    className="h-5 w-5 border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-800">{column}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        <div className="flex justify-end space-x-4 mt-4">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded text-gray-700 bg-gray-200 hover:bg-gray-300"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="px-4 py-2 rounded text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300"
            disabled={selectedExpressionColumns.length === 0 || !selectedGeneColumn}
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpressionColumnSelectorModal; 