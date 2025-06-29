import React from 'react';

interface TargetGraphSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (graphIndex: number) => void;
  title?: string;
  description?: string;
  button1Text?: string;
  button2Text?: string;
}

const TargetGraphSelectorModal: React.FC<TargetGraphSelectorModalProps> = ({ 
  isOpen, 
  onClose, 
  onSelect, 
  title = "Select Graph",
  description = "Which graph do you want to add expression data to?",
  button1Text = "Graph 1",
  button2Text = "Graph 2"
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-5000 flex justify-center items-center">
      <div className="bg-white p-6 rounded-lg shadow-xl w-auto min-w-[300px]">
        <h2 className="text-xl font-bold mb-4 text-center">{title}</h2>
        <p className="mb-6 text-gray-600 text-center">{description}</p>
        <div className="flex justify-around space-x-4">
          <button 
            onClick={() => onSelect(0)} 
            className="px-6 py-3 rounded text-white bg-blue-600 hover:bg-blue-700 w-full"
          >
            {button1Text}
          </button>
          <button 
            onClick={() => onSelect(1)} 
            className="px-6 py-3 rounded text-white bg-green-600 hover:bg-green-700 w-full"
          >
            {button2Text}
          </button>
        </div>
        <div className="flex justify-center mt-4">
           <button onClick={onClose} className="text-sm text-gray-500 hover:underline">Cancel</button>
        </div>
      </div>
    </div>
  );
};

export default TargetGraphSelectorModal; 