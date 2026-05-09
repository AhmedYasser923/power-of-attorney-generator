'use strict';

const EC261_EU_COUNTRIES = new Set([
  'austria','belgium','bulgaria','croatia','cyprus','czech republic','denmark',
  'estonia','finland','france','germany','greece','hungary','ireland','italy',
  'latvia','lithuania','luxembourg','malta','netherlands','the netherlands',
  'poland','portugal','romania','slovakia','slovenia','spain','sweden',
  'iceland','norway','switzerland',
  // UK
  'united kingdom','uk','england','scotland','wales','northern ireland',
  // EU overseas territories covered by EC261
  'canary islands','madeira','azores','guadeloupe','martinique',
  'french guiana','réunion','reunion','mayotte','saint martin',
]);

function isEUCountry(country) {
  return EC261_EU_COUNTRIES.has((country || '').toLowerCase().trim());
}

// ---------------------------------------------------------------------------
// PNR-Aware EC261 Helpers
// ---------------------------------------------------------------------------
function isValidPnr(pnr) {
  if (!pnr) return false;
  const normalized = pnr.trim().toLowerCase();
  return normalized !== '' && normalized !== 'not provided' && normalized !== 'unknown';
}

const DISRUPTION_STATUSES = [
  'cancelled', 'replacement flight', 'unused replacement flight',
  'unused / missed connection', 'rescheduled',
];

function hasDisruptionStatus(leg) {
  const status = (leg.flightStatus || '').toLowerCase().trim();
  return DISRUPTION_STATUSES.some(ds => status.includes(ds));
}

// Evaluate an array of legs as a single booking group using RULE 1/2/3
function evaluateLegsEC261(legs) {
  let anyEligible = false;
  let anyIneligible = false;

  const firstLeg = legs[0];
  const lastLeg  = legs[legs.length - 1];
  const firstOriginEU = isEUCountry(firstLeg.originCountry);
  const lastDestEU    = isEUCountry(lastLeg.destinationCountry);

  // RULE 1: EU/UK origin -> entire group automatically eligible
  if (firstOriginEU) {
    legs.forEach(leg => {
      leg.ec261Leg        = leg.ec261Leg || {};
      leg.ec261Leg.status = 'Eligible';
      leg.ec261Leg.reason = `Booking departs from EU/UK (${firstLeg.originCountry}). EC261/2004 applies automatically to all legs in this booking.`;
    });
    return { anyEligible: true, anyIneligible: false };
  }

  // RULE 2: Non-EU origin AND non-EU final destination -> entirely ineligible
  if (!lastDestEU) {
    legs.forEach(leg => {
      leg.ec261Leg        = leg.ec261Leg || {};
      leg.ec261Leg.status = 'Not Eligible';
      leg.ec261Leg.reason = 'Not Covered: Both the booking origin and final destination are outside the EU/UK.';
    });
    return { anyEligible: false, anyIneligible: true };
  }

  // RULE 3: Non-EU origin, EU/UK destination -> per-leg evaluation
  legs.forEach(leg => {
    leg.ec261Leg = leg.ec261Leg || {};
    const oEU    = isEUCountry(leg.originCountry);
    const dEU    = isEUCountry(leg.destinationCountry);
    const opEU   = isEUCountry(leg.operatingAirlineCountry);
    const opName = leg.operatingAirline        || 'Unknown carrier';
    const opCtry = leg.operatingAirlineCountry || 'unknown country';

    if (oEU) {
      leg.ec261Leg.status = 'Eligible';
      leg.ec261Leg.reason = `Departs from EU/UK (${leg.originCountry}) — eligible regardless of carrier.`;
      anyEligible = true;
    } else if (dEU) {
      if (opEU) {
        leg.ec261Leg.status = 'Eligible';
        leg.ec261Leg.reason = `Arrives in EU/UK (${leg.destinationCountry}) and operated by EU/UK carrier ${opName} (${opCtry}).`;
        anyEligible = true;
      } else {
        leg.ec261Leg.status = 'Not Eligible';
        leg.ec261Leg.reason = `Arrives in EU/UK (${leg.destinationCountry}) but operated by non-EU/UK carrier ${opName} (${opCtry}).`;
        anyIneligible = true;
      }
    } else {
      leg.ec261Leg.status = 'Not Eligible';
      leg.ec261Leg.reason = `Both origin (${leg.originCountry}) and destination (${leg.destinationCountry}) are outside the EU/UK.`;
      anyIneligible = true;
    }
  });

  return { anyEligible, anyIneligible };
}

// ---------------------------------------------------------------------------
// Deterministic EC261 Evaluator (PNR-aware)
// ---------------------------------------------------------------------------
function evaluateEC261Deterministic(parsedJourneys) {
  parsedJourneys.forEach(journey => {
    if (!journey.routes) return;

    const allLegs = journey.routes.flatMap(r => r.legs || []);
    if (!allLegs.length) return;

    journey.ec261 = journey.ec261 || {};
    journey.ec261.firstOriginCountry      = allLegs[0].originCountry     || 'Unknown';
    journey.ec261.finalDestinationCountry = allLegs[allLegs.length - 1].destinationCountry || 'Unknown';

    let anyEligible = false;
    let anyIneligible = false;

    journey.routes.forEach(route => {
      const routeLegs = route.legs || [];
      if (!routeLegs.length) return;

      // --- PNR-aware grouping: detect separate bookings within the same route ---
      const validPnrs = new Set();
      routeLegs.forEach(leg => {
        if (isValidPnr(leg.pnr)) validPnrs.add(leg.pnr.trim());
      });

      // Decide whether to split by PNR
      let shouldSplit = false;
      if (validPnrs.size > 1) {
        const hasDisruption = routeLegs.some(hasDisruptionStatus);
        if (hasDisruption) {
          console.log(`[EC261] Route has ${validPnrs.size} PNRs but disruption detected — keeping route-level evaluation.`);
        } else {
          console.log(`[EC261] Route has ${validPnrs.size} distinct PNRs (${Array.from(validPnrs).join(', ')}) with no disruptions — splitting by PNR.`);
          shouldSplit = true;
        }
      }

      if (!shouldSplit) {
        // Evaluate entire route as one group (original behavior)
        const result = evaluateLegsEC261(routeLegs);
        if (result.anyEligible) anyEligible = true;
        if (result.anyIneligible) anyIneligible = true;
      } else {
        // Group legs by PNR and evaluate each group independently
        const pnrGroups = {};
        const unknownPnrLegs = [];

        routeLegs.forEach(leg => {
          if (isValidPnr(leg.pnr)) {
            const key = leg.pnr.trim();
            if (!pnrGroups[key]) pnrGroups[key] = [];
            pnrGroups[key].push(leg);
          } else {
            unknownPnrLegs.push(leg);
          }
        });

        Object.entries(pnrGroups).forEach(([pnr, legs]) => {
          console.log(`[EC261] Evaluating PNR group "${pnr}": ${legs.map(l => `${l.originIata || '?'}->${l.destinationIata || '?'}`).join(', ')}`);
          const result = evaluateLegsEC261(legs);
          if (result.anyEligible) anyEligible = true;
          if (result.anyIneligible) anyIneligible = true;
        });

        // Unknown-PNR legs evaluated individually
        unknownPnrLegs.forEach(leg => {
          const result = evaluateLegsEC261([leg]);
          if (result.anyEligible) anyEligible = true;
          if (result.anyIneligible) anyIneligible = true;
        });
      }
    });

    if (anyEligible && anyIneligible) {
      journey.ec261.status = 'Partially Eligible';
      journey.ec261.reason = 'This booking contains a mix of eligible and ineligible legs under EC261/2004. See per-leg breakdown below.';
    } else if (anyEligible) {
      journey.ec261.status = 'Eligible';
      journey.ec261.reason = 'All routes in this booking qualify for EC261/2004 compensation.';
    } else {
      journey.ec261.status = 'Not Eligible';
      journey.ec261.reason = 'No routes or legs in this booking qualify for EC261/2004 compensation.';
    }
  });
}

// ---------------------------------------------------------------------------
// BUG FIX: PNR Cross-Carrier Validator
// Detects when different operating carriers incorrectly share the same PNR
// ---------------------------------------------------------------------------
function validateAndCorrectPNRs(parsedJourneys) {
  parsedJourneys.forEach(journey => {
    if (!journey.routes) return;

    journey.routes.forEach(route => {
      if (!route.legs || route.legs.length === 0) return;

      // Collect unique operating carriers
      const operatorSet = new Set();
      route.legs.forEach(leg => {
        if (leg.operatingAirline && leg.operatingAirline !== 'Unknown') {
          operatorSet.add(leg.operatingAirline);
        }
      });

      console.log(`[PNR VALIDATOR] Route with ${route.legs.length} legs, ${operatorSet.size} unique operators: ${Array.from(operatorSet).join(', ')}`);

      // If multiple carriers, check for PNR diversity
      if (operatorSet.size > 1) {
        const pnrSet = new Set();
        const pnrMap = {};
        route.legs.forEach(leg => {
          if (leg.pnr && leg.pnr !== 'Not Provided' && leg.pnr !== 'Unknown') {
            pnrSet.add(leg.pnr);
            pnrMap[leg.pnr] = (pnrMap[leg.pnr] || 0) + 1;
          }
        });

        console.log(`[PNR VALIDATOR] Found ${pnrSet.size} unique PNRs: ${Array.from(pnrSet).join(', ')}`);
        console.log(`[PNR VALIDATOR] PNR map:`, pnrMap);

        // WARNING: Multiple carriers but only one PNR detected
        if (pnrSet.size === 1) {
          console.warn(`⚠️  [PNR VALIDATOR] Multi-carrier booking detected but only ONE PNR found across all legs!`);
          console.warn(`    Carriers: ${Array.from(operatorSet).join(', ')}`);
          console.warn(`    Shared PNR: ${Array.from(pnrSet)[0]}`);
          console.warn(`    → This may indicate PNR cross-contamination. Manual review recommended.`);

          // Flag it in the data for frontend display
          route.legs.forEach(leg => {
            if (!leg._warnings) leg._warnings = [];
            leg._warnings.push('MULTI_CARRIER_SINGLE_PNR_DETECTED');
            console.log(`[PNR VALIDATOR] Flagged leg: ${leg.flightNumbers?.[0]} operated by ${leg.operatingAirline} with PNR ${leg.pnr}`);
          });
        }
      }
    });
  });
}

module.exports = { isEUCountry, evaluateEC261Deterministic, validateAndCorrectPNRs };
