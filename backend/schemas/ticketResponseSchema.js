'use strict';

const { SchemaType } = require('@google/generative-ai');

const TICKET_RESPONSE_SCHEMA = {
  type: SchemaType.ARRAY,
  items: {
    type: SchemaType.OBJECT,
    properties: {
      _chronology_scratchpad: {
        type: SchemaType.STRING,
        description: "MENTAL WORKSPACE: Write out a flat chronological timeline of all flights extracted. Identical boarding passes must be completely merged into one leg. Determine Outbound vs Return structure."
      },
      passengers: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            firstName:    { type: SchemaType.STRING },
            lastName:     { type: SchemaType.STRING },
            ticketNumber: { type: SchemaType.STRING, description: 'STRICTLY 13 NUMERIC DIGITS. NO LETTERS. Output "Not Provided" if missing.' },
          },
          required: ['firstName', 'lastName', 'ticketNumber'],
        },
      },
      ec261: {
        type: SchemaType.OBJECT,
        properties: {
          firstOriginCountry:      { type: SchemaType.STRING },
          finalDestinationCountry: { type: SchemaType.STRING },
          status:                  { type: SchemaType.STRING },
          reason:                  { type: SchemaType.STRING },
        },
        required: ['firstOriginCountry', 'finalDestinationCountry', 'status', 'reason'],
      },
      routes: {
        type: SchemaType.ARRAY,
        items: {
          type: SchemaType.OBJECT,
          properties: {
            type: { type: SchemaType.STRING, description: 'Outbound or Return' },
            legs: {
              type: SchemaType.ARRAY,
              items: {
                type: SchemaType.OBJECT,
                properties: {
                  printedReference: { type: SchemaType.STRING, description: 'Raw alphanumeric reference physically printed on the document. Output "Not Provided" if absent.' },
                  pnr: { type: SchemaType.STRING, description: 'Per-carrier booking reference. If this leg is operated by a different airline than others in the booking, extract the PNR specific to THIS operating carrier from the "Airline Booking Reference" field. Example: if document shows "AA/SNMAUJ, BA/7IQHOL" and this leg is operated by American Airlines, output "SNMAUJ". If operated by British Airways, output "7IQHOL". NEVER copy PNRs across different operating carriers.' },
                  flightStatus: { type: SchemaType.STRING, description: 'One of: Cancelled | Unused / Missed Connection | Rescheduled | Replacement Flight | Unused Replacement Flight | Flown | Scheduled' },
                  marketingAirline:        { type: SchemaType.STRING },
                  marketingAirlineCountry: { type: SchemaType.STRING },
                  operatingAirline:        { type: SchemaType.STRING },
                  operatingAirlineCountry: { type: SchemaType.STRING },
                  flightNumbers:    { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
                  isCodeshare:      { type: SchemaType.BOOLEAN, description: 'true if the multiple flight numbers in flightNumbers represent the SAME physical flight marketed under different airline codes (e.g. BA494 / AA7041, "Sold as AA7041"). false (or omit) for a genuine unknown-stopover where multiple numbers represent different physical flights connecting at an unspecified airport.' },
                  originIata:         { type: SchemaType.STRING },
                  originName:         { type: SchemaType.STRING },
                  originCity:         { type: SchemaType.STRING },
                  originCountry:      { type: SchemaType.STRING },
                  departureTime:      { type: SchemaType.STRING, description: "Time ONLY in HH:MM format (24-hour). Example: '11:59' or '14:44'. NEVER include date or timezone. Extract ONLY the time component from any datetime string. If you see '2026-03-29T11:59:00', output '11:59'." },
                  arrivalTime:        { type: SchemaType.STRING, description: "Time ONLY in HH:MM format (24-hour). Example: '11:59' or '14:44'. NEVER include date or timezone. Extract ONLY the time component from any datetime string. If you see '2026-03-29T14:44:00', output '14:44'." },
                  destinationIata:    { type: SchemaType.STRING },
                  destinationName:    { type: SchemaType.STRING },
                  destinationCity:    { type: SchemaType.STRING },
                  destinationCountry: { type: SchemaType.STRING },
                  rawExtractedDate:   { type: SchemaType.STRING },
                  date:               { type: SchemaType.STRING },
                  originalDepartureTime: { type: SchemaType.STRING, description: "Time ONLY in HH:MM format (24-hour). Example: '11:59' or '14:44'. NEVER include date or timezone. Extract ONLY the time component from any datetime string. If you see '2026-03-29T11:59:00', output '11:59'." },
                  originalArrivalTime:   { type: SchemaType.STRING, description: "Time ONLY in HH:MM format (24-hour). Example: '11:59' or '14:44'. NEVER include date or timezone. Extract ONLY the time component from any datetime string. If you see '2026-03-29T11:59:00', output '11:59'." },
                  passengerTickets: {
                    type: SchemaType.ARRAY,
                    description: "List of exactly which ticket numbers were used for this specific leg, mapped to each passenger's name.",
                    items: {
                      type: SchemaType.OBJECT,
                      properties: {
                        passengerName: { type: SchemaType.STRING },
                        ticketNumber: { type: SchemaType.STRING }
                      },
                      required: ['passengerName', 'ticketNumber']
                    }
                  },
                  ec261Leg: {
                    type: SchemaType.OBJECT,
                    properties: {
                      legOriginCountry:      { type: SchemaType.STRING },
                      legDestinationCountry: { type: SchemaType.STRING },
                      status:                { type: SchemaType.STRING },
                      reason:                { type: SchemaType.STRING },
                      claimExpiration: {
                        type: SchemaType.OBJECT,
                        properties: {
                          originYears:           { type: SchemaType.STRING },
                          destinationYears:      { type: SchemaType.STRING },
                          marketingAirlineYears: { type: SchemaType.STRING },
                          operatingAirlineYears: { type: SchemaType.STRING },
                          bestCountry:           { type: SchemaType.STRING },
                          bestYears:             { type: SchemaType.STRING },
                          expirationDate:        { type: SchemaType.STRING },
                          isExpired:             { type: SchemaType.BOOLEAN },
                        },
                        required: ['originYears','destinationYears','marketingAirlineYears','operatingAirlineYears','bestCountry','bestYears','expirationDate','isExpired'],
                      },
                    },
                    required: ['legOriginCountry','legDestinationCountry','status','reason','claimExpiration'],
                  },
                },
                required: ['passengerTickets','printedReference','pnr','flightStatus','marketingAirline','marketingAirlineCountry','operatingAirline','operatingAirlineCountry','flightNumbers','originIata','originName','originCity','originCountry','departureTime','arrivalTime','destinationIata','destinationName','destinationCity','destinationCountry','rawExtractedDate','date','originalDepartureTime','originalArrivalTime','ec261Leg'],
              },
            },
          },
          required: ['type', 'legs'],
        },
      },
    },
    required: ['_chronology_scratchpad', 'passengers', 'ec261', 'routes'],
  },
};

module.exports = TICKET_RESPONSE_SCHEMA;
