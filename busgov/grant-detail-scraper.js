const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');
const cheerio = require('cheerio');

// Helper function to clean text
const cleanText = (text) => {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
};

// Helper function for delay that works with any Puppeteer version
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Function to scrape a single grant detail page
async function scrapeGrantDetail(url, browser) {
  try {
    console.log(`Scraping details: ${url}`);
    
    const page = await browser.newPage();
    
    // Set a user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to the page and wait for content to load
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // Wait for the content to load
    await page.waitForSelector('.body-copy', { timeout: 30000 })
      .catch(() => console.log('Could not find main content on the page'));
    
    // Additional wait to ensure all dynamic content is loaded
    await delay(1000);
    
    // Get the content of the page
    const content = await page.content();
    
    const $ = cheerio.load(content);
    const detailData = {};
    
    // Extract the full detailed description (overview section)
    const overviewSection = $('.body-copy .lh-lg').filter(function() {
      return $(this).find('h2').text().includes('Overview');
    });
    
    if (overviewSection.length) {
      // Get all text from this section, excluding the h2 header
      let overview = '';
      overviewSection.contents().each(function() {
        if (this.tagName !== 'h2') {
          overview += $(this).text() + ' ';
        }
      });
      detailData.overview = cleanText(overview);
    }
    
    // Get "Who is this for?" section with more details
    const whoIsThisForSection = $('.body-copy h3').filter(function() {
      return $(this).text().includes('Who is this for?');
    });
    
    if (whoIsThisForSection.length) {
      detailData.whoCanApplyDetail = cleanText(whoIsThisForSection.next().text());
    }
    
    // Get "What do you get?" section with more details
    const whatDoYouGetSection = $('.body-copy h3').filter(function() {
      return $(this).text().includes('What do you get?');
    });
    
    if (whatDoYouGetSection.length) {
      detailData.whatYouGetDetail = cleanText(whatDoYouGetSection.next().text());
    }
    
    // Get how to apply information
    const applySection = $('.cta-standard');
    if (applySection.length) {
      const applyLink = applySection.find('a').attr('href');
      const applyText = cleanText(applySection.find('h3').text());
      const applyDescription = cleanText(applySection.find('p').text());
      
      detailData.apply = {
        text: applyText,
        description: applyDescription,
        link: applyLink
      };
    }
    
    // Get closing date information
    const closeDateSelector = '#close-date-value';
    if ($(closeDateSelector).length) {
      detailData.closeDate = cleanText($(closeDateSelector).text());
    }
    
    // Get contact information
    const contactSection = $('.call-out-contact');
    if (contactSection.length) {
      const contactInfo = {};
      
      // Email
      const emailElement = contactSection.find('a[href^="mailto:"]');
      if (emailElement.length) {
        contactInfo.email = emailElement.text().trim();
      }
      
      // Phone (if present)
      const phoneLabel = contactSection.find('strong').filter(function() {
        return $(this).text().includes('Phone:');
      });
      
      if (phoneLabel.length) {
        contactInfo.phone = cleanText(phoneLabel.next('div').text());
      }
      
      detailData.contact = contactInfo;
    }
    
    await page.close();
    return detailData;
    
  } catch (error) {
    console.error(`Error scraping details for ${url}:`, error.message);
    return {};
  }
}

// Main function to enrich all grants
async function enrichGrantData() {
  try {
    console.log('Starting grant detail scraper...');
    
    // Read the existing JSON file
    const grantsFilePath = path.join(__dirname, 'business-gov-grants.json');
    const grants = JSON.parse(fs.readFileSync(grantsFilePath, 'utf8'));
    
    console.log(`Found ${grants.length} grants to enrich`);
    
    // Launch a browser instance that we'll reuse for all requests
    const browser = await puppeteer.launch({ headless: true });
    
    // Process ALL grants (removed the filter for only active grants)
    const grantsToProcess = grants;
    console.log(`Processing all ${grantsToProcess.length} grants`);
    
    for (let i = 0; i < grantsToProcess.length; i++) {
      const grant = grantsToProcess[i];
      console.log(`Processing grant ${i+1}/${grantsToProcess.length}: ${grant.title} (${grant.status})`);
      
      // Scrape the detail page
      const detailData = await scrapeGrantDetail(grant.link, browser);
      
      // Update the grant with detailed information
      Object.assign(grant, detailData);
      
      // No need to update original grant as we're using the same array
      
      // Small delay between requests
      if (i < grantsToProcess.length - 1) {
        console.log('Waiting before next request...');
        await delay(500);
      }
    }
    
    await browser.close();
    
    // Save the enriched data to a new file
    const outputPath = path.join(__dirname, 'business-gov-grants-enriched.json');
    fs.writeFileSync(outputPath, JSON.stringify(grants, null, 2));
    
    console.log(`Enrichment complete. Saved ${grants.length} grants to ${outputPath}`);
  } catch (error) {
    console.error('Error in enrichment process:', error);
  }
}

enrichGrantData(); 