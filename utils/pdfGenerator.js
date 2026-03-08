const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const moment = require('moment');

class PDFGenerator {
  static async generatePOA(app, data, templateName = 'assignment-pdf') {
    
    // 1. Get Standard Logo
    const standardLogoPath = path.join(__dirname, '../public/images/Screenshot_1.png');
    let standardLogoDataUrl = null;
    try {
      const standardLogoBase64 = fs.readFileSync(standardLogoPath, { encoding: 'base64' });
      standardLogoDataUrl = `data:image/png;base64,${standardLogoBase64}`;
    } catch (err) {
      console.warn('Standard logo not found');
    }

    // 2. Get Lufthansa Logo
    let lufthansaLogoPath = path.join(__dirname, '../public/images/Lufthansa_Logo_2018.svg.png');
    if (!fs.existsSync(lufthansaLogoPath)) {
        lufthansaLogoPath = path.join(__dirname, '../public/images/Lufthansa_Logo_2018.svg.png');
    }
    let lufthansaLogoDataUrl = null;
    try {
      const lhLogoBase64 = fs.readFileSync(lufthansaLogoPath, { encoding: 'base64' });
      lufthansaLogoDataUrl = `data:image/png;base64,${lhLogoBase64}`;
    } catch (err) {
      console.warn('Lufthansa logo not found');
    }

    // 3. Get Star Alliance Logo
    let starAllianceLogoPath = path.join(__dirname, '../public/images/star-alliance.png');
    if (!fs.existsSync(starAllianceLogoPath)) {
        starAllianceLogoPath = path.join(__dirname, '../public/images/star-alliance.png');
    }
    let starAllianceLogoDataUrl = null;
    try {
      const saLogoBase64 = fs.readFileSync(starAllianceLogoPath, { encoding: 'base64' });
      starAllianceLogoDataUrl = `data:image/png;base64,${saLogoBase64}`;
    } catch (err) {
      console.warn('Star Alliance logo not found');
    }

    // FORMAT UPDATE: Changed to 'MMM DD, YYYY' for the Lufthansa template dates
    const formattedFlightDate = data.flightDate ? moment(data.flightDate).format('MMM DD, YYYY') : '';
    const formattedClaimDate = data.claimDate ? moment(data.claimDate).format('MMM DD, YYYY') : '';

    // Standard form compatibility fallback (Kept as DD-MM-YYYY just in case your standard form relies on it)
    const formattedDate = data.date ? moment(data.date).format('DD-MM-YYYY') : '';

    const templateData = { 
      ...data, 
      logo: standardLogoDataUrl, 
      lufthansaLogo: lufthansaLogoDataUrl, 
      starAllianceLogo: starAllianceLogoDataUrl,
      formattedDate,
      formattedFlightDate,
      formattedClaimDate
    };

    return new Promise((resolve, reject) => {
      app.render(templateName, templateData, async (err, html) => {
        if (err) return reject(err);
        try {
          const browser = await chromium.launch();
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle' });
          
          const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
          await browser.close();
          resolve(pdfBuffer);
        } catch (error) {
          reject(error);
        }
      });
    });
  }
}

module.exports = PDFGenerator;