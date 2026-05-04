import { useLocation } from 'react-router-dom';
import DocumentCheckPage from '../DocumentCheck/DocumentCheckPage.jsx';
import Ec261CalculatorPage from '../Ec261Calculator/Ec261CalculatorPage.jsx';
import EocRadarPage from '../EocRadar/EocRadarPage.jsx';
import EmailBuilderPage from '../EmailBuilder/EmailBuilderPage.jsx';
import FlightSearchPage from '../FlightTools/FlightSearchPage.jsx';
import FlightStatsPage from '../FlightTools/FlightStatsPage.jsx';
import IataLookupPage from '../IataLookup/IataLookupPage.jsx';
import JurisdictionCheckerPage from '../Jurisdiction/JurisdictionCheckerPage.jsx';
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

  if (activeTool === 'eoc') {
    return <EocRadarPage />;
  }

  if (activeTool === 'doc-check') {
    return <DocumentCheckPage />;
  }

  if (activeTool === 'jurisdiction') {
    return <JurisdictionCheckerPage />;
  }

  if (activeTool === 'iata') {
    return <IataLookupPage />;
  }

  if (activeTool === 'email') {
    return <EmailBuilderPage />;
  }

  if (activeTool === 'ec261') {
    return <Ec261CalculatorPage />;
  }

  return (
    <section className="dashboard-placeholder">
      <h1>Tool coming soon</h1>
      <p>This tool has not moved into the React client yet.</p>
    </section>
  );
}
