const { GoogleGenAI } = require('@google/genai');

async function listModels() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  
  try {
    const models = await ai.models.list();
    console.log('Available models:');
    models.forEach(model => {
      console.log(`- ${model.name}`);
      if (model.supportedGenerationMethods) {
        console.log(`  Methods: ${model.supportedGenerationMethods.join(', ')}`);
      }
    });
  } catch (error) {
    console.error('Error listing models:', error);
  }
}

listModels();