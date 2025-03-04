const fs = require('fs');
const path = require('path');

// Read the JSON file
const filePath = path.join(__dirname, 'busgov', 'grants-summarized.json');
fs.readFile(filePath, 'utf8', (err, data) => {
  if (err) {
    console.error('Error reading file:', err);
    return;
  }

  try {
    // Parse the JSON data
    const grants = JSON.parse(data);
    
    // Count grants with "Open" status
    const openGrants = grants.filter(grant => grant.complexity === "High");
    
    console.log(`Total grants: ${grants.length}`);
    console.log(`Open grants: ${openGrants.length}`);
    
    // Optional: List the open grants
    console.log('\nList of Open Grants:');
    openGrants.forEach((grant, index) => {
      console.log(`${index + 1}. ${grant.title}`);
    });
    
  } catch (error) {
    console.error('Error parsing JSON:', error);
  }
});
