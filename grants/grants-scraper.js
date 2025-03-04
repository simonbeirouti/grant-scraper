const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;

// Helper function to create a delay
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function scrapeGrantsPage(pageNum) {
  try {
    const url = pageNum === 1 
      ? 'https://www.grants.gov.au/Go/List' 
      : `https://www.grants.gov.au/Go/List?page=${pageNum}`;
    
    console.log(`Scraping page ${pageNum}: ${url}`);
    
    // Fetch the HTML content
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      }
    });

    const html = response.data;
    const $ = cheerio.load(html);
    
    // Find all article elements with role="article"
    const articles = $('article[role="article"]');
    
    // Create an array to store the extracted data
    const grants = [];
    
    // Extract data from each article
    articles.each((index, element) => {
      const article = $(element);
      
      // Extract data based on the actual HTML structure
      const title = article.find('p.font20[role="heading"]').text().trim();
      
      // Get the GO ID (and its link)
      const goIdElement = article.find('a.u');
      const goId = goIdElement.text().trim();
      const detailsLink = goIdElement.attr('href');
      
      // Get close date
      const closeDateElement = article.find('.list-desc:contains("Close Date")').find('.list-desc-inner');
      const closeDate = closeDateElement.clone().children().remove().end().text().trim();
      const timezone = closeDateElement.find('span').text().trim();
      
      // Get agency
      const agency = article.find('.list-desc:contains("Agency:")').find('.list-desc-inner').text().trim();
      
      // Get category
      const category = article.find('.list-desc:contains("Primary Category:")').find('.list-desc-inner').text().trim();
      
      // Get description
      const description = article.find('.list-desc:contains("Description:")').find('.list-desc-inner').text().trim();
      
      // Get full details link
      const fullDetailsLink = article.find('a.detail').attr('href');
      
      // Add to grants array
      grants.push({
        title,
        goId,
        closeDate,
        timezone,
        agency,
        category,
        description,
        page: pageNum,
        detailsLink: detailsLink ? (detailsLink.startsWith('http') ? detailsLink : `https://www.grants.gov.au${detailsLink}`) : null,
        fullDetailsLink: fullDetailsLink ? (fullDetailsLink.startsWith('http') ? fullDetailsLink : `https://www.grants.gov.au${fullDetailsLink}`) : null
      });
    });
    
    console.log(`Found ${grants.length} grants on page ${pageNum}`);
    return grants;
  } catch (error) {
    console.error(`Error scraping grants on page ${pageNum}:`, error);
    return []; // Return empty array on error for a specific page, to continue with others
  }
}

async function scrapeAllGrants() {
  const allGrants = [];
  const totalPages = 10;
  
  for (let page = 1; page <= totalPages; page++) {
    // Scrape the current page
    const pageGrants = await scrapeGrantsPage(page);
    allGrants.push(...pageGrants);
    
    // Delay before the next request (except after the last page)
    if (page < totalPages) {
      console.log(`Waiting 5 seconds before fetching page ${page + 1}...`);
      await delay(5000); // 5 seconds delay
    }
  }
  
  console.log(`Completed scraping. Total grants found: ${allGrants.length}`);
  return allGrants;
}

// Run the scraper and save results to a file
scrapeAllGrants()
  .then(async grants => {
    // Create a timestamp for unique filenames
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `grants-${timestamp}.json`;
    
    // Format the grants data with pretty-printing (2 spaces for indentation)
    const jsonData = JSON.stringify(grants, null, 2);
    
    // Write to the file
    await fs.writeFile(filename, jsonData);
    
    console.log(`Successfully scraped ${grants.length} grants`);
    console.log(`Data saved to ${filename}`);
  })
  .catch(err => {
    console.error('Failed to scrape or save grants:', err);
  }); 