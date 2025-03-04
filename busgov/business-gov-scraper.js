const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer');

// Base URL and settings
const baseUrl = 'https://business.gov.au/grants-and-programs';
const resultsPerPage = 50;
const maxResults = 590;

// Helper function to clean text
const cleanText = (text) => {
  if (!text) return '';
  return text.replace(/\s+/g, ' ').trim();
};

// Function to scrape a single page with Puppeteer
async function scrapePage(url) {
  try {
    console.log(`Scraping: ${url}`);
    
    // Launch a headless browser
    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    // Set a user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');
    
    // Navigate to the page and wait for content to load
    await page.goto(url, { waitUntil: 'networkidle2' });
    
    // Wait for the Coveo search UI to initialize and load results
    await page.waitForSelector('.coveo-list-layout.CoveoResult', { timeout: 30000 })
      .catch(() => console.log('Could not find any grant cards on the page'));
    
    // Additional wait to ensure all dynamic content is loaded
    await page.waitForTimeout(2000);
    
    // Get the content of the page
    const content = await page.content();
    
    // Save the HTML for debugging on first page only
    if (url.includes('firstResult=0') || !url.includes('firstResult')) {
      fs.writeFileSync('page-debug.html', content);
      console.log('Saved page HTML to page-debug.html for inspection');
    }
    
    const $ = cheerio.load(content);
    const grants = [];
    
    // Debug info
    const grantCount = $('.coveo-list-layout.CoveoResult').length;
    console.log(`Found ${grantCount} grant cards on the page`);
    
    // Find each grant card
    $('.coveo-list-layout.CoveoResult').each((i, element) => {
      const $card = $(element);
      
      // Extract title and link
      const titleEl = $card.find('[data-testid="search-card-grants-title"] a');
      const title = cleanText(titleEl.text());
      const link = titleEl.attr('href');
      
      if (!title || !link) {
        console.log(`Warning: Missing title or link for card ${i+1}`);
        return; // Skip this card
      }
      
      const fullLink = link.startsWith('/') ? `https://business.gov.au${link}` : link;
      
      // Extract program name
      const programName = cleanText($card.find('.search-card-grant-name span').text());
      
      // Extract description
      const description = cleanText($card.find('[data-test-id="search-card-grants-description"]').text());
      
      // Extract status
      const status = cleanText($card.find('.tag.status').text());
      
      // Extract closing date information
      const closingInfo = cleanText($card.find('.status-countdown').text());
      
      // Extract detailed information from the accordion
      const grantId = $card.find('.search-card-grant-expand').attr('data-bs-target')?.replace('#grant-', '') || '';
      
      // Who can apply - we need to click the accordion to get this data
      const whoCanApply = cleanText($card.find(`#grant-${grantId} h4:contains("Who is this for?")`).next().text());
      
      // What do you get
      const whatYouGet = cleanText($card.find(`#grant-${grantId} h4:contains("What do you get?")`).next().text());
      
      console.log(`Found grant: ${title}`);
      
      grants.push({
        title,
        link: fullLink,
        programName,
        description,
        status,
        closingInfo,
        whoCanApply,
        whatYouGet,
        id: grantId
      });
    });
    
    await browser.close();
    return grants;
  } catch (error) {
    console.error('Error scraping page:', error.message);
    return [];
  }
}

// Main function to scrape all pages
async function scrapeAllPages() {
  const allGrants = [];
  let offset = 0;
  
  while (offset < maxResults) {
    const url = offset === 0 
      ? `${baseUrl}?resultsNum=${resultsPerPage}`
      : `${baseUrl}?firstResult=${offset}&resultsNum=${resultsPerPage}`;
    
    const grants = await scrapePage(url);
    
    if (grants.length === 0) {
      console.log('No grants found on this page. Stopping scrape.');
      break;
    }
    
    allGrants.push(...grants);
    console.log(`Added ${grants.length} grants. Total: ${allGrants.length}`);
    
    // Increment offset for next page
    offset += resultsPerPage;
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  return allGrants;
}

// Run the scraper and save results
async function main() {
  try {
    console.log('Starting grant scraper...');
    const grants = await scrapeAllPages();
    
    if (grants.length === 0) {
      console.log('No grants were found. Please check the debug HTML file for issues.');
      return;
    }
    
    // Save to JSON file
    const outputPath = path.join(__dirname, 'business-gov-grants.json');
    fs.writeFileSync(outputPath, JSON.stringify(grants, null, 2));
    
    console.log(`Scraping complete. Saved ${grants.length} grants to ${outputPath}`);
  } catch (error) {
    console.error('Error in main function:', error);
  }
}

main(); 