const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const moment = require('moment');

class PDFGenerator {
  static async generatePOA(app, data, templateName = 'assignment-pdf') {
    
    // 1. Standard Logo
    const standardLogoPath = path.join(__dirname, '../public/images/Screenshot_1.png');
    let standardLogoDataUrl = null;
    try {
      standardLogoDataUrl = `data:image/png;base64,${fs.readFileSync(standardLogoPath, { encoding: 'base64' })}`;
    } catch (err) {}

    // 2. Lufthansa Logo
    const lufthansaLogoPath = path.join(__dirname, '../public/images/Lufthansa_Logo_2018.svg.png');
    let lufthansaLogoDataUrl = null;
    try {
      lufthansaLogoDataUrl = `data:image/png;base64,${fs.readFileSync(lufthansaLogoPath, { encoding: 'base64' })}`;
    } catch (err) {}

    // 3. Star Alliance Logo
    const starAllianceLogoPath = path.join(__dirname, '../public/images/star-alliance.png');
    let starAllianceLogoDataUrl = null;
    try {
      starAllianceLogoDataUrl = `data:image/png;base64,${fs.readFileSync(starAllianceLogoPath, { encoding: 'base64' })}`;
    } catch (err) {}

    // 4. NEW: Aer Lingus Logo
    const aerlingusLogoPath = path.join(__dirname, '../public/images/aer-lingus.png');
    let aerlingusLogoDataUrl = null;
    try {
      aerlingusLogoDataUrl = `data:image/png;base64,${fs.readFileSync(aerlingusLogoPath, { encoding: 'base64' })}`;
    } catch (err) {}

    const formattedFlightDate = data.flightDate ? moment(data.flightDate).format('MMM DD, YYYY') : '';
    const formattedClaimDate = data.claimDate ? moment(data.claimDate).format('MMM DD, YYYY') : '';
    const formattedDate = data.date ? moment(data.date).format('DD-MM-YYYY') : '';

    const templateData = { 
      ...data, 
      logo: standardLogoDataUrl, 
      lufthansaLogo: lufthansaLogoDataUrl, 
      starAllianceLogo: starAllianceLogoDataUrl,
      aerlingusLogo: aerlingusLogoDataUrl,
      formattedDate,
      formattedFlightDate,
      formattedClaimDate
    };

    return new Promise((resolve, reject) => {
      app.render(templateName, templateData, async (err, html) => {
        if (err) return reject(err);
        let browser;
        try {
          browser = await chromium.launch();
          const page = await browser.newPage();
          await page.setContent(html, { waitUntil: 'networkidle' });
          const pdfBuffer = await page.pdf({ format: 'A4', printBackground: true });
          resolve(pdfBuffer);
        } catch (error) {
          reject(error);
        } finally {
          if (browser) await browser.close().catch(() => {});
        }
      });
    });
  }
}

module.exports = PDFGenerator;