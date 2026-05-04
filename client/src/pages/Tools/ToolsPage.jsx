import { useLocation } from 'react-router-dom';
import FlightSearchPage from '../FlightTools/FlightSearchPage.jsx';
import FlightStatsPage from '../FlightTools/FlightStatsPage.jsx';
import PoaGeneratorPage from '../PoaGenerator/PoaGeneratorPage.jsx';
import TicketAnalyzerPage from '../TicketAnalyzer/TicketAnalyzerPage.jsx';

function getActiveTool(hash) {
  const toolHash = hash.replace('#', '');

  return toolHash || 'ticket-analyzer';
}

export default function ToolsPage() {
  const location = useLocation();
  const activeTool = getActiveTool(location.hash);

  if (activeTool === 'poa') {
    return <PoaGeneratorPage />;
  }

  if (activeTool === 'ticket-analyzer') {
    return <TicketAnalyzerPage />;
  }

  if (activeTool === 'flight-search') {
    return <FlightSearchPage />;
  }

  if (activeTool === 'flight-stats') {
    return <FlightStatsPage />;
  }

  return (
    <section className="dashboard-placeholder">
      <h1>Tool coming soon</h1>
      <p>This tool has not moved into the React client yet.</p>
    </section>
  );
}
