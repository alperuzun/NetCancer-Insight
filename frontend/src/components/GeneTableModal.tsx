import React, { useState } from 'react';
import { useReactTable, getCoreRowModel, flexRender, createColumnHelper } from '@tanstack/react-table';
import { getGeneEnrichment } from '../services/api'; // Import the API function

type GeneTableModalProps = {
  genes: string[];
  onClose: () => void;
  onSelectGene: (gene: string) => void;
};

type GeneData = {
  gene: string;
};

// Define a type for the enrichment data
interface EnrichmentData {
  source: string;
  term_id: string;
  term_name: string;
}

const columnHelper = createColumnHelper<GeneData>();

const columns = [
  columnHelper.accessor('gene', {
    header: () => 'Gene',
    cell: info => info.getValue(),
  }),
];

export default function GeneTableModal({ genes, onClose, onSelectGene }: GeneTableModalProps) {
  // State to store enrichment data, keyed by gene symbol
  const [enrichmentData, setEnrichmentData] = useState<Record<string, EnrichmentData[]>>({});
  // State to track which gene's enrichment is currently expanded
  const [expandedGene, setExpandedGene] = useState<string | null>(null);

  // Map gene strings to objects with a 'gene' property for the table data
  const data: GeneData[] = React.useMemo(
    () => genes.map(gene => ({ gene })), [genes]
  );

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  const handleGeneClick = async (gene: string) => {
    // Call the original onSelectGene prop
    onSelectGene(gene);

    // Toggle expansion
    if (expandedGene === gene) {
      setExpandedGene(null);
    } else {
      setExpandedGene(gene);
      // Fetch enrichment data only if not already loaded
      if (!enrichmentData[gene]) {
        try {
          const response = await getGeneEnrichment(gene);
          setEnrichmentData(prevData => ({
            ...prevData,
            [gene]: response.data.results // Store the fetched data
          }));
        } catch (error) {
          console.error(`Error fetching enrichment data for ${gene}:`, error);
          // Optionally store an error state or empty array to avoid refetching
          setEnrichmentData(prevData => ({
            ...prevData,
            [gene]: [] // Store empty array on error
          }));
        }
      }
    }
  };

  return (
    // Modal backdrop
    <div className="fixed inset-0 z-1000 flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
      {/* Modal content */}
      <div className="bg-white p-4 rounded-lg shadow-lg z-50 w-11/12 max-w-2xl max-h-[80vh] flex flex-col">
        {/* Modal header */}
        <div className="flex justify-between items-center border-b pb-2 mb-2">
          <h2 className="text-xl font-bold text-black">Gene List</h2>
          <button onClick={onClose} className="text-red-500 font-bold text-2xl leading-none bg-transparent border-none cursor-pointer">
            &times;
          </button>
        </div>

        {/* Table Container (scrollable) */}
        <div className="overflow-y-auto flex-grow">
          <table className="w-full text-black">
            <thead>
              {table.getHeaderGroups().map(headerGroup => (
                <tr key={headerGroup.id}>
                  {headerGroup.headers.map(header => (
                    <th key={header.id} className="px-4 py-2 text-left">
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.map(row => (
                <React.Fragment key={row.id}> {/* Use Fragment to wrap multiple rows */}
                  <tr
                    onClick={() => handleGeneClick((row.original as GeneData).gene)}
                    className="cursor-pointer hover:bg-gray-100"
                  >
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="border px-4 py-2">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>{/* Enrichment data row (conditionally rendered) */}
                  {expandedGene === (row.original as GeneData).gene && enrichmentData[expandedGene] && (
                    <tr>
                      <td colSpan={columns.length} className="border px-4 py-2 bg-gray-50">
                        <h3 className="font-semibold">Enrichment Data:</h3>
                        {enrichmentData[expandedGene].length > 0 ? (
                          <ul className="list-disc list-inside">
                            {enrichmentData[expandedGene].map((item, index) => (
                              <li key={index}>
                                <strong>{item.source}:</strong> {item.term_name} ({item.term_id})
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p>No enrichment data found for this gene.</p>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
} 