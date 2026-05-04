export const TEMPLATE_OPTIONS = [
  { value: 'standard', label: 'Standard ReFly Template (1 Passenger)' },
  { value: 'lufthansa', label: 'Lufthansa Template (Up to 4 Passengers)' },
  { value: 'aerlingus', label: 'Aer Lingus Template (1 Passenger)' }
];

export const LANGUAGE_OPTIONS = [
  ['En', 'English (En)'],
  ['Fr', 'French (Fr)'],
  ['De', 'German (De)'],
  ['Es', 'Spanish (Es)'],
  ['It', 'Italian (It)'],
  ['Pt', 'Portuguese (Pt)'],
  ['Tr', 'Turkish (Tr)'],
  ['Ar', 'Arabic (Ar)'],
  ['Pl', 'Polish (Pl)'],
  ['Sv', 'Swedish (Sv)'],
  ['No', 'Norwegian (No)'],
  ['Da', 'Danish (Da)'],
  ['Fi', 'Finnish (Fi)'],
  ['Nl', 'Dutch (Nl)'],
  ['Ro', 'Romanian (Ro)'],
  ['Hi', 'Hindi (Hi)'],
  ['Ja', 'Japanese (Ja)'],
  ['He', 'Hebrew (He)'],
  ['CH', 'Chinese (Ch)'],
  ['Al', 'Albanian (Al)'],
  ['Gr', 'Greek (Gr)']
];

export const SIGNATURE_PROCESSING_OPTIONS = [
  ['none', 'None (Use Raw Image)'],
  ['cloudinary', 'Cloudinary AI (Background Removal)'],
  ['gemini-easy', 'Nano Banana - Easy'],
  ['gemini-medium', 'Nano Banana - Medium'],
  ['gemini-hard', 'Nano Banana - Hard']
];

export const CLAIM_TYPE_OPTIONS = [
  ['compensation', 'Compensation Claim (Regulation EC 261/2004)'],
  ['expense', 'Expense Claim'],
  ['baggage', 'Delayed, Lost or Damaged Baggage Claim'],
  ['complaint', 'Complaint'],
  ['other', 'Other']
];

export const INITIAL_STANDARD = {
  lang: 'En',
  firstName: '',
  lastName: '',
  address: '',
  pnr: '',
  date: '',
  sigProcessing: 'none'
};

export const INITIAL_LUFTHANSA = {
  flightNumber: '',
  pnr: '',
  flightDate: '',
  fullName1: '',
  fullName2: '',
  fullName3: '',
  fullName4: '',
  address1: '',
  claimDate: '',
  sigProcessing1: 'none',
  sigProcessing2: 'none',
  sigProcessing3: 'none',
  sigProcessing4: 'none'
};

export const INITIAL_AERLINGUS = {
  claimType: 'compensation',
  caseNumber: '',
  firstName: '',
  lastName: '',
  address: '',
  pnr: '',
  flightNumber: '',
  flightDate: '',
  route: '',
  sigProcessing: 'none'
};
