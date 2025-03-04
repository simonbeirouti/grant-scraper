const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;

// Helper function to create a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

// Find the most recent grants JSON file
async function findMostRecentGrantsFile() {
  try {
    const files = await fs.readdir('./');
    const grantsFiles = files.filter(file => file.startsWith('grants-') && file.endsWith('.json'));
    
    if (grantsFiles.length === 0) {
      throw new Error('No grants JSON files found');
    }
    
    // Sort files by creation date (newest first)
    grantsFiles.sort((a, b) => {
      // Extract timestamps from filenames
      const timestampA = a.replace('grants-', '').replace('.json', '');
      const timestampB = b.replace('grants-', '').replace('.json', '');
      return timestampB.localeCompare(timestampA);
    });
    
    return grantsFiles[0];
  } catch (error) {
    console.error('Error finding grants file:', error);
    throw error;
  }
}

// Extract all possible data from a grant details page
async function scrapeGrantDetails(url) {
  try {
    console.log(`Scraping details from: ${url}`);
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);
    
    // Find the box containing all details
    const detailsBox = $('.box.boxW.r9.listInner');
    
    // Create an object to store all details
    const details = {};
    
    // Extract all list-desc elements (key-value pairs)
    detailsBox.find('.list-desc').each((index, element) => {
      const listDesc = $(element);
      const key = listDesc.find('span').first().text().trim().replace(':', '');
      
      if (key) {
        // Get the text content and replace newlines with spaces, then normalize whitespace
        const textContent = listDesc.find('.list-desc-inner').text().trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
        details[key] = textContent;
      }
    });
    
    // Extract the title from the heading if available
    const title = $('h1, h2').first().text().trim().replace(/\n/g, ' ').replace(/\s+/g, ' ');
    if (title) {
      details['Title'] = title;
    }
    
    // Extract any attachments or documents if available
    const attachments = [];
    $('.list-attachments, .attachments').find('a').each((index, element) => {
      const link = $(element);
      attachments.push({
        name: link.text().trim().replace(/\n/g, ' ').replace(/\s+/g, ' '),
        url: link.attr('href')
      });
    });
    
    if (attachments.length > 0) {
      details['Attachments'] = attachments;
    }
    
    return details;
  } catch (error) {
    console.error(`Error scraping grant details for ${url}:`, error);
    return { error: `Failed to scrape: ${error.message}` };
  }
}

// Main function
async function enhanceGrantsData() {
  try {
    // Find and load the most recent grants file
    const grantsFile = await findMostRecentGrantsFile();
    console.log(`Using grants file: ${grantsFile}`);
    
    const grantsData = JSON.parse(await fs.readFile(grantsFile, 'utf8'));
    console.log(`Loaded ${grantsData.length} grants from file`);
    
    const enhancedGrants = [];
    
    // Process each grant
    for (let i = 0; i < grantsData.length; i++) {
      const grant = grantsData[i];
      console.log(`Processing grant ${i+1}/${grantsData.length}: ${grant.title}`);
      
      // Get the details URL - prefer fullDetailsLink, but fall back to detailsLink
      const detailsUrl = grant.fullDetailsLink || grant.detailsLink;
      
      if (detailsUrl) {
        // Scrape the details page
        const details = await scrapeGrantDetails(detailsUrl);
        
        // Merge the list data with the details data
        const enhancedGrant = {
          ...grant,
          details
        };
        
        enhancedGrants.push(enhancedGrant);
        
        // Add a delay after each request except the last one
        if (i < grantsData.length - 1) {
          console.log(`Waiting 1 seconds before next request...`);
          await delay(100); // 1 second delay
        }
      } else {
        console.warn(`No details URL found for grant: ${grant.title}`);
        enhancedGrants.push(grant);
      }
    }
    
    // Create a timestamp for the new file
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const outputFilename = `grants-detailed-${timestamp}.json`;
    
    // Save the enhanced data
    await fs.writeFile(outputFilename, JSON.stringify(enhancedGrants, null, 2));
    
    console.log(`Enhanced data saved to ${outputFilename}`);
    console.log(`Successfully processed ${enhancedGrants.length} grants`);
    
  } catch (error) {
    console.error('Error enhancing grants data:', error);
  }
}

// Run the script
enhanceGrantsData(); 