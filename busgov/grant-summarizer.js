const fs = require('fs').promises;
const axios = require('axios');
const path = require('path');

// Configuration
const OLLAMA_API_URL = 'http://localhost:11434/api/generate';
const MODEL_NAME = 'deepseek-r1:14b';
const INPUT_FILE = path.join(__dirname, 'business-gov-grants-enriched.json');
const OUTPUT_FILE = path.join(__dirname, 'grants-summarized.json');

/**
 * Creates a prompt for the LLM to summarize a grant
 */
function createPrompt(grant) {
  return `
You are a helpful assistant specializing in government grants analysis.

Please analyze the following grant information and provide:
1. A concise summary (2-3 sentences) of what this grant offers, including the key benefits and eligibility criteria, and how they could win the grant. 
2. An assessment of the application complexity (Easy, Medium, or Hard)
3. Key tip for applicants related to how they could be applicable and steps they could take to improve their chances of success. Do not provide basic tips like "read the guidelines" or "apply early".

Grant Information:
- Title: ${grant.title}
- Program: ${grant.programName}
- Description: ${grant.description}
- Who can apply: ${grant.whoCanApply}
- Who can apply detail: ${grant.whoCanApplyDetail || 'Not specified'}
- What you get: ${grant.whatYouGet}
- What you get detail: ${grant.whatYouGetDetail || 'Not specified'}
- Overview: ${grant.overview || 'Not provided'}
- Status: ${grant.status}
- Closing Info: ${grant.closingInfo || 'Not specified'}
- Close Date: ${grant.closeDate || 'Not specified'}

Provide your response in the following JSON format:
{
  "summary": "Concise summary here",
  "complexity": "Easy/Medium/Hard",
  "tip": "Your tip for applicants"
}
`;
}

/**
 * Sends a single grant to Ollama for processing
 */
async function processGrant(grant) {
  console.log(`\n----- Processing grant: ${grant.title} -----`);
  
  try {
    const prompt = createPrompt(grant);
    console.log(`Sending request to Ollama...`);
    
    const response = await axios.post(OLLAMA_API_URL, {
      model: MODEL_NAME,
      prompt: prompt,
      stream: false
    });
    
    const result = response.data.response;
    console.log(`\nReceived response from Ollama:\n${result}\n`);
    
    // Extract the JSON from the response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('Failed to extract JSON from response');
    }
    
    const summary = JSON.parse(jsonMatch[0]);
    console.log(`Successfully parsed response for: ${grant.title}`);
    
    return {
      id: grant.id,
      title: grant.title,
      programName: grant.programName,
      ...summary
    };
  } catch (error) {
    console.error(`Error processing grant ${grant.title}:`, error.message);
    return {
      id: grant.id,
      title: grant.title,
      programName: grant.programName || 'Unknown Program',
      summary: "Error processing this grant",
      complexity: "Unknown",
      tip: "Please try again later"
    };
  }
}

/**
 * Creates a markdown file for a grant summary
 */
async function saveMarkdownFile(grantSummary) {
  // Create a safe filename from the grant title
  const safeTitle = grantSummary.title
    .replace(/[^a-z0-9]/gi, '-')
    .replace(/-+/g, '-')
    .toLowerCase();
  
  const outputDir = path.join(__dirname, 'grant-summaries');
  
  // Ensure the output directory exists
  try {
    await fs.mkdir(outputDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  
  const filePath = path.join(outputDir, `${grantSummary.id}-${safeTitle}.md`);
  
  const markdownContent = `# ${grantSummary.title}
  
## Program
${grantSummary.programName || 'Not specified'}

## Summary
${grantSummary.summary}

## Application Complexity
**${grantSummary.complexity}**

## Key Tip
${grantSummary.tip}
`;

  await fs.writeFile(filePath, markdownContent, 'utf8');
  console.log(`Markdown saved: ${filePath}`);
  
  return filePath;
}

/**
 * Main function to process all grants
 */
async function main() {
  try {
    // Read and parse the input file
    console.log(`Reading grants from ${INPUT_FILE}`);
    const data = await fs.readFile(INPUT_FILE, 'utf8');
    const grants = JSON.parse(data);
    
    // Filter to only include open applications
    const openGrants = grants.filter(grant => 
      grant.status && grant.status.toLowerCase().includes('open')
    );
    
    console.log(`Found ${grants.length} total grants`);
    console.log(`Processing ${openGrants.length} open grants`);
    
    // Process grants with some concurrency control
    const batchSize = 5; // Process 5 grants at a time
    const results = [];
    const markdownFiles = [];
    
    for (let i = 0; i < openGrants.length; i += batchSize) {
      const batch = openGrants.slice(i, i + batchSize);
      const batchPromises = batch.map(grant => processGrant(grant));
      const batchResults = await Promise.all(batchPromises);
      
      // Save each result as a markdown file
      const markdownPromises = batchResults.map(result => saveMarkdownFile(result));
      const batchMarkdownFiles = await Promise.all(markdownPromises);
      
      results.push(...batchResults);
      markdownFiles.push(...batchMarkdownFiles);
      
      console.log(`Processed ${Math.min(i + batchSize, openGrants.length)}/${openGrants.length} open grants`);
    }
    
    // Also write the consolidated JSON file for reference
    await fs.writeFile(OUTPUT_FILE, JSON.stringify(results, null, 2), 'utf8');
    console.log(`\nSummary:`);
    console.log(`- Successfully processed ${openGrants.length} open grants`);
    console.log(`- JSON results saved to: ${OUTPUT_FILE}`);
    console.log(`- ${markdownFiles.length} markdown files created in: ${path.join(__dirname, 'grant-summaries')}`);
    
  } catch (error) {
    console.error('Error in main process:', error);
  }
}

// Run the script
main(); 