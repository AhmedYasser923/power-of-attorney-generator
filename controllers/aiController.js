const { GoogleGenerativeAI } = require('@google/generative-ai');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');

// Initialize the Gemini API with your secret key
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

exports.extractData = catchAsync(async (req, res, next) => {
  const { messyText } = req.body;

  if (!messyText || !messyText.trim()) {
    return next(new AppError('No text provided', 400));
  }

  // We use the fast 'flash' model for quick data extraction
  const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-lite-preview" });

  // Strict instructions so Gemini returns an array of up to 4 passengers AND the flight route
  const prompt = `
    You are a data extractor for a legal application. Read the following messy text and extract the passenger information.
    Return ONLY a raw JSON object. Do NOT wrap it in markdown blockquotes or add any extra text.

    Text: "${messyText}"

    Required JSON format exactly like this:
    {
      "passengers": [
        {
          "firstName": "Extracted first name, or empty string",
          "lastName": "Extracted last name, or empty string"
        }
      ],
      "address": "Extracted full address, or empty string",
      "pnr": "Extracted PNR/Booking Code (can be 6 to 9 characters, alphanumeric or just numbers), or empty string",
      "flightNumber": "Extracted flight number (e.g. LH982), or empty string",
      "date": "You MUST format the date strictly as YYYY-MM-DD. For example, 2025-10-15. Do not include any other text. If no date is found, return an empty string.",
      "route": "Extracted flight route (e.g. DUB - JFK, or London to Dublin), or empty string"
    }
    
    IMPORTANT: The "passengers" array must contain an object for EVERY passenger mentioned in the text, up to a maximum of 4 passengers.
  `;

  const result = await model.generateContent(prompt);

  // Clean up the response just in case the AI adds markdown ticks
  const responseText = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();

  let extractedData;
  try {
    extractedData = JSON.parse(responseText);
  } catch (parseErr) {
    return next(new AppError('The AI returned an unparseable response. Please try again.', 502));
  }

  // Send the clean JSON back to the frontend
  res.json(extractedData);
});
