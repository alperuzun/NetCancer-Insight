import affil1 from '../assets/Brown_logo.png';
import affil2 from '../assets/Legoretta.png';
import affil3 from '../assets/WarrenAlpert_logo.png';

import { useNavigate } from 'react-router-dom';

export default function Home() {
  const navigate = useNavigate();

  const steps = [
    {
      title: 'Upload Your Network',
      description: 'Upload your cancer network data in CSV or TSV format.',
      icon: '📊'
    },
    {
      title: 'Analyze Patterns',
      description: 'Our advanced algorithms identify key patterns and relationships.',
      icon: '🔍'
    },
    {
      title: 'Visualize Results',
      description: 'Explore interactive 2D and 3D visualizations of your network.',
      icon: '🎯'
    },
    {
      title: 'Get Insights',
      description: 'Discover critical nodes and potential therapeutic targets.',
      icon: '💡'
    }
  ];

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white">
      {/* Hero Section */}
      <div className="section-container pt-20 pb-16">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-5xl font-bold text-gray-900 mb-6">
            Network Cancer Analysis
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Advanced graph analysis tools for cancer research. Upload your network data and discover critical patterns instantly.
          </p>
          <button
            onClick={() => navigate('/program')}
            className="btn-primary text-white"
          >
            Start Analysis
          </button>
        </div>

      </div>

      {/* How it Works Section */}
      <div className="bg-white py-20">
        <div className="section-container">
          <h2 className="text-3xl font-bold text-center text-gray-900 mb-12">
            How it works
          </h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {steps.map((step, index) => (
              <div key={index} className="bg-white rounded-xl p-6 shadow-lg hover:shadow-xl transition-shadow duration-300">
                <div className="text-4xl mb-4">{step.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-2">
                  {step.title}
                </h3>
                <p className="text-gray-600">
                  {step.description}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="py-16 bg-white">
      <h2 className="text-2xl font-bold text-center mb-8">Affiliations</h2>
      <div className="flex flex-wrap justify-center items-center gap-12">
        <img src={affil1} alt="Affiliation 1" className="w-[300px] h-[150px] object-contain" />
        <img src={affil2} alt="Affiliation 2" className="w-[300px] h-[150px] object-contain" />
        <img src={affil3} alt="Affiliation 3" className="w-[300px] h-[150px] object-contain" />
      </div>
    </div>

      {/* Footer */}
      <footer className="bg-gray-50 py-12">
        <div className="section-container">
          <div className="text-center text-gray-600">
            <p>© 2024 Network Cancer Analysis. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
} 