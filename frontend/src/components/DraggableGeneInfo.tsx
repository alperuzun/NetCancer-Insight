import { useState } from 'react';
// Import Rnd from react-rnd
import { Rnd } from 'react-rnd';

type Props = {
  gene: string
  data: any
  onClose: () => void
}

export default function DraggableGeneInfo({ gene, data, onClose }: Props) {
  // State for position and size (managed by Rnd)
  const [bounds, setBounds] = useState({
    x: 100,
    y: 100,
    width: 400,
    height: 300,
  });

  // State to manage the open/closed state of each dropdown
  const [openDropdowns, setOpenDropdowns] = useState<{ [key: string]: boolean }>({});

  // Function to toggle dropdown state
  const toggleDropdown = (key: string) => {
    setOpenDropdowns(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    // Use Rnd component from react-rnd
    <Rnd
      size={{ width: bounds.width, height: bounds.height }}
      position={{ x: bounds.x, y: bounds.y }}
      onDragStop={(_e, d) => {
        setBounds(prevBounds => ({
          ...prevBounds,
          x: d.x,
          y: d.y,
        }));
      }}
      onResizeStop={(_e, _direction, ref, _delta, position) => {
        setBounds({
          width: ref.offsetWidth,
          height: ref.offsetHeight,
          ...position,
        });
      }}
      // min/max constraints using react-rnd props
      minWidth={250}
      minHeight={150}
      maxWidth={800}
      maxHeight={600}
      // Apply Tailwind classes for styling
      className="bg-white border border-gray-300 rounded-lg shadow-lg flex flex-col"
      // Add padding to an inner div instead of the Rnd component itself
      style={{ zIndex: 50, overflow: 'auto' }}
    >
      {/* Inner container for padding and content */}
      <div className="p-3 flex flex-col flex-grow">
        {/* Header with gene name and close button */}
        {/* cursor-grab indicates draggable area */}
        <div className="flex justify-between items-center pb-2 cursor-grab">
          <h2 className="text-black text-lg font-bold m-0">{gene}</h2>
          <button onClick={onClose} className="text-red-500 font-bold bg-transparent border-none cursor-pointer p-1 leading-none">
            ×
          </button>
        </div>

        {/* Gene Information Section */}
        <div className="text-black text-base font-bold mt-2 mb-1">Gene Information:</div>

        {/* Data Dropdowns Container (scrollable) */}
        {data ? (
            <div className="flex-grow overflow-y-auto">
              {Object.entries(data).map(([key, value], _index) => (
                  <div key={key} className="border-b border-gray-200 py-2">
                      <div
                          className="flex justify-between items-center cursor-pointer font-bold text-black"
                          onClick={() => toggleDropdown(key)}
                      >
                          <span>{key.replace(/_/g, ' ').toUpperCase()}</span>
                          <span>{openDropdowns[key] ? '▲' : '▼'}</span>
                      </div>
                      {openDropdowns[key] && (
                          <div className="mt-2 pl-4 text-sm text-gray-700">
                              {Array.isArray(value) ? (
                                  <ul className="list-disc pl-5 mt-1">
                                      {value.map((item, idx) => <li key={idx}>{item}</li>)}
                                  </ul>
                              ) : (
                                  <p className="m-0">{String(value)}</p>
                              )}
                          </div>
                      )}
                  </div>
              ))}
      </div>
        ) : (
            <div className="text-sm text-black flex-grow overflow-y-auto">Gene not found in annotation database.</div>
        )}
      </div>
    </Rnd>
  )
}
