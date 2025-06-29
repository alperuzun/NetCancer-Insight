import { useState, useEffect } from 'react';
import { Radar } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend,
} from 'chart.js';
import { getComparativeAnalysis } from '../services/api';

ChartJS.register(
  RadialLinearScale,
  PointElement,
  LineElement,
  Filler,
  Tooltip,
  Legend
);

type ComparativeAnalysisProps = {
  onClose: () => void;
  graph1: { nodes: any[]; links: any[] } | null;
  graph2: { nodes: any[]; links: any[] } | null;
};

export default function ComparativeAnalysis({ onClose, graph1, graph2 }: ComparativeAnalysisProps) {
  const [analysisData, setAnalysisData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchAnalysis = async () => {
      if (graph1 && graph2) {
        setLoading(true);
        setError(null);
        try {
          const response = await getComparativeAnalysis(0, 1); // Assuming graph indices 0 and 1
          setAnalysisData(response.data);
        } catch (err) {
          console.error('Error fetching comparative analysis:', err);
          setError('Failed to fetch comparative analysis data.');
        } finally {
          setLoading(false);
        }
      }
    };
    fetchAnalysis();
  }, [graph1, graph2]);

  // Calculate the maximum value from all metrics
  const calculateMaxValue = () => {
    if (!analysisData) return 1;

    const allValues = [
      ...analysisData.normalized_metrics1,
      ...analysisData.normalized_metrics2,
    ].filter(value => typeof value === 'number');

    if (allValues.length === 0) return 1;

    const maxValue = Math.max(...allValues);
    // Round up to the nearest tenth
    return Math.ceil(maxValue * 10) / 10;
  };

  const radarChartData = analysisData ? {
    labels: analysisData.metric_labels,
    datasets: [
      {
        label: 'Graph 1',
        data: analysisData.normalized_metrics1,
        backgroundColor: 'rgba(255, 99, 132, 0.2)',
        borderColor: 'rgba(255, 99, 132, 1)',
        borderWidth: 1,
      },
      {
        label: 'Graph 2',
        data: analysisData.normalized_metrics2,
        backgroundColor: 'rgba(54, 162, 235, 0.2)',
        borderColor: 'rgba(54, 162, 235, 1)',
        borderWidth: 1,
      },
    ],
  } : { labels: [], datasets: [] };

  const radarChartOptions = {
    scales: {
      r: {
        angleLines: { display: false },
        suggestedMin: 0,
        suggestedMax: calculateMaxValue(),
        ticks: { 
          backdropColor: 'rgba(255, 255, 255, 0)', 
          color: 'black',
          stepSize: calculateMaxValue() / 5 // Divide the max value into 5 steps
        },
        grid: { color: 'rgba(0, 0, 0, 0.1)' },
        pointLabels: { color: 'black' },
      },
    },
    plugins: {
      legend: {
        labels: { color: 'black' },
      },
    },
    maintainAspectRatio: false,
  };

  return (
    <div className="fixed inset-0 z-[1000] flex justify-center items-center" style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}>
      <div className="bg-white p-4 rounded-lg shadow-lg w-11/12 max-w-2xl max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center border-b pb-2 mb-2">
          <h2 className="text-xl font-bold text-black">Comparative Analysis</h2>
          <button onClick={onClose} className="text-red-500 font-bold text-2xl leading-none bg-transparent border-none cursor-pointer">
            &times;
          </button>
        </div>
        <div className="overflow-y-auto flex-grow text-black">
          {loading && <p>Loading comparative analysis...</p>}
          {error && <p className="text-red-500">Error: {error}</p>}
          {!loading && !error && graph1 && graph2 ? (
            <>
              <p className="mb-4">Graphs uploaded. Here is the comparative analysis:</p>
              <div className="mt-4">
                <h3 className="text-lg font-semibold">Graph Metrics Radar Chart</h3>
                <div className="w-full h-80">
                  <Radar data={radarChartData} options={radarChartOptions} />
                </div>
              </div>
              {analysisData && (
                <div className="mt-8 text-center">
                  <h3 className="text-lg font-semibold">Separation Score</h3>
                  <p className="text-4xl font-bold text-blue-600">{analysisData.separation_score.toFixed(4)}</p>
                  <p className="text-sm text-gray-600">Lower score indicates greater similarity between graphs.</p>
                </div>
              )}

              <div className="mt-8">
                <h3 className="text-lg font-semibold">Detailed Metrics:</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                  <div>
                    <h4 className="font-bold">Graph 1 Metrics:</h4>
                    {analysisData && Object.entries(analysisData.graph1_metrics).map(([key, value]: [string, any]) => (
                      <p key={key}>{key}: {typeof value === 'number' ? value.toFixed(4) : value}</p>
                    ))}
                  </div>
                  <div>
                    <h4 className="font-bold">Graph 2 Metrics:</h4>
                    {analysisData && Object.entries(analysisData.graph2_metrics).map(([key, value]: [string, any]) => (
                      <p key={key}>{key}: {typeof value === 'number' ? value.toFixed(4) : value}</p>
                    ))}
                  </div>
                </div>
              </div>
            </>
          ) : (
            !loading && !error && <p>Please upload both graphs to perform comparative analysis.</p>
          )}
        </div>
      </div>
    </div>
  );
} 