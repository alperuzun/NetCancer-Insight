
type InteractionData = {
  gene1: string;
  gene2: string;
  sources: string[];
};

type DraggableInteractionInfoProps = {
  onClose: () => void;
  interactionData?: InteractionData;
};

export default function DraggableInteractionInfo({ onClose, interactionData }: DraggableInteractionInfoProps) {
  return (
    <div className="fixed inset-0 z-[1000] flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
      <div className="bg-white p-4 rounded-lg shadow-lg w-11/12 max-w-sm max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center border-b pb-2 mb-2">
          <h2 className="text-xl font-bold text-black">Interaction Information</h2>
          <button onClick={onClose} className="text-red-500 font-bold text-2xl leading-none bg-transparent border-none cursor-pointer">
            &times;
          </button>
        </div>
        <div className="overflow-y-auto flex-grow text-black">
          {interactionData ? (
            <div className="space-y-2">
              <p><span className="font-semibold">Gene 1:</span> {interactionData.gene1}</p>
              <p><span className="font-semibold">Gene 2:</span> {interactionData.gene2}</p>
              <div>
                <p className="font-semibold mb-1">Interaction Sources:</p>
                {interactionData.sources.length > 0 ? (
                  <ul className="list-disc pl-5">
                    {interactionData.sources.map((source, index) => (
                      <li key={index}>{source}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-gray-500">No interaction sources found</p>
                )}
              </div>
            </div>
          ) : (
            <p>Loading interaction information...</p>
          )}
        </div>
      </div>
    </div>
  );
} 